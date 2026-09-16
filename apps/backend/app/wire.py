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
VERSION = 0x01
HEADER_BYTES = 21

FLAG_SCROLL = 0x01

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


def _u16(value: int, field: str) -> bytes:
    if not 0 <= value <= UINT16_MAX:
        raise MaskFormatError(f"{field} is {value}, outside uint16 range")
    return bytes([(value >> 8) & 0xFF, value & 0xFF])


def _read_u16(buffer: bytes, offset: int) -> int:
    return (buffer[offset] << 8) | buffer[offset + 1]


def encode_frame(frame: ScreenFrame) -> bytes:
    if len(frame.color) != 3 or not all(0 <= c <= 255 for c in frame.color):
        raise MaskFormatError(f"colour {frame.color!r} is not three 0-255 channels")

    scroll = frame.scroll
    header = bytearray()
    header.append(MAGIC)
    header.append(VERSION)
    header.append(FLAG_SCROLL if scroll else 0x00)
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

    assert len(header) == HEADER_BYTES
    body = encode_pal4(frame.mask) if isinstance(frame.mask, Palette4) else encode(frame.mask)
    return bytes(header) + body


def decode_frame(payload: bytes) -> ScreenFrame:
    if len(payload) < HEADER_BYTES:
        raise MaskFormatError(f"frame is {len(payload)} bytes, too short for a header")
    if payload[0] != MAGIC or payload[1] != VERSION:
        raise MaskFormatError(f"unexpected frame magic/version: {payload[0]}/{payload[1]}")

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

    return ScreenFrame(
        color=(payload[3], payload[4], payload[5]),
        window=Window(
            _read_u16(payload, 6),
            _read_u16(payload, 8),
            _read_u16(payload, 10),
            _read_u16(payload, 12),
        ),
        mask=decode_block(payload[HEADER_BYTES:]),
        scroll=scroll,
    )


def topic_for(screen_id: str) -> str:
    return f"{config.MQTT_TOPIC_PREFIX}/{screen_id}"
