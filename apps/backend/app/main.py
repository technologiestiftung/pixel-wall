import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from . import config, state as state_store
from .auth import BasicAuthMiddleware
from .models import AuthStatus, HealthResponse, MqttStatus, StateResponse, WallState, WallStateUpdate
from .mqtt import publisher

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
    version="1.0.0",
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
    allow_methods=["GET", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _apply(new_state: WallState) -> dict:
    try:
        written = state_store.write_state(new_state)
    except OSError as error:
        logger.error("state write failed: %s", error)
        raise HTTPException(status_code=500, detail=f"could not write state file: {error}")

    if not publisher.publish_state(written):
        logger.warning("state written but MQTT publish failed; wall state is still authoritative")

    return written


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
            topic=config.MQTT_TOPIC,
            last_error=publisher.last_error,
        ),
    )


@app.get("/api/state", response_model=StateResponse, tags=["state"])
def get_state() -> StateResponse:
    return StateResponse(**state_store.read_state())


@app.put("/api/state", response_model=StateResponse, tags=["state"])
def put_state(payload: WallState) -> StateResponse:
    return StateResponse(**_apply(payload))


@app.patch("/api/state", response_model=StateResponse, tags=["state"])
def patch_state(payload: WallStateUpdate) -> StateResponse:
    current = state_store.read_state()
    merged = current | payload.model_dump(exclude_none=True)
    return StateResponse(**_apply(WallState.model_validate(merged)))


@app.get("/api/limits", tags=["state"])
def limits() -> dict:
    return {
        "text": {"max_length": config.TEXT_MAX_LENGTH},
        "color": {"min": 0, "max": 255, "length": 3},
        "brightness": {"min": config.BRIGHTNESS_MIN, "max": config.BRIGHTNESS_MAX},
        "speed_ms": {"min": config.SPEED_MS_MIN, "max": config.SPEED_MS_MAX},
        "defaults": config.DEFAULT_STATE,
    }


@app.get("/", include_in_schema=False)
def root() -> Response:
    return Response(status_code=307, headers={"Location": "/docs"})
