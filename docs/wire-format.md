# Pixel Wall wire format

The payload the backend sends to a panel driver (`pi_display.py` over the
state file, the ESP32 over MQTT). Frozen here so the TypeScript encoder, the
Python decoder and the C++ decoder are each written against this document
rather than against one another.

See `INTEGRATION-PLAN.md` for why these formats exist and
`docs/wire-format-fixtures.json` for the shared test vectors.

## Why 1-bit and 4-bit, not RGB

Farbe (a flat fill of one preset colour, with no foreground) is genuinely
monochrome and travels as `mask1` — a 1-bit coverage mask plus one RGB colour
— 512 bytes for a 64×64 frame instead of 12,288 for RGB888.

Text and Animation/Bild both travel as `pal4` instead: text carries a
user-chosen colour (and, since it sits over a Hintergrund, up to one more for
the background) rather than always being a single fixed colour, and every
Animation/Bild template is real, possibly multi-coloured artwork —
`src/render/wire.ts` does not special-case per template, so no template is
ever forced into a colour it doesn't have, and multi-colour content must not
be faked by dithering a `mask1` mask. `pal4` is 4× larger than `mask1` on the
one size-critical case, a Lauftext filmstrip, which is why Farbe alone stays
on `mask1`.

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
	"scroll": { "direction": "left", "speedPxPerSec": 60, "pauseMs": 2000 },
	"frames": { "frameCount": 12, "frameDurationMs": 83.3, "compositeWidthPx": 64 },
	"background": [30, 55, 145]
}
```

| Field                 | Type                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`              | string                | `"mask1"` or `"pal4"`. A decoder MUST reject an unknown value and keep showing its previous frame rather than attempt to render it.                                                                                                                                                                                                                                                                                                                                                |
| `widthPx`, `heightPx` | uint16                | Size of the mask in `data`. Duplicated inside the binary header so a decoder can detect an envelope/payload mismatch.                                                                                                                                                                                                                                                                                                                                                              |
| `color`               | `[r, g, b]`           | `mask1` only: 0–255 each, every set bit renders as this colour and every clear bit as black. Ignored for `pal4`, which carries its own palette.                                                                                                                                                                                                                                                                                                                                    |
| `data`                | string                | base64 of the binary block below.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `window`              | object                | The region of the mask this screen displays. For a single-screen selection this is the whole mask at offset 0.                                                                                                                                                                                                                                                                                                                                                                     |
| `scroll`              | object or absent      | Present only for Lauftext. Absent means a static frame. Mutually exclusive with `frames` — a renderer never has to handle both on the same content.                                                                                                                                                                                                                                                                                                                               |
| `frames`              | object or absent      | Present only for an animated Animation/Bild template. See "`frames`" below. Large (Pi) screens only for now — see `docs/adr/0002-phase-animated-templates-by-hardware-kind.md` and `docs/plan-esp32-animation-frames.md`. Absent everywhere else, including today's ESP32-driven small screens, which show `data`'s first frame statically until that phase lands.                                                                                                            |
| `background`          | `[r, g, b]` or absent | A static fill a renderer paints _behind_ `data`, wherever `data` has nothing lit (`mask1` clear bit, or `pal4` index 0) — never baked into `data` itself, since for a scrolling frame that would pan along with the text. Present only for Lauftext on large (Pi) screens for now — see `docs/adr/0001-phase-lauftext-background-by-hardware-kind.md`. Absent everywhere else, including today's ESP32-driven small screens, which keep rendering on black until that phase lands. |

`widthPx` and `heightPx` describe the mask, which for Lauftext is the full
filmstrip and for an animated template is `frameCount` frames laid out side
by side — in both cases wider than the screen. `window` is how a screen finds
its slice of a shared composite.

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

### `frames`

| Field              | Type   | Notes                                                                                          |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| `frameCount`       | number | How many frames `data` contains, 1–255.                                                          |
| `frameDurationMs`  | number | How long each frame is shown before advancing to the next.                                       |
| `compositeWidthPx` | number | Width of one frame — not `widthPx`, which is the whole strip (`frameCount * compositeWidthPx`). |

A renderer picks `floor(elapsedMs / frameDurationMs) % frameCount`, then
crops the `compositeWidthPx`-wide slot at that index out of the mask —
`window.offsetXPx` is added on top exactly as for a static frame, since each
slot is itself a full composite. This is the same
crop-a-window-out-of-a-wide-bitmap mechanism as `scroll` above, just stepped
instead of continuous, and for the same reason: the frontend rasterises once
and every renderer plays it back as a pure function of elapsed time, so
multiple screens of one composite stay in phase for free.

Because the two are mutually exclusive on one content, `frameCount` and
`frameDurationMs` are chosen so that `frameCount * frameDurationMs` reproduces
the animated template's own authored loop length (both templates that exist
today loop every 4000ms) — sampled at a frame rate the editor's fps control
picks per edit (see `apps/frontend/src/domain/content.ts`'s
`Template.animated`/`loopMs` and `apps/frontend/src/render/animatedTemplate.ts`).
Like `scroll`'s `speedPxPerSec`, `frameDurationMs` may be fractional; the
difference is well below one frame and not observable.

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

**`frames` has no binary encoding yet.** It exists only in the JSON envelope
above, which today only reaches large (Pi) screens — the Pi reads the state
file directly rather than going over MQTT, so this is not a gap in what's
shipped, only in what the ESP32 side can do. Adding it to this binary
envelope is planned, not implemented — see
`docs/plan-esp32-animation-frames.md` for the exact header/flag layout that
plan proposes, mirroring how `docs/plan-esp32-lauftext-background.md`
similarly extends this same header for `background`. An ESP32 that receives
an animated template's multi-frame `data` today (nothing currently sends it
one, but nothing stops the backend from trying) decodes it as an ordinary
static block and shows frame 0 — the first `compositeWidthPx`-wide slot of
the strip — rather than animating or corrupting.

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
