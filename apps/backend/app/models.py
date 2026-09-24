import base64
import binascii
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

from . import config
from .mask import MaskFormatError, decode_block
from .screens import DEFAULT_LAYOUT, SCREEN_IDS

ScreenKind = Literal["small", "large"]
BitmapFormat = Literal["mask1", "pal4"]


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def _coerce_brightness(value: Any) -> Any:
    if isinstance(value, int) and not isinstance(value, bool):
        return _clamp(value, config.BRIGHTNESS_MIN, config.BRIGHTNESS_MAX)
    return value


def _validate_rgb(value: Optional[list[int]], field: str) -> Optional[list[int]]:
    if value is None:
        return None
    if len(value) != 3 or any(not 0 <= c <= 255 for c in value):
        raise ValueError(f"{field} must be three 0-255 channels")
    return value


Brightness = Annotated[int, BeforeValidator(_coerce_brightness)]


class BrightnessByKind(BaseModel):
    """Per hardware kind, not per screen: `matrix.brightness` on the Pi and
    `setBrightness8` on the ESP32 are both whole-canvas properties, so this is
    the finest granularity the hardware supports."""

    model_config = ConfigDict(extra="ignore")

    small: Brightness = config.DEFAULT_BRIGHTNESS
    large: Brightness = config.DEFAULT_BRIGHTNESS


class LayoutPositionModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    screenId: str
    xMm: float
    yMm: float

    @field_validator("screenId")
    @classmethod
    def _known_screen(cls, value: str) -> str:
        if value not in SCREEN_IDS:
            raise ValueError(f"unknown screen id: {value}")
        return value


class ScreenWindow(BaseModel):
    """A screen's region of the (possibly multi-screen) content bitmap —
    `window` in docs/wire-format.md."""

    model_config = ConfigDict(extra="ignore")

    offsetXPx: int = Field(ge=0, le=65535)
    offsetYPx: int = Field(ge=0, le=65535)
    widthPx: int = Field(gt=0, le=65535)
    heightPx: int = Field(gt=0, le=65535)


class ScrollModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    direction: Literal["left", "right"] = "left"
    speedPxPerSec: float = Field(gt=0, le=65535)
    pauseMs: int = Field(ge=0, le=65535)
    #: Width of the area the content scrolls across — see docs/wire-format.md.
    #: Not the mask width: the mask is the filmstrip, this is the selection.
    compositeWidthPx: int = Field(gt=0, le=65535)


class ContentModel(BaseModel):
    """The JSON envelope from docs/wire-format.md."""

    model_config = ConfigDict(extra="ignore")

    format: BitmapFormat
    widthPx: int = Field(gt=0, le=65535)
    heightPx: int = Field(gt=0, le=65535)
    color: Optional[list[int]] = None
    data: str
    scroll: Optional[ScrollModel] = None
    #: A static fill behind a scrolling filmstrip — never baked into `data`,
    #: since that would pan along with the text (see docs/wire-format.md
    #: `scroll` and render/layers.ts on the frontend). Large screens (Pi)
    #: only for now — see
    #: docs/adr/0001-phase-lauftext-background-by-hardware-kind.md. Ignored
    #: by compose.py's binary (ESP32) envelope entirely.
    background: Optional[list[int]] = None

    @field_validator("color")
    @classmethod
    def _rgb(cls, value: Optional[list[int]]) -> Optional[list[int]]:
        return _validate_rgb(value, "color")

    @field_validator("background")
    @classmethod
    def _rgb_background(cls, value: Optional[list[int]]) -> Optional[list[int]]:
        return _validate_rgb(value, "background")

    def block(self) -> bytes:
        try:
            return base64.b64decode(self.data, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError(f"data is not valid base64: {error}") from error

    @field_validator("data")
    @classmethod
    def _decodable(cls, value: str) -> str:
        """A payload that cannot be decoded here would reach a panel and be
        rejected there instead, where nobody sees the error."""
        try:
            decode_block(base64.b64decode(value, validate=True))
        except (binascii.Error, ValueError, MaskFormatError) as error:
            raise ValueError(f"data is not a valid bitmap block: {error}") from error
        return value


class ScreenStateModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    window: ScreenWindow
    content: ContentModel
    #: What the editor was showing when this frame was rendered, as its own
    #: background/foreground layers. Opaque here: nothing in the backend or on
    #: a panel reads it, and a frame renders identically without it. It exists
    #: so the editor can change one layer without flattening the other, which
    #: a rendered bitmap alone cannot support.
    source: Optional[dict] = None


class WallState(BaseModel):
    model_config = ConfigDict(extra="ignore")

    brightness: BrightnessByKind = Field(default_factory=BrightnessByKind)
    layout: list[LayoutPositionModel] = Field(
        default_factory=lambda: [LayoutPositionModel(**p) for p in DEFAULT_LAYOUT]
    )
    screens: dict[str, ScreenStateModel] = Field(default_factory=dict)

    @field_validator("screens")
    @classmethod
    def _known_screens(cls, value: dict[str, ScreenStateModel]) -> dict[str, ScreenStateModel]:
        unknown = sorted(set(value) - set(SCREEN_IDS))
        if unknown:
            raise ValueError(f"unknown screen ids: {', '.join(unknown)}")
        return value


class StateResponse(WallState):
    updated_at: str


class LayoutRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    positions: list[LayoutPositionModel]


class LayoutResponse(BaseModel):
    positions: list[LayoutPositionModel]


class ScreensResponse(BaseModel):
    screens: list[dict]


class ApplyTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")

    screenId: str
    window: ScreenWindow

    @field_validator("screenId")
    @classmethod
    def _known_screen(cls, value: str) -> str:
        if value not in SCREEN_IDS:
            raise ValueError(f"unknown screen id: {value}")
        return value


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    selectionKind: ScreenKind
    screens: list[ApplyTarget] = Field(min_length=1)
    content: ContentModel
    brightness: Optional[BrightnessByKind] = None
    #: Editor-only layer description stored verbatim — see ScreenStateModel.
    source: Optional[dict] = None


class ApplyResponse(BaseModel):
    appliedAt: str


class MqttStatus(BaseModel):
    enabled: bool
    connected: bool
    broker: str
    topic_prefix: str
    last_error: Optional[str] = None


class AuthStatus(BaseModel):
    enabled: bool


class HealthResponse(BaseModel):
    status: str
    state_file: str
    state_file_writable: bool
    updated_at: Optional[str] = None
    auth: AuthStatus
    mqtt: MqttStatus
