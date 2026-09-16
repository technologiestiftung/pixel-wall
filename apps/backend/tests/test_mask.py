import base64
import json
from pathlib import Path

import pytest

from app import mask as m

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[3] / "docs" / "wire-format-fixtures.json").read_text()
)
CASES = FIXTURES["cases"]
IDS = [case["name"] for case in CASES]


def test_fixture_file_has_cases():
    assert CASES


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_encodes_to_fixture_bytes(case):
    assert m.encode(m.Mask.from_rows(case["rows"])).hex() == case["encodedHex"]


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_encodes_to_fixture_base64(case):
    encoded = base64.b64encode(m.encode(m.Mask.from_rows(case["rows"]))).decode()
    assert encoded == case["encodedBase64"]


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_decodes_raw_form(case):
    assert m.decode(bytes.fromhex(case["rawHex"])).to_rows() == case["rows"]


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_decodes_rle_form(case):
    assert m.decode(bytes.fromhex(case["rleHex"])).to_rows() == case["rows"]


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_dimensions_and_stride(case):
    mask = m.Mask.from_rows(case["rows"])
    assert (mask.width_px, mask.height_px) == (case["widthPx"], case["heightPx"])
    assert mask.stride == case["strideBytes"]


@pytest.mark.parametrize("case", CASES, ids=IDS)
def test_never_exceeds_raw_size(case):
    assert len(m.encode(m.Mask.from_rows(case["rows"]))) <= len(case["rawHex"]) // 2


def test_picks_rle_for_sparse_mask():
    mask = m.Mask.blank(64, 64)
    mask.set(10, 10)
    block = m.encode(mask)
    assert block[2] == m.ENCODING_RLE
    assert len(block) < 64


def test_picks_raw_for_dense_alternating_mask():
    mask = m.Mask.blank(64, 64)
    for y in range(64):
        for x in range(0, 64, 2):
            mask.set(x + (y % 2), y)
    assert m.encode(mask)[2] == m.ENCODING_RAW


def test_round_trips_wide_filmstrip():
    mask = m.Mask.blank(2000, 64)
    for x in range(0, 2000, 7):
        mask.set(x, x % 64)
    assert m.decode(m.encode(mask)).to_rows() == mask.to_rows()


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda b: bytes([0x51]) + b[1:], "magic"),
        (lambda b: b[:1] + bytes([0x02]) + b[2:], "magic/version"),
        (lambda b: b[:2] + bytes([0x07]) + b[3:], "encoding"),
        (lambda b: b[:2], "too short"),
    ],
)
def test_rejects_malformed_blocks(mutate, message):
    block = m.encode(m.Mask.from_rows(["#..."]))
    with pytest.raises(m.MaskFormatError, match=message):
        m.decode(mutate(block))


def test_rejects_rle_that_does_not_cover_declared_size():
    block = bytes([0x50, 0x01, 0x01, 0x00, 0x08, 0x00, 0x01, 0x04])
    with pytest.raises(m.MaskFormatError, match="covers 4 bits"):
        m.decode(block)


def test_window_extracts_a_screens_slice():
    mask = m.Mask.from_rows(
        [
            "####....",
            "....####",
            "########",
            "........",
        ]
    )
    assert mask.window(4, 0, 4, 2).to_rows() == ["....", "####"]


def test_window_outside_the_source_reads_clear():
    mask = m.Mask.from_rows(["####", "####"])
    assert mask.window(2, 1, 4, 3).to_rows() == ["##..", "....", "...."]


PAL_CASES = FIXTURES["pal4Cases"]
PAL_IDS = [case["name"] for case in PAL_CASES]


def _pal_image(case) -> m.Palette4:
    return m.Palette4.from_rows(case["rows"], [tuple(c) for c in case["palette"]])


def test_pal4_fixture_file_has_cases():
    assert PAL_CASES


@pytest.mark.parametrize("case", PAL_CASES, ids=PAL_IDS)
def test_pal4_encodes_to_fixture_bytes(case):
    assert m.encode_pal4(_pal_image(case)).hex() == case["encodedHex"]


@pytest.mark.parametrize("case", PAL_CASES, ids=PAL_IDS)
def test_pal4_encodes_to_fixture_base64(case):
    encoded = base64.b64encode(m.encode_pal4(_pal_image(case))).decode()
    assert encoded == case["encodedBase64"]


@pytest.mark.parametrize("case", PAL_CASES, ids=PAL_IDS)
def test_pal4_decodes_raw_form(case):
    decoded = m.decode_pal4(bytes.fromhex(case["rawHex"]))
    assert decoded.to_rows() == case["rows"]
    assert decoded.palette == [tuple(c) for c in case["palette"]]


@pytest.mark.parametrize("case", PAL_CASES, ids=PAL_IDS)
def test_pal4_decodes_rle_form(case):
    decoded = m.decode_pal4(bytes.fromhex(case["rleHex"]))
    assert decoded.to_rows() == case["rows"]
    assert decoded.palette == [tuple(c) for c in case["palette"]]


@pytest.mark.parametrize("case", PAL_CASES, ids=PAL_IDS)
def test_pal4_stride_and_never_exceeds_raw(case):
    image = _pal_image(case)
    assert image.stride == case["strideBytes"]
    assert len(m.encode_pal4(image)) <= len(case["rawHex"]) // 2


def test_pal4_picks_rle_for_flat_artwork():
    palette = [(0, 0, 0), (254, 68, 65)]
    rows = ["0" * 64 for _ in range(32)] + ["1" * 64 for _ in range(32)]
    block = m.encode_pal4(m.Palette4.from_rows(rows, palette))
    assert block[2] == m.ENCODING_RLE
    assert len(block) < 64


def test_pal4_odd_width_pads_with_index_zero():
    image = m.Palette4.from_rows(["111"], [(0, 0, 0), (1, 2, 3)])
    packed = image.packed_rows()
    assert len(packed) == 2
    assert packed[1] & 0x0F == 0
    assert m.decode_pal4(m.encode_pal4(image)).to_rows() == ["111"]


def test_pal4_rejects_oversized_palette():
    palette = [(i, i, i) for i in range(17)]
    image = m.Palette4(1, 1, palette, bytearray([0]))
    with pytest.raises(m.MaskFormatError, match="palette has 17"):
        m.encode_pal4(image)


def test_pal4_rejects_bad_palette_count_on_decode():
    block = bytearray(m.encode_pal4(m.Palette4.from_rows(["01"], [(0, 0, 0), (1, 1, 1)])))
    block[7] = 0
    with pytest.raises(m.MaskFormatError, match="paletteCount"):
        m.decode_pal4(bytes(block))


def test_pal4_rejects_truncated_palette():
    block = m.encode_pal4(m.Palette4.from_rows(["01"], [(0, 0, 0), (1, 1, 1)]))
    with pytest.raises(m.MaskFormatError, match="truncated pal4 palette"):
        m.decode_pal4(block[:9])


def test_pal4_rejects_pixel_outside_palette():
    with pytest.raises(m.MaskFormatError, match="outside the palette"):
        m.Palette4.from_rows(["05"], [(0, 0, 0), (1, 1, 1)])


def test_decode_block_dispatches_on_magic():
    mask_block = m.encode(m.Mask.from_rows(["##.."]))
    pal_block = m.encode_pal4(m.Palette4.from_rows(["01"], [(0, 0, 0), (9, 9, 9)]))
    assert isinstance(m.decode_block(mask_block), m.Mask)
    assert isinstance(m.decode_block(pal_block), m.Palette4)


def test_decode_block_rejects_unknown_magic():
    with pytest.raises(m.MaskFormatError, match="unknown block magic"):
        m.decode_block(bytes([0x99, 0x01, 0x00]))


def test_decode_block_rejects_empty():
    with pytest.raises(m.MaskFormatError, match="empty block"):
        m.decode_block(b"")
