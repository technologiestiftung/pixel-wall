import pytest

from app import wire
from app.mask import Mask, MaskFormatError, Palette4


def frame(**overrides) -> wire.ScreenFrame:
    base = dict(
        color=(254, 241, 119),
        window=wire.Window(84, 0, 64, 64),
        mask=Mask.from_rows(["####....", "....####"]),
        scroll=None,
    )
    base.update(overrides)
    return wire.ScreenFrame(**base)


def test_header_is_fixed_width_without_scroll():
    payload = wire.encode_frame(frame())
    assert payload[:3] == bytes([0x57, 0x01, 0x00])
    assert payload[14:19] == bytes(5)


def test_round_trips_a_static_frame():
    original = frame()
    decoded = wire.decode_frame(wire.encode_frame(original))
    assert decoded.color == original.color
    assert decoded.window == original.window
    assert decoded.scroll is None
    assert decoded.mask.to_rows() == original.mask.to_rows()


def test_round_trips_a_scrolling_frame():
    original = frame(scroll=wire.Scroll("right", 60, 2000))
    decoded = wire.decode_frame(wire.encode_frame(original))
    assert decoded.scroll == original.scroll
    assert decoded.mask.to_rows() == original.mask.to_rows()


def test_scroll_flag_is_set_only_when_scrolling():
    assert wire.encode_frame(frame())[2] == 0x00
    assert wire.encode_frame(frame(scroll=wire.Scroll("left", 40, 2000)))[2] == wire.FLAG_SCROLL


def test_fractional_speed_is_rounded():
    decoded = wire.decode_frame(wire.encode_frame(frame(scroll=wire.Scroll("left", 59.6, 2000))))
    assert decoded.scroll.speed_px_per_sec == 60


def test_rejects_bad_magic():
    payload = bytearray(wire.encode_frame(frame()))
    payload[0] = 0x58
    with pytest.raises(MaskFormatError, match="magic"):
        wire.decode_frame(bytes(payload))


def test_rejects_short_payload():
    with pytest.raises(MaskFormatError, match="too short"):
        wire.decode_frame(b"\x57\x01\x00")


def test_rejects_out_of_range_colour():
    with pytest.raises(MaskFormatError, match="channels"):
        wire.encode_frame(frame(color=(0, 0, 300)))


def test_rejects_unknown_scroll_direction():
    with pytest.raises(MaskFormatError, match="direction"):
        wire.encode_frame(frame(scroll=wire.Scroll("up", 40, 2000)))


def test_topic_is_per_screen():
    assert wire.topic_for("04") == "ledwall/screen/04"


def test_worst_case_small_screen_filmstrip_fits_an_esp32_buffer():
    """The size ceiling Phase E's MQTT buffer is sized against."""
    mask = Mask.blank(2304, 32)
    for x in range(0, 2304, 3):
        for y in range(8, 24):
            mask.set(x, y)
    payload = wire.encode_frame(frame(mask=mask, scroll=wire.Scroll("left", 40, 2000)))
    assert len(payload) < 16384


def test_round_trips_a_pal4_frame():
    image = Palette4.from_rows(["0121", "2010"], [(0, 0, 0), (254, 68, 65), (180, 185, 255)])
    decoded = wire.decode_frame(wire.encode_frame(frame(mask=image)))
    assert isinstance(decoded.mask, Palette4)
    assert decoded.mask.to_rows() == image.to_rows()
    assert decoded.mask.palette == image.palette


def test_pal4_frame_still_carries_window_and_scroll():
    image = Palette4.from_rows(["01"], [(0, 0, 0), (1, 2, 3)])
    original = frame(mask=image, scroll=wire.Scroll("right", 45, 2000))
    decoded = wire.decode_frame(wire.encode_frame(original))
    assert decoded.window == original.window
    assert decoded.scroll == original.scroll
