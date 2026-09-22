# Pixel Wall wire format

The payload the backend sends to a panel driver (`pi_display.py` over the
state file, the ESP32 over MQTT). Frozen here so the TypeScript encoder, the
Python decoder and the C++ decoder are each written against this document
rather than against one another.

See `INTEGRATION-PLAN.md` for why these formats exist and
`docs/wire-format-fixtures.json` for the shared test vectors.

## Why 1-bit and 4-bit, not RGB

Text and Farbe are genuinely monochrome: `src/render/rasterize.ts` draws text
in `#ffffff`, and Farbe is a flat fill of one preset colour. Both travel as
`mask1` — a 1-bit coverage mask plus one RGB colour — 512 bytes for a 64×64
frame instead of 12,288 for RGB888, and 4× smaller than `pal4` on the one
size-critical case, a Lauftext filmstrip.

Animation/Bild always travels as `pal4` instead, whether a given template
happens to be genuinely multi-coloured brand artwork or one of the older
hand-drawn single-colour icons — `src/render/wire.ts` does not special-case
per template, so no template is ever forced into a colour it doesn't have,
and multi-colour content must not be faked by dithering a `mask1` mask.

## JSON envelope (HTTP and state file)

One JSON object per screen.

```json
{
	"format": "mask1",
	"widthPx": 148,
	"heightPx": 64,
	"color": [254, 241, 119],
	"data": "UAEBAJQAQAA...",
	"window": { "offsetXPx": 84, "offsetYPx": 0, "widthPx": 64, "heightPx": 64 },
	"scroll": { "direction": "left", "speedPxPerSec": 60, "pauseMs": 2000 }
}
```

| Field                 | Type             | Notes                                                                                                                                           |
| --------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`              | string           | `"mask1"` or `"pal4"`. A decoder MUST reject an unknown value and keep showing its previous frame rather than attempt to render it.             |
| `widthPx`, `heightPx` | uint16           | Size of the mask in `data`. Duplicated inside the binary header so a decoder can detect an envelope/payload mismatch.                           |
| `color`               | `[r, g, b]`      | `mask1` only: 0–255 each, every set bit renders as this colour and every clear bit as black. Ignored for `pal4`, which carries its own palette. |
| `data`                | string           | base64 of the binary block below.                                                                                                               |
| `window`              | object           | The region of the mask this screen displays. For a single-screen selection this is the whole mask at offset 0.                                  |
| `scroll`              | object or absent | Present only for Lauftext. Absent means a static frame.                                                                                         |

`widthPx` and `heightPx` describe the mask, which for Lauftext is the full
filmstrip and is wider than the screen. `window` is how a screen finds its
slice of a shared composite.

### `scroll`

| Field              | Type                  | Notes                                                                                                           |
| ------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `direction`        | `"left"` or `"right"` | Direction the content travels.                                                                                  |
| `speedPxPerSec`    | number                | Device pixels per second.                                                                                       |
| `pauseMs`          | number                | Hold between loop repeats. Fixed at 2000 in v1 (CONTEXT.md "Content").                                          |
| `compositeWidthPx` | number                | Width of the area the content scrolls across — the whole selection, including the phantom gaps between screens. |

`compositeWidthPx` is not the same as the mask's `widthPx`: for Lauftext the
mask is a filmstrip as wide as the rendered text, while the composite is the
selection's own width. A renderer needs both — the text travels from
`compositeWidthPx` to `-widthPx` (or the reverse), and each screen then reads
its own `window.offsetXPx` into that composite. Without it a screen cannot know
how far the text has to go, and multi-screen Lauftext tears at the seams.

Panning is over the **mask**, and `window.offsetXPx` is added on top. Every
screen in one composite must therefore pan from a shared phase, or the content
tears at the seams. This is why all four large screens must be driven from a
single process and all three small screens from a single board.

## MQTT envelope (binary)

The JSON envelope above is what `GET /api/state` returns and what the state
file holds. **MQTT uses a binary envelope instead**, carrying exactly the same
information.

This is not gratuitous: a worst-case small-screen Lauftext filmstrip is ~9.2 KB
as a `mask1` block, ~12.3 KB once base64'd. Parsing that as JSON on an ESP32
means ArduinoJson holding both the document and the decoded string — roughly
24 KB of heap, on top of a matching MQTT buffer. Binary framing removes the
JSON parser and the base64 step from the firmware entirely and drops the
worst case to ~9.2 KB.

Published retained to `ledwall/screen/<id>`, one topic per screen.

```
offset  size  field
0       1     magic, 0x57 ('W')
1       1     version, 0x01
2       1     flags: bit 0 set = scroll fields are meaningful
3       1     color red
4       1     color green
5       1     color blue
6       2     window offsetXPx,  uint16 big-endian
8       2     window offsetYPx,  uint16 big-endian
10      2     window widthPx,    uint16 big-endian
12      2     window heightPx,   uint16 big-endian
14      1     scroll direction: 0 = left, 1 = right
15      2     scroll speedPxPerSec,    uint16 big-endian
17      2     scroll pauseMs,          uint16 big-endian
19      2     scroll compositeWidthPx, uint16 big-endian
21      1     brightness percent, 5-100
22      ...   the binary block below (mask1 or pal4), verbatim
```

Which block follows is read from its own magic byte, not from a field here.
The `color` bytes are meaningful only for a `mask1` block; a `pal4` block
carries its own palette and the decoder ignores them.

The scroll fields are always present so the header is a fixed 22 bytes; when
flags bit 0 is clear they are zero and must be ignored.

`brightness` is carried here because a device driven only by MQTT has no other
way to learn it — the Pi reads it straight out of the state file, but the ESP32
never sees that file. It is the value for this screen's hardware kind, so every
screen on one board receives the same number. A decoder MUST reject
an unexpected magic or version and keep showing its previous frame.

`speedPxPerSec` is rounded to a whole number here. The JSON envelope allows a
fractional value; the difference is well below one pixel per frame and not
observable on a panel.

## `mask1` binary block

7-byte header, then the body.

```
offset  size  field
0       1     magic, 0x50 ('P')
1       1     version, 0x01
2       1     encoding: 0x00 = raw, 0x01 = RLE
3       2     widthPx,  uint16 big-endian
5       2     heightPx, uint16 big-endian
7       ...   body
```

A decoder MUST reject a block whose magic or version is unexpected, and whose
width/height disagree with the envelope.

### Bit layout

Rows run top to bottom. Within a row the most significant bit of the first
byte is the **leftmost** pixel. Each row is padded with clear bits to a whole
byte, so:

```
stride = ceil(widthPx / 8)        bytes per row
raw body size = stride * heightPx
```

Byte-aligned rows are deliberate: both panel sizes (32 and 64) are multiples
of 8, so a screen's window into a composite is almost always byte-aligned and
can be blitted without bit shifting.

### `encoding = 0x00` — raw

The body is exactly `stride * heightPx` bytes, as laid out above.

### `encoding = 0x01` — RLE

The body is a sequence of run lengths over the **padded bit stream** — all
`stride * 8 * heightPx` bits, row padding included. Runs alternate, and the
first run is of clear bits. A leading run of length 0 encodes a mask that
starts with a set bit.

Run lengths are LEB128 varints: 7 bits of value per byte, little-endian
groups, high bit set on every byte except the last.

```
150  ->  0x96 0x01
```

Padding bits are clear and simply merge into the surrounding runs; the decoder
reconstructs the full padded buffer and then reads it back at `stride`.

An encoder MUST emit whichever of raw and RLE is smaller, so a payload is
never larger than raw plus the 7-byte header. For text masks — overwhelmingly
long runs of clear bits — RLE is typically an order of magnitude smaller, which
is what keeps a Lauftext filmstrip inside an ESP32's MQTT buffer.

## `pal4` binary block

Indexed colour, 4 bits per pixel, for flat multi-colour artwork (the
Animation/Bild template library). Same framing ideas as `mask1` — big-endian
header, row padding, raw-or-RLE whichever is smaller — but a wider header
carrying the palette, and runs over nibbles rather than bits.

```
offset  size  field
0       1     magic, 0x51 ('Q')
1       1     version, 0x01
2       1     encoding: 0x00 = raw, 0x01 = RLE
3       2     widthPx,  uint16 big-endian
5       2     heightPx, uint16 big-endian
7       1     paletteCount, 1-16
8       3*n   palette, paletteCount entries of r, g, b
8+3n    ...   body
```

Index 0 is conventionally the background and is what a decoder should use for
any pixel it cannot resolve. A `paletteCount` of 0 or above 16 is invalid.

### Bit layout

Rows run top to bottom. Within a row the **high nibble** of the first byte is
the leftmost pixel. Each row is padded with index-0 nibbles to a whole byte:

```
stride = ceil(widthPx / 2)        bytes per row
raw body size = stride * heightPx
```

### `encoding = 0x00` — raw

The body is exactly `stride * heightPx` bytes.

### `encoding = 0x01` — RLE

Runs over the padded **nibble** stream — all `stride * 2 * heightPx` nibbles,
row padding included. Because there are 16 possible values rather than 2, runs
cannot simply alternate, so each run is encoded explicitly:

```
1 byte   palette index (0-15; the high nibble MUST be 0)
varint   run length, LEB128 as for mask1
```

An encoder MUST emit whichever of raw and RLE is smaller. Flat artwork is
mostly long runs of one index, so RLE usually wins; the `pal4-alternating`
fixture is the case where it does not.

## Worked example

A 12×2 mask, set bits marked `#`:

```
row 0:  ####........
row 1:  ........####
```

`stride = ceil(12 / 8) = 2`, so each row is 2 bytes with 4 padding bits.

```
row 0:  11110000 0000____   ->  0xF0 0x00
row 1:  00000000 1111____   ->  0x00 0xF0
```

Raw body is `stride * heightPx` = 4 bytes, so the raw block is
`50 01 00 000C 0002 F0 00 00 F0` — 11 bytes.

The padded bit stream is `1111000000000000 0000000011110000`. Reading runs
from the start, beginning with clear bits: 0 (it starts set), 4, 20, 4, 4.
The RLE body is `00 04 14 04 04` — 5 bytes, so the RLE block is 12 bytes.

Raw is smaller here, so the encoder emits the raw form. At this size the
7-byte header and the per-run overhead dominate; RLE only starts paying off on
realistic frames, where a 64×64 text mask is mostly one long clear run. Both
forms decode to the same mask, and a decoder must handle either.

## Adding a format later

`format` is the extension point, and each format gets its own magic byte so a
decoder can dispatch on the block alone: `mask1` is 0x50 ('P'), `pal4` is 0x51
('Q'). An RGB565 variant for photographic content would be `"rgb565"` with its
own magic, leaving both existing decoders untouched — they reject what they
don't know. Do not add fields to an existing format that change how its
current bytes are interpreted.
