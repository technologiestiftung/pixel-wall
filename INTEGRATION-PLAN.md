# Integration Plan — Frontend → Backend → Panels

Status: **Phases A–F complete and merged**; only **G** (end-to-end against the
real wall) is outstanding. D and E are written and unit-tested but have never
run on hardware. Written to be
read alongside `CONTEXT.md`
(the domain glossary), which this plan treats as the source of truth for
*behaviour* and deliberately contradicts in two places on *hardware* (see
"Open questions" — those need confirming against the physical wall).

## Where we are today

The frontend is complete and self-consistent, but nothing it does reaches a
panel. Three separate breaks:

1. **The frontend talks to a mock in every environment.** `src/main.tsx`
   starts MSW unconditionally; `src/api/mocks/handlers.ts` stores applied
   content in a module-level object that dies with the tab.
2. **The endpoints don't exist.** The frontend calls `/api/screens`,
   `/api/layout`, `/api/apply` and a per-screen `/api/state`. The backend
   serves one flat global `{text, color, brightness, speed_ms}`.
3. **The panels can't render what the frontend produces.** `pi_display.py`
   and the ESP32 firmware each draw text themselves from a string. The
   frontend sends a rasterised bitmap. Farbe, Animation/Bild, scale,
   per-screen selection and layout have no downstream representation at all.

There are also two unrelated HTTP layers in the frontend: `src/lib/api.ts`
(real backend, Basic auth, used only by the auth gate) and
`src/api/client.ts` (no auth, mocked). The password gate authenticates
against the real Pi and everything behind it then writes to a mock.

## The decision everything else hangs on

Do the panels keep rendering content themselves from semantic fields, or do
they receive pixels?

**Recommendation: pixels**, because the alternative cannot express the v1
feature set. Animation/Bild templates, per-screen slices of a shared
composite, alignment and scale, and text flowing across a physical gap all
require the renderer to know the full composite geometry — which only the
frontend has. Keeping text rendering on the devices would mean reimplementing
the template library and the composite mapping twice in C++ and Python, and
would still not support Animation/Bild.

### Payload format: 1-bit mask + colour, RLE-compressed

The key observation is in `src/render/rasterize.ts`: **every v1 content type
is monochrome**. Text is drawn in `#ffffff`, template icons are drawn in
`#ffffff`, and Farbe is a flat fill of one of four presets. So the entire v1
content space is exactly *a 1-bit coverage mask plus one RGB colour*.

That makes the wire payload dramatically smaller than an RGB bitmap:

| Format | 64×64 frame |
|---|---|
| RGB888 | 12,288 B |
| RGB565 | 8,192 B |
| **1-bit mask** | **512 B** (684 B base64) |

Proposed per-screen payload:

```json
{
  "format": "mask1",
  "widthPx": 148,
  "heightPx": 64,
  "color": [254, 241, 119],
  "data": "<base64 of RLE-encoded 1-bit rows>",
  "scroll": { "direction": "left", "speedPxPerSec": 60, "pauseMs": 2000 },
  "window": { "offsetXPx": 84, "offsetYPx": 0, "widthPx": 64, "heightPx": 64 }
}
```

`format` is the extension point: `"pal4"` (below) carries multi-colour
template artwork, and a future `"rgb565"` could carry photographic content
without breaking deployed firmware — devices reject formats they don't know
rather than mis-rendering.

RLE matters most for Lauftext: a scrolling filmstrip is as wide as the full
text, so a 256-character message at a large font size can be several thousand
pixels wide. Uncompressed that is ~60 KB; as a mask it is ~7.7 KB; RLE'd
(text masks are overwhelmingly runs of zeros) it should land in the hundreds
of bytes. **This is the main technical risk** — see "Risks" below.

## Target architecture

```
frontend  ──HTTP──▶  FastAPI backend  ──┬── state.json ──▶ pi_display.py ──▶ 4 large panels
(rasterises)         (stores, fans out) └── MQTT per-screen ──▶ ESP32 ──▶ 3 small panels
```

The backend stays the single source of truth. The Pi reads the state file
directly (so the wall survives a backend restart, as today); the ESP32 gets
retained MQTT messages (as today). Only the *shape* of what they consume
changes.

### Screen addressing vs. user layout

These are two different coordinate systems and must not be conflated:

- **Wall layout** (mm, user-dragged, persisted via `/api/layout`) decides how
  content is *split across* a selection. The frontend already resolves this
  into per-screen `geometry` offsets in `src/domain/apply.ts`.
- **Hardware layout** (which panel sits where in a HUB75 chain) is fixed by
  cabling and is *not* user-editable. It belongs in device-side config.

So the devices never need to know about millimetres. They need a static map
of `screenId → (originX, originY)` within their own physical canvas, and then
blit each screen's `window` slice at that origin.

### Scroll synchronisation

For Lauftext across a multi-screen composite, every screen must pan the same
filmstrip at the same phase, or the text tears at the seams. This is free
given the current hardware: all four large screens live in one `pi_display.py`
process on one canvas, and all three small screens live on one ESP32.
Selections can never mix kinds (`CONTEXT.md` "Selection"), so no cross-device
clock sync is required. **If the small screens are ever split onto three
separate boards, this becomes a real problem** and would need a shared
timebase.

## Phases

### Phase A — Freeze the wire format — **done**

- `docs/wire-format.md` — normative spec.
- `docs/wire-format-fixtures.json` — shared test vectors for both formats.
- `apps/frontend/src/domain/mask.ts` — TypeScript codec.
- `apps/backend/app/mask.py` — Python codec.
- `apps/backend/app/wire.py` — binary MQTT envelope.

The two codecs were written independently from the spec and cross-checked
against a third throwaway implementation that generated the fixtures, so a
shared misreading of the spec would have shown up as a mismatch rather than
as agreement.

Phase A produced three decisions that were not in the original proposal:

**MQTT carries a binary envelope, not JSON.** Measuring real payloads (below)
showed a worst-case small-screen filmstrip at ~12.3 KB of base64 inside JSON,
which an ESP32 would have to parse with ArduinoJson holding both document and
decoded string — roughly 24 KB of heap. A fixed 19-byte binary header plus the
raw block drops that to ~9.2 KB and removes the JSON parser and the base64
step from the firmware entirely. HTTP and the state file keep the JSON
envelope, which is unproblematic in Python and TypeScript.

**Chunked MQTT transfer is not needed.** This was the plan's main open risk.
Measured worst case for the ESP32 path is ~9.2 KB, so Phase E raises
`setBufferSize()` to 16 KB and that is the whole mitigation.

**Multi-colour is `pal4`, not RGB565.** The multi-colour content actually
planned is flat-colour template artwork, not photographs, and text remains
single-coloured — so a scrolling filmstrip is never multi-colour, and the
147 KB RGB565 filmstrip problem never arises. `pal4` is 4-bit indexed colour
with a 16-entry palette, reusing `mask1`'s header, raw/RLE framing and row
padding. `mask1` stays the default and is used for all text, because it is
4× smaller on the one size-critical case.

#### Measured payload sizes

| Scenario | mask | `mask1` | on the wire |
|---|---|---|---|
| Any static frame (Farbe, template, static text) | ≤ 148×64 | ≤ 200 B | ≤ 268 B |
| Small screen, 20-char Lauftext | 180×32 | 743 B | 762 B |
| Small screen, 256-char Lauftext (max) | 2304×32 | 9,223 B | 9,242 B |
| Large screen, 64-char Lauftext | 1856×64 | 8,316 B | 11,088 B |
| Large screen, 256-char Lauftext (max) | 7424×64 | 32,494 B | 43,328 B |

Small screens go to the ESP32 over the binary envelope; large screens go to
the Pi through the state file as base64 JSON, where 43 KB does not matter.

Worth knowing for later: RLE *loses* to raw on small-screen text, because a
16px font on a 32px-tall canvas leaves few long clear runs. The
"emit whichever is smaller" rule means this costs nothing, but it does mean
small-screen payloads will not shrink much if the format is revisited.

### Phase B — Backend: per-screen state — **done**

Rework `apps/backend/app/`:

- `models.py` — replace the flat `WallState` with `ScreenSpec`,
  `LayoutPosition`, `ScreenGeometry`, `ScreenContent`, and a `WallState` that
  is `{layout: [...], screens: {id: {geometry, content}}}`. Keep the existing
  clamping/coercion discipline (`BeforeValidator`) — it's good and should
  carry over to the new fields.
- `state.py` — keep the atomic-write machinery as-is (it's solid); only the
  payload shape changes. Bitmaps live in the state file as base64.
- `main.py` — new endpoints matching `src/api/types.ts`:
  - `GET /api/screens` — the 7 specs. Static, from config.
  - `GET /api/layout` / `PUT /api/layout` — persisted mm positions.
  - `GET /api/state` — per-screen geometry + content.
  - `POST /api/apply` — accept an `ApplyRequest`, slice the composite bitmap
    per screen, persist, fan out.

  Drop `PUT`/`PATCH /api/state` and the old flat shape. Nothing is deployed
  publicly yet, so a clean break beats a compatibility layer — but the
  systemd units in `apps/backend/systemd/` and both READMEs need updating in
  the same change.

**Where the slicing happens** is a real choice. The frontend currently sends
one composite bitmap plus per-screen geometry windows. The backend can either
(a) store the composite once and let each device slice using `window`, or
(b) slice server-side and store 7 independent per-screen bitmaps.

Recommend **(b)**: it keeps the devices dumb, lets each MQTT message be
self-contained and retained per topic, and avoids shipping the whole composite
to a device that needs a 64×64 corner of it. The cost is that the backend
gains a small bitmap-slicing routine. For Lauftext the filmstrip cannot be
sliced (every screen needs the whole strip), so scrolling content is the
exception: send the full strip plus each screen's window offset.

**Brightness** gets a real frontend control rather than a hidden backend
setting. Two values — one for small screens, one for large — since the two
kinds are driven by separate boards and `setBrightness8`/`matrix.brightness`
are both whole-canvas properties, so per-kind is the finest granularity the
hardware supports natively.

The slider lives in the edit panel and edits the brightness for the kind of
the current selection (a selection is always single-kind, per CONTEXT.md
"Selection"), committed by the existing Speichern button alongside the content
edit. It therefore affects every screen of that kind, not just the selected
ones — the label must say so explicitly rather than looking selection-scoped.

Backend: `brightness` becomes `{"small": 60, "large": 60}` at the top of the
wall state, included in `GET /api/state` and accepted by `POST /api/apply`.
Frontend: `draftHasChanges` must treat a brightness change as a change, or
Speichern stays disabled.

### Phase C — Backend: per-screen MQTT — **done**

`mqtt.py` currently publishes one retained message to `ledwall/message`.
Change to one retained message per screen: `ledwall/screen/<id>`.

Retained-per-topic is what makes a device reboot recover its exact content
without the backend being up — worth preserving. Keep the fire-and-forget
error handling exactly as it is.

### Phase D — `pi_display.py` rewrite — **done, untested on hardware**

Largest single piece of work. It stops being a text renderer and becomes a
compositor:

- Drop `graphics.Font` / `DrawText` and the BDF font dependency entirely.
- Read the new state file; for each large screen, decode its mask, tint it
  with `color`, and blit at that screen's hardware origin.
- Drive Lauftext panning from `scroll` metadata: advance one position per
  `speedPxPerSec`, hold `pauseMs` between loops, and pan *the composite*, not
  each screen independently.
- Keep the existing defensive `read_state` posture (never raise, keep showing
  the last good frame) and the mid-scroll re-poll.
- Handle both `mask1` and `pal4`, rejecting anything else and keeping the
  last good frame.

Add `apps/backend/app/hardware.py` holding the fixed `screenId → rectangle
within the 128×128 matrix` table. This is **not** derivable from the mm
`Layout`: the layout is the user's planning arrangement, while the matrix
rectangle is fixed by which bonnet output a panel hangs off and where it sits
in that chain. Two different coordinate spaces, composed per redraw — crop the
applied bitmap at the screen's content-space window, then blit into its
matrix-space rectangle.

With `chain_length = 2, parallel = 2`, `parallel` selects the bonnet output
and `chain_length` the position along that output's chain:

| Quadrant | Bonnet output | Position in chain |
|---|---|---|
| `04` → (0,0) | 1 | first |
| `05` → (64,0) | 1 | second |
| `06` → (0,64) | 2 | first |
| `07` → (64,64) | 2 | second |

Two things in that table are assumptions until bench-checked: which bonnet
output is the top half, and which end of each chain is the left quadrant
(with `rpi-rgb-led-matrix` the panel physically plugged into the board is not
necessarily the one showing columns 0–63). If the chain direction is
inverted, `04`/`05` swap and `06`/`07` swap, and the symptom is subtle —
Lauftext jumps backwards at the seam rather than obviously breaking. Fill one
quadrant at a time and note which physical panel lights up.

### Phase E — ESP32 firmware rewrite — **done, untested on hardware**

Same transformation in C++:

- Replace `doc["text"]` / `display->print()` with mask decode + blit.
- Subscribe to `ledwall/screen/+` and route each message to the right 32px
  slot in the 96×32 canvas by screen id.
- Raise `mqtt.setBufferSize()` to 16 KB — the current 1024 B was sized for a
  256-char text message and will not hold a filmstrip. Phase A measured the
  worst case at ~9.2 KB, so no chunked transfer is needed.
- Decode the binary envelope (`docs/wire-format.md`) rather than JSON: no
  ArduinoJson, no base64. The `ArduinoJson` dependency can be dropped.
- Test the decoder against `docs/wire-format-fixtures.json`, not against the
  panels.
- Keep the retained-message-on-subscribe behaviour and the reconnect loop.

The decoder lives in `pixel_wall_esp32/wire_decode.h`, deliberately free of
Arduino headers so it compiles on a host. `apps/backend/tests/test_esp32_decoder.py`
generates a fixtures header from `docs/wire-format-fixtures.json`, compiles the
decoder with `-Wall -Wextra -Werror`, and runs all 14 fixtures in both
encodings plus the malformed-input cases. That closes the "three decoders, one
format" risk: the C++ implementation is now checked by the same vectors as the
other two, rather than by looking at the panels.

### Phase F — Frontend: stop mocking, unify auth — **done**

- `main.tsx` — start MSW only under `import.meta.env.DEV && VITE_USE_MOCKS`.
  Keep the handlers for tests. Today MSW is imported unconditionally and
  ships ~293 KB of mock service worker in the production bundle.
- Merge `src/api/client.ts` into `src/lib/api.ts` so content requests carry
  the Basic auth header and the `ApiError` handling the auth gate already
  has. Today a 401 on `/api/apply` would surface as a generic failure.
- Auth stays **optional**, exactly as the backend already behaves: enforced
  only when `LEDWALL_PASSWORD` is set. `PasswordGate` should appear only when
  `GET /api/health` reports `auth.enabled`, rather than gating unconditionally.
- `src/domain/apply.ts` — emit the Phase A mask format instead of
  `canvas.toDataURL("image/png")`.
- Widen backend CORS `allow_methods` to include `POST` (currently
  `GET, PUT, PATCH, OPTIONS` — `/api/apply` would be blocked).

Two things emerged while building it. Brightness needed its own
`PUT /api/brightness`: moving only the slider is a legitimate save with no
content to rasterise, and `POST /api/apply` requires content. And the auth
probe moved from `/api/state` to `/api/health` — `/api/state` now returns every
screen's bitmap, which is a lot to fetch just to find out whether a password is
required.

### Phase G — End-to-end

Bring up backend + Pi + ESP32 against the real wall and walk every content
type: static text, Lauftext across two adjacent large screens, Animation/Bild
at several scales, all four Farbe presets, and a small-screen multi-selection
(same content on each, not split).

## Open questions — need confirming against the hardware

1. ~~**Large-panel chain geometry.**~~ Resolved 2026-09-16: two bonnet outputs,
   two panels each → `chain_length = 2, parallel = 2`, one 128×128 canvas.
   **`build_matrix` is therefore wrong in the running code** (`chain_length = 4,
   parallel = 1` → 256×64); the docstring above it was right. Fixing it is part
   of Phase D but is a real bug today, not just an integration concern.
2. ~~**Small-panel wiring.**~~ Resolved 2026-09-16: all three small panels are
   chained off a single ESP32 as one 96×32 canvas, as the firmware already
   assumes. `CONTEXT.md` has been corrected. Phase E stays simple — one
   subscriber, three slots — and the cross-device scroll-sync concern does not
   arise.

   Note this does **not** collapse to a single shared MQTT topic. A small-screen
   selection can be a subset (apply to 01+02 and 03 must keep its content), so
   per-screen topics are still required; the one board subscribes to all three.
3. ~~**Colour depth.**~~ Resolved 2026-09-16: multi-colour means flat-colour
   template artwork, not photographs or multi-colour text. Implemented in
   Phase A as `pal4`; RGB565 is not needed and remains available as a future
   `format` value.
4. ~~**Brightness.**~~ Resolved: per-kind sliders in the edit panel, applied
   on Speichern. See Phase B.
5. ~~**Authentication.**~~ Resolved 2026-09-16: keep it, optional — enforced
   only when `LEDWALL_PASSWORD` is set. See Phase F.

Still open, and needing someone at the wall: which physical panel occupies
which quadrant, and which end of each chain is the left quadrant (Phase D).

## Risks

- ~~**Filmstrip size on the ESP32.**~~ Retired in Phase A: measured worst case
  is ~9.2 KB over the binary envelope, so a 16 KB MQTT buffer covers it and no
  chunked-transfer protocol is needed.
- ~~**Three decoders, two formats.**~~ Retired in Phase E: the C++ decoder is
  compiled and run against the shared fixtures by the backend test suite, so
  all three implementations are held to the same vectors.
- **Nothing has run on hardware.** D and E are unit-tested but have never
  driven a panel. The geometry assumptions in `app/hardware.py` are the most
  likely thing to be wrong, and the quadrant bench check is what settles them.
- **`/api/state` payload growth.** The frontend polls every 20s
  (`useWallSync.ts`) and would pull all 7 screens' bitmaps each time. Fine on
  a LAN, but add `ETag`/`If-None-Match` if it becomes noticeable.
- **Phase D has no rollback.** Once `pi_display.py` stops rendering text, the
  old flat `state.json` no longer drives the wall. Tag the current commit
  before starting so there's a known-good firmware/display pair to return to.

## What is left

**Phase G**, against the real wall:

1. Flash the firmware and confirm each small screen responds to its own topic —
   apply to `01` alone and check `02`/`03` keep their content.
2. Run `sudo python3 -m app.hardware` and correct the quadrant table if needed.
3. Walk every content type: static text, Lauftext across two adjacent large
   screens (watch the seam), Animation/Bild at several scales, all four Farbe
   presets, and a small-screen multi-selection (same content on each, not
   split).
4. Check brightness moves both hardware kinds independently.

Tag the current commit first: once `pi_display.py` stops rendering text there
is no path back to the old flat `state.json` without one.
