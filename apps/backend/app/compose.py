"""Turns one applied composite into per-screen payloads.

The frontend rasterises content once, across the whole selection's composite
(see CONTEXT.md "Rendering split"), and tells us which region each screen
shows. Slicing here rather than on the devices keeps each retained MQTT
message self-contained and keeps the firmware dumb — see INTEGRATION-PLAN.md
Phase B, "Where the slicing happens".
"""

import base64

from .mask import Mask, Palette4, decode_block, encode, encode_pal4
from .models import ContentModel, ScreenWindow
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


def slice_for_screen(
    content: ContentModel, window: ScreenWindow
) -> tuple[ContentModel, ScreenWindow]:
    """Returns the content this screen should store, and its window into it."""
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
