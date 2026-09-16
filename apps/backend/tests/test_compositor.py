"""Geometry tests for the Pi's frame composition — the part of the display
path that can be wrong without a wall attached to notice."""

import base64

import pytest

from app.compositor import brightness_for_large, render_frame, screen_tile
from app.hardware import LARGE_SCREEN_MATRIX_RECT
from app.mask import Mask, Palette4, encode, encode_pal4

RED = [254, 68, 65]


def mask_entry(rows, window=None, color=RED, scroll=None):
    mask = Mask.from_rows(rows)
    content = {
        "format": "mask1",
        "widthPx": mask.width_px,
        "heightPx": mask.height_px,
        "color": color,
        "data": base64.b64encode(encode(mask)).decode(),
    }
    if scroll:
        content["scroll"] = scroll
    return {
        "window": window
        or {
            "offsetXPx": 0,
            "offsetYPx": 0,
            "widthPx": mask.width_px,
            "heightPx": mask.height_px,
        },
        "content": content,
    }


def test_set_pixels_take_the_content_colour():
    tile = screen_tile(mask_entry(["##", ".."]), (2, 2), 0)
    assert tile.getpixel((0, 0)) == tuple(RED)
    assert tile.getpixel((0, 1)) == (0, 0, 0)


def test_unlit_pixels_are_black():
    tile = screen_tile(mask_entry(["..", ".."]), (2, 2), 0)
    assert tile.getpixel((0, 0)) == (0, 0, 0)


def test_pal4_uses_its_own_palette():
    image = Palette4.from_rows(["01"], [(0, 0, 0), (10, 20, 30)])
    entry = {
        "window": {"offsetXPx": 0, "offsetYPx": 0, "widthPx": 2, "heightPx": 1},
        "content": {
            "format": "pal4",
            "widthPx": 2,
            "heightPx": 1,
            "data": base64.b64encode(encode_pal4(image)).decode(),
        },
    }
    tile = screen_tile(entry, (2, 1), 0)
    assert tile.getpixel((0, 0)) == (0, 0, 0)
    assert tile.getpixel((1, 0)) == (10, 20, 30)


def test_a_window_offset_shifts_the_view():
    """Scrolling content keeps the whole filmstrip, so the offset is live."""
    entry = mask_entry(
        ["#..."],
        window={"offsetXPx": 1, "offsetYPx": 0, "widthPx": 2, "heightPx": 1},
        scroll={
            "direction": "left",
            "speedPxPerSec": 0,
            "pauseMs": 0,
            "compositeWidthPx": 0,
        },
    )
    tile = screen_tile(entry, (2, 1), 0)
    assert tile.getpixel((0, 0)) == (0, 0, 0)


def test_undecodable_content_renders_black_rather_than_raising():
    entry = mask_entry(["##"])
    entry["content"]["data"] = "bm90LWEtYmxvY2s="
    tile = screen_tile(entry, (2, 1), 0)
    assert tile.getpixel((0, 0)) == (0, 0, 0)


def test_scrolling_moves_the_content_over_time():
    scroll = {
        "direction": "left",
        "speedPxPerSec": 10,
        "pauseMs": 0,
        "compositeWidthPx": 4,
    }
    entry = mask_entry(
        ["##"],
        window={"offsetXPx": 0, "offsetYPx": 0, "widthPx": 4, "heightPx": 1},
        scroll=scroll,
    )

    # Starts fully off the right-hand edge of the 4px composite.
    assert screen_tile(entry, (4, 1), 0).getpixel((0, 0)) == (0, 0, 0)

    # Travel is composite + text = 6px at 10px/s, so 300ms is halfway: the
    # text's left edge sits at 4 - 3 = 1.
    midway = screen_tile(entry, (4, 1), 300)
    assert midway.getpixel((1, 0)) == tuple(RED)
    assert midway.getpixel((0, 0)) == (0, 0, 0)


def test_two_screens_of_one_composite_stay_in_step():
    """The seam case: screen B must continue exactly where screen A stops."""
    scroll = {
        "direction": "left",
        "speedPxPerSec": 10,
        "pauseMs": 0,
        "compositeWidthPx": 8,
    }
    rows = ["####"]
    left = mask_entry(
        rows,
        window={"offsetXPx": 0, "offsetYPx": 0, "widthPx": 4, "heightPx": 1},
        scroll=scroll,
    )
    right = mask_entry(
        rows,
        window={"offsetXPx": 4, "offsetYPx": 0, "widthPx": 4, "heightPx": 1},
        scroll=scroll,
    )

    at_ms = 600
    combined = [
        screen_tile(left, (4, 1), at_ms).getpixel((x, 0)) for x in range(4)
    ] + [screen_tile(right, (4, 1), at_ms).getpixel((x, 0)) for x in range(4)]

    lit = [i for i, px in enumerate(combined) if px != (0, 0, 0)]
    # A contiguous run — no gap or repeat where the two screens meet.
    assert lit == list(range(lit[0], lit[0] + len(lit)))


def test_render_frame_places_each_screen_in_its_quadrant():
    state = {
        "screens": {
            screen_id: mask_entry(["#" * 64] * 64)
            for screen_id in LARGE_SCREEN_MATRIX_RECT
        }
    }
    frame = render_frame(state, 0)
    assert frame.size == (128, 128)
    for x0, y0, _, _ in LARGE_SCREEN_MATRIX_RECT.values():
        assert frame.getpixel((x0, y0)) == tuple(RED)


def test_render_frame_leaves_unapplied_screens_black():
    state = {"screens": {"04": mask_entry(["#" * 64] * 64)}}
    frame = render_frame(state, 0)
    assert frame.getpixel((0, 0)) == tuple(RED)
    assert frame.getpixel((64, 0)) == (0, 0, 0)


def test_render_frame_tolerates_an_empty_state():
    assert render_frame({}, 0).getpixel((0, 0)) == (0, 0, 0)
    assert render_frame({"screens": {}}, 0).size == (128, 128)


@pytest.mark.parametrize(
    "state, expected",
    [
        ({"brightness": {"small": 10, "large": 70}}, 70),
        ({"brightness": {}}, None),
        ({}, None),
        ({"brightness": "bright"}, None),
    ],
)
def test_brightness_for_large(state, expected):
    assert brightness_for_large(state) == expected
