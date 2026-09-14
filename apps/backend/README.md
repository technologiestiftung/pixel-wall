# Pixel Wall backend

LAN-only control API for the LED matrix wall. It owns one piece of state — the
message the wall is showing — and hands it to two consumers:

```
                    PUT/PATCH /api/state
  web interface ──────────────────────────▶  backend (FastAPI, :5000, user pi)
                                                   │
                            atomic write           │  publish retain=true
                                                   ▼
                       /var/lib/ledwall/state.json │  mosquitto ledwall/message
                                   │               ▼
                                   ▼           ESP32 (3x 32x32)
                     pi_display.py (root)
                     4x 64x64 HUB75
```

The two paths are deliberately decoupled. `pi_display.py` re-reads the state
file every scroll cycle and never talks to the backend, so **the wall keeps
running when the backend is stopped, crashed, or being upgraded**. A broker
outage is logged and ignored; the API still returns 200.

## Why FastAPI

Flask would also do the job, but three things here are free in FastAPI and
hand-rolled in Flask: Pydantic models give the validation and clamping of
`brightness` / `speed_ms` / colour as declarative types rather than a wall of
`if` statements; the generated OpenAPI schema at `/docs` and `/openapi.json` is
a live, checkable contract for the frontend you're writing yourself; and the
ASGI stack means the eventual "push state changes to the browser" step is a
websocket endpoint rather than a rewrite. Cost is one extra dependency
(`uvicorn`) and ~40 MB of RAM on the Pi 4.

## Install

On the Pi, as `pi`. This assumes the repo is at `/home/pi/ledwall` and the
existing display script is at `/home/pi/ledwall/pi_display.py`.

```bash
sudo apt update
sudo apt install -y python3-venv mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto

cd /home/pi/ledwall/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Create the shared state directory. The `ledwall` group is what lets the backend
write a file the root display process reads — see [systemd/README.md](./systemd/README.md)
for why it is done this way:

```bash
sudo groupadd -f ledwall
sudo usermod -aG ledwall pi
sudo install -d -o root -g ledwall -m 2775 /var/lib/ledwall
```

Log out and back in so `pi` picks up the new group. Optionally drop overrides in
`/etc/ledwall/backend.env` (see [.env.example](./.env.example)); every setting
has a working default.

Install the units:

```bash
sudo cp systemd/ledwall-backend.service systemd/ledwall-display.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ledwall-display ledwall-backend
```

Verify:

```bash
curl -s http://localhost:5000/api/health | python3 -m json.tool
mosquitto_sub -h localhost -t ledwall/message -v -C 1
```

## Finding the Pi's IP

From the Pi:

```bash
hostname -I | awk '{print $1}'
```

From another machine on the same LAN, if avahi is running (it is by default on
Raspberry Pi OS), `http://raspberrypi.local:5000` works without knowing the IP —
substitute your hostname if you changed it. Otherwise scan:

```bash
ping -c1 raspberrypi.local
arp -a | grep -i b8:27:eb   # older Pi OUI
arp -a | grep -i dc:a6:32   # Pi 4 OUI
```

Give the Pi a DHCP reservation on your router if you want the address to stay
put — the frontend has to hardcode it somewhere.

## API contract

Base URL `http://<pi-ip>:5000`. JSON in, JSON out, no auth. CORS is open (`*`)
so the frontend can be hosted anywhere on the LAN. Interactive docs at `/docs`,
machine-readable schema at `/openapi.json`.

### The state object

| Field        | Type        | Range                    | Meaning                          |
| ------------ | ----------- | ------------------------ | -------------------------------- |
| `text`       | string      | 0–256 chars              | message shown on the wall        |
| `color`      | `[r, g, b]` | each 0–255               | text colour                      |
| `brightness` | integer     | 5–100                    | panel brightness                 |
| `speed_ms`   | integer     | 5–500                    | milliseconds per pixel of scroll |
| `updated_at` | string      | RFC 3339 UTC, read-only  | when the state was last written  |

### `GET /api/state` → `200`

```json
{
	"text": "HELLO BERLIN",
	"color": [255, 0, 128],
	"brightness": 60,
	"speed_ms": 30,
	"updated_at": "2026-09-14T10:38:20Z"
}
```

Returns the built-in defaults if the state file does not exist yet.

### `PUT /api/state` → `200`

Full replacement. Every field is optional and falls back to its default, so a
`PUT` is always a complete, known state.

```bash
curl -X PUT http://raspberrypi.local:5000/api/state \
  -H 'Content-Type: application/json' \
  -d '{"text":"HELLO BERLIN","color":"#ff0080","brightness":60,"speed_ms":30}'
```

### `PATCH /api/state` → `200`

Partial update, merged onto current state. Omitted fields keep their value. Use
this for a brightness slider that shouldn't touch the message.

```bash
curl -X PATCH http://raspberrypi.local:5000/api/state \
  -H 'Content-Type: application/json' -d '{"brightness":85}'
```

Both return the full new state, identical in shape to `GET /api/state`.

### Validation and clamping

Two different behaviours, deliberately:

- **Wrong type** → `422` with FastAPI's standard error body. `"brightness": "high"`
  and `"color": [1, 2]` are rejected; the frontend has a bug.
- **Right type, out of range** → clamped silently and reflected in the response.
  `"brightness": 999` becomes `100`, `"speed_ms": 0` becomes `5`. The frontend
  should render the returned state rather than assume its request was applied
  verbatim.

`color` also accepts `"#ff0080"` or `{"r":255,"g":0,"b":128}` on input and always
comes back as `[r, g, b]`. `text` is stripped of control characters and truncated
to 256 characters.

### `GET /api/limits` → `200`

The ranges above, as data — so sliders and inputs can be bounded without
hardcoding numbers that might change:

```json
{
	"text": { "max_length": 256 },
	"color": { "min": 0, "max": 255, "length": 3 },
	"brightness": { "min": 5, "max": 100 },
	"speed_ms": { "min": 5, "max": 500 },
	"defaults": { "text": "PIXEL WALL", "color": [255, 255, 255], "brightness": 60, "speed_ms": 30 }
}
```

### `GET /api/health` → `200`

```json
{
	"status": "ok",
	"state_file": "/var/lib/ledwall/state.json",
	"state_file_writable": true,
	"updated_at": "2026-09-14T10:38:20Z",
	"mqtt": {
		"enabled": true,
		"connected": true,
		"broker": "127.0.0.1:1883",
		"topic": "ledwall/message",
		"last_error": null
	}
}
```

Always `200` while the process is alive — read the fields to tell degraded from
healthy. `state_file_writable: false` means the group setup above is wrong and
writes will fail; `mqtt.connected: false` means the ESP32 panels are stale while
the HUB75 panels are fine.

### Status codes

| Code  | When                                                              |
| ----- | ----------------------------------------------------------------- |
| `200` | success                                                           |
| `404` | unknown path                                                      |
| `422` | body failed type validation (never for out-of-range numbers)       |
| `500` | state file could not be written — check `state_file_writable`      |

MQTT failures never produce an error status. The state file is the source of
truth; the broker is a fan-out for the ESP32.

## Display script

`pi_display.py` replaces the hardcoded `MESSAGES` list with a read of the state
file. Three changes from the original worth knowing about:

- **It no longer publishes MQTT.** The backend owns `ledwall/message` now, and
  two publishers writing a retained message to one topic would overwrite each
  other. One less dependency running as root.
- **It re-reads state mid-scroll, not just between cycles**, every 200 ms.
  Brightness and speed apply immediately; a change of text or colour restarts
  the scroll from the right edge. Without this a 200-character message at
  30 ms/px would ignore your slider for the better part of a minute. Drop
  `POLL_INTERVAL` and the block at the bottom of the scroll loop if you'd
  rather it only refreshed per cycle.
- **A bad state file is survivable.** Missing, truncated, malformed, or missing
  keys — `read_state` returns the last good state and the wall keeps scrolling.
  Values are clamped again here, so the display never trusts the file even
  though the backend already validated it.

The matrix config is untouched: `rows=64`, `cols=64`, `chain_length=2`,
`parallel=2`, `adafruit-hat-pwm`, `gpio_slowdown=4`, `drop_privileges=False`.

Install it alongside the backend:

```bash
sudo cp pi_display.py /home/pi/ledwall/pi_display.py
sudo chmod +x /home/pi/ledwall/pi_display.py
```

It needs `rgbmatrix` importable by the *system* Python (root, outside the
backend venv) and the BDF font at `FONT_PATH` — both already true on your Pi.

## MQTT

On every successful state change the backend publishes to `ledwall/message` with
`retain=true`, so an ESP32 that reboots gets the current message immediately on
subscribe:

```json
{ "brightness": 60, "color": [255, 0, 128], "speed_ms": 30, "text": "HELLO BERLIN" }
```

Keys are sorted, so `ArduinoJson` with a fixed document size is safe. Publishing
happens after the state file write and its failure is logged, not raised.

## Layout

| Path                | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `app/main.py`       | endpoints                                                  |
| `app/models.py`     | request/response models, clamping, colour coercion         |
| `app/state.py`      | atomic read/write of the shared state file                 |
| `app/mqtt.py`       | fire-and-forget publisher                                  |
| `app/config.py`     | environment configuration and ranges                       |
| `systemd/`          | both units and the file-permission rationale               |
| `pi_display.py`     | display driver, installed to `/home/pi/ledwall/`            |

## Local development

Away from the Pi, point the state file somewhere writable and turn MQTT off:

```bash
LEDWALL_STATE_FILE=/tmp/ledwall-state.json LEDWALL_MQTT_ENABLED=0 \
  .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 5000
```
