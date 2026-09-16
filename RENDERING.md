# Pixel Wall — Rendering & Wire Protocol (draft)

Companion to [`HARDWARE.md`](./HARDWARE.md) (physical wiring) and
[`CONTEXT.md`](./CONTEXT.md) (content/domain glossary). This file works out the
piece both of those flag as open: how a **selection → content edit** in the
frontend actually becomes pixels on the 4× 64×64 panels (and, separately, the
3× 32×32 panels), given that a selection can be a single screen, a chained
strip, or a 2D block, and that content can shift across the seam between
screens both horizontally and vertically.

**Status: draft, not implemented.** This reconciles `apps/frontend/src/domain/*`
(the model the frontend already codes toward) with `apps/backend` and
`pi_display.py` (what's actually running today, per HARDWARE.md's
"Current implementation status"). Nothing here is committed to; it's the
starting point for that decision, not the record of it.

## The two coordinate spaces

This is the crux of the whole design, so it goes first.

**Content space.** `domain/mapping.ts`'s `computeDisplayComposite` lays a
selection's screens out using their real dragged mm positions (`Layout`),
converted to px via each kind's pitch (`PITCH_MM_PER_PX`). For a 2-screen
horizontal selection this produces a composite wider than 2×64=128px whenever
there's real cable slack between the panels — the extra width is the "phantom
gap" CONTEXT.md's **Content** section describes ("treating the real physical
gap between screens as blank/phantom pixels so text doesn't visually jump").
`apply.ts`'s `buildApplyRequest` rasterizes content into this space at device
resolution and gives each screen an `{offsetXPx, offsetYPx}` — its window into
that bitmap.

**Hardware matrix space.** Per HARDWARE.md, `pi_display.py` configures
`rpi-rgb-led-matrix` with `chain_length=2, parallel=2`, which makes the library
treat all 4 large panels as **one continuous, gapless 128×128 index space** —
column/row addresses, not millimeters. Which physical panel sits at which
128×128 quadrant is fixed by which HUB75 output it's wired to and where it
sits in its chain; it cannot change at runtime and has nothing to do with
where the user last dragged that screen in the layout tool.

These two spaces must not be conflated. Content space explains _how much
bitmap to leave as gap_ and _where each screen's window sits in that bitmap_;
matrix space explains _which physical quadrant the backend blits that window
into_. The frontend already owns the first (correctly — it needs the mm
layout for the phantom-gap sizing). The second doesn't exist anywhere yet and
isn't derivable from `DEFAULT_LAYOUT`: those positions are the Figma-sourced
default _planning_ arrangement (and are demonstrably not a clean rectangle —
04–07 sit at scattered coordinates), not the electrical chain topology.
HARDWARE.md's own note that the two panels of a chain-pair can be dragged
apart despite being "electrically one continuous canvas" is the same point
from the hardware side.

**What this means concretely:** the backend needs a small, fixed,
hand-verified table —

```python
# apps/backend/app/hardware_map.py (new)
# screenId -> this screen's fixed rectangle within the 128x128 matrix index space.
# Determined once, by bench test (address each quadrant, note which physical
# panel lights up) — not derived from layout.json, and not user-editable.
LARGE_SCREEN_MATRIX_RECT = {
    "04": (0, 0, 64, 64),
    "05": (64, 0, 64, 64),
    "06": (0, 64, 64, 64),
    "07": (64, 64, 64, 64),
}
```

— independent of, and in addition to, the mm `Layout` the frontend already
persists. Nothing about a selection needs to be a rectangle in matrix space;
because `parallel=2` makes the whole 128×128 canvas always addressable
regardless of which screens are currently selected, any contiguous subset the
frontend's `validateSelection` accepts is drivable — the backend just needs
this table to know where to blit each screen's cropped tile.

## Large screens: the wire contract

The shape already sketched in `api/types.ts` (`ApplyRequest`/`StateResponse`)
is the right shape; it needs two concrete extensions before a backend can
consume it.

**1. Scroll is x-axis only — confirmed, including for column selections.**
Lauftext always scrolls left/right, never up/down, regardless of whether the
selection is a row or a column of large screens. CONTEXT.md's "single row or
single column" only scopes _which selections may carry Lauftext at all_, not
which axis it scrolls on — the axis is always x. That matches what's already
built, so none of it needs to change:

- `TextContent.direction` (`domain/types.ts:31`) is typed `"left" | "right"` —
  correct as-is, no `"up"`/`"down"` to add.
- `domain/scroll.ts`'s `marqueeOffsetPx` takes `compositeWidthPx`/`textWidthPx`
  and only ever produces an x-offset — correct as-is.
- `render/ContentLayer.tsx`'s `ScrollingBitmap` only ever animates `left`
  (`style={{ ..., left: offset, top: 0 }}`) — correct as-is.
- `domain/apply.ts`'s scrolling branch only ever widens the bitmap
  (`bitmapWidthPx = textWidthPx`), never its height — correct as-is.

For a column selection this means the composite is tall (it spans the
stacked screens' combined height, phantom gap included) but only ever one
screen wide, so the text scrolls left/right within that single-screen-wide
window; `vAlign` decides where in the tall composite it sits. There's no
vertical or 2D-block scroll case to design for on either the frontend or the
Pi-side render loop below — the render loop's per-frame crop offset is always
an x-offset, full stop.

**2. `offsetXPx/offsetYPx` in `ApplyRequest.screens[]` is content-space, and
the backend needs to keep it that way — never conflate it with the matrix
table above.** The backend's job per screen, every time it needs to redraw:
crop the applied bitmap at that screen's content-space window, then blit the
result into that screen's fixed matrix-space rectangle from
`LARGE_SCREEN_MATRIX_RECT`. Two lookups, two different tables, composed.

**3. Backend state needs to become per-screen, not one global blob.** Today's
`WallState` (`app/models.py`) is a single `{text, color, brightness, speed_ms}`
— one message for the whole wall. `StateResponse` in `api/types.ts` already
models the target shape (`Record<screenId, {geometry, content}>`); the backend
needs an equivalent `state.json` restructure, and `PUT/PATCH /api/state`
retired in favor of `POST /api/apply` (which only ever touches the screens in
its own `selectionKind`/`screens[]`, leaving the rest of the wall's applied
state untouched — matching what CONTEXT.md's **Apply changes** section
already requires of the frontend).

**4. The render loop, not just the state store, needs a rewrite.**
`pi_display.py` today owns both jobs at once: it _is_ the renderer (draws its
own text with a local BDF font) and the poller (re-reads `state.json` every
200ms mid-scroll). The new model moves rendering entirely to the frontend
(CONTEXT.md **Rendering split**: the frontend sends a finished bitmap, never
raw text) — so the Pi process's job shrinks to: hold the last-applied
`{bitmap, geometry, scroll?}` for each of the 4 large screenIds in memory,
and on every frame, for each one, compute its current crop offset (0 if
static; `marqueeOffsetPx(elapsedMs, ...)` if scrolling), crop that region out
of its decoded bitmap with PIL, and blit it into its fixed matrix rectangle.
Because all 4 panels are one physical canvas, this loop always redraws the
whole 128×128 frame every tick regardless of which screen(s) actually
changed — "already-applied screens are left untouched" (CONTEXT.md) is a
guarantee about _state_, not about _frame composition_.

Keeping the same file-based hand-off `pi_display.py` already uses (backend
writes, display process polls, no direct coupling — so the wall survives a
backend restart) is worth preserving rather than replacing with an in-process
call, for the same resilience reason HARDWARE.md gives today.

## Small screens: a deliberately simpler contract

CONTEXT.md is explicit that small screens "never combine into a shared
canvas" — a selection of small screens applies the _same_ content
independently to each. That has a real simplification worth keeping: there is
no per-screen geometry to compute or send at all for small-screen applies,
and only one MQTT message is needed (all 3 ESP32 panels subscribe to the same
retained topic and render it identically), not three.

Two things to settle before the ESP32 firmware (which HARDWARE.md notes
doesn't exist yet) gets written, since both are much cheaper to decide now
than to retrofit:

- **Wire format shouldn't be PNG.** The frontend's bitmap is a base64 PNG —
  fine over HTTP to a Pi with Pillow available, expensive to decode on an
  ESP32-WROOM-32 with no PNG library in the current toolchain
  (`ESP32-HUB75-MatrixPanel-DMA`, per HARDWARE.md). The backend should decode
  the PNG once (it already will, to crop the large-screen composite) and
  publish a raw packed framebuffer instead — 32×32 RGB565 is 2048 bytes,
  trivially small for MQTT and for `ArduinoJson`/a fixed buffer on the ESP32
  side, and needs no decode logic beyond memcpy-into-framebuffer.
- **Scroll needs a shared time origin, not each device's own clock-since-boot.**
  `useMarqueeOffset` drives every preview tile off `performance.now()`, which
  is why multiple tiles in one browser tab stay in phase "for free" — but
  that only holds within one tab. Three independent ESP32s (and the Pi, and
  any other open browser tab) each have their own "time since I started"
  and would drift out of phase with each other for no reason a viewer could
  guess at. `ApplyResponse.appliedAt` (already in `api/types.ts`) is the
  natural fix: forward it as scroll's `t0`, and have every renderer — browser
  tabs, the Pi loop, the ESP32 firmware — compute `elapsedMs = now() - t0`
  against their own clock. Wall-clock drift between devices on the same WiFi
  is small enough not to matter for a visual marquee; independent "since I
  booted" clocks are not.

## Open items this doc doesn't resolve

- `api/client.ts`'s `request()` helper (used by `getScreens`/`getLayout`/
  `getState`/`applyChanges`) doesn't attach the `Authorization` header the
  way `lib/api.ts`'s `apiFetch` does for the currently-live `/api/state`
  endpoints — fine while it only targets the MSW mock, needs reconciling
  before it targets the real backend.
- The bench test HARDWARE.md already flags (verify the daisy-chain's cable
  run) and the one this doc adds (verify which physical large panel sits at
  which matrix quadrant) are both one-time hardware checks worth doing in the
  same session, since both need someone standing in front of the wall.
