import re
from typing import Annotated, Any, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from . import config

_HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def _coerce_text(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    return _CONTROL.sub("", value).strip()[: config.TEXT_MAX_LENGTH]


def _coerce_color(value: Any) -> Any:
    if isinstance(value, str):
        match = _HEX.match(value.strip())
        if match is None:
            return value
        digits = match.group(1)
        return [int(digits[i : i + 2], 16) for i in (0, 2, 4)]
    if isinstance(value, dict) and {"r", "g", "b"} <= value.keys():
        value = [value["r"], value["g"], value["b"]]
    if isinstance(value, (list, tuple)) and len(value) == 3:
        if all(isinstance(c, int) and not isinstance(c, bool) for c in value):
            return [_clamp(c, 0, 255) for c in value]
    return value


def _coerce_brightness(value: Any) -> Any:
    if isinstance(value, int) and not isinstance(value, bool):
        return _clamp(value, config.BRIGHTNESS_MIN, config.BRIGHTNESS_MAX)
    return value


def _coerce_speed(value: Any) -> Any:
    if isinstance(value, int) and not isinstance(value, bool):
        return _clamp(value, config.SPEED_MS_MIN, config.SPEED_MS_MAX)
    return value


Text = Annotated[str, BeforeValidator(_coerce_text), Field(max_length=config.TEXT_MAX_LENGTH)]
Color = Annotated[list[int], BeforeValidator(_coerce_color), Field(min_length=3, max_length=3)]
Brightness = Annotated[int, BeforeValidator(_coerce_brightness)]
SpeedMs = Annotated[int, BeforeValidator(_coerce_speed)]


class WallState(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: Text = config.DEFAULT_STATE["text"]
    color: Color = config.DEFAULT_STATE["color"]
    brightness: Brightness = config.DEFAULT_STATE["brightness"]
    speed_ms: SpeedMs = config.DEFAULT_STATE["speed_ms"]


class WallStateUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: Optional[Text] = None
    color: Optional[Color] = None
    brightness: Optional[Brightness] = None
    speed_ms: Optional[SpeedMs] = None


class StateResponse(WallState):
    updated_at: str


class MqttStatus(BaseModel):
    enabled: bool
    connected: bool
    broker: str
    topic: str
    last_error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    state_file: str
    state_file_writable: bool
    updated_at: Optional[str] = None
    mqtt: MqttStatus
