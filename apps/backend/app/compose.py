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
from .wire import Scroll, ScreenFrame, Window

#: Scrolling content is the one case that cannot be sliced: every screen pans
#: the same filmstrip, so each needs the whole thing plus its own offset.
def _is_sliceable(content: ContentModel) -> bool:
    return content.scroll is None


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
    scroll = None
    if content.scroll is not None:
        scroll = Scroll(
            content.scroll.direction,
            round(content.scroll.speedPxPerSec),
            content.scroll.pauseMs,
            content.scroll.compositeWidthPx,
        )

    return ScreenFrame(
        color=tuple(content.color or (255, 255, 255)),
        window=Window(
            window.offsetXPx, window.offsetYPx, window.widthPx, window.heightPx
        ),
        mask=decode_block(content.block()),
        scroll=scroll,
        brightness=brightness,
    )
