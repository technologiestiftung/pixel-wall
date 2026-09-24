# ESP32 plan: static background behind Lauftext (phase 2)

Companion to [`docs/adr/0001-phase-lauftext-background-by-hardware-kind.md`](./adr/0001-phase-lauftext-background-by-hardware-kind.md). This is **deferred work** — don't implement it until you're ready to flash and visually verify on the physical small screens; nothing in phase 1 (large screens) depends on this.

## Goal

Let a background colour show, static and non-scrolling, behind Lauftext on the 3 ESP32-driven 32×32 screens — mirroring the large-screen (Pi) behaviour from phase 1. Today `drawFrame()` clears the whole 96×32 canvas to black once per frame and only ever paints pixels `pixelWallSample()` reports as "lit"; everything else stays black. The fix doesn't touch how the scrolling `mask1`/`pal4` block itself is decoded — it adds a second, independent "background colour" concept that fills in wherever a screen has nothing lit. This mirrors why the background has to be dropped from the filmstrip today: baking it into the panned bitmap would make it slide with the text.

## 1. Wire format (`docs/wire-format.md`)

Bump `ENVELOPE_VERSION` from `0x01` to `0x02` for the **binary MQTT envelope** specifically — the JSON envelope used by the Pi doesn't need this, phase 1 already extended it with an optional field with no version dance needed. Per the doc's own rule ("do not add fields to an existing format that change how its current bytes are interpreted"), extending the fixed 22-byte header in place under the same version number would make an unflashed v1 device misread the block that follows it. A version bump makes old firmware reject the frame cleanly instead — `pixelWallDecodeFrame` already checks `payload[1] != ENVELOPE_VERSION` — and keep showing its last good frame, rather than corrupt-decode it.

New v2 header (25 bytes total, extending the table in `docs/wire-format.md`):

```
offset  size  field
...     ...   (0-21 unchanged from v1)
2       1     flags: bit 0 = scroll fields meaningful (unchanged), bit 1 = background fields meaningful (NEW)
22      1     background red     (NEW, v2 only)
23      1     background green   (NEW, v2 only)
24      1     background blue    (NEW, v2 only)
25      ...   the binary block (mask1 or pal4), verbatim — this started at offset 22 in v1
```

When flag bit 1 is clear, bytes 22-24 are zero and must be ignored — mirrors how the existing scroll fields already behave when bit 0 is clear.

Add a couple of new fixtures to `docs/wire-format-fixtures.json` (scrolling `pal4` with a background, scrolling with none) so the Python and C decoders can be checked against the same vectors as today.

## 2. Firmware: `apps/esp32/pixel_wall_esp32/wire_decode.h`

- Add to `PixelWallScreen`: `bool hasBackground; uint8_t bgR, bgG, bgB;`
- `pixelWallScreenInit`: no change needed — `memset` already zero-inits, so `hasBackground` defaults to `false`.
- `pixelWallDecodeFrame` (currently lines 219-244): branch on `payload[1]`. `0x01` keeps today's 22-byte header exactly as now, block starts at `payload + 22`. `0x02` reads the 25-byte header, sets `hasBackground = (payload[2] & FLAG_BACKGROUND) != 0` and `bgR/bgG/bgB = payload[22..24]`, and passes `payload + 25` to `pixelWallDecodeBlock`. Reject any other version, as today.
- Add `#define FLAG_BACKGROUND 0x02` alongside the existing `FLAG_SCROLL 0x01`.
- **No change** to `pixelWallDecodeBlock`, `pixelWallDecodeBody`, or `pixelWallSample` — the mask/pal4 bit-packing and the "unlit pixel → return false" contract stay exactly as-is. Background compositing happens one layer below that, not inside it.

## 3. Firmware: `apps/esp32/pixel_wall_esp32/pixel_wall_esp32.ino`

`drawFrame()` (lines 173-196) currently does one canvas-wide `display->clearScreen()` (always black) before the per-screen sampling loop. Since the 3 screens are independently addressed and could each have a different background, replace the single global clear with a per-screen fill:

```cpp
static void drawFrame(unsigned long elapsedMs) {
    for (int index = 0; index < SCREEN_COUNT; index++) {
        const PixelWallScreen &screen = screens[index];
        int slotX = index * PANEL_RES_X;

        // Per-screen base fill: this screen's background if it has one, else
        // black — replaces the old single canvas-wide clearScreen().
        uint8_t fillR = 0, fillG = 0, fillB = 0;
        if (screen.valid && screen.hasBackground) {
            fillR = screen.bgR; fillG = screen.bgG; fillB = screen.bgB;
        }
        for (int y = 0; y < PANEL_RES_Y; y++) {
            for (int x = 0; x < PANEL_RES_X; x++) {
                display->drawPixelRGB888(slotX + x, y, fillR, fillG, fillB);
            }
        }

        if (!screen.valid || screen.pixels == nullptr) continue;

        float shiftX = screen.scrolling ? marqueeOffset(screen, elapsedMs) : 0.0f;
        int originX = (int)lroundf(shiftX) - (int)screen.winX;
        int originY = -(int)screen.winY;

        for (int y = 0; y < PANEL_RES_Y; y++) {
            for (int x = 0; x < PANEL_RES_X; x++) {
                uint8_t r, g, b;
                if (pixelWallSample(&screen, x - originX, y - originY, &r, &g, &b)) {
                    display->drawPixelRGB888(slotX + x, y, r, g, b);
                }
            }
        }
    }
    display->flipDMABuffer();
}
```

Two passes per screen (fill, then overlay lit pixels) instead of one global clear plus one pass — negligible cost at 32×32×3 against the existing 20ms frame budget.

## 4. Backend: Python MQTT encoder

Locate the code that builds the binary envelope for MQTT publish (in `apps/backend/app/mqtt.py` or nearby — confirm the exact function before starting, it wasn't pinned down during design). Add: emit `ENVELOPE_VERSION = 2`, set flag bit 1 and the 3 background bytes when the screen's `ScreenLayers.background` is non-null and the content is scrolling text (mirroring the phase-1 `compositor.py` logic for the Pi). Hold the encoder at version 1 (today's behaviour, unconditionally) until the firmware above is actually flashed — see rollout below.

## 5. Testing

- `apps/backend/tests/test_esp32_decoder.py` (host build against `wire_decode.h`): add cases decoding a v2 envelope with and without a background set, and confirm a v1 envelope still decodes exactly as it does today.
- The Python-side binary encoder gets matching round-trip tests (encode v2, assert decode), following the existing pattern in `apps/backend/tests/test_wire.py`.
- `apps/backend/tests/test_compositor.py` is Pi-only and untouched by this phase.

## 6. Rollout (manual, hardware-in-the-loop — this part is on you, not something to automate)

1. Flash the updated firmware with the backend still emitting v1. Confirm nothing regressed — small screens should behave exactly as before, since the firmware is now v2-capable but nothing sends it v2 yet.
2. Flip the backend to emit v2 for small-screen Lauftext content specifically.
3. Visually confirm on the physical wall: background stays static behind the panning text, no tearing at the loop-pause reset, and existing static-text/Animation content on small screens is unaffected.
4. Only then remove the phase-1 UI restriction (the "Hintergrund does nothing yet for a small-screen Lauftext selection" warning) for small-screen selections.
