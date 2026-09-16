"""Builds the frame the Pi pushes to its 128x128 canvas.

Kept apart from `pi_display.py` so the geometry — which is where the bugs
live — can be tested without a wall attached. The display script owns the
matrix and the timing; this owns "given this state at this moment, what should
each pixel be".
"""

import base64
from typing import Any, Optional

from PIL import Image

from .hardware import LARGE_SCREEN_MATRIX_RECT, MATRIX_HEIGHT_PX, MATRIX_WIDTH_PX
from .mask import Mask, MaskFormatError, Palette4, decode_block
from .scroll import Marquee, marquee_offset_px

BLACK = (0, 0, 0)


def _to_image(block: bytes, color: tuple[int, int, int]) -> Image.Image:
    """Decodes a bitmap block into an RGB image.

    `mask1`'s packed rows are already exactly PIL's mode-"1" layout (MSB first,
    rows padded to a byte), so there is no per-pixel loop here.
    """
    decoded = decode_block(block)

    if isinstance(decoded, Mask):
        stencil = Image.frombytes(
            "1", (decoded.width_px, decoded.height_px), bytes(decoded.bits)
        )
        out = Image.new("RGB", (decoded.width_px, decoded.height_px), BLACK)
        out.paste(Image.new("RGB", out.size, color), mask=stencil)
        return out

    assert isinstance(decoded, Palette4)
    indexed = Image.frombytes(
        "P", (decoded.width_px, decoded.height_px), bytes(decoded.indices)
    )
    flat: list[int] = []
    for entry in decoded.palette:
        flat.extend(entry)
    flat.extend([0] * (768 - len(flat)))
    indexed.putpalette(flat)
    return indexed.convert("RGB")


def screen_tile(
    entry: dict[str, Any],
    size: tuple[int, int],
    elapsed_ms: float,
) -> Image.Image:
    """One screen's 64x64 (or 32x32) view of its content at this moment.

    Static content was already sliced per screen by the backend, so its window
    offset is zero and this is a straight paste. Scrolling content is the
    exception — every screen holds the whole filmstrip and reads its own offset
    into the shared composite, which is what keeps a multi-screen Lauftext from
    tearing at the seams.
    """
    tile = Image.new("RGB", size, BLACK)
    content = entry["content"]
    window = entry["window"]

    try:
        source = _to_image(
            base64.b64decode(content["data"]), tuple(content.get("color") or (255, 255, 255))
        )
    except (MaskFormatError, ValueError, KeyError):
        return tile

    shift_x = 0.0
    scroll = content.get("scroll")
    if scroll:
        shift_x = marquee_offset_px(
            elapsed_ms,
            Marquee(
                composite_width_px=scroll["compositeWidthPx"],
                text_width_px=content["widthPx"],
                speed_px_per_sec=scroll["speedPxPerSec"],
                pause_ms=scroll["pauseMs"],
                direction=scroll.get("direction", "left"),
            ),
        )

    tile.paste(
        source,
        (round(shift_x - window["offsetXPx"]), -window["offsetYPx"]),
    )
    return tile


def render_frame(state: dict[str, Any], elapsed_ms: float) -> Image.Image:
    """The whole 128x128 canvas.

    Every tick redraws the entire frame regardless of which screens changed:
    the four panels are one physical canvas, so "already-applied screens are
    left untouched" (CONTEXT.md) is a guarantee about state, not about frame
    composition.
    """
    frame = Image.new("RGB", (MATRIX_WIDTH_PX, MATRIX_HEIGHT_PX), BLACK)
    screens = state.get("screens") or {}

    for screen_id, (x0, y0, width, height) in LARGE_SCREEN_MATRIX_RECT.items():
        entry = screens.get(screen_id)
        if not entry:
            continue
        frame.paste(screen_tile(entry, (width, height), elapsed_ms), (x0, y0))

    return frame


def brightness_for_large(state: dict[str, Any]) -> Optional[int]:
    brightness = state.get("brightness")
    if isinstance(brightness, dict) and isinstance(brightness.get("large"), int):
        return brightness["large"]
    return None
