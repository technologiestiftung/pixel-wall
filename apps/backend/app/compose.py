"""Turns one applied composite into per-screen payloads.

The frontend rasterises content once, across the whole selection's composite
(see CONTEXT.md "Rendering split"), and tells us which region each screen
shows. Slicing here rather than on the devices keeps each retained MQTT
message self-contained and keeps the firmware dumb — see INTEGRATION-PLAN.md
Phase B, "Where the slicing happens".
"""

import base64
from typing import Optional

from .mask import (
    Mask,
    Palette4,
    decode_block,
    encode,
    encode_pal4,
    pal4_stride_for,
    stride_for,
)
from . import config
from .models import (
    ApplyTarget,
    ContentModel,
    FramesModel,
    ScreenKind,
    ScreenStateModel,
    ScreenWindow,
    WallState,
)
from .wire import Frames, Scroll, ScreenFrame, Window

#: Scrolling content and an animated Animation/Bild template's frame strip are
#: the cases that cannot be sliced: every screen needs the whole thing (the
#: filmstrip, or every frame) plus its own offset, not just its own crop of
#: one frame. `gameOfLife` is the same story for a different reason — there is
#: no bitmap to crop at all, only a flag every selected screen receives
#: identically (see CONTEXT.md "Content").
def _is_sliceable(content: ContentModel) -> bool:
    return (
        content.format != "gameOfLife"
        and content.scroll is None
        and content.frames is None
    )


def _encode(image) -> bytes:
    return encode_pal4(image) if isinstance(image, Palette4) else encode(image)


#: Mirrors MAX_PIXELS_BYTES in apps/esp32/pixel_wall_esp32/wire_decode.h —
#: the firmware rejects any block that decodes to more than this.
ESP32_MAX_PIXELS_BYTES = 12288


def _fit_frames_for_small_screen(
    content: ContentModel, window: ScreenWindow
) -> tuple[ContentModel, ScreenWindow]:
    """An animated template's strip holds every frame at full composite width,
    which on a small screen is several times what the ESP32 can hold. Each
    screen only ever shows its own window of a frame, so crop every frame to
    that, then drop frames evenly (keeping the loop's total length) until the
    strip fits the firmware's decode budget."""
    image = decode_block(content.block())
    source_count = content.frames.frameCount
    frame_width = content.frames.compositeWidthPx
    width, height = window.widthPx, window.heightPx

    is_pal4 = isinstance(image, Palette4)
    bytes_per_frame = (pal4_stride_for(width) if is_pal4 else stride_for(width)) * height
    count = max(1, min(source_count, ESP32_MAX_PIXELS_BYTES // bytes_per_frame))

    if is_pal4:
        strip = Palette4(
            width * count, height, list(image.palette), bytearray(width * count * height)
        )
    else:
        strip = Mask.blank(width * count, height)

    for index in range(count):
        source_index = index * source_count // count
        frame = image.window(
            source_index * frame_width + window.offsetXPx, window.offsetYPx, width, height
        )
        for y in range(height):
            for x in range(width):
                if is_pal4:
                    strip.indices[y * strip.width_px + index * width + x] = frame.indices[
                        y * width + x
                    ]
                elif frame.get(x, y):
                    strip.set(index * width + x, y)

    loop_ms = source_count * content.frames.frameDurationMs
    fitted = content.model_copy(
        update={
            "widthPx": strip.width_px,
            "heightPx": height,
            "data": base64.b64encode(_encode(strip)).decode(),
            "frames": FramesModel(
                frameCount=count,
                frameDurationMs=loop_ms / count,
                compositeWidthPx=width,
            ),
        }
    )
    origin = ScreenWindow(offsetXPx=0, offsetYPx=0, widthPx=width, heightPx=height)
    return fitted, origin


def slice_for_screen(
    content: ContentModel, window: ScreenWindow, kind: ScreenKind = "large"
) -> tuple[ContentModel, ScreenWindow]:
    """Returns the content this screen should store, and its window into it."""
    if kind == "small" and content.frames is not None:
        return _fit_frames_for_small_screen(content, window)
    if not _is_sliceable(content):
        return content, window

    image = decode_block(content.block())
    cropped = image.window(
        window.offsetXPx, window.offsetYPx, window.widthPx, window.heightPx
    )
    sliced = ContentModel(
        format=content.format,
        widthPx=window.widthPx,
        heightPx=window.heightPx,
        color=content.color,
        data=base64.b64encode(_encode(cropped)).decode(),
        scroll=None,
    )
    origin = ScreenWindow(
        offsetXPx=0,
        offsetYPx=0,
        widthPx=window.widthPx,
        heightPx=window.heightPx,
    )
    return sliced, origin


def frame_for_screen(
    content: ContentModel, window: ScreenWindow, brightness: int = 60
) -> ScreenFrame:
    """The binary MQTT payload for one screen."""
    if content.format == "gameOfLife":
        return ScreenFrame(
            color=(255, 255, 255),
            window=Window(
                window.offsetXPx, window.offsetYPx, window.widthPx, window.heightPx
            ),
            mask=None,
            brightness=brightness,
            game_of_life=True,
        )

    scroll = None
    if content.scroll is not None:
        scroll = Scroll(
            content.scroll.direction,
            round(content.scroll.speedPxPerSec),
            content.scroll.pauseMs,
            content.scroll.compositeWidthPx,
        )

    frames = None
    if content.frames is not None:
        frames = Frames(
            content.frames.frameCount,
            round(content.frames.frameDurationMs),
            content.frames.compositeWidthPx,
        )

    return ScreenFrame(
        color=tuple(content.color or (255, 255, 255)),
        window=Window(
            window.offsetXPx, window.offsetYPx, window.widthPx, window.heightPx
        ),
        mask=decode_block(content.block()),
        scroll=scroll,
        frames=frames,
        background=tuple(content.background) if content.background is not None else None,
        brightness=brightness,
    )


def apply_to_screens(
    state: WallState,
    kind: ScreenKind,
    targets: list[ApplyTarget],
    content: ContentModel,
    source: Optional[dict],
) -> dict[str, ScreenFrame]:
    """Writes `content` into `state` for each target screen, and returns the
    MQTT frame each of them should now be sent."""
    brightness = config.BRIGHTNESS[kind]
    frames = {}
    for target in targets:
        sliced, window = slice_for_screen(content, target.window, kind)
        state.screens[target.screenId] = ScreenStateModel(
            window=window, content=sliced, source=source
        )
        frames[target.screenId] = frame_for_screen(sliced, window, brightness)
    return frames
