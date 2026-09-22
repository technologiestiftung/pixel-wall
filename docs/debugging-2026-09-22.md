# Pixel Wall — 64x64 panel flickering, session of 2026-09-22

Continuation of the prior glitching/flickering debug session (see git history /
team notes for the earlier round: ground-bonding hypothesis, refresh-rate math,
PWM sweep). This session tested that hypothesis directly on the hardware and
went further. Two separate problems are now clearly distinguished; neither is
fully resolved.

## Starting symptom

Simple scrolling text tolerated brightness up to ~47% before flickering.
Showing an image (denser content) flickered at any brightness.

## Finding 1 — Panel "06" (physically marked 🟢 green) has a standalone defect

- Bench-mapped physical panels to screen IDs via `python3 -m app.hardware`:
  🟢 green = `04`, 🔵 blue = `05`, 🟠 orange = `06`, 🟡 yellow = `07`.
  (`04`/`05` share one bonnet-output chain, `06`/`07` share the other.)
- Swapped green (`04`) and blue (`05`): the flicker **followed the `05`
  position**, not the panel that was physically there — first read as a
  position/wiring fault.
- Replaced **both** cable segments on that chain (bonnet→`04` and the `04`→`05`
  pass-through) with known-good shorter cables proven on the 32x32 panels:
  **no change.** Rules out cabling.
- Isolated the panel now sitting at `05` (green) **alone** on the bonnet's
  spare 3rd output — single panel, fresh cable, no chain partner, `parallel=3`
  with outputs 1/2 unpopulated: **still flickered / varied brightness**, and
  specifically showed a **localized, one-sided flicker** that was confirmed
  reproducible on repeat.
- Conclusion: not the chain position, not the cabling, not bonnet output 1's
  electronics (output 3 shows the same fault). This narrows it to the panel
  itself (or its HUB75 connector) — recommend inspecting/replacing panel `06`
  specifically. Not yet tried: swapping in a spare panel at that exact spot to
  do a final confirm.

## Finding 2 — Whole-wall flicker is brightness-*value*-dependent, not brightness-*level*-dependent

This is the more novel finding this session. Manually stepping brightness one
deliberate value at a time (single "Speichern" click, holding each) produced
an irregular, **non-monotonic** map — not "worse at higher brightness":

| Brightness | Result |
|---|---|
| 16% | flickers |
| 21% | clean |
| 26% | flickers |
| 30–33% | clean |
| 34–36% | flickers |
| 37–39% | clean |
| 40–41% | flickers |
| 42–44% | clean |
| 45% | flickers |
| 54% | clean |
| above 54% | mostly flickers, not exhaustively checked |

(Panel `06`'s own localized fault, above, shows through at every level and
should be read separately from this table.)

**Repeated-trial check**: set 30% five independent times (fresh transition via
10%→30% each time, single deliberate API call, no dragging) — **5/5 clean**.
So this is a real, *repeatable* per-value effect, not randomness.

**Ruled out as the cause of this pattern:**

- *Frontend request racing* — hypothesized that dragging the brightness
  slider fires rapid, unordered `PUT /api/brightness` requests, and a stale
  one could silently overwrite a newer one. Checked the code: dragging only
  updates local draft state (`BrightnessSlider.tsx` → `Menu.tsx`); the network
  call fires **exactly once**, on explicit "Speichern" click
  (`useApplyChanges.ts:101-123` → `wall.ts:78-86`). No debounce, no
  `AbortController`, no request sequencing exists **anywhere** in the
  frontend — worth fixing generically regardless, but it isn't what's
  producing this brightness table.
- *Refresh rate* — re-measured 78.0 Hz at `pwm_bits=8` (matches the historical
  baseline exactly); current default `pwm_bits=6` extrapolates to ~105 Hz,
  comfortably above the ~100 Hz flicker threshold. Not the bottleneck.
- *Panel driver chip init* — `options.panel_type` was never set in
  `pi_display.py`. Added env-var support (`LEDWALL_PANEL_TYPE`,
  `LEDWALL_MULTIPLEXING`, `LEDWALL_ROW_ADDR_TYPE` — see below) and tested
  `FM6126A`: **zero visible effect**, not even partial — ruled out.
- *PWM LSB timing* — tested `pwm_lsb_nanoseconds` at 300 (worse — rolling
  artifact got *faster*) and 80 (also worse) vs. the default 130. The default
  is already near-optimal; no headroom in either direction.

**Best current explanation**: at `pwm_bits=6` there are only 64 distinct
brightness levels, each a specific binary bit-pattern. Certain patterns are
more prone to timing-marginal glitches than others on this hardware — this
produces exactly this kind of scattered, per-value (not per-range) map. This
is consistent with, and likely worsened by, incomplete ground bonding (next
section) but isn't explained by it alone.

## Ground bonding — real issue, partially fixed, not sufficient on its own

- Measured Pi GND vs. panel PSU −V: **80–160 mV, wandering with load** (never
  previously measured — HARDWARE.md doesn't document a ground run to the
  bonnet at all).
- Added an 18 AWG+ jumper from the PSU's −V terminal to a Pi header GND pin,
  per the standard fix for this class of symptom.
- Re-measured: **70–80 mV, now stable** (no longer wandering). Real, measurable
  improvement.
- Re-tested the flicker after the fix: **no visible change** — same panels,
  same brightness-value pattern. So the ground bond was genuinely improved but
  not enough to fix the symptom; the jumper wire itself is likely too thin for
  a fully low-resistance bond. Worth trying a heavier gauge / shorter run, but
  don't expect it alone to resolve Finding 2 given the partial fix already
  showed no effect.

## Not yet tried

- Heavier-gauge / more direct ground bond, re-measure and re-test.
- Systematic sweep of `pwm_bits` (4/5/6/7) *combined with* the per-value
  brightness table above — a different bit depth changes which specific
  percentages are "bad," might land on a cleaner map.
- Oscilloscope check for transient ground-bounce/switching noise — invisible
  to a multimeter, and would explain why a DC ground improvement didn't fix a
  fast-switching artifact.
- Swap in a spare panel at `06`'s position for final confirmation it's the
  panel itself.
- Full exhaustive brightness-value map beyond 54%.

## Software findings (separate from the hardware investigation)

- `ledwall-display.service` was found **masked** (not just disabled) —
  stronger than what earlier notes recorded. `systemctl unmask` deleted the
  live unit file entirely (masking had replaced it with a `/dev/null`
  symlink); reinstalled from `apps/backend/systemd/ledwall-display.service`
  with paths corrected for the current deployment (`/home/mranderson/pixel-wall`,
  not `/home/pi/ledwall`).
- `pi_display.py` **does not shut down cleanly on SIGTERM** — reproduced
  repeatedly this session (systemd's default 90s stop timeout elapses, then
  SIGKILL is required; `timeout` around manual test scripts has the same
  problem). Worth investigating — likely a stuck realtime PWM/DMA thread in
  the `rgbmatrix` C extension that doesn't respond to the signal. Caused a
  multi-process GPIO pileup once this session when a restart raced with a
  still-dying old process; recovered by killing by explicit PID (**not**
  `pkill -f`, which matches and kills its own invocation).
- The backend API (`uvicorn`, port 5000) is running **outside systemd
  tracking** — alive and healthy, but not via the `ledwall-backend.service`
  unit, so it won't survive a crash or reboot unattended. Should be started
  properly via `systemctl start ledwall-backend`.
- Frontend bug, partially diagnosed: editing a large (64×64) screen sometimes
  silently did nothing — both "Vorschau" and "Speichern" appeared to do
  nothing with no error shown. One confirmed mechanism:
  `draftHasChanges`/`canApply` in `state/selectors.ts:82-105` disables both
  buttons when the edit would be byte-identical to already-applied content, no
  error shown. Separately, one edit attempt visibly wrote to the wrong
  `screenId` (`04` instead of the selected `05`) with no root cause
  identified — stopped recurring later in the session, unconfirmed why. Worth
  a closer look if it resurfaces.
- `HARDWARE.md` is stale in two places: it still says `hardware_mapping =
  adafruit-hat-pwm` / `gpio_slowdown=4` (code uses `regular` / `2`), and its
  "Current implementation status" section says `/api/screens`, `/api/layout`,
  `/api/apply` "don't exist on the backend yet" — they've since been
  implemented (`app/main.py`). Needs updating.
- Added (uncommitted) env-var plumbing in `pi_display.py` for
  `LEDWALL_PANEL_TYPE`, `LEDWALL_MULTIPLEXING`, `LEDWALL_ROW_ADDR_TYPE` —
  infrastructure for future testing regardless of today's FM6126A result.

## Useful commands from this session

```bash
# Bench-map physical panels to screen IDs (lights each quadrant 5s)
sudo systemctl stop ledwall-display
cd apps/backend && sudo python3 -m app.hardware
sudo systemctl start ledwall-display

# Kill a stuck pi_display.py-derived process — NEVER pkill -f "pi_display.py"
# (it matches and kills its own invocation over SSH, dropping the session)
ps -eo pid,cmd | grep pi_display.py | grep -v grep
sudo kill -9 <pid>

# Single-panel isolation on bonnet output 3 (parallel=3, output 3 = canvas
# rows 128-191, outputs 1/2 left unpopulated)
# see /tmp/test_output3.py and /tmp/brightness_sweep.py on the Pi from this
# session for the full scripts
```
