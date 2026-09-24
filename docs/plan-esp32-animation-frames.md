# ESP32 plan: animated Animation/Bild templates (phase 2)

Companion to [`docs/adr/0002-phase-animated-templates-by-hardware-kind.md`](./adr/0002-phase-animated-templates-by-hardware-kind.md). This is **deferred work** — don't implement it until you're ready to flash and visually verify on the physical small screens; nothing in phase 1 (large screens, already shipped) depends on this.

## Goal

Let an animated Animation/Bild template (currently: the rotating arrow, the wobbling raute — `domain/content.ts`'s `TEMPLATES` with `animated: true`) actually animate on the 3 ESP32-driven 32×32 screens, mirroring the large-screen (Pi) behaviour phase 1 already shipped. Today `frames` (`docs/wire-format.md`) exists only in the JSON envelope; the ESP32 firmware has no binary encoding for it at all, so a small-screen apply of an animated template — nothing currently sends one, but nothing stops it either — decodes as an ordinary static block and shows frame 0, the strip's first slot, same as any other content the firmware doesn't specifically understand.

**Coordinate with [`docs/plan-esp32-lauftext-background.md`](./plan-esp32-lauftext-background.md) before starting.** That plan also proposes a binary-envelope version bump (`0x01` → `0x02`, new flag bit 1, 3 new trailing bytes for a background colour). Both plans are independent and additive — different flag bits, both append past the current 22-byte header — so if neither has shipped yet, do them together as a single `0x02` bump with two new flag bits and both sets of trailing fields, rather than bumping the version twice. If the background phase has already shipped as `0x02` by the time this one starts, this one becomes `0x03` instead; update the byte offsets below accordingly (background's 3 bytes would sit before this phase's fields in that case).

## 1. Wire format (`docs/wire-format.md`)

Bump `ENVELOPE_VERSION` for the **binary MQTT envelope** specifically — the JSON envelope used by the Pi doesn't need this, phase 1 already extended it with an optional field with no version dance needed, exactly as the background phase did. Per the doc's own rule ("do not add fields to an existing format that change how its current bytes are interpreted"), a version bump makes an unflashed old-version device reject the frame cleanly instead of misreading it — `pixelWallDecodeFrame` already checks `payload[1] != ENVELOPE_VERSION` and keeps showing its last good frame.

New header, assuming this phase ships alone (see the coordination note above for the combined case):

```
offset  size  field
...     ...   (0-21 unchanged from v1)
2       1     flags: bit 0 = scroll fields meaningful (unchanged), bit 2 = frame fields meaningful (NEW)
22      1     frames frameCount              (NEW) — 1-255
23      2     frames frameDurationMs, uint16 big-endian, rounded ms (NEW)
25      2     frames compositeWidthPx, uint16 big-endian (NEW)
27      ...   the binary block (mask1 or pal4), verbatim — this started at offset 22 in v1
```

`frameDurationMs` is rounded to a whole millisecond here, mirroring how `scroll.speedPxPerSec` is already rounded on the wire (`docs/wire-format.md`) — the JSON envelope allows a fractional value, and the difference is well below one frame and not observable.

Bit 2 rather than bit 1 deliberately leaves bit 1 free for the background phase's flag, so the two can coexist in one flags byte if combined (see above). `scroll` and `frames` are mutually exclusive on one content (`compositor.py`'s `screen_tile` already branches `if scroll: ... elif frames: ...`), so a decoder only ever needs to read one of bit 0's fields or bit 2's fields, never both — but they occupy different byte ranges regardless (bit 2's fields are new bytes past the v1 header, not a reinterpretation of bit 0's), matching this doc's existing "do not add fields that change how current bytes are interpreted" discipline rather than a tagged union over the same bytes.

Add fixtures to `docs/wire-format-fixtures.json` (an animated `pal4` strip, `frameCount` small enough to keep the fixture readable) so the Python and C decoders are checked against the same vectors as today.

## 2. Firmware: `apps/esp32/pixel_wall_esp32/wire_decode.h`

- Add to `PixelWallScreen` (currently lines 38-62): `bool animating; uint8_t frameCount; uint16_t frameDurationMs; uint16_t frameWidthPx;`
- `pixelWallScreenInit`: no change needed — `memset` already zero-inits, so `animating` defaults to `false`.
- `pixelWallDecodeFrame` (currently lines 219-244): read `flags & FLAG_FRAMES` the same way `flags & FLAG_SCROLL` is read today; when set, read `frameCount = payload[22]`, `frameDurationMs = pixelWallReadU16(payload + 23)`, `frameWidthPx = pixelWallReadU16(payload + 25)`, and pass `payload + 27` (rather than `payload + ENVELOPE_HEADER`) to `pixelWallDecodeBlock`. The header-offset constant needs to become conditional on which flag is set (or on the envelope version, if this ships combined with the background phase) rather than the single fixed `ENVELOPE_HEADER` it is today.
- Add `#define FLAG_FRAMES 0x04` alongside the existing `FLAG_SCROLL 0x01` (and `FLAG_BACKGROUND 0x02`, if that phase has landed).
- **No change** to `pixelWallDecodeBlock`, `pixelWallDecodeBody`, or `pixelWallSample` — picking a frame is a crop offset computed before sampling, not a change to how the mask/pal4 body itself is decoded or sampled, exactly as scroll's offset already works.

## 3. Firmware: `apps/esp32/pixel_wall_esp32/pixel_wall_esp32.ino`

- Add a `frameShiftX` function mirroring `marqueeOffset` (currently lines 147-162), which itself already mirrors `app/compositor.py`'s `screen_tile` and `domain/scroll.ts`'s `marqueeOffsetPx`:

  ```cpp
  /* Mirrors app/compositor.py's screen_tile `frames` branch and
   * animatedTemplate.ts's frame-strip layout: picking a frame is the same
   * crop-a-window-out-of-a-wide-bitmap mechanism as marqueeOffset above, just
   * stepped instead of continuous. */
  static float frameShiftX(const PixelWallScreen &screen, unsigned long elapsedMs) {
      if (screen.frameDurationMs == 0 || screen.frameCount == 0) return 0.0f;
      unsigned long frameIndex = (elapsedMs / screen.frameDurationMs) % screen.frameCount;
      return -(float)(frameIndex * screen.frameWidthPx);
  }
  ```

- `drawFrame()` (currently lines 173-196): `float shiftX = screen.scrolling ? marqueeOffset(screen, elapsedMs) : (screen.animating ? frameShiftX(screen, elapsedMs) : 0.0f);` — same `originX`/`originY`/`pixelWallSample` loop below it, untouched.
- `anyScrolling()` (currently lines 166-171): generalise to `anyMotion()`, checking `.scrolling || .animating` — matches the `has_scrolling` → `has_motion` rename phase 1 already made in `app/compositor.py`, so all three implementations (TypeScript, Python, C++) use the same name for the same concept. Update the one call site in `loop()` (currently line 275) accordingly.
- If the background phase (`docs/plan-esp32-lauftext-background.md`) has also landed, its per-screen fill in `drawFrame()` composes with this unchanged — a frame's crop offset and a screen's background fill are independent concerns.

## 4. Backend: Python MQTT encoder

Two things need to change here, not just firmware — the current backend doesn't forward `frames` over MQTT at all yet, even though `ContentModel.frames` already exists (phase 1):

- `apps/backend/app/wire.py`: add a `Frames` dataclass mirroring `Scroll` (currently lines 29-37) — `frame_count: int`, `frame_duration_ms: int`, `composite_width_px: int`. Add `frames: Optional[Frames] = None` to `ScreenFrame` (currently lines 48-58). `encode_frame`/`decode_frame` (currently lines 71-133) need a `FLAG_FRAMES` branch alongside the existing `FLAG_SCROLL` one, writing/reading the 5 new header bytes exactly as laid out above.
- `apps/backend/app/compose.py`'s `frame_for_screen` (currently lines 54-75) only reads `content.scroll` today — it needs a matching `if content.frames is not None: frames = Frames(...)` branch, passed into `ScreenFrame`. Without this, even a fully-flashed v2/v3 firmware would never actually receive `frames` — the gap is on the encoder side, not just the decoder.
- Emit the new envelope version unconditionally once the firmware above is flashed and confirmed (see rollout) — unlike the background phase (which conditions the version on whether a screen actually has a background), there's no equivalent "only when needed" condition here: any screen with `frames` set needs the new version, and any screen without it is unaffected by the bump either way.

## 5. Testing

- `apps/backend/tests/test_esp32_decoder.py` (host build against `wire_decode.h`): add cases decoding an envelope with `frames` set, with and without a simultaneous `background` if combined, and confirm the pre-bump envelope shape still decodes exactly as it does today.
- `apps/backend/tests/test_wire.py`: matching Python-side round-trip tests (encode with `frames`, assert decode), following the existing pattern for `scroll`.
- `apps/backend/tests/test_compositor.py` is Pi-only (`frames` there is already tested — see `test_frames_show_the_slot_the_elapsed_time_selects`, `test_frames_loop_back_to_the_first_slot`) and untouched by this phase.

## 6. Rollout (manual, hardware-in-the-loop — this part is on you, not something to automate)

1. Flash the updated firmware with the backend still emitting the current version. Confirm nothing regressed — small screens should behave exactly as before, since the firmware is now frames-capable but nothing sends it a frames-bearing envelope yet.
2. Flip the backend to emit the new version for small-screen animated-template content specifically (or unconditionally, once confirmed safe — see "4" above on why there's no partial-rollout condition needed here).
3. Visually confirm on the physical wall: the arrow rotates and the raute wobbles on the small screens the same way they already do on the large ones (both convert at the same fixed `ANIMATION_FPS`, currently 16 — see `domain/content.ts`), with no tearing at the loop point and no regression to existing static-text/Farbe/non-animated-template content on small screens.
4. Only then remove this plan's "shows frame 0 statically" caveat from `docs/wire-format.md` and `docs/adr/0002-...`.
