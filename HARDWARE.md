# Pixel Wall — Hardware & System Architecture

Companion to [`CONTEXT.md`](./CONTEXT.md) (frontend content/domain glossary) and
[`apps/backend/README.md`](./apps/backend/README.md) (API contract, install steps).
This file covers the physical wiring, power, and network layer — the parts that
don't live in either of those.

**Status note:** the sections below (screen inventory, wiring, power, network)
are settled decisions. The content-rendering _software_ architecture (how
selections/layout/bitmaps map to what actually gets driven onto the panels) is
explicitly still being worked out — see "Current implementation status" at the
bottom before assuming anything in `apps/frontend/src/domain` is already wired
up end to end.

## Screen inventory

| Kind  | Count | Resolution | Physical size | Pitch | Driven by                  |
| ----- | ----- | ---------- | ------------- | ----- | -------------------------- |
| Large | 4     | 64×64 px   | 192×192 mm    | 3 mm  | Raspberry Pi 4B, via HUB75 |
| Small | 3     | 32×32 px   | 128×128 mm    | 4 mm  | ESP32-WROOM-32, via HUB75  |

## Raspberry Pi side (4 large screens)

- Raspberry Pi 4B with a triple-output HUB75 bonnet (Adafruit-style / "Active3"
  class — see note under **Small screens** on why this specific bonnet is a Pi
  accessory, not something the ESP32 can use).
- Wiring (per `pi_display.py`):
  - bonnet output 1 → chain of 2× 64×64 panels
  - bonnet output 2 → chain of 2× 64×64 panels
  - bonnet output 3 → spare (considered for the small screens; not used — see below)
- Driver: `pi_display.py`, using `rpi-rgb-led-matrix` (hzeller), run as root
  (needs direct GPIO access). Config: `chain_length=2`, `parallel=2` →
  the library treats all 4 panels as **one continuous 128×128 canvas**,
  `adafruit-hat-pwm` hardware mapping, `gpio_slowdown=4`.
- The Pi has its own power supply, separate from the panels' 5V/20A rail.

### Why the small screens don't use the Pi's spare 3rd output

Considered wiring the 3 small (32×32) panels into the bonnet's unused 3rd
output instead of the ESP32. Ruled out for now:

- `rpi-rgb-led-matrix` sets panel geometry and scan timing **per process**,
  and 64×64 vs. 32×32 panels use different multiplexing — mixing panel types
  across the bonnet's 3 parallel outputs in one process isn't supported by the
  library's global rows/cols configuration.
- Running a _second_, separate process bound to just output 3 might work
  around that, but whether two `rpi-rgb-led-matrix` processes can share the
  bonnet's GPIO/PWM hardware concurrently without conflict is unverified —
  not something to assume without a bench test.
- Worth revisiting only if someone actually tests the dual-process approach;
  until then, keep the small screens on the ESP32 (below).

## Small screens (ESP32, 3× 32×32)

- **Decision:** one ESP32-WROOM-32, all 3 panels daisy-chained on its single
  HUB75 output (`chain_length=3`), talking to the Pi over MQTT.
- **Why not the "Active3" triple bonnet for the ESP32:** that bonnet is a
  Raspberry Pi accessory — Pi 40-pin GPIO header, timed for the Pi's
  bit-banging driver. There's no ESP32 version or adapter for it.
- **Why daisy-chain instead of one ESP32 per screen:** a plain ESP32-WROOM-32
  can only drive one HUB75 output chain per chip (confirmed against the
  standard `ESP32-HUB75-MatrixPanel-DMA` library — chaining panels in series
  on that one output is supported, driving multiple _independent_ chains from
  one chip is not). Daisy-chaining keeps the original single-ESP32,
  single-MQTT-client plan; the alternative (3 separate ESP32s) would work too
  but adds 2 more boards and 2 more WiFi/MQTT clients to provision.
- **Open risk — flag for a bench test:** the 3 panels sit ~0.5 m apart, so the
  daisy-chain's combined HUB75 ribbon-cable run is 1 m+. HUB75's clock speeds
  are not friendly to long cable runs; watch for ghosting/corruption and be
  ready to add active/buffered HUB75 extension cables if it shows up.
- **Firmware doesn't exist yet.** `apps/` currently only has `backend` and
  `frontend` — no ESP32 project in this repo. The Pi's backend already
  implements its half of the MQTT contract (retained publish to
  `ledwall/message`); the ESP32 side (subscribe, parse, drive the panels) is
  still to be written.

## Power

**Two separate supplies (confirmed on the wall, 2026-09-16):**

| Rail  | Feeds            | Supply | Typical worst case                  |
| ----- | ---------------- | ------ | ----------------------------------- |
| Large | 4 × 64×64 panels | 5V/20A | ~16 A at full white, max brightness |
| Small | 3 × 32×32 panels | 5V/4A  | ~6 A at full white, max brightness  |

The Pi has its own separate PSU.

- **The large rail has adequate headroom** (~20% at worst case).
- **The small rail is under-spec for the worst case.** Three 32×32 panels at
  full white and 100% brightness ask for roughly 6 A from a 4 A supply, plus
  ~0.25 A for the ESP32. Ordinary content (text, sparse icons) draws a
  fraction of that, so this may never bite in practice — but a white `Farbe`
  fill across all three small screens at full brightness is exactly the case
  that would.
  - **Mitigation available now:** brightness is settable per hardware kind
    from the UI (see CONTEXT.md "Content"), so the small screens can be capped
    independently of the large ones. Around 60% keeps worst-case draw inside
    4 A.
  - The per-panel figures above are typical HUB75 numbers, not measured from
    these specific panels. Confirm against the datasheets or a bench
    measurement before relying on them.

**Diagnosing a brownout** — it looks different from the refresh flicker caused
by CPU contention (see `apps/backend/README.md`, "Display script"). A brownout
shows as colours washing out toward dim or red, affects whichever rail is
loaded, and can reset the ESP32 (visible as a reboot in the Serial Monitor).
To check: display white at 100% and measure across 5V/GND at the **last panel
in the chain**, not at the supply. Below ~4.7 V means either the supply or
voltage drop in the wiring.

- **Distribution topology: not decided yet.** Two options on the table:
  - **Star:** separate wire run from the PSU to each panel/chain, sized for
    that branch's current. Avoids voltage drop accumulating along a chain.
  - **Piggybacked on the data chain:** power passed panel-to-panel alongside
    the HUB75 ribbon. Simpler wiring, but voltage can sag toward the far end
    of a chain — a real concern for the 2-panel large-screen chains and the
    3-panel small-screen chain.
  - Whichever is chosen, size wire gauge for the branch's actual current, and
    give the ESP32 a clean tap (its own regulation/decoupling) rather than
    the noisiest point on a rail shared with switching LED loads.

## Network & control protocol

- **Pi ↔ ESP32:** MQTT over WiFi via a local `mosquitto` broker running on the
  Pi (`127.0.0.1:1883`). The backend publishes retained messages to
  `ledwall/message` on every state change, so a rebooting ESP32 gets the
  current message immediately on subscribe. MQTT failures are logged, never
  surfaced as API errors — the state file on the Pi is the source of truth;
  MQTT is fan-out only.
- **Frontend ↔ Pi:** plain HTTP, same LAN/WiFi, port **5000** (FastAPI
  backend, systemd unit `ledwall-backend`, runs as user `pi`). CORS is
  wildcarded (LAN-only tool, not exposed to the internet). Single shared HTTP
  Basic password, no username (leave the username field blank), no TLS —
  accepted trade-off for a LAN-only kiosk tool; never port-forward this.
- The frontend is hosted online but only usable from a device on the same
  WiFi as the Pi, since the browser has to reach port 5000 directly.
- **Discovery:** `raspberrypi.local:5000` via avahi/mDNS (on by default on
  Raspberry Pi OS). Recommend a DHCP reservation for the Pi's IP, since the
  frontend has to hardcode the address somewhere.

## Current implementation status (as of Sept 2026 — expect this to go stale fast)

This section exists so nobody assumes more is built than actually is.

- **What's running today:** one global "wall state"
  (`text`, `color`, `brightness`, `speed_ms`) — a single message scrolls
  across all 4 large screens combined into one 128×128 canvas, and (once the
  ESP32 firmware exists) the same message would mirror identically to all 3
  small screens via MQTT. That's the entirety of today's backend API
  (`GET/PUT/PATCH /api/state`, `/api/limits`, `/api/health`) and today's
  `pi_display.py`, which draws its own text with a local BDF font.
- **What the frontend is already coding toward, but isn't backed by the API
  above yet:** per-screen independent content, a persisted layout (real mm
  positions), contiguous-selection validation, and a browser-side rendering
  pipeline that rasterizes a composite bitmap meant for a `POST /api/apply`
  endpoint (see `apps/frontend/src/domain/*`, `apps/frontend/src/api/types.ts`,
  and `CONTEXT.md`). `/api/screens`, `/api/layout`, `/api/apply`, and
  per-screen bitmaps don't exist on the backend yet.
- **This gap is expected, not a bug to fix quietly:** per Anna (Sept 2026),
  the content-rendering logic is explicitly still being worked out. Treat the
  frontend's domain model as a working draft of where this is headed, not a
  spec the backend is already supposed to match.

## Open follow-ups

- [ ] Bench-test the daisy-chained small-screen cable run for signal integrity
      over its full ~1 m+ length
- [ ] Real current-draw budget for the 5V/20A rail (datasheet or bench
      measurement, all 7 panels + ESP32, worst-case brightness/content)
- [ ] Decide power distribution topology (star vs. piggybacked) and wire
      gauge accordingly
- [ ] Write the ESP32 firmware (subscribe to `ledwall/message`, drive the 3
      daisy-chained 32×32 panels)
- [ ] Reconcile the backend API / `pi_display.py` with the frontend's
      per-screen/bitmap content model once that design settles
