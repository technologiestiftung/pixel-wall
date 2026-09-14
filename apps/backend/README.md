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
file between scroll cycles and every 200 ms during one, and never talks to the
backend, so **the wall keeps running when the backend is stopped, crashed, or
being upgraded**. A broker outage is logged and ignored; the API still
returns 200.

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

On the Pi, as `pi`. This assumes the repo is cloned to `/home/pi/ledwall`, so
this directory is `/home/pi/ledwall/apps/backend`. That path is baked into both
systemd units — change it there if you clone elsewhere.

```bash
sudo apt update
sudo apt install -y python3-venv mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto

cd /home/pi/ledwall/apps/backend
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

Log out and back in so `pi` picks up the new group.

Set the API password. The unit requires this file to exist, so a missing or
unreadable one fails the service loudly rather than quietly starting an open
API:

```bash
sudo install -d -m 755 /etc/ledwall
sudo tee /etc/ledwall/backend.env >/dev/null <<'EOF'
LEDWALL_PASSWORD=pick-something-long
EOF
sudo chmod 600 /etc/ledwall/backend.env
```

`0600 root:root` is enough: systemd reads the file as root before dropping to
`pi`, so the password never needs to be readable by the account the API runs
as. Every other setting in [.env.example](./.env.example) can go in the same
file; all of them have working defaults.

Install the units:

```bash
sudo cp systemd/ledwall-backend.service systemd/ledwall-display.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ledwall-display ledwall-backend
```

Verify:

```bash
systemctl status ledwall-display ledwall-backend
curl -su :pick-something-long http://localhost:5000/api/health | python3 -m json.tool
mosquitto_sub -h localhost -t ledwall/message -v -C 1   # blocks until a state change
```

A `401` from that curl means the password is wrong; check
`sudo systemctl show ledwall-backend -p EnvironmentFiles`.

`state_file_writable: false` in the health output means `pi` has not picked up
the `ledwall` group yet — log out and back in, or `sudo systemctl restart
ledwall-backend` after a reboot.

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

Base URL `http://<pi-ip>:5000`. JSON in, JSON out, HTTP Basic auth on every
route (see [Authentication](#authentication)). CORS is open (`*`) so the
frontend can be hosted anywhere on the LAN. Interactive docs at `/docs`,
machine-readable schema at `/openapi.json`.

### Authentication

Every route — the API, `/docs`, `/openapi.json` and `/` — is behind a single
shared password. Open `http://<pi-ip>:5000` in a browser and it prompts; the
browser then caches it for the rest of the session.

**There is no username.** The transport is HTTP Basic, so the browser's prompt
still draws a username box — leave it empty. Whatever is typed there is
ignored. The password must go in the password box; putting it in the username
box returns a `401` whose body says so.

Set the password in `/etc/ledwall/backend.env`:

```
LEDWALL_PASSWORD=something-long
```

Restart with `sudo systemctl restart ledwall-backend` to pick up a change. If
`LEDWALL_PASSWORD` is unset the middleware is bypassed entirely and the API is
open to the whole LAN — the service logs a warning at startup and
`/api/health` reports `auth.enabled: false`.

**Calling it from the frontend.** A browser only shows its own password prompt
for a navigation, not for a cross-origin `fetch()`. A frontend served from
anywhere other than the Pi itself must collect the password and send the header
itself:

```js
const auth = "Basic " + btoa(`:${password}`); // empty username, colon required
const res = await fetch(`${apiUrl}/api/state`, {
	headers: { Authorization: auth },
});
if (res.status === 401) {
	// wrong or missing password — prompt again
}
```

Do not pass `credentials: "include"`; these are plain headers, not cookies, and
that mode is incompatible with the wildcard CORS origin. `Authorization` is
listed explicitly in `allow_headers` because the Fetch spec excludes it from
the `*` wildcard — a frontend would otherwise fail preflight.

**What this is and isn't.** Basic auth over plain HTTP sends the password
base64-encoded, which is encoding, not encryption: anyone who can sniff traffic
on your LAN can read it. That is an accepted trade for a LAN-only wall with no
TLS. It stops casual access from other people on the network, and nothing more.
Don't reuse a password you use elsewhere, and don't port-forward this to the
internet.

### The state object

| Field        | Type        | Range                   | Meaning                          |
| ------------ | ----------- | ----------------------- | -------------------------------- |
| `text`       | string      | 0–256 chars             | message shown on the wall        |
| `color`      | `[r, g, b]` | each 0–255              | text colour                      |
| `brightness` | integer     | 5–100                   | panel brightness                 |
| `speed_ms`   | integer     | 5–500                   | milliseconds per pixel of scroll |
| `updated_at` | string      | RFC 3339 UTC, read-only | when the state was last written  |

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
curl -u :your-password -X PUT http://raspberrypi.local:5000/api/state \
  -H 'Content-Type: application/json' \
  -d '{"text":"HELLO BERLIN","color":"#ff0080","brightness":60,"speed_ms":30}'
```

### `PATCH /api/state` → `200`

Partial update, merged onto current state. Omitted fields keep their value. Use
this for a brightness slider that shouldn't touch the message.

```bash
curl -u :your-password -X PATCH http://raspberrypi.local:5000/api/state \
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
	"defaults": {
		"text": "PIXEL WALL",
		"color": [255, 255, 255],
		"brightness": 60,
		"speed_ms": 30
	}
}
```

### `GET /api/health` → `200`

```json
{
	"status": "ok",
	"state_file": "/var/lib/ledwall/state.json",
	"state_file_writable": true,
	"updated_at": "2026-09-14T10:38:20Z",
	"auth": { "enabled": true },
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
| `422` | body failed type validation (never for out-of-range numbers)      |
| `401` | missing or wrong credentials; response carries `WWW-Authenticate` |
| `500` | state file could not be written — check `state_file_writable`     |

`GET /` redirects to `/docs` with a `307`; it is not part of the API.

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

`ledwall-display.service` runs it straight out of the repo at
`/home/pi/ledwall/apps/backend/pi_display.py` rather than from a copy at
`/home/pi/ledwall/pi_display.py`, so a `git pull` followed by

```bash
sudo systemctl restart ledwall-display
```

is the whole update path and there is no second copy to drift. If you prefer
the old location, copy the file there and edit `ExecStart` in the unit.

It needs `rgbmatrix` importable by the _system_ Python — it runs as root,
outside the backend venv — and the BDF font at `FONT_PATH`. Both are already
true on your Pi.

## MQTT

On every successful state change the backend publishes to `ledwall/message` with
`retain=true`, so an ESP32 that reboots gets the current message immediately on
subscribe:

```json
{
	"brightness": 60,
	"color": [255, 0, 128],
	"speed_ms": 30,
	"text": "HELLO BERLIN"
}
```

Keys are sorted, so `ArduinoJson` with a fixed document size is safe. Publishing
happens after the state file write and its failure is logged, not raised.

## Layout

| Path               | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `app/main.py`      | endpoints                                                |
| `app/models.py`    | request/response models, clamping, colour coercion       |
| `app/state.py`     | atomic read/write of the shared state file               |
| `app/mqtt.py`      | fire-and-forget publisher                                |
| `app/auth.py`      | HTTP Basic middleware                                    |
| `app/config.py`    | environment configuration and ranges                     |
| `systemd/`         | both units and the file-permission rationale             |
| `pi_display.py`    | display driver, run in place as root by the display unit |
| `requirements.txt` | pinned runtime dependencies                              |
| `.env.example`     | every setting, with its default                          |

## Local development

Away from the Pi, point the state file somewhere writable and turn MQTT off:

```bash
LEDWALL_STATE_FILE=/tmp/ledwall-state.json LEDWALL_MQTT_ENABLED=0 \
  .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 5000
```

On macOS, port 5000 is taken by the AirPlay Receiver (it shows up as
`ControlCenter` in `lsof -nP -iTCP:5000`), and uvicorn will fail to bind while
requests appear to succeed against the wrong server. Use another port locally,
or turn the receiver off in System Settings → General → AirDrop & Handoff.

Settings can also go in a `.env` file next to this README (or `app/.env`); it
is loaded at import time and never overrides a real environment variable. Both
are gitignored. Leaving `LEDWALL_PASSWORD` out of it runs the API without auth,
which is usually what you want locally.
