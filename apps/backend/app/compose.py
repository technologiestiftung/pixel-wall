"""Turns one applied composite into per-screen payloads.

The frontend rasterises content once, across the whole selection's composite
(see CONTEXT.md "Rendering split"), and tells us which region each screen
shows. Slicing here rather than on the devices keeps each retained MQTT
message self-contained and keeps the firmware dumb — see INTEGRATION-PLAN.md
Phase B, "Where the slicing happens".
"""

import base64
from typing import Optional

from .mask import Mask, Palette4, decode_block, encode_block, pal4_stride_for, stride_for
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


def _encoded_data(image) -> str:
    return base64.b64encode(encode_block(image)).decode()


def _origin(width: int, height: int) -> ScreenWindow:
    return ScreenWindow(offsetXPx=0, offsetYPx=0, widthPx=width, heightPx=height)


def _wire_window(window: ScreenWindow) -> Window:
    return Window(window.offsetXPx, window.offsetYPx, window.widthPx, window.heightPx)


#: Mirrors MAX_PIXELS_BYTES in apps/esp32/pixel_wall_esp32/wire_decode.h —
#: the firmware rejects any block that decodes to more than this. Bench-tested
#: on the physical board (2026-10-07): all 3 small screens simultaneously
#: holding a maxed-out 32-frame pal4 strip each settles at a stable ~72 KB
#: free heap / ~42 KB largest block, no crash — raised from the original
#: 12288 (sized for an unrelated worst-case Lauftext filmstrip, never tuned
#: for animation frames) accordingly. PubSubClient's setBufferSize in the
#: sketch must stay >= this plus wire-header/encoding overhead.
ESP32_MAX_PIXELS_BYTES = 16384

#: How much faster than its authored pace a small-screen animated template may
#: play once its frame strip is cropped to fit ESP32_MAX_PIXELS_BYTES. Cropping
#: alone (dropping frames but holding each for longer, so the loop's total
#: length is unchanged) keeps the speed exact but can leave long templates
#: updating only a few times a second — a 15s loop cropped to 32 frames update
#: at ~2fps. Capping the speed-up instead trades some of that length accuracy
#: for a higher, steadier update rate: at 1.5x, that same 15s template updates
#: at ~4.8fps and finishes its loop in ~10s instead of 15s. 1.0 disables this
#: (the old behaviour: exact speed, whatever fps the crop leaves you with).
SMALL_SCREEN_MAX_SPEEDUP = 1.5


def _fit_frames_for_small_screen(
    content: ContentModel, window: ScreenWindow
) -> tuple[ContentModel, ScreenWindow]:
    """An animated template's strip holds every frame at full composite width,
    which on a small screen is several times what the ESP32 can hold. Each
    screen only ever shows its own window of a frame, so crop every frame to
    that, then drop frames evenly until the strip fits the firmware's decode
    budget. The kept frames are spread back over as much of the original loop
    length as SMALL_SCREEN_MAX_SPEEDUP allows — see its comment — never below
    the content's own native per-frame duration (that would play faster than
    the template was ever sampled at, for no benefit)."""
    image = decode_block(content.block())
    source_count = content.frames.frameCount
    frame_width = content.frames.compositeWidthPx
    width, height = window.widthPx, window.heightPx

    is_pal4 = isinstance(image, Palette4)
    bytes_per_frame = (pal4_stride_for(width) if is_pal4 else stride_for(width)) * height
    count = max(1, min(source_count, ESP32_MAX_PIXELS_BYTES // bytes_per_frame))

    frames = [
        image.window(
            (index * source_count // count) * frame_width + window.offsetXPx,
            window.offsetYPx,
            width,
            height,
        )
        for index in range(count)
    ]

    if is_pal4:
        indices = b"".join(
            frame.indices[y * width : (y + 1) * width] for y in range(height) for frame in frames
        )
        strip = Palette4(width * count, height, list(image.palette), bytearray(indices))
    else:
        strip = Mask.blank(width * count, height)
        for y in range(height):
            row = 0
            for frame in frames:
                row = (row << width) | frame.row_value(y)
            strip.set_row_value(y, row)

    native_duration_ms = content.frames.frameDurationMs
    loop_ms = source_count * native_duration_ms
    correct_duration_ms = loop_ms / count
    frame_duration_ms = max(native_duration_ms, correct_duration_ms / SMALL_SCREEN_MAX_SPEEDUP)

    fitted = content.model_copy(
        update={
            "widthPx": strip.width_px,
            "heightPx": height,
            "data": _encoded_data(strip),
            "frames": FramesModel(
                frameCount=count,
                frameDurationMs=frame_duration_ms,
                compositeWidthPx=width,
            ),
        }
    )
    return fitted, _origin(width, height)


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
        data=_encoded_data(cropped),
        scroll=None,
    )
    return sliced, _origin(window.widthPx, window.heightPx)


def frame_for_screen(
    content: ContentModel, window: ScreenWindow, brightness: int = 60
) -> ScreenFrame:
    """The binary MQTT payload for one screen."""
    if content.format == "gameOfLife":
        return ScreenFrame(
            color=(255, 255, 255),
            window=_wire_window(window),
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
        window=_wire_window(window),
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
