"""Lauftext panning.

A deliberate mirror of `apps/frontend/src/domain/scroll.ts`: the browser
preview and the wall must agree on where the text is, or the preview lies. Both
are pure functions of elapsed time, which is also what keeps every screen of a
multi-screen composite in step — they each evaluate the same function rather
than tracking their own position.
"""

from dataclasses import dataclass


@dataclass
class Marquee:
    #: Width of the area the text scrolls across (the whole selection).
    composite_width_px: int
    #: Natural width of the rendered text — the filmstrip.
    text_width_px: int
    speed_px_per_sec: float
    pause_ms: int
    direction: str = "left"


def marquee_offset_px(elapsed_ms: float, params: Marquee) -> float:
    """The text's current x offset within the composite.

    The text starts fully hidden past one edge, travels to fully hidden past
    the other, then holds there for `pause_ms` before looping.
    """
    travel_px = params.composite_width_px + params.text_width_px
    duration_ms = (travel_px / params.speed_px_per_sec) * 1000 if params.speed_px_per_sec > 0 else 0
    cycle_ms = duration_ms + params.pause_ms

    start = params.composite_width_px if params.direction == "left" else -params.text_width_px
    end = -params.text_width_px if params.direction == "left" else params.composite_width_px

    if cycle_ms <= 0:
        return start

    t = elapsed_ms % cycle_ms
    if t >= duration_ms:
        return end

    return start + (end - start) * (t / duration_ms)
