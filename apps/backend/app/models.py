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
from .mask import MaskFormatError, decode_block
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

    @field_validator("data")
    @classmethod
    def _decodable(cls, value: Optional[str]) -> Optional[str]:
        """A payload that cannot be decoded here would reach a panel and be
        rejected there instead, where nobody sees the error. `None` is valid
        for `gameOfLife`, which carries no data — that absence is enforced by
        `_format_matches_its_fields` instead."""
        if value is None:
            return None
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
