import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from . import compose, config, screens as screen_inventory, state as state_store
from .auth import BasicAuthMiddleware
from .models import (
    ApplyRequest,
    ApplyResponse,
    AuthStatus,
    BrightnessByKind,
    HealthResponse,
    LayoutRequest,
    LayoutResponse,
    MqttStatus,
    ScreenStateModel,
    ScreensResponse,
    StateResponse,
    WallState,
)
from .mqtt import publisher
from .wire import encode_frame

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ledwall.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not config.AUTH_ENABLED:
        logger.warning(
            "LEDWALL_PASSWORD is not set: the API is reachable by anyone on the LAN"
        )
    publisher.start()
    yield
    publisher.stop()


app = FastAPI(
    title="Pixel Wall API",
    version="2.0.0",
    summary="LAN-only control API for the LED matrix wall.",
    lifespan=lifespan,
)

app.add_middleware(BasicAuthMiddleware)

# Added after the auth middleware so it wraps it: Starlette runs the
# last-added middleware outermost, and a 401 still needs CORS headers for the
# browser to read it. "Authorization" is listed explicitly because the Fetch
# spec excludes it from the "*" wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
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
    )


@app.get("/api/screens", response_model=ScreensResponse, tags=["wall"])
def get_screens() -> ScreensResponse:
    return ScreensResponse(screens=screen_inventory.SCREEN_SPECS)


@app.get("/api/layout", response_model=LayoutResponse, tags=["wall"])
def get_layout() -> LayoutResponse:
    return LayoutResponse(positions=state_store.read_state()["layout"])


@app.put("/api/layout", response_model=LayoutResponse, tags=["wall"])
def put_layout(payload: LayoutRequest) -> LayoutResponse:
    current = WallState.model_validate(state_store.read_state())
    current.layout = payload.positions
    written = _write(current)
    return LayoutResponse(positions=written["layout"])


@app.put("/api/brightness", response_model=BrightnessByKind, tags=["wall"])
def put_brightness(payload: BrightnessByKind) -> BrightnessByKind:
    """Brightness on its own, for when the user moves only the slider.

    It is not part of a content edit — `POST /api/apply` also accepts it so the
    common case is one request — but it has to be settable without one.
    """
    current = WallState.model_validate(state_store.read_state())
    current.brightness = payload
    written = _write(current)
    return BrightnessByKind(**written["brightness"])


@app.get("/api/state", response_model=StateResponse, tags=["wall"])
def get_state() -> StateResponse:
    return StateResponse(**state_store.read_state())


@app.post("/api/apply", response_model=ApplyResponse, tags=["wall"])
def post_apply(payload: ApplyRequest) -> ApplyResponse:
    """Applies one content edit to the selected screens only.

    Screens outside the selection keep whatever they were showing — CONTEXT.md
    "Apply changes" requires that already-applied screens are left untouched.
    """
    current = WallState.model_validate(state_store.read_state())

    kinds = {screen_inventory.kind_of(target.screenId) for target in payload.screens}
    if kinds != {payload.selectionKind}:
        raise HTTPException(
            status_code=422,
            detail=f"selectionKind {payload.selectionKind!r} does not match the selected screens",
        )

    frames = {}
    for target in payload.screens:
        content, window = compose.slice_for_screen(payload.content, target.window)
        current.screens[target.screenId] = ScreenStateModel(window=window, content=content)
        frames[target.screenId] = compose.frame_for_screen(content, window)

    if payload.brightness is not None:
        current.brightness = payload.brightness

    written = _write(current)

    for screen_id, frame in frames.items():
        if not publisher.publish_screen(screen_id, encode_frame(frame)):
            logger.warning(
                "screen %s written but MQTT publish failed; state file is still authoritative",
                screen_id,
            )

    return ApplyResponse(appliedAt=written["updated_at"])


@app.get("/api/limits", tags=["wall"])
def limits() -> dict:
    return {
        "brightness": {"min": config.BRIGHTNESS_MIN, "max": config.BRIGHTNESS_MAX},
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
