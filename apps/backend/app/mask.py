"""Codecs for the `mask1` and `pal4` payloads.

`docs/wire-format.md` is the normative spec; the shared vectors in
`docs/wire-format-fixtures.json` are what keep this, the TypeScript encoder
in the frontend and the C++ decoder on the ESP32 in agreement.
"""

from dataclasses import dataclass
from typing import Union

MAGIC = 0x50
VERSION = 0x01
HEADER_BYTES = 7

PAL4_MAGIC = 0x51
PAL4_HEADER_BYTES = 8
PAL4_MAX_COLORS = 16

ENCODING_RAW = 0x00
ENCODING_RLE = 0x01


class MaskFormatError(ValueError):
    """A payload that cannot be trusted to render. Callers keep the last good frame."""


def stride_for(width_px: int) -> int:
    return (width_px + 7) // 8


@dataclass
class Mask:
    width_px: int
    height_px: int
    #: Packed rows, MSB = leftmost pixel, each row padded to `stride_for(width_px)` bytes.
    bits: bytearray

    @classmethod
    def blank(cls, width_px: int, height_px: int) -> "Mask":
        return cls(width_px, height_px, bytearray(stride_for(width_px) * height_px))

    @property
    def stride(self) -> int:
        return stride_for(self.width_px)

    def get(self, x: int, y: int) -> bool:
        return bool(self.bits[y * self.stride + (x >> 3)] & (0x80 >> (x & 7)))

    def set(self, x: int, y: int, on: bool = True) -> None:
        index = y * self.stride + (x >> 3)
        bit = 0x80 >> (x & 7)
        if on:
            self.bits[index] |= bit
        else:
            self.bits[index] &= ~bit & 0xFF

    def to_rows(self) -> list[str]:
        return [
            "".join("#" if self.get(x, y) else "." for x in range(self.width_px))
            for y in range(self.height_px)
        ]

    @classmethod
    def from_rows(cls, rows: list[str]) -> "Mask":
        height = len(rows)
        width = len(rows[0]) if rows else 0
        mask = cls.blank(width, height)
        for y, row in enumerate(rows):
            if len(row) != width:
                raise MaskFormatError(f"ragged mask rows: expected {width}, got {len(row)}")
            for x, char in enumerate(row):
                if char == "#":
                    mask.set(x, y)
        return mask

    def window(self, offset_x: int, offset_y: int, width_px: int, height_px: int) -> "Mask":
        """The sub-mask a single screen displays. Reads outside the source are clear,
        so a window may legitimately overhang (a scaled template is cropped, not fitted)."""
        out = Mask.blank(width_px, height_px)
        for y in range(height_px):
            source_y = offset_y + y
            if not 0 <= source_y < self.height_px:
                continue
            for x in range(width_px):
                source_x = offset_x + x
                if 0 <= source_x < self.width_px and self.get(source_x, source_y):
                    out.set(x, y)
        return out


def _header(encoding: int, width_px: int, height_px: int) -> bytes:
    return bytes(
        [
            MAGIC,
            VERSION,
            encoding,
            (width_px >> 8) & 0xFF,
            width_px & 0xFF,
            (height_px >> 8) & 0xFF,
            height_px & 0xFF,
        ]
    )


def _leb128(value: int) -> bytes:
    out = bytearray()
    while True:
        septet = value & 0x7F
        value >>= 7
        if value:
            out.append(septet | 0x80)
        else:
            out.append(septet)
            return bytes(out)


def _rle_body(mask: Mask) -> bytes:
    total_bits = len(mask.bits) * 8
    runs: list[int] = []
    expected = 0
    index = 0

    while index < total_bits:
        run = 0
        while index < total_bits:
            byte = mask.bits[index >> 3]
            # Whole-byte fast path: text masks are overwhelmingly runs of clear
            # bytes, and a wide Lauftext filmstrip is slow to walk bit by bit.
            if index & 7 == 0 and byte in (0x00, 0xFF):
                if (0 if byte == 0x00 else 1) != expected:
                    break
                run += 8
                index += 8
                continue
            if (byte >> (7 - (index & 7))) & 1 != expected:
                break
            run += 1
            index += 1
        runs.append(run)
        expected ^= 1

    return b"".join(_leb128(run) for run in runs)


def encode(mask: Mask) -> bytes:
    """Emits whichever encoding is smaller, so a payload never exceeds the raw form."""
    expected = mask.stride * mask.height_px
    if len(mask.bits) != expected:
        raise MaskFormatError(f"mask buffer is {len(mask.bits)} bytes, expected {expected}")

    raw = _header(ENCODING_RAW, mask.width_px, mask.height_px) + bytes(mask.bits)
    rle = _header(ENCODING_RLE, mask.width_px, mask.height_px) + _rle_body(mask)
    return rle if len(rle) < len(raw) else raw


def decode(block: bytes) -> Mask:
    if len(block) < HEADER_BYTES:
        raise MaskFormatError(f"mask block is {len(block)} bytes, too short for a header")
    if block[0] != MAGIC or block[1] != VERSION:
        raise MaskFormatError(f"unexpected mask magic/version: {block[0]}/{block[1]}")

    encoding = block[2]
    width_px = (block[3] << 8) | block[4]
    height_px = (block[5] << 8) | block[6]
    mask = Mask.blank(width_px, height_px)
    body = block[HEADER_BYTES:]

    if encoding == ENCODING_RAW:
        if len(body) != len(mask.bits):
            raise MaskFormatError(f"raw body is {len(body)} bytes, expected {len(mask.bits)}")
        mask.bits[:] = body
        return mask

    if encoding != ENCODING_RLE:
        raise MaskFormatError(f"unknown mask encoding: {encoding}")

    total_bits = len(mask.bits) * 8
    bit_index = 0
    value = 0
    cursor = 0

    while cursor < len(body):
        run = 0
        shift = 0
        while True:
            if cursor >= len(body):
                raise MaskFormatError("truncated varint in mask RLE body")
            byte = body[cursor]
            cursor += 1
            run |= (byte & 0x7F) << shift
            if not byte & 0x80:
                break
            shift += 7

        if bit_index + run > total_bits:
            raise MaskFormatError("mask RLE runs overflow the declared size")
        if value:
            for i in range(bit_index, bit_index + run):
                mask.bits[i >> 3] |= 0x80 >> (i & 7)
        bit_index += run
        value ^= 1

    if bit_index != total_bits:
        raise MaskFormatError(f"mask RLE covers {bit_index} bits, expected {total_bits}")
    return mask


def pal4_stride_for(width_px: int) -> int:
    return (width_px + 1) // 2


@dataclass
class Palette4:
    width_px: int
    height_px: int
    #: 1-16 entries of (r, g, b). Index 0 is the background.
    palette: list[tuple[int, int, int]]
    #: One palette index per pixel, row-major, unpacked for ease of use.
    indices: bytearray

    @property
    def stride(self) -> int:
        return pal4_stride_for(self.width_px)

    @classmethod
    def from_rows(cls, rows: list[str], palette: list[tuple[int, int, int]]) -> "Palette4":
        height = len(rows)
        width = len(rows[0]) if rows else 0
        indices = bytearray(width * height)
        for y, row in enumerate(rows):
            if len(row) != width:
                raise MaskFormatError(f"ragged pal4 rows: expected {width}, got {len(row)}")
            for x, char in enumerate(row):
                value = int(char, 16)
                if value >= len(palette):
                    raise MaskFormatError(f"pixel {char!r} is outside the palette")
                indices[y * width + x] = value
        return cls(width, height, palette, indices)

    def to_rows(self) -> list[str]:
        return [
            "".join(
                format(self.indices[y * self.width_px + x], "x") for x in range(self.width_px)
            )
            for y in range(self.height_px)
        ]

    def packed_rows(self) -> bytearray:
        """Packed rows including the index-0 padding nibble on odd widths."""
        packed = bytearray(self.stride * self.height_px)
        for y in range(self.height_px):
            for x in range(self.width_px):
                value = self.indices[y * self.width_px + x] & 0x0F
                target = y * self.stride + (x >> 1)
                packed[target] |= value << 4 if x % 2 == 0 else value
        return packed


def _pal4_header(encoding: int, image: Palette4) -> bytes:
    out = bytearray(
        [
            PAL4_MAGIC,
            VERSION,
            encoding,
            (image.width_px >> 8) & 0xFF,
            image.width_px & 0xFF,
            (image.height_px >> 8) & 0xFF,
            image.height_px & 0xFF,
            len(image.palette),
        ]
    )
    for r, g, b in image.palette:
        out += bytes([r & 0xFF, g & 0xFF, b & 0xFF])
    return bytes(out)


def _pal4_rle_body(packed: bytearray) -> bytes:
    """Runs over the padded nibble stream; each run is an explicit index byte plus
    a varint length, since 16 values cannot simply alternate."""

    def nibble_at(i: int) -> int:
        return (packed[i >> 1] >> 4) & 0x0F if i % 2 == 0 else packed[i >> 1] & 0x0F

    total = len(packed) * 2
    body = bytearray()
    index = 0
    while index < total:
        value = nibble_at(index)
        run = 0
        while index < total and nibble_at(index) == value:
            run += 1
            index += 1
        body.append(value)
        body += _leb128(run)
    return bytes(body)


def encode_pal4(image: Palette4) -> bytes:
    if not 1 <= len(image.palette) <= PAL4_MAX_COLORS:
        raise MaskFormatError(
            f"pal4 palette has {len(image.palette)} entries, expected 1-{PAL4_MAX_COLORS}"
        )
    expected = image.width_px * image.height_px
    if len(image.indices) != expected:
        raise MaskFormatError(f"pal4 index buffer is {len(image.indices)}, expected {expected}")

    packed = image.packed_rows()
    raw = _pal4_header(ENCODING_RAW, image) + bytes(packed)
    rle = _pal4_header(ENCODING_RLE, image) + _pal4_rle_body(packed)
    return rle if len(rle) < len(raw) else raw


def decode_pal4(block: bytes) -> Palette4:
    if len(block) < PAL4_HEADER_BYTES:
        raise MaskFormatError(f"pal4 block is {len(block)} bytes, too short for a header")
    if block[0] != PAL4_MAGIC or block[1] != VERSION:
        raise MaskFormatError(f"unexpected pal4 magic/version: {block[0]}/{block[1]}")

    encoding = block[2]
    width_px = (block[3] << 8) | block[4]
    height_px = (block[5] << 8) | block[6]
    palette_count = block[7]
    if not 1 <= palette_count <= PAL4_MAX_COLORS:
        raise MaskFormatError(f"pal4 paletteCount is {palette_count}, expected 1-16")

    palette_end = PAL4_HEADER_BYTES + palette_count * 3
    if len(block) < palette_end:
        raise MaskFormatError("truncated pal4 palette")
    palette = [
        (block[i], block[i + 1], block[i + 2])
        for i in range(PAL4_HEADER_BYTES, palette_end, 3)
    ]

    stride = pal4_stride_for(width_px)
    packed = bytearray(stride * height_px)
    body = block[palette_end:]

    if encoding == ENCODING_RAW:
        if len(body) != len(packed):
            raise MaskFormatError(f"pal4 raw body is {len(body)} bytes, expected {len(packed)}")
        packed[:] = body
    elif encoding == ENCODING_RLE:
        total = len(packed) * 2
        nibble = 0
        cursor = 0
        while cursor < len(body):
            value = body[cursor]
            cursor += 1
            if value > 0x0F:
                raise MaskFormatError(f"pal4 run value {value} is not a nibble")
            run = 0
            shift = 0
            while True:
                if cursor >= len(body):
                    raise MaskFormatError("truncated varint in pal4 RLE body")
                byte = body[cursor]
                cursor += 1
                run |= (byte & 0x7F) << shift
                if not byte & 0x80:
                    break
                shift += 7
            if nibble + run > total:
                raise MaskFormatError("pal4 RLE runs overflow the declared size")
            for i in range(nibble, nibble + run):
                packed[i >> 1] |= value << 4 if i % 2 == 0 else value
            nibble += run
        if nibble != total:
            raise MaskFormatError(f"pal4 RLE covers {nibble} nibbles, expected {total}")
    else:
        raise MaskFormatError(f"unknown pal4 encoding: {encoding}")

    indices = bytearray(width_px * height_px)
    for y in range(height_px):
        for x in range(width_px):
            source = packed[y * stride + (x >> 1)]
            indices[y * width_px + x] = (source >> 4) & 0x0F if x % 2 == 0 else source & 0x0F
    return Palette4(width_px, height_px, palette, indices)


def decode_block(block: bytes) -> Union[Mask, Palette4]:
    """Dispatches on the block's own magic byte — this is how the MQTT envelope,
    which carries no format field, knows what it is holding."""
    if not block:
        raise MaskFormatError("empty block")
    if block[0] == MAGIC:
        return decode(block)
    if block[0] == PAL4_MAGIC:
        return decode_pal4(block)
    raise MaskFormatError(f"unknown block magic: {block[0]}")
