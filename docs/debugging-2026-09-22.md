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

## Follow-up session, same day — refresh-cap fix, then a new frontend mystery

Continuation of the above, done live against the running Pi (`welcome-pixel-pi` /
`exhibitpi-twelve.local`, user `mranderson`) via SSH, per a colleague's
refresh-rate measurement procedure. Two things came out of this: a
software-side refresh cap fix that's ready but **uncommitted, pending visual
confirmation**, and a frontend "can't change panels" report whose root cause
was not found before the session ended.

### Refresh-cap fix — done, not yet confirmed on the wall

Colleague's procedure: stop `ledwall-display`, run `pi_display.py` manually
with `LEDWALL_SHOW_REFRESH=1 LEDWALL_REFRESH_HZ=0` (uncapped) to measure the
hardware's real refresh rate, then set the cap ~5 Hz below whatever's actually
achievable so it stops content-dependent refresh variance from reading as
flicker (see `LIMIT_REFRESH_HZ` at `pi_display.py:76`).

Measurements taken (all with real content on the wall, not blank):

| Config | Avg | Lowest |
|---|---|---|
| `PWM_BITS=6`, `GPIO_SLOWDOWN=2` (existing defaults) | 83.1 Hz | 79.8 Hz |
| `PWM_BITS=5`, `GPIO_SLOWDOWN=2` | 83.5 Hz | 81.8 Hz |
| `PWM_BITS=5`, `GPIO_SLOWDOWN=1` | 83.6 Hz | 82.2 Hz — **visibly glitchy**, reverted |

**This disproves the "refresh scales ~linearly with PWM_BITS" model** that was
in the `pi_display.py` comments and that the historical 78.5 Hz @ 8-bit
baseline was extrapolated from. Going 6→5 bits should have bought ~17 Hz
(→~100 Hz) if linear; it bought 0.4 Hz. Dropping `GPIO_SLOWDOWN` 2→1 (a more
aggressive signal-timing change) also bought essentially nothing while
introducing visible corruption. Refresh is pinned at ~80–84 Hz regardless of
either knob — this now reads as a hardware ceiling (consistent with the
ground-bonding and panel-`06` suspects above), not something tunable in
software.

Decision: keep `PWM_BITS=6` (no measurable speed cost to keeping the better
colour depth) and `GPIO_SLOWDOWN=2` (safe default), set
`LEDWALL_REFRESH_HZ=75` (~5 Hz under the worst *lowest* measured, not the
average — the cap only does its job if it's below what the hardware can miss
under real content).

**Changed** (uncommitted, mirrored onto both this repo checkout and the Pi's
`/home/mranderson/pixel-wall` checkout without touching the Pi's own
uncommitted `PANEL_TYPE`/`MULTIPLEXING`/`ROW_ADDR_TYPE` plumbing from the
morning session):
- `apps/backend/pi_display.py:68-80` — `LIMIT_REFRESH_HZ` default `100→75`;
  comment rewritten to record the disproved linear model and why 75 was
  chosen, so the next person doesn't redo this detour.
- `apps/backend/systemd/ledwall-display.service:17` —
  `LEDWALL_REFRESH_HZ=75`. Pushed live via the README's
  `sed .../home/pi/ledwall.../ | sudo tee /etc/systemd/system/... &&
  systemctl daemon-reload` pattern, service (re)started, no errors in
  `journalctl`.

**Not yet done**: actually eyeball the wall at the new 75 Hz cap across
brightness levels and dense content, the way the original brightness-value
table (Finding 2, above) was built. Session moved on to the frontend issue
before this happened — do this first before committing.

### Process hygiene note

Mid-session, killed the live `pi_display.py` (PID by explicit `sudo kill -9
<pid>`, **not** `pkill -f`, per the existing caution in this doc) so systemd's
`Restart=always` (`RestartSec=3`) would bring up a clean single instance.
Confirmed only one `pi_display.py` process afterward — no GPIO pileup repeat.

### New bug: "can't change panels through the frontend" — investigated, not resolved

User report: after the restart above, the frontend (both the live wall and
its own "Vorschau" preview) stopped responding to edits.

**Ruled out**, with evidence, in a fresh browser tab against the real
backend (`192.168.4.236:5000`):
- Backend health: `/api/health` OK, state file writable, MQTT connected.
- The frontend's own network-log tool (`read_network_requests`) showed
  *zero* requests reaching the Pi — looked like a dead client. This was a
  **false lead**: cross-checking via `performance.getEntriesByType('resource')`
  in the page itself showed the real requests, including two separate
  `POST /api/preview` calls, both `200 OK` in ~140-170ms. The browser
  automation tool's network log simply wasn't capturing cross-origin
  requests to the Pi's LAN IP — a tooling gap, not a product bug. Don't
  trust that tool's request list for this app again; check
  `performance.getEntriesByType('resource')` instead.
- Also ruled out the `VITE_API_URL` trailing-whitespace-in-`.env` red herring
  (`http://192.168.4.236:5000/ ` — trailing space would break
  `api.ts`'s `.replace(/\/$/, "")` trim if it survived): confirmed via
  `import.meta.env` at runtime that Vite's env loader already strips it,
  `API_URL` is clean.
- With all that ruled out, a manual repro in a clean tab **worked
  correctly end-to-end**: selected a screen, typed text, clicked "Vorschau",
  got the "Vorschau läuft — noch nicht gespeichert" banner and the correct
  live thumbnail. So the preview *mechanism* itself — API round-trip, React
  state, UI — is not broadly broken.

**Leading hypothesis, not yet confirmed**: the screen used in that working
repro was one of the **small (32×32, ESP32/MQTT) panels** — `app/main.py`'s
`/api/preview` only ever calls `_publish()`, which goes out over MQTT
(`ledwall/screen/<id>`, per `pi_display.py:14-16`'s own comment: *"MQTT is
not published from here: the backend owns the `ledwall/screen/<id>` topics
and the ESP32 syncs from their retained messages"*). `pi_display.py` — the
process driving the four **large** 64×64 panels — only ever reads
`state.json` (`read_state()`, polled every `STATE_POLL_INTERVAL`s) and never
subscribes to MQTT at all. `/api/apply` writes `state.json` *and* publishes,
so applied changes reach the large panels through the file-poll path. But
`/api/preview` **deliberately never writes state** (see its own docstring
and the `_previewed_screens` comment at `main.py:64-67`) — it only
publishes. If that's right, **preview on the large panels may be a no-op by
design and always has been**, independent of anything changed this session —
worth checking whether this is a known/accepted limitation or a real gap.

This was not confirmed before the session ended — investigation was cut off
partway through reading `main.py`. Concretely still open:
1. Which screen(s) was the user actually testing on — large (`04-07`) or
   small (`01-03`)? This is the single fact that would confirm or kill the
   hypothesis.
2. If large: does `pi_display.py` need an MQTT subscriber for preview frames
   (mirroring the ESP32 path), or does `/api/preview` need a large-panel-only
   fallback that writes a *separate* preview-only file `pi_display.py` also
   polls (state.json itself must stay untouched, per its docstring, so the
   real save/apply semantics aren't disturbed)?
3. If small, or if it turns out both kinds are actually affected: the
   restart-timing theory (preview landing during/just after the
   `pi_display.py` kill+restart above) hasn't been tested either — worth a
   clean retry now that the process has settled, before chasing the MQTT
   theory further.
4. Was this the user's own already-open browser tab in some stale state
   (old previewStatus, old bundle) rather than a backend/architecture issue
   at all? A hard reload was not tried.

## Follow-up session, 2026-09-23 — single-panel isolation, power-supply hypothesis

New setup: **one single 64×64 panel** only, wired to bonnet **output 1**,
powered by a **5V/20W (4A) supply** — the same unit that has run the 32×32
panels without flicker, i.e. the *small-panel-class* rail, not the documented
5V/20A large-panel rail (`HARDWARE.md`). A direct Pi-GND↔panel-GND jumper was
also added, then later removed (see below). Session done live via SSH
(`welcome-pixel-pi` alias → `mranderson@exhibitpi-twelve.local`).

### Hypothesis: is the 20W/4A supply browning out under load?

`HARDWARE.md`'s own math puts a single 64×64 panel's full-white draw at ~4A by
itself — a 20W/4A supply would have ~zero headroom, a plausible explanation for
"denser content flickers at any brightness" and the prior session's
non-monotonic per-brightness-value flicker map.

Standalone test script (`/tmp/power_test.py` on the Pi, not part of the repo):
single-panel `RGBMatrixOptions` (`chain_length=1, parallel=1`, otherwise
mirroring `pi_display.py`'s bench-measured defaults), solid white fill, run
once per brightness level via a CLI arg (`sudo python3 /tmp/power_test.py 100`)
so each level is a fresh process — see "script bug" note below for why it
isn't a single stepping loop.

**Result — DC/steady-state brownout ruled out** at the three highest-current
levels tested (multimeter across 5V/GND at the panel's HUB75 input, per the
existing `HARDWARE.md` brownout procedure):

| Brightness | Voltage (panel 5V/GND) | Flicker |
|---|---|---|
| 100% | 5.08 V, steady | Yes |
| 85% | 5.28 V, steady | Yes |
| 70% | 5.28 V, steady | Yes |

All three are comfortably above the ~4.7V brownout threshold, and steady (not
wandering) — yet flicker persisted at every level. **This session's headline
finding: the 20W/4A supply is not causing a sustained brownout for a single
64×64 panel**, even at 100% brightness solid white (the worst-case draw this
test can produce). Lower brightness levels draw less current and were not
completed (55/40/25/5% still open — see below) but are very unlikely to sag
worse than 100% did.

**Caveat**: a multimeter only reads steady-state/averaged voltage. It cannot
catch a fast (µs/kHz-scale) transient sag tied to specific PWM bit-pattern
switching — the "oscilloscope check for transient ground-bounce/switching
noise" item from the prior session's "not yet tried" list is still untested
and still the live candidate for a power-related explanation.

### Total-blackout detour and a script bug found along the way

Before the readings above, the panel produced **no light at all, at any
brightness**, for a stretch of this session — a red herring chased at length:

- First occurrence: right after wiring up (ground jumper added, single panel
  on output 1). Swapping the HUB75 cable, the panel itself, and the bonnet in
  turn, plus removing the new ground jumper, eventually got a bare "solid
  white, static 100%" script (`/tmp/light_test.py`) to light up (with
  flicker) — but which specific swap fixed it was not isolated (multiple
  things were changed at once under time pressure). Worth a controlled
  re-test later if the wiring needs touching again.
- Second occurrence: after that success, `light_test.py` got stuck on
  `Ctrl+C` (same known `rgbmatrix` shutdown issue as `pi_display.py` — see the
  2026-09-22 notes above) and was killed with explicit `sudo kill -9 <pid>`
  (never `pkill -f`, same reasoning as before). The next run — the original
  step-through `power_test.py`, which called `matrix.brightness = pct` at
  runtime inside a loop — went fully dark again at every step, including
  100%. Suspected a stuck DMA/PWM peripheral left by the `kill -9` and
  rebooted the Pi to clear it (`sudo reboot`, confirmed back up ~90s later,
  `/tmp` scripts re-deployed since it's cleared on reboot).
- **The reboot did not fix it** — the same stepping script still produced no
  light on any level post-reboot. This disproved the stuck-DMA theory and
  pointed at the script instead.
- **Root cause of the blackout: `matrix.brightness = <value>` set at runtime
  after `RGBMatrix` construction produced no visible output at all**, at any
  value, on this library/hardware combination — even though this is exactly
  the pattern `pi_display.py` itself uses for live brightness updates
  (`pi_display.py:189-190`). Rewriting the test script to set brightness only
  via `RGBMatrixOptions.brightness` at construction time (one process per
  brightness level, matching `light_test.py`'s already-working pattern)
  immediately worked. **This calls the production runtime brightness-update
  path in `pi_display.py` into question** — it has not actually been
  confirmed to work visually this session or the prior one; worth a dedicated
  check (start the display service, change brightness via the API while
  watching the wall) rather than assuming it works.
- Every stuck process this session (`light_test.py`, `power_test.py` at
  100%/85%/70%) needed the same explicit `sudo kill -9 <pid>` treatment
  between runs — `Ctrl+C` never worked, consistent with the existing
  `pi_display.py` SIGTERM finding, now confirmed to affect ad-hoc scripts
  using this library too, not just the production driver.

### Not yet done

- Finish the brightness sweep at 55%, 40%, 25%, 5% (voltage expected healthy
  given 70-100% already are, but not actually measured).
- Oscilloscope check for transient switching noise — still the most likely
  remaining power-related explanation given DC brownout is now ruled out.
- Confirm whether `pi_display.py`'s runtime `matrix.brightness = ...` update
  path (used by the real backend, not just this test script) actually works
  visually — the blackout root-caused above raises real doubt.
- Isolate which specific swap (cable, panel, or bonnet) fixed the earlier
  total-blackout state; removing the ground jumper was also part of that
  batch of changes and its individual effect is unconfirmed.
- Re-run Finding 2's non-monotonic brightness-value table on this new
  hardware (panel/cable/bonnet all now different from 2026-09-22).

## Follow-up session, 2026-09-23 (continued) — hardware-pulse identified as root cause; new ghosting artifact surfaced

Live SSH session (`welcome-pixel-pi` → `mranderson@exhibitpi-twelve.local`),
prompted by researching the upstream `rpi-rgb-led-matrix` (hzeller) library's
own documented flicker causes against Finding 2's still-unexplained
non-monotonic brightness-value pattern. Test methodology: a fresh process per
brightness value (never runtime `matrix.brightness = ...` mutation, per the
still-open doubt about that path — see prior session), each preceded by a
~3s black gap so transitions are unambiguous. Driver scripts:
`/tmp/sweep_test.py` + `/tmp/run_sweep.sh` (synthetic solid-fill, single
panel) and `/tmp/real_sweep.sh` (drives the real `pi_display.py` against real
`state.json` content) — not committed to the repo, Pi-local only.

**Pitfall hit and fixed while building the driver**: `sudo CMD &` in bash
backgrounds *sudo's own monitor process*, not the `CMD` it forks internally —
killing `$!` only kills the monitor and orphans the real Python process,
which keeps driving the GPIO. Caused a 28-process pileup mid-session. Fixed
by using `timeout --signal=KILL <secs> sudo -E python3 ...` instead (`timeout`
directly forks and directly signals its own child, no manual pid tracking
needed). Worth remembering for any future ad-hoc test scripts against this
hardware.

**Correction (2026-09-23, bonnet-bypass session below):** this form is
itself incomplete — `SIGKILL` lands on `sudo`, not on the `python3` child
`sudo` spawns, so the child is still orphaned. Put `timeout` *inside* the
`sudo` call instead: `sudo timeout --signal=KILL <secs> python3 ...`. See
the "Process-management gotcha" section below for the pileup this caused.

### Audio — already fixed, just not documented

`snd_bcm2835` (the actual PWM-audio kernel module that shares hardware with
the matrix's hardware-pulse feature on GPIO18) is **already blacklisted**
via `/etc/modprobe.d/blacklist-rgb-matrix.conf` on the Pi, from some earlier
undocumented fix. `lsmod` confirms it is not loaded. What *is* still loaded
is the separate HDMI-audio ALSA chain (`snd_soc_hdmi_codec`, `snd_soc_core`,
`snd_pcm`, tied to `vc4`) — architecturally unrelated to the GPIO18 hardware
PWM peripheral, left alone. **The classic audio/PWM conflict was already
handled and is not the explanation for Finding 2.**

Also stopped for the duration of this session's testing (not yet restored —
see "State left mid-test" below): `bluetooth.service`, NTP time-stepping
(`timedatectl set-ntp false`). `triggerhappy`/`pigpiod` were already
inactive.

### Baseline re-measurement (today's single-panel setup, `regular` mapping, hardware pulse on, `PWM_BITS=6`)

Single 64×64 panel, bonnet output 1 (today's rebuilt hardware — different
panel/cable than either prior session). Swept the same value set as the
original Finding 2 table:

| Brightness | 16 | 21 | 26 | 30 | 34 | 37 | 40 | 42 | 45 | 54 | 70 | 85 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Result | flicker | flicker | flicker | **clean** | flicker | **clean** | flicker | **clean** | flicker | **clean** | flicker | flicker | flicker |

**The clean set (30, 37, 42, 54) exactly matches the original 2026-09-22
whole-wall table's clean ranges**, despite a completely different panel,
cable, and single-panel-vs-whole-wall setup. Strong evidence this is **not**
panel-, cable-, or bonnet-chain-position-specific — it's something systematic
in software/timing that reproduces identically across different physical
hardware.

### PWM_BITS variation — confirms bit-depth involvement, rules out "more bits = better"

Same procedure, `PWM_BITS` varied, hardware pulse still on:

| `PWM_BITS` | Flickered | Clean | Flicker count |
|---|---|---|---|
| 6 (current default) | 16,21,26,34,40,45,70,85,100 | 30,37,42,54 | 9/13 |
| 8 (old pre-optimization default) | 16,45,70,85,100 | 21,26,30,34,37,40,42,54 | 5/13 |
| 11 (library max) | 16,26,37,70,85,100 | 21,30,34,40,42,45,54 | 6/13 |

The clean *set* genuinely shifts with `PWM_BITS` (confirms bit-depth
involvement), but it is **not monotonic** — 11-bit is slightly worse than
8-bit. Rules out a simple "more color resolution = less flicker" story.
16, 70, 85, and 100% flickered at every bit depth tested.

### Refresh-rate check — ruled out as the mechanism

`LEDWALL_SHOW_REFRESH=1` on a known-bad value (16%, `PWM_BITS=6`) and a
known-good value (30%), fully static content (no redraws, single
`SwapOnVSync` then idle): **both pinned rock-solid at exactly 75.0Hz with
zero variance**, the whole run. Refresh-rate drift/instability is **ruled
out** as the mechanism — whatever is happening, happens at a perfectly
steady frame rate.

### Breakthrough — hardware pulse generator is the root cause

`options.disable_hardware_pulsing` (`LEDWALL_NO_HARDWARE_PULSE=1`) was
already plumbed into `pi_display.py` but never tested in either prior
session. A/B on the single panel, `PWM_BITS=6`:

- **Hardware pulse on** (default): 16% and 45% flickered in *every* test run
  this session, at every `PWM_BITS` value tried.
- **Hardware pulse off**: 16%, 30%, 45% — all clean. Extended to the full
  13-value sweep: **13/13 clean.**

This points at the Pi's dedicated hardware PWM peripheral (GPIO18) itself
being marginal on this specific Pi+bonnet combination — not power, not the
panels, not the bonnet's GPIO mapping, not refresh rate. Handing pulse
generation to the CPU (software-driven bit-banging, normally the *worse*
option per the library's own docs) fixes it here, which suggests this
bonnet's OE trace isn't clean enough for the hardware peripheral's faster,
more precise pulses specifically.

### Real-wall validation — flicker fix holds, but a separate ghosting issue surfaced

Two 64×64 panels (only two available this session, not the usual four)
physically chained together on bonnet output 1, driving the **real**
`pi_display.py` against **real** `state.json` per-screen content (not
synthetic fills) — `chain_length=2, parallel=2` as usual, output 2 simply
unpopulated (harmless, same as prior sessions' single-output isolation
tests). `LEDWALL_NO_HARDWARE_PULSE=1`, otherwise production defaults
(`PWM_BITS=6`, `GPIO_SLOWDOWN=2`, `LIMIT_REFRESH_HZ=75`).

Full 13-value sweep: **zero flicker at any value.** Confirms the
hardware-pulse fix holds with real content, not just synthetic solid fills.

**New artifact at high brightness (85%, 100%)**: the real text content
appeared duplicated as fainter "ghost" copies on the rows immediately above
and below the real content — a fixed-position duplication, not a
scroll-direction trailing artifact. This is the classic signature of the row
address lines (A–E — the lines selecting which of the 64×64 panel's 32
scan-line pairs is active) not being fully settled before OE re-enables,
worse at high brightness because OE stays active longer per cycle, leaving
less margin before the next address transition.

Tried `GPIO_SLOWDOWN=3` (up from 2) with hardware pulse still off: **ghosting
persisted at 85%/100%.** Not yet tried: `GPIO_SLOWDOWN=4`, increasing
`pwm_lsb_nanoseconds` (library docs suggest 200–300 for bright-content
trailing/ghosting artifacts specifically).

**Important caveat from the user**: this ghosting is likely **not new** —
probably present before as well, just masked by/mixed in with the flicker
itself, making it hard to distinguish. Not yet confirmed whether it also
occurs with hardware pulse **on** at 85–100% (worth a quick dedicated check
before assuming it's specific to the software-pulse path).

### State left mid-test — needs restoring before calling this done

- `bluetooth.service` stopped, NTP stepping disabled — not yet restored.
- `/var/lib/ledwall/state.json`'s `brightness.large` field was repeatedly
  overwritten during testing (content untouched); original backed up at
  `/tmp/state.json.backup-before-real-wall-test` on the Pi, not yet restored.
- `ledwall-display.service` left `inactive` throughout (manual test runs
  only) — not yet restarted.
- None of today's findings have been made permanent in
  `apps/backend/pi_display.py` / `ledwall-display.service` yet — deliberately
  held back until the ghosting question is resolved, so a single coherent fix
  lands rather than a partial one.

### Not yet done

- Resolve the ghosting: `GPIO_SLOWDOWN=4`, `pwm_lsb_nanoseconds` sweep
  (200–300 range), and confirm whether it happens with hardware pulse **on**
  too (i.e., whether it's actually independent of today's fix or interacts
  with it).
- Differential check with the spare 32×32 panel (different scan type, no E
  line) at 85–100% specifically for the ghosting — would separate "row
  address timing in general" from "E-line/1-32-scan specific," now that the
  flicker question itself is answered. (`hardware_mapping` A/B and the
  direct-jumper bonnet bypass from the original plan are de-prioritized
  given the flicker root cause is now identified in software, not the
  bonnet.)
- Oscilloscope check on OE and the row-address lines specifically during
  85–100% brightness, now much better targeted than before.
- Once ghosting is resolved: full 4-panel (not 2-panel) real-wall
  confirmation sweep, then land the fix — `disable_hardware_pulsing=True` (or
  a resolved equivalent) as the new default in `pi_display.py` /
  `ledwall-display.service`, committed.
- Restore Pi to clean idle state (bluetooth, NTP, `state.json`,
  `ledwall-display.service`) once testing for this round is complete.

## Follow-up session, 2026-09-23 — bonnet bypass, direct GPIO wiring

The previous session's plan had de-prioritized the bonnet bypass once the
flicker root cause was found in software, not hardware — but the user wanted
it done anyway, as a genuine physical simplification (fewer components on the
bench) rather than purely a diagnostic isolation test. Two 64×64 panels,
single chain (`chain_length=2, parallel=1`), jumper-wired directly from the
Pi 4B's 40-pin header to panel 1's HUB75 IN connector, no bonnet in the
signal path. `hardware_mapping` did **not** need to change — `pi_display.py`
already uses `"regular"`, which is the direct-GPIO pin layout this wiring
needs (confirmed against `apps/backend/README.md:463-473`, which explains the
Adafruit-specific mappings only support a single chain anyway).

### First bring-up: totally dark, then wiring-fault hunt

First power-up produced **no light at all**, with the driver script running
and exiting clean (no exception) — same signature as the total-blackout
detour in the 2026-09-23 single-panel session above. Systematic multimeter
continuity checks (meter unpowered, continuity/resistance mode — the
RICOKEY XL830L on hand does have a working continuity buzzer) ruled out
simple opens on GND, OE, CLK, LAT, R1, G1, R2, G2 one at a time: every wire
beeped end-to-end.

The actual fault only became clear from the *pattern* of a solid-color test:
a pure red fill (`R=255,G=0,B=0` everywhere, no other colour mixed in)
rendered as scattered blue blocky streaks, never red. Per-wire continuity
passing while the wrong colour comes out is the signature of a systematic
pin-position mixup rather than a broken wire — in this case, **the whole
hand-wired bundle had pins swapped** relative to the intended HUB75
connector layout (not simply a top/bottom row swap, which wouldn't produce a
clean red→blue substitution — closer to a full remap across the bundle).
After the user corrected the wiring and rebooted the Pi, a solid-red test
now renders correctly as red — **the bonnet-bypass wiring is confirmed
electrically correct.**

### Process-management gotcha: `timeout` wrapping `sudo` doesn't kill the child

`timeout --signal=KILL <secs> sudo -E python3 ...` — the exact form this doc
previously recommended — turned out to **not** reliably kill the driven
process: `SIGKILL` terminates `sudo` itself, but `sudo` dying does not
propagate the signal to the child it spawned, so `python3` (running as root)
is orphaned and keeps driving the GPIO. This produced a real pileup (two
stray `bypass_lighttest.py` processes) mid-session, cleaned up the usual way
(`sudo kill -9 <pid>` on the explicit PIDs from
`ps -eo pid,cmd | grep pi_display.py`-style filtering, never `pkill -f`).

**Fix: put `timeout` *inside* the `sudo` invocation instead**, so `timeout`
is the direct parent of the driven process and its `SIGKILL` lands on the
right target:

```bash
# Bad — SIGKILL hits sudo, not its child; python3 gets orphaned:
timeout --signal=KILL 22 sudo -E python3 script.py

# Good — timeout directly parents and signals the real process:
sudo timeout --signal=KILL 22 python3 script.py
```

Worth updating this doc's standing convention (see "Useful commands" section
near the top) to the second form going forward.

### New finding: `disable_hardware_pulsing=True` hangs on this wiring

With hardware pulse **on** (default), the bonnet-bypass wiring drives the
panel reliably — solid colours render correctly, with the same known
flicker from before the earlier session's fix (expected, since this test
script doesn't set `disable_hardware_pulsing`).

With hardware pulse **off** (`disable_hardware_pulsing=True` /
`LEDWALL_NO_HARDWARE_PULSE=1`) — the exact setting that cleanly fixed flicker
in the previous session's 2-panel/bonnet test — `RGBMatrix()` construction
now **hangs** on this wiring: the process never reaches its own startup
print statement and has to be force-killed. Reproduced twice in a row, not a
one-off. Toggling back to hardware-pulse-on in between confirmed the wiring
itself is fine (works immediately, every time), so this is specific to the
software-pulse code path, not a general wiring regression.

**Leading hypothesis, not yet confirmed**: leftover DMA/GPIO kernel state
from this session's several forced `SIGKILL`s (including the orphaned
processes from the `timeout`/`sudo` bug above) is wedging specifically the
software-pulse timing engine, which apparently uses a different internal
setup path than hardware-pulse mode. A clean reboot (already done once for
the wiring fix) is the standard reset for this class of symptom — same
reasoning as the total-blackout detour earlier in this doc — but a
post-reboot retest of `disable_hardware_pulsing=True` specifically had not
been done as of this write-up.

### Reboot fixed the hang, and confirmed the flicker fix holds bonnet-free

A clean `sudo reboot` (not just repeated `kill -9`) resolved the
`disable_hardware_pulsing=True` hang from above — post-reboot, the same
option ran immediately and drove a solid, flicker-free red fill on the
bonnet-bypass wiring. Confirms the hang was leftover DMA/GPIO kernel state
from this session's forced kills, not a real incompatibility with
`parallel=1` or the direct-GPIO wiring. **The flicker fix
(`disable_hardware_pulsing=True`) holds on the bonnet-bypass wiring**, same
as it did through the bonnet in the prior session.

### Ghosting sweep on the bonnet-bypass wiring — reproduces, and isn't cleanly fixed by either documented knob

Test pattern: solid black background with two bright white 3px-thick bars
(rows 20-22 and 44-46) — chosen so any duplicate/ghost row above or below is
unambiguous, closer to the "bright text on black" case upstream docs call
out. All runs with `disable_hardware_pulsing=True` (the confirmed flicker
fix), `chain_length=2, parallel=1`, `"regular"` mapping.

| `pwm_lsb_nanoseconds` | `gpio_slowdown` | Brightness | Result |
|---|---|---|---|
| 130 (default) | 2 (default) | 85% | Ghost bars visible above both real bars — reproduces with the bonnet completely out of the signal path, confirming Finding 2/ghosting is **not** bonnet-specific. |
| 220 | 2 | 85% | No visible change — still 2 real + 2 ghost bars. |
| 300 | 2 | 85% | Worse — whole-screen flicker returned. Not more ghosting per se: this test script doesn't cap refresh rate the way `pi_display.py` does, and 300ns is heavy enough to drag achievable refresh down into flicker range on its own, layering a second artifact on top. Consistent with upstream's own documented frame-rate-vs-quality tradeoff for this flag. |
| 130 | 4 | 85% | **Inconsistent between two back-to-back runs at identical settings**: one run showed 2 bars, ~5px thick (read as the ghost merging right up against the real bar rather than sitting as a separate line); the very next run at the same settings showed 4 separate 3px bars again, matching the `gpio_slowdown=2` baseline. |

**Reading of this session's sweep**: neither `pwm_lsb_nanoseconds` nor
`gpio_slowdown`, swept individually within the range that avoids
reintroducing flicker, produces a clean, repeatable fix. The
`gpio_slowdown=4` run-to-run inconsistency under *identical* settings is the
more important result than either single reading — a parameter that
genuinely fixed a deterministic timing margin wouldn't flip between two
different visible patterns on consecutive runs with nothing changed. That
kind of instability is the signature of a marginal signal-integrity margin
(a timing edge close enough to the failure boundary that ordinary run-to-run
noise tips it either way), not a value these two knobs alone can dial out —
which lines up with this session's own opening caveat: bypassing the
bonnet's buffer/level-shifter chip trades away exactly the drive margin that
would keep this stable. Not tested this session: whether the *original*
bonnet wiring (with its buffer chip) shows the same run-to-run instability
at `gpio_slowdown=4`, or whether that instability is itself new since going
unbuffered.

### Not yet done

- Test whether the ghosting/instability is present on the *original* bonnet
  wiring under the same identical-settings-repeated-run methodology used
  above, to isolate "ghosting exists either way" (already shown true) from
  "the run-to-run *instability* specifically is new since removing the
  buffer chip" (not yet isolated).
- If the buffer-chip theory holds: reintroducing some form of line buffering
  (the bonnet itself, or a standalone level-shifter board) may be a more
  productive direction than further software parameter tuning for the
  ghosting specifically, even though the *flicker* fix
  (`disable_hardware_pulsing`) itself is confirmed to work fine unbuffered.
- Oscilloscope check on OE and the row-address lines during 85–100%
  brightness — still the most direct way to distinguish a genuine timing
  margin problem from something else, and now better motivated by the
  run-to-run instability finding above.
- Differential check with the spare 32×32 panel (no E line) — still open
  from the prior session, would separate "row address timing in general"
  from "E-line/1-32-scan specific."
- Once ghosting is resolved: full 4-panel real-wall confirmation sweep
  (back through the bonnet, or via a properly buffered bypass), then land
  `disable_hardware_pulsing=True` as the new default in `pi_display.py` /
  `ledwall-display.service`, committed.
- Restore `bluetooth.service`/NTP/`state.json`/`ledwall-display.service` to
  clean idle state (still outstanding from the prior session, unchanged this
  session). No stray test processes left running as of this write-up
  (verified via `ps` after the last test).

## External research, 2026-09-23 — ghosting: two converging explanations

Desk research (no hardware access this session) against the upstream
`rpi-rgb-led-matrix` (hzeller) library's own docs, its GitHub issues, and
community reports, prompted by the still-open ghosting question from the two
sessions above. Wiring has since been reverted to the bonnet (chain back on
bonnet output 1, buffer chip back in the signal path) — the bonnet-bypass
sessions above are now history, not the current setup.

### Finding 1 — the library documents this exact symptom, and the prior 300ns result may be a false negative

The README names this symptom directly: *"some panels have trouble with sharp
contrasts and short pulses that results in ghosting"*, calling out *"bright
text on black background"* specifically — matching the real-wall ghosting
artifact from the bonnet session above almost word for word. The documented
fix is to **increase** `--led-pwm-lsb-nanoseconds` (default 130) into the
**100–300ns range**, opposite of lowering it.

The bonnet-bypass ghosting sweep above already tried 220ns (no visible change)
and 300ns ("worse" — whole-screen flicker returned). But that 300ns result is
confounded: the test script used (`/tmp/...` sweep scripts) didn't cap refresh
rate the way `pi_display.py`'s `LIMIT_REFRESH_HZ` does, and upstream's own docs
describe a frame-rate-vs-quality tradeoff for this flag — so 300ns may have
been measured as "worse" because it dragged achievable refresh down into
flicker range on an uncapped script, not because 300ns doesn't help the
ghosting itself. This makes the prior test inconclusive, not a real disproof,
and it was run on the unbuffered bonnet-bypass wiring in the first place (see
Finding 2). Worth a full retest of the 100–300ns range now that the bonnet is
back and a refresh cap is in play.

### Finding 2 — the library maintainer warns against exactly the wiring used in the bonnet-bypass sessions

Upstream's README is explicit: *"you can self wire without level shifters and
it will work most of the time, but if you're not in a hurry get a board"* —
and names the failure signature as *"artifacts like randomly showing up
pixels, color fringes, or parts of the panel showing 'static'"* when a panel's
input isn't driven through a 74HCT245/74AHCT245-class buffer chip from a
proper adapter board (bonnet, HAT, or equivalent).

This matches the bonnet-bypass session's own `gpio_slowdown=4` run-to-run
*instability* finding closely enough to be the likely explanation for it — that
session's own reading already suspected "bypassing the bonnet's buffer/
level-shifter chip trades away exactly the drive margin that would keep this
stable." Wiring is now back through the bonnet, which puts the buffer chip
back in the signal path — this variable is now most likely addressed, but
that hasn't been confirmed with an actual retest yet.

### Finding 3 — row addressing is currently unset, defaulting to type 0

`--led-row-addr-type` is never set anywhere in `pi_display.py` (no
`LEDWALL_ROW_ADDR_TYPE` env var is read for it despite one being named in the
2026-09-22 notes above), so it silently defaults to type 0 (standard direct
addressing). For 1/32-scan panels with an E line — which is what these 64x64
P3 panels are, per the row-address-line ghosting mechanism already described
above — type 0 is usually correct, but types 3/4/5 exist specifically for
ABC/ABC+DE-addressed variants and are a cheap, fast thing to A/B if a
pwm-lsb-nanoseconds retest doesn't fully clear the ghosting.

### Finding 4 — multiplexing untried, lowest priority

`--led-multiplexing` has never been tried this round. It only matters for
panels with a non-standard internal pixel mapping (typically outdoor-rated
panels) — worth checking the panel's actual chipset/datasheet before sweeping
this blindly, since it's unlikely to be relevant for indoor P3 64x64 panels.

### Not yet done (research-informed, ranked)

1. **Highest priority** — re-run the same ghosting test pattern from the
   bonnet session above (solid black background, two bright white 3px bars)
   now that the bonnet is back, combined with a `pwm_lsb_nanoseconds` sweep
   across 130/180/220/260/300ns at both a known-bad and known-clean
   brightness value. This retests both suspected causes at once, since a
   buffered signal path and adequate LSB timing margin point at the same fix
   in the same direction.
2. If ghosting persists across that full range: try `led_row_addr_type`
   values 3/4/5 (currently unset) as a quick A/B.
3. Lowest priority: `led_multiplexing`, only after checking the panel's
   actual chipset/datasheet for a non-standard scan pattern.
4. Oscilloscope check on OE and the row-address lines during 85–100%
   brightness — still open from prior sessions, and still the most direct way
   to settle this if the above doesn't produce a clean fix.

Sources:
[rpi-rgb-led-matrix README](https://github.com/hzeller/rpi-rgb-led-matrix/blob/master/README.md),
[Troubleshooting (DeepWiki)](https://deepwiki.com/hzeller/rpi-rgb-led-matrix/10-troubleshooting),
[Issue #703 — ghosting on 64x64 P3 panels](https://github.com/hzeller/rpi-rgb-led-matrix/issues/703),
[Issue #328 — can't solve ghosting issue](https://github.com/hzeller/rpi-rgb-led-matrix/issues/328).

## Follow-up session, 2026-09-23 — real-wall `pwm_lsb_nanoseconds` sweep: ghosting NOT resolved, disproves the desk-research hypothesis

Live session against the real Pi (`welcome-pixel-pi` / `mranderson@exhibitpi-twelve.local`), executing item 1 of the prior section's ranked research to-do. Hardware: **two 64×64 panels chained on bonnet output 1** of the triple bonnet (`chain_length=2, parallel=1` — bonnet wiring, buffer chip in the signal path, not the bonnet-bypass rig). `ledwall-display.service` was `inactive` throughout (as left by the prior session), no stray processes found before or after.

Two Pi-local `/tmp` scripts (`ghost_test.py`, `channel_test.py`) were already present from an undocumented tail end of a prior session — reused `ghost_test.py` (same black-bg/two-white-3px-bar pattern as the bonnet-bypass sweep) after adding a `limit_refresh_rate_hz` option (default 75, matching `pi_display.py`'s real cap) that the original didn't have. This directly retests the prior desk-research theory that the earlier "300ns is worse" reading was confounded by running uncapped. `disable_hardware_pulsing=True` held fixed for every run (the confirmed flicker fix), `gpio_slowdown=2` (default) held fixed, one fresh process per run via `sudo timeout --signal=KILL 22 python3 ghost_test.py <brightness> <lsb_ns> 2 75`.

Full sweep — `pwm_lsb_nanoseconds` × two brightness levels (85%, a known-bad value from Finding 2's table; 30%, a known-clean one):

| `pwm_lsb_nanoseconds` | 85% (known-bad) | 30% (known-clean) |
|---|---|---|
| 130 (default/baseline) | ghost rows | clean |
| 180 | ghost rows, **worse** than baseline, **flicker also returned** | clean |
| 220 | ghost rows, better than 180 but still present, no flicker | clean |
| 260 | **worst**: "running lines" (rolling artifact) + flicker | "running lines" appear, no ghosting (brightness too low) |
| 300 | "running lines" + flicker | "running lines" + flicker |

**This disproves the desk-research hypothesis** (README's documented fix of raising `pwm_lsb_nanoseconds` into the 100–300ns range): even with the refresh cap active this time — ruling out the "earlier 300ns test ran uncapped" theory — no value in the swept range gives a clean result at 85%. The response is non-monotonic (180 is worse than baseline before 220 gets partially better), and nothing fully clears the ghosting; 220ns is the least-bad point but still shows ghost rows.

**New, distinct finding**: a "running lines" / rolling artifact — matching the **original 2026-09-22 session's very first LSB test** ("tested `pwm_lsb_nanoseconds` at 300 — worse, rolling artifact got *faster*") — reliably onsets at `pwm_lsb_nanoseconds` ≥ 260, **independent of brightness** (reproduces at both 30% and 85%, unlike the ghosting itself, which only shows at high brightness). This is a second, separate LSB-driven artifact, not the same mechanism as the row-address ghosting, and it rules out the entire 260–300ns range regardless of what it might do for ghosting.

**Conclusion**: `pwm_lsb_nanoseconds` alone is not a viable fix for the ghosting — the only usable range (130–220, before the rolling-lines artifact appears) never eliminates it, only marginally improves it at 220ns. Per the session's agreed scope, no code/config changes were made or committed (the flicker fix and 75Hz refresh-cap diff remain staged, not landed — still deliberately held pending a full ghosting fix). Next step, per the prior section's own ranked list: `led_row_addr_type` (currently unset, defaults to type 0) A/B across values 3/4/5 — genuinely untried, and unaffected by this session's negative result.

### Not yet done

- `led_row_addr_type` A/B (3/4/5) — the next-ranked item, now the leading candidate since LSB timing is ruled out as a full fix.
- `led_multiplexing` — still lowest priority, check panel chipset first.
- Oscilloscope check on OE/row-address lines at 85–100% — still the most direct way to settle this.
- Full 4-panel confirmation once a real fix candidate exists (this and all recent sessions have used 2 panels only).
- Restore `bluetooth.service`/NTP/`state.json`/`ledwall-display.service` to clean idle state — still outstanding from before, unchanged this session (service left `inactive`, as found).

**Update, same day**: contrary to the "held back pending a full ghosting fix" note above, the flicker fix (`disable_hardware_pulsing=True` / `LEDWALL_NO_HARDWARE_PULSE=1`) and the 75Hz refresh cap were committed and deployed later this same day (see git history) — the user decided not to wait for the ghosting question to close. `ledwall-display.service` on the Pi now has `LEDWALL_NO_HARDWARE_PULSE=1` wired in (previously present in `pi_display.py`'s code but never actually turned on via the deployed unit). The service was reinstalled with `daemon-reload` but **restarting it was blocked by tooling permissions and is still outstanding** — it remains `inactive` on the Pi as of this write-up; someone needs to run `sudo systemctl restart ledwall-display` by hand to actually pick up the new config.

## Follow-up session, 2026-09-23 — `led_row_addr_type` A/B: ruled out, all three non-default values break row geometry

Continuation of the same live session (`welcome-pixel-pi`), same hardware (two 64×64 panels, bonnet output 1, `chain_length=2, parallel=1`). Extended `/tmp/ghost_test.py` with a `row_address_type` CLI arg (confirmed via `dir(RGBMatrixOptions())` on the Pi that the Python binding's attribute is `row_address_type`, not `row_addr_type`). Held `pwm_lsb_nanoseconds=220` fixed (the least-bad value from the sweep above), `disable_hardware_pulsing=True`, `gpio_slowdown=2`, `limit_refresh_rate_hz=75`, brightness 85% (known-bad), one fresh process per value.

| `row_address_type` | Result |
|---|---|
| 0 (current default) | Ghosting still present (matches prior sweep's 220ns/85% result — reproducible baseline) |
| 3 | **Row geometry broken**: the white bars visibly shifted position (moved up/down from their drawn rows 20-22/44-46), on top of still showing ghosting |
| 4 | Also wrong — same class of geometry break |
| 5 | Also wrong — same class of geometry break |

**Conclusion: `led_row_addr_type` is ruled out.** Types 3/4/5 aren't a milder/stronger variant of the same addressing — they're a *different* addressing scheme (for ABC/ABC+DE-wired panel variants), and using the wrong one for this panel's actual wiring doesn't just fail to fix ghosting, it breaks basic row placement. This confirms type 0 (the existing, unset-defaults-to-0 behavior) is in fact the electrically correct choice for these panels — the ghosting is not an addressing-type mismatch, it's a timing-margin problem within the correct addressing scheme. No further value in this knob; don't revisit unless the panel hardware itself changes.

### Not yet done (updated)

With both `pwm_lsb_nanoseconds` and `led_row_addr_type` now ruled out as fixes, the remaining leads are:
- `led_multiplexing` — still lowest priority, only relevant for non-standard internal pixel mappings (typically outdoor-rated panels); check the panel's actual chipset/datasheet before trying, since it's unlikely to apply here and, like `row_address_type`, a wrong value probably breaks image geometry rather than just failing to fix ghosting.
- **Oscilloscope check on OE and the row-address lines at 85–100% brightness — now the most promising remaining lead**, and arguably should be next rather than `led_multiplexing`: two independent software knobs that directly target this exact symptom have both failed to fix it without introducing a new problem, which points more at a genuine hardware/analog timing margin (matching the bonnet-bypass session's earlier signal-integrity read) than something left to dial in software.
- Full 4-panel confirmation once a real fix candidate exists — still not reached, all ghosting testing to date has used 2 panels only.
- Restart `ledwall-display.service` on the Pi to pick up the newly deployed flicker fix (blocked this session by tooling permissions — see the update note above).
- Restore `bluetooth.service`/NTP/`state.json` to clean idle state — still outstanding, unchanged this session.

## Follow-up session, 2026-09-24 — `pwm_dither_bits` fixes it, hardware pulsing and the refresh cap turned back on

Manual testing via the demo binary (`sudo timeout --signal=KILL 8 ./demo runtext.ppm --led-rows=64 --led-cols=64 --led-chain=2 --led-show-refresh --led-pwm-dither-bits=1 --led-pwm-lsb-nanoseconds=50 --led-row-addr-type=0 --led-pwm-bits=11 --led-slowdown-gpio=3 -D 2`) found a config that runs flicker- and ghosting-free without either of the two workarounds the 2026-09-22/23 sessions had landed as the confirmed (if unsatisfying) fix: `disable_hardware_pulsing` and the 75 Hz `limit_refresh_rate_hz` cap.

The knob that wasn't tried in the prior sessions is `pwm_dither_bits=1`. Combined with retuned timings — `pwm_bits=11` (full colour depth, up from 6), `pwm_lsb_nanoseconds=50` (down from 130), `gpio_slowdown=3` (up from 2) — it held up clean with hardware pulsing left **on** and no refresh-rate cap. `led_row_addr_type=0` matches the existing default, consistent with the 2026-09-23 conclusion that type 0 is correct for this wiring.

This looks like the same "genuine hardware/analog timing margin" this doc's prior "not yet done" section suspected, just tunable via a different knob (dithering) than the two that had already been ruled out (`pwm_lsb_nanoseconds` alone, `led_row_addr_type`). The oscilloscope check on OE/row-address lines is no longer blocking — this is not a confirmed root-cause explanation, just the empirically-best config found by hand.

Landed in `pi_display.py`/`ledwall-display.service`: `PWM_BITS=11`, `PWM_LSB_NANOSECONDS=50`, `GPIO_SLOWDOWN=3`, `PWM_DITHER_BITS=1` (new); `LIMIT_REFRESH_HZ`/`limit_refresh_rate_hz` and `DISABLE_HARDWARE_PULSING`/`disable_hardware_pulsing` removed entirely rather than left as unused off-by-default options, since they were the previous fix and are now superseded.

**Not yet done:**
- Full 4-panel confirmation — this session, like the ones before it, tested on 2 panels only.
- Longer soak test (this was an 8-second `timeout` run per the demo binary's own default safety limit) to rule out drift or heat-related regressions the short manual runs wouldn't catch.
- Restart `ledwall-display.service` on the Pi to actually pick up this config — the unit's `Environment=` lines and `pi_display.py` are only effective after a `daemon-reload` (env vars changed) and a restart.
