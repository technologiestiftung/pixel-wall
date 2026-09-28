"""Binary MQTT envelope — see docs/wire-format.md "MQTT envelope (binary)".

The JSON envelope is fine over HTTP and in the state file, but a worst-case
Lauftext filmstrip is ~12 KB once base64'd, and parsing that as JSON on an
ESP32 costs roughly twice that in heap. This framing is fixed-width and
parses with pointer arithmetic.
"""

from dataclasses import dataclass
from typing import Optional, Union

from . import config
from .mask import Mask, MaskFormatError, Palette4, decode_block, encode, encode_pal4

MAGIC = 0x57
VERSION_1 = 0x01
VERSION_2 = 0x02
HEADER_BYTES_V1 = 22
HEADER_BYTES_V2 = 30

FLAG_SCROLL = 0x01
FLAG_BACKGROUND = 0x02
FLAG_FRAMES = 0x04

DIRECTION_LEFT = 0
DIRECTION_RIGHT = 1
_DIRECTIONS = {DIRECTION_LEFT: "left", DIRECTION_RIGHT: "right"}
_DIRECTION_CODES = {name: code for code, name in _DIRECTIONS.items()}

UINT16_MAX = 0xFFFF


@dataclass
class Scroll:
    direction: str
    speed_px_per_sec: int
    pause_ms: int
    #: Width of the area the content scrolls across — the whole selection,
    #: which for Lauftext is wider than the screen and narrower than the
    #: filmstrip. See docs/wire-format.md.
    composite_width_px: int = 0


@dataclass
class Frames:
    """An animated Animation/Bild template's frame strip — the stepped
    counterpart of `Scroll`. Mutually exclusive with `scroll` on one content.
    See docs/wire-format.md `frames`."""

    frame_count: int
    frame_duration_ms: int
    #: Width of one frame slot — not the whole strip. See docs/wire-format.md.
    composite_width_px: int


@dataclass
class Window:
    offset_x_px: int
    offset_y_px: int
    width_px: int
    height_px: int


@dataclass
class ScreenFrame:
    color: tuple[int, int, int]
    window: Window
    #: A `mask1` mask (tinted with `color`) or a `pal4` image (which carries
    #: its own palette, making `color` meaningless).
    mask: Union[Mask, Palette4]
    scroll: Optional[Scroll] = None
    frames: Optional[Frames] = None
    #: A static fill behind the mask, wherever it has nothing lit — see
    #: docs/wire-format.md `background`. Independent of `scroll`/`frames`: a
    #: background can sit behind either.
    background: Optional[tuple[int, int, int]] = None
    #: Brightness for this screen's hardware kind, 5-100. Carried on the wire
    #: because an MQTT-only device cannot read the state file.
    brightness: int = 60


def _u16(value: int, field: str) -> bytes:
    if not 0 <= value <= UINT16_MAX:
        raise MaskFormatError(f"{field} is {value}, outside uint16 range")
    return bytes([(value >> 8) & 0xFF, value & 0xFF])


def _read_u16(buffer: bytes, offset: int) -> int:
    return (buffer[offset] << 8) | buffer[offset + 1]


def encode_frame(frame: ScreenFrame) -> bytes:
    if len(frame.color) != 3 or not all(0 <= c <= 255 for c in frame.color):
        raise MaskFormatError(f"colour {frame.color!r} is not three 0-255 channels")
    background = frame.background
    if background is not None and (
        len(background) != 3 or not all(0 <= c <= 255 for c in background)
    ):
        raise MaskFormatError(f"background {background!r} is not three 0-255 channels")

    scroll = frame.scroll
    frames = frame.frames
    # v1's 22-byte header is all a plain frame (no background, no frames) ever
    # needs, so it stays there — only content that actually carries a new
    # field pays for the bigger v2 header. An unflashed v1 device would
    # otherwise reject every frame outright instead of just the ones it can't
    # understand yet.
    version = VERSION_2 if (background is not None or frames is not None) else VERSION_1

    flags = 0x00
    if scroll:
        flags |= FLAG_SCROLL
    if background is not None:
        flags |= FLAG_BACKGROUND
    if frames is not None:
        flags |= FLAG_FRAMES

    header = bytearray()
    header.append(MAGIC)
    header.append(version)
    header.append(flags)
    header.extend(frame.color)
    header.extend(_u16(frame.window.offset_x_px, "window.offsetXPx"))
    header.extend(_u16(frame.window.offset_y_px, "window.offsetYPx"))
    header.extend(_u16(frame.window.width_px, "window.widthPx"))
    header.extend(_u16(frame.window.height_px, "window.heightPx"))

    if scroll is None:
        header.extend(bytes(7))
    else:
        if scroll.direction not in _DIRECTION_CODES:
            raise MaskFormatError(f"unknown scroll direction: {scroll.direction!r}")
        header.append(_DIRECTION_CODES[scroll.direction])
        header.extend(_u16(round(scroll.speed_px_per_sec), "scroll.speedPxPerSec"))
        header.extend(_u16(scroll.pause_ms, "scroll.pauseMs"))
        header.extend(_u16(scroll.composite_width_px, "scroll.compositeWidthPx"))

    header.append(max(5, min(100, frame.brightness)))

    if version == VERSION_2:
        header.extend(background if background is not None else bytes(3))
        if frames is None:
            header.extend(bytes(5))
        else:
            if not 1 <= frames.frame_count <= 255:
                raise MaskFormatError(
                    f"frames.frameCount is {frames.frame_count}, outside 1-255"
                )
            header.append(frames.frame_count)
            header.extend(_u16(round(frames.frame_duration_ms), "frames.frameDurationMs"))
            header.extend(_u16(frames.composite_width_px, "frames.compositeWidthPx"))

    assert len(header) == (HEADER_BYTES_V2 if version == VERSION_2 else HEADER_BYTES_V1)
    body = encode_pal4(frame.mask) if isinstance(frame.mask, Palette4) else encode(frame.mask)
    return bytes(header) + body


def decode_frame(payload: bytes) -> ScreenFrame:
    if len(payload) < HEADER_BYTES_V1:
        raise MaskFormatError(f"frame is {len(payload)} bytes, too short for a header")
    if payload[0] != MAGIC or payload[1] not in (VERSION_1, VERSION_2):
        raise MaskFormatError(f"unexpected frame magic/version: {payload[0]}/{payload[1]}")

    version = payload[1]
    header_bytes = HEADER_BYTES_V2 if version == VERSION_2 else HEADER_BYTES_V1
    if len(payload) < header_bytes:
        raise MaskFormatError(
            f"frame is {len(payload)} bytes, too short for a v{version} header"
        )

    flags = payload[2]
    scroll = None
    if flags & FLAG_SCROLL:
        direction = _DIRECTIONS.get(payload[14])
        if direction is None:
            raise MaskFormatError(f"unknown scroll direction code: {payload[14]}")
        scroll = Scroll(
            direction,
            _read_u16(payload, 15),
            _read_u16(payload, 17),
            _read_u16(payload, 19),
        )

    background = None
    frames = None
    if version == VERSION_2:
        if flags & FLAG_BACKGROUND:
            background = (payload[22], payload[23], payload[24])
        if flags & FLAG_FRAMES:
            frames = Frames(
                payload[25],
                _read_u16(payload, 26),
                _read_u16(payload, 28),
            )

    return ScreenFrame(
        color=(payload[3], payload[4], payload[5]),
        window=Window(
            _read_u16(payload, 6),
            _read_u16(payload, 8),
            _read_u16(payload, 10),
            _read_u16(payload, 12),
        ),
        mask=decode_block(payload[header_bytes:]),
        scroll=scroll,
        frames=frames,
        background=background,
        brightness=payload[21],
    )


def topic_for(screen_id: str) -> str:
    return f"{config.MQTT_TOPIC_PREFIX}/{screen_id}"
