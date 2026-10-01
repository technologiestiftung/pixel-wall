import base64
import binascii
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from . import config
from .mask import MaskFormatError, Palette4, decode_block
from .screens import DEFAULT_LAYOUT, SCREEN_IDS

ScreenKind = Literal["small", "large"]
BitmapFormat = Literal["mask1", "pal4"]
#: `gameOfLife` carries no bitmap at all — see CONTEXT.md "Content" (Game of
#: Life) and docs/wire-format.md. Small-screen (ESP32) only.
ContentFormat = Literal["mask1", "pal4", "gameOfLife"]


def _validate_rgb(value: Optional[list[int]], field: str) -> Optional[list[int]]:
    if value is None:
        return None
    if len(value) != 3 or any(not 0 <= c <= 255 for c in value):
        raise ValueError(f"{field} must be three 0-255 channels")
    return value


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


class FramesModel(BaseModel):
    """Present only for an animated Animation/Bild template — the frame-strip
    counterpart of ScrollModel. `data` is `frameCount` copies of one
    `compositeWidthPx`-wide frame laid out side by side; see
    docs/wire-format.md `frames` and app/compositor.py's `screen_tile`, which
    picks a frame by elapsed time exactly as it already picks a scroll offset."""

    model_config = ConfigDict(extra="ignore")

    frameCount: int = Field(gt=0, le=255)
    frameDurationMs: float = Field(gt=0, le=65535)
    compositeWidthPx: int = Field(gt=0, le=65535)


class ContentModel(BaseModel):
    """The JSON envelope from docs/wire-format.md.

    `format: "gameOfLife"` is the one exception to everything else here: it
    carries no bitmap, no window-worthy size, and no scroll/frames/background
    — just the flag. See CONTEXT.md "Content" (Game of Life) and
    `docs/adr/0003-game-of-life-native-esp32-content-type.md`.
    """

    model_config = ConfigDict(extra="ignore")

    format: ContentFormat
    widthPx: Optional[int] = Field(default=None, gt=0, le=65535)
    heightPx: Optional[int] = Field(default=None, gt=0, le=65535)
    color: Optional[list[int]] = None
    data: Optional[str] = None
    scroll: Optional[ScrollModel] = None
    #: Present only for an animated Animation/Bild template — see FramesModel.
    #: `compose.py`'s binary (ESP32) envelope encodes this too — both hardware
    #: kinds animate it now, see
    #: docs/adr/0002-phase-animated-templates-by-hardware-kind.md.
    frames: Optional[FramesModel] = None
    #: A static fill behind a scrolling filmstrip — never baked into `data`,
    #: since that would pan along with the text (see docs/wire-format.md
    #: `scroll` and render/layers.ts on the frontend). `compose.py`'s binary
    #: (ESP32) envelope encodes this too — both hardware kinds composite it
    #: now, see docs/adr/0001-phase-lauftext-background-by-hardware-kind.md.
    background: Optional[list[int]] = None

    @field_validator("color")
    @classmethod
    def _rgb(cls, value: Optional[list[int]]) -> Optional[list[int]]:
        return _validate_rgb(value, "color")

    @field_validator("background")
    @classmethod
    def _rgb_background(cls, value: Optional[list[int]]) -> Optional[list[int]]:
        return _validate_rgb(value, "background")

    @model_validator(mode="after")
    def _format_matches_its_fields(self) -> "ContentModel":
        if self.format == "gameOfLife":
            if self.data is not None or self.widthPx is not None or self.heightPx is not None:
                raise ValueError("gameOfLife content must not carry widthPx/heightPx/data")
            if self.scroll is not None or self.frames is not None or self.background is not None:
                raise ValueError("gameOfLife content must not carry scroll/frames/background")
        elif self.data is None or self.widthPx is None or self.heightPx is None:
            raise ValueError(f"{self.format} content requires data, widthPx and heightPx")
        return self

    def block(self) -> bytes:
        assert self.data is not None, "block() is only meaningful for a bitmap format"
        try:
            return base64.b64decode(self.data, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError(f"data is not valid base64: {error}") from error


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


#: One per icon under apps/frontend/public/weather/ — app/weather.py maps
#: Bright Sky's icon names onto these.
WeatherVariant = Literal[
    "sunny",
    "night",
    "cloudy-day-1",
    "cloudy-night-3",
    "cloudy",
    "fog",
    "rainy-6",
    "rainy-7",
    "snowy-5",
    "snowy-6",
    "thunder",
]


#: Every character a temperature reading can need, e.g. "-3°".
TEMPERATURE_GLYPHS = "0123456789-°"


class TemperatureModel(BaseModel):
    """How to draw the current temperature over a weather variant.

    The editor renders each of TEMPERATURE_GLYPHS once, in the user's chosen
    font and size, as a `mask1` block (all the same height), and the backend
    lines up whichever ones the current reading needs — so the wall's text
    is in the editor's own fonts without the backend ever rendering text.
    app/weather.py `stamp_temperature` and the frontend's
    render/temperature.ts must lay a reading out identically."""

    model_config = ConfigDict(extra="ignore")

    glyphs: dict[str, str]
    color: list[int]
    hAlign: Literal["left", "center", "right"] = "center"
    vAlign: Literal["top", "center", "bottom"] = "bottom"
    paddingXPx: int = Field(default=0, ge=0, le=255)
    paddingYPx: int = Field(default=0, ge=0, le=255)

    @field_validator("color")
    @classmethod
    def _rgb(cls, value: list[int]) -> list[int]:
        return _validate_rgb(value, "color")

    @field_validator("glyphs")
    @classmethod
    def _every_glyph(cls, value: dict[str, str]) -> dict[str, str]:
        if set(value) != set(TEMPERATURE_GLYPHS):
            raise ValueError(f"glyphs must be exactly {TEMPERATURE_GLYPHS!r}")
        heights = set()
        for char, data in value.items():
            try:
                glyph = decode_block(base64.b64decode(data, validate=True))
            except (binascii.Error, ValueError, MaskFormatError) as error:
                raise ValueError(f"glyph {char!r} is not a valid bitmap block: {error}") from error
            if isinstance(glyph, Palette4):
                raise ValueError(f"glyph {char!r} must be mask1")
            heights.add(glyph.height_px)
        if len(heights) != 1:
            raise ValueError("glyphs must all be the same height")
        return value


class WeatherRequest(BaseModel):
    """The same weather content rendered once per icon, so the backend can
    switch between them without the editor — see app/weather.py.

    Not decoded on the way in, unlike ApplyRequest.content: each is a full
    animation strip, and decoding ten of them in pure Python would hold the
    request for a long time on the Pi. A variant that fails to decode is
    caught when it is first shown, and the screen keeps its previous frame."""

    model_config = ConfigDict(extra="ignore")

    variants: dict[WeatherVariant, ContentModel] = Field(min_length=1)
    temperature: Optional[TemperatureModel] = None


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    selectionKind: ScreenKind
    screens: list[ApplyTarget] = Field(min_length=1)
    content: ContentModel
    #: Editor-only layer description stored verbatim — see ScreenStateModel.
    source: Optional[dict] = None
    #: Present only for live weather content. `content` is then just the
    #: variant to show when the current weather isn't known yet.
    weather: Optional[WeatherRequest] = None

    @field_validator("content")
    @classmethod
    def _decodable(cls, value: ContentModel) -> ContentModel:
        """A payload that cannot be decoded here would reach a panel and be
        rejected there instead, where nobody sees the error. Checked on the way
        in only: decoding a large animation strip in pure Python takes seconds
        on the Pi, and every read of the state file would otherwise pay it."""
        if value.data is None:
            return value
        try:
            decode_block(value.block())
        except (ValueError, MaskFormatError) as error:
            raise ValueError(f"data is not a valid bitmap block: {error}") from error
        return value


class ApplyResponse(BaseModel):
    appliedAt: str


class WeatherGroup(BaseModel):
    """One weather apply, kept so it can be re-applied with another variant.
    `screens` shrinks as later applies take screens over."""

    model_config = ConfigDict(extra="ignore")

    selectionKind: ScreenKind
    screens: list[ApplyTarget]
    source: Optional[dict] = None
    variants: dict[WeatherVariant, ContentModel]
    temperature: Optional[TemperatureModel] = None
    #: What the screens show now: the variant, and the whole degrees drawn
    #: over it. None until the weather (or temperature) is known.
    active: Optional[WeatherVariant] = None
    activeTemperature: Optional[int] = None


class WeatherStore(BaseModel):
    model_config = ConfigDict(extra="ignore")

    groups: list[WeatherGroup] = Field(default_factory=list)


class WeatherResponse(BaseModel):
    """The latest Bright Sky reading. Every field is None until the first
    fetch succeeds."""

    variant: Optional[WeatherVariant] = None
    icon: Optional[str] = None
    condition: Optional[str] = None
    temperature: Optional[float] = None
    observedAt: Optional[str] = None
    station: Optional[str] = None


class WeatherStatus(BaseModel):
    enabled: bool
    observedAt: Optional[str] = None
    last_error: Optional[str] = None


class MqttStatus(BaseModel):
    enabled: bool
    connected: bool
    broker: str
    topic_prefix: str
    last_error: Optional[str] = None


class AuthStatus(BaseModel):
    enabled: bool


class ControlRequest(BaseModel):
    sessionId: str = Field(min_length=8, max_length=128)
    #: Take control even if another session holds it.
    takeover: bool = False


class ControlResponse(BaseModel):
    #: Whether this session now controls the wall. False means another
    #: session holds it and this one can only watch.
    controller: bool


class HealthResponse(BaseModel):
    status: str
    state_file: str
    state_file_writable: bool
    updated_at: Optional[str] = None
    auth: AuthStatus
    mqtt: MqttStatus
    weather: WeatherStatus


class UploadRequest(BaseModel):
    """An uploaded image/animation as the editor decoded it — the fields of
    the frontend's `UploadedMedia` (domain/types.ts), minus `id`."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1, max_length=255)
    sheetDataUrl: str = Field(pattern=r"^data:image/png;base64,")
    frameWidthPx: int = Field(gt=0, le=1024)
    frameHeightPx: int = Field(gt=0, le=1024)
    frameCount: int = Field(gt=0, le=255)
    columns: int = Field(gt=0, le=255)
    frameDurationMs: float = Field(gt=0, le=65535)

    @field_validator("sheetDataUrl")
    @classmethod
    def _bounded(cls, value: str) -> str:
        if len(value) > config.MAX_UPLOAD_SHEET_CHARS:
            raise ValueError("sprite sheet is too large")
        try:
            base64.b64decode(value.split(",", 1)[1], validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError(f"sprite sheet is not valid base64: {error}") from error
        return value


class UploadModel(UploadRequest):
    id: str
    createdAt: str


class UploadLibrary(BaseModel):
    uploads: list[UploadModel] = Field(default_factory=list)


class UploadSummary(BaseModel):
    id: str
