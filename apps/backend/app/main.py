import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from . import compose, config, screens as screen_inventory, state as state_store, uploads as upload_library
from .auth import BasicAuthMiddleware
from .control import SESSION_HEADER, ControlLeaseMiddleware, lease as control_lease
from .mask import MaskFormatError
from .models import (
    ApplyRequest,
    ApplyResponse,
    AuthStatus,
    ControlRequest,
    ControlResponse,
    HealthResponse,
    LayoutRequest,
    LayoutResponse,
    MqttStatus,
    ScreenStateModel,
    ScreensResponse,
    StateResponse,
    UploadLibrary,
    UploadModel,
    UploadRequest,
    UploadSummary,
    WallState,
    WeatherResponse,
    WeatherStatus,
)
from .mqtt import publish_frames, publisher
from .weather import live_weather

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ledwall.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not config.AUTH_ENABLED:
        logger.warning(
            "LEDWALL_PASSWORD is not set: the API is reachable by anyone on the LAN"
        )
    publisher.start()
    live_weather.start()
    yield
    live_weather.stop()
    publisher.stop()


app = FastAPI(
    title="Pixel Wall API",
    version="2.0.0",
    summary="LAN-only control API for the LED matrix wall.",
    lifespan=lifespan,
)

app.add_middleware(ControlLeaseMiddleware)
app.add_middleware(BasicAuthMiddleware)

# Added after the auth middleware so it wraps it: Starlette runs the
# last-added middleware outermost, and a 401 still needs CORS headers for the
# browser to read it. "Authorization" is listed explicitly because the Fetch
# spec excludes it from the "*" wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", SESSION_HEADER],
)


def _require_matching_kind(payload: ApplyRequest) -> None:
    kinds = {screen_inventory.kind_of(target.screenId) for target in payload.screens}
    if kinds != {payload.selectionKind}:
        raise HTTPException(
            status_code=422,
            detail=f"selectionKind {payload.selectionKind!r} does not match the selected screens",
        )


def _require_game_of_life_only_on_small(payload: ApplyRequest) -> None:
    """Game of Life runs natively on the ESP32 — large (Pi) screens have no
    such mechanism. See CONTEXT.md "Content" (Game of Life)."""
    if payload.content.format == "gameOfLife" and payload.selectionKind != "small":
        raise HTTPException(
            status_code=422,
            detail="gameOfLife content is only valid for small (ESP32) screens",
        )


def _write(new_state: WallState) -> dict:
    try:
        return state_store.write_state(new_state)
    except OSError as error:
        logger.error("state write failed: %s", error)
        raise HTTPException(status_code=500, detail=f"could not write state file: {error}")


@app.get("/api/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    current = state_store.read_state()
    return HealthResponse(
        status="ok",
        state_file=str(config.STATE_FILE),
        state_file_writable=state_store.state_file_writable(),
        updated_at=current["updated_at"],
        auth=AuthStatus(enabled=config.AUTH_ENABLED),
        mqtt=MqttStatus(
            enabled=config.MQTT_ENABLED,
            connected=publisher.connected,
            broker=f"{config.MQTT_HOST}:{config.MQTT_PORT}",
            topic_prefix=config.MQTT_TOPIC_PREFIX,
            last_error=publisher.last_error,
        ),
        weather=WeatherStatus(
            enabled=config.WEATHER_ENABLED,
            observedAt=live_weather.reading.observed_at if live_weather.reading else None,
            last_error=live_weather.last_error,
        ),
    )


@app.post("/api/control", response_model=ControlResponse, tags=["system"])
def post_control(payload: ControlRequest) -> ControlResponse:
    """Claims or renews control of the wall for one browser session — the
    editor calls it as a heartbeat. See app/control.py."""
    return ControlResponse(controller=control_lease.claim(payload.sessionId, payload.takeover))


@app.get("/api/screens", response_model=ScreensResponse, tags=["wall"])
def get_screens() -> ScreensResponse:
    return ScreensResponse(screens=screen_inventory.SCREEN_SPECS)


@app.get("/api/layout", response_model=LayoutResponse, tags=["wall"])
def get_layout() -> LayoutResponse:
    return LayoutResponse(positions=state_store.read_state()["layout"])


@app.put("/api/layout", response_model=LayoutResponse, tags=["wall"])
def put_layout(payload: LayoutRequest) -> LayoutResponse:
    with state_store.edit_lock:
        current = WallState.model_validate(state_store.read_state())
        current.layout = payload.positions
        written = _write(current)
    return LayoutResponse(positions=written["layout"])


@app.get("/api/state", response_model=StateResponse, tags=["wall"])
def get_state() -> StateResponse:
    return StateResponse(**state_store.read_state())


@app.post("/api/apply", response_model=ApplyResponse, tags=["wall"])
def post_apply(payload: ApplyRequest) -> ApplyResponse:
    """Applies one content edit to the selected screens only.

    Screens outside the selection keep whatever they were showing — CONTEXT.md
    "Apply changes" requires that already-applied screens are left untouched.
    """
    _require_matching_kind(payload)
    _require_game_of_life_only_on_small(payload)

    with state_store.edit_lock:
        current = WallState.model_validate(state_store.read_state())
        content, variant, degrees = live_weather.content_for(payload)
        try:
            frames = compose.apply_to_screens(
                current, payload.selectionKind, payload.screens, content, payload.source
            )
        except (ValueError, MaskFormatError) as error:
            raise HTTPException(
                status_code=422, detail=f"weather variant {variant} could not be shown: {error}"
            )
        written = _write(current)
        try:
            live_weather.record_apply(payload, variant, degrees)
        except OSError as error:
            logger.error("weather file write failed: %s", error)
            raise HTTPException(
                status_code=500, detail=f"could not write weather file: {error}"
            )

    publish_frames(frames)

    return ApplyResponse(appliedAt=written["updated_at"])


@app.get("/api/weather", response_model=WeatherResponse, tags=["wall"])
def get_weather() -> WeatherResponse:
    """The reading weather screens are currently showing — see app/weather.py."""
    reading = live_weather.reading
    return reading.to_response() if reading else WeatherResponse()


@app.get("/api/uploads", response_model=UploadLibrary, tags=["uploads"])
def get_uploads() -> UploadLibrary:
    return UploadLibrary(uploads=upload_library.list_uploads())


@app.post("/api/uploads", response_model=UploadModel, tags=["uploads"])
def post_upload(payload: UploadRequest) -> UploadModel:
    try:
        return UploadModel(**upload_library.add_upload(payload))
    except upload_library.LibraryFullError as error:
        raise HTTPException(status_code=409, detail=str(error))
    except OSError as error:
        logger.error("upload library write failed: %s", error)
        raise HTTPException(status_code=500, detail=f"could not write upload library: {error}")


@app.delete("/api/uploads/{upload_id}", response_model=UploadSummary, tags=["uploads"])
def delete_upload(upload_id: str) -> UploadSummary:
    """Removes an entry from the library only — screens already showing it
    keep their own copy (see app/uploads.py)."""
    if not upload_library.delete_upload(upload_id):
        raise HTTPException(status_code=404, detail=f"unknown upload: {upload_id}")
    return UploadSummary(id=upload_id)


@app.get("/api/limits", tags=["wall"])
def limits() -> dict:
    return {
        "bitmap": {
            "maxWidthPx": config.MAX_BITMAP_WIDTH_PX,
            "maxHeightPx": config.MAX_BITMAP_HEIGHT_PX,
            "formats": ["mask1", "pal4"],
        },
        "screens": screen_inventory.SCREEN_SPECS,
    }


@app.get("/", include_in_schema=False)
def root() -> Response:
    return Response(status_code=307, headers={"Location": "/docs"})
