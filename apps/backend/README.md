# Pixel Wall backend

LAN-only control API for the LED matrix wall. It owns what each of the 7
screens is showing, and hands that to two consumers:

```
                      POST /api/apply
  web interface ──────────────────────────▶  backend (FastAPI, :5000, user pi)
                                                   │
                            atomic write           │  publish retain=true,
                                                   ▼  one topic per screen
                       /var/lib/ledwall/state.json │  mosquitto ledwall/screen/<id>
                                   │               ▼
                                   ▼           ESP32 (3x 32x32, one board)
                     pi_display.py (root)
                     4x 64x64 HUB75 (128x128)
```

The frontend rasterises content and sends **pixels**, not text — see
[`docs/wire-format.md`](../../docs/wire-format.md). Neither consumer renders
text or knows what a template is.

The two paths are deliberately decoupled. `pi_display.py` re-reads the state
file between scroll cycles and every 200 ms during one, and never talks to the
backend, so **the wall keeps running when the backend is stopped, crashed, or
being upgraded**. A broker outage is logged and ignored; the API still
returns 200.

## Why FastAPI

Flask would also do the job, but three things here are free in FastAPI and
hand-rolled in Flask: Pydantic models give the validation and clamping of
`brightness` / window geometry / bitmap payloads as declarative types rather
than a wall of `if` statements; the generated OpenAPI schema at `/docs` and `/openapi.json` is
a live, checkable contract for the frontend you're writing yourself; and the
ASGI stack means the eventual "push state changes to the browser" step is a
websocket endpoint rather than a rewrite. Cost is one extra dependency
(`uvicorn`) and ~40 MB of RAM on the Pi 4.

## Install

On the Pi. The systemd units ship with `/home/pi/ledwall` and `User=pi` baked
in, which is only right if your login user is `pi` and you cloned to that path.
Set these two once and the rest of this section rewrites the units for you:

```bash
REPO=$HOME/pixel-wall          # wherever you cloned it
SVC_USER=$(whoami)
```

Dependencies and the virtualenv:

```bash
sudo apt update
sudo apt install -y python3-venv mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto

cd "$REPO/apps/backend"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Create the shared state directory. The `ledwall` group is what lets the backend
write a file the root display process reads — see [systemd/README.md](./systemd/README.md)
for why it is done this way:

```bash
sudo groupadd -f ledwall
sudo usermod -aG ledwall "$SVC_USER"
sudo install -d -o root -g ledwall -m 2775 /var/lib/ledwall
```

Log out and back in so `$SVC_USER` picks up the new group. A shell that was
already open will not have it, and the backend will fail to write state.

Set the API password. The unit requires this file to exist, so a missing or
unreadable one fails the service loudly rather than quietly starting an open
API:

```bash
sudo install -d -m 755 /etc/ledwall
sudo nano /etc/ledwall/backend.env      # LEDWALL_PASSWORD=<something you invent>
sudo chmod 600 /etc/ledwall/backend.env
```

Invent the value rather than copying one out of this file — a placeholder
pasted verbatim is a password that is written down in a public repository.

`0600 root:root` is enough: systemd reads the file as root before dropping to
the service user, so the password never needs to be readable by the account the
API runs as. Every other setting in [.env.example](./.env.example) can go in the
same file; all of them have working defaults.

Open the broker to the LAN. Mosquitto 2.x binds to localhost and refuses
anonymous remote clients, which is fine for the backend on `127.0.0.1` but
means the ESP32 cannot connect at all:

```bash
sudo tee /etc/mosquitto/conf.d/ledwall.conf >/dev/null <<'EOF'
listener 1883 0.0.0.0
allow_anonymous true
EOF
sudo systemctl restart mosquitto
ss -tlnp | grep 1883                    # want 0.0.0.0:1883, not 127.0.0.1:1883
```

That leaves the broker open to everyone on the network. It is the same trade
already made for the HTTP API and acceptable only because this is LAN-only —
note that the API password does not protect the wall from anyone who can reach
the broker directly.

Install the units, rewritten for your path and user:

```bash
cd "$REPO/apps/backend"
for u in ledwall-backend ledwall-display; do
  sed -e "s|/home/pi/ledwall|$REPO|g" -e "s|^User=pi$|User=$SVC_USER|" \
      "systemd/$u.service" | sudo tee "/etc/systemd/system/$u.service" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now ledwall-display ledwall-backend
```

Check the rewrite landed before chasing service errors:

```bash
grep -E 'User=|WorkingDirectory=|ExecStart=|Environment=' /etc/systemd/system/ledwall-*.service
```

Verify:

```bash
systemctl status ledwall-display ledwall-backend
curl -su :<your-password> http://localhost:5000/api/health | python3 -m json.tool
mosquitto_sub -h localhost -t 'ledwall/screen/+' -F '%t %l bytes' -C 1   # blocks until an apply
```

A `401` from that curl means the password is wrong; check
`sudo systemctl show ledwall-backend -p EnvironmentFiles` and read
`/etc/ledwall/backend.env`. The 401 body is identical for a wrong password and
a missing one, so it tells you nothing about which.

`state_file_writable: false` in the health output means the service user has not
picked up the `ledwall` group yet — log out and back in, or `sudo systemctl
restart ledwall-backend` after a reboot.

### Changing the password

`/etc/ledwall/backend.env` is the only file read on the Pi. A `.env` in the repo
is loaded with `override=False` ([app/config.py](./app/config.py)), so it never
overrides what systemd has already set — editing one there looks like it does
nothing.

```bash
sudo nano /etc/ledwall/backend.env
sudo systemctl restart ledwall-backend
```

The restart is required every time: the password is read once at import time
into a module-level constant, and nothing re-reads it. The restart takes under
a second and does not interrupt the wall — `ledwall-display` is a separate unit
reading the state file, and keeps scrolling throughout.

Anyone holding the old password in a browser tab stays in until their next
request, then gets a 401 and the password gate again.


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

Base URL `http://<pi-ip>:5000`. JSON in, JSON out, optional HTTP Basic auth
(see [Authentication](#authentication)). CORS is open (`*`) so the frontend can
be hosted anywhere on the LAN. Interactive docs at `/docs`, machine-readable
schema at `/openapi.json`.

The wall is modelled as **7 independently addressed screens**, not one global
message. A content edit applies to a selection of screens and leaves every
other screen untouched.

### Authentication

Authentication is **optional**: the middleware is active only when
`LEDWALL_PASSWORD` is set. Leave it unset for a trusted LAN and the API is open
to anyone on the network — the service logs a warning at startup and
`/api/health` reports `auth.enabled: false`, which is how the frontend decides
whether to show its password gate.

When it is set, every route — the API, `/docs`, `/openapi.json` and `/` — is
behind that single shared password.

**There is no username.** The transport is HTTP Basic, so the browser's prompt
still draws a username box — leave it empty. Whatever is typed there is
ignored. The password must go in the password box; putting it in the username
box returns a `401` whose body says so.

Set the password in `/etc/ledwall/backend.env`:

```
LEDWALL_PASSWORD=something-long
```

Restart with `sudo systemctl restart ledwall-backend` to pick up a change.

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

### `GET /api/screens` → `200`

The fixed hardware inventory. Static; it never changes at runtime.

```json
{
	"screens": [
		{ "id": "01", "kind": "small", "pixelSize": 32, "physicalSizeMm": 128 },
		{ "id": "04", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192 }
	]
}
```

Three `small` screens (`01`–`03`) and four `large` (`04`–`07`).

### `GET /api/layout` → `200`, `PUT /api/layout` → `200`

The user-arranged physical positions, in millimetres, of every screen. This is
a *planning* arrangement used to work out how content spans a selection — it is
not the electrical topology, and the display process does not derive panel
addresses from it.

```json
{
	"positions": [{ "screenId": "01", "xMm": 508, "yMm": 3 }]
}
```

`PUT` replaces the whole list and returns it. An unknown `screenId` is a `422`.

### `GET /api/state` → `200`

Everything the wall is currently showing.

```json
{
	"brightness": { "small": 60, "large": 60 },
	"layout": [{ "screenId": "01", "xMm": 508, "yMm": 3 }],
	"screens": {
		"04": {
			"window": { "offsetXPx": 0, "offsetYPx": 0, "widthPx": 64, "heightPx": 64 },
			"content": {
				"format": "mask1",
				"widthPx": 64,
				"heightPx": 64,
				"color": [254, 241, 119],
				"data": "UAEB…",
				"scroll": null
			}
		}
	},
	"updated_at": "2026-09-16T09:31:00Z"
}
```

`screens` contains only screens that have had content applied; it starts empty.
`content` is the JSON envelope from
[`docs/wire-format.md`](../../docs/wire-format.md) — `data` is a base64 bitmap
block in one of two formats:

| `format` | Use | Colour |
| -------- | --- | ------ |
| `mask1`  | text, flat colour fills, single-colour icons | one RGB value in `color` |
| `pal4`   | multi-colour template artwork | a palette inside `data` |

### `POST /api/apply` → `200`

Applies one content edit to a selection of screens.

```json
{
	"selectionKind": "large",
	"screens": [
		{ "screenId": "04", "window": { "offsetXPx": 0, "offsetYPx": 0, "widthPx": 64, "heightPx": 64 } },
		{ "screenId": "05", "window": { "offsetXPx": 84, "offsetYPx": 0, "widthPx": 64, "heightPx": 64 } }
	],
	"content": { "format": "mask1", "widthPx": 148, "heightPx": 64, "color": [255, 255, 255], "data": "UAEB…" },
	"brightness": { "small": 60, "large": 85 }
}
```

Returns `{ "appliedAt": "2026-09-16T09:31:00Z" }`.

- The frontend rasterises content **once**, across the whole selection's
  composite, and `window` says which region each screen shows. Static content is
  sliced per screen here, so each stored bitmap and each MQTT message is
  self-contained.
- **Scrolling content is not sliced**: every screen pans the same filmstrip, so
  each keeps the whole strip plus its own `window` offset. A composite's screens
  must therefore pan from a shared phase, which is why all four large screens
  are driven from one process.
- `brightness` is optional; omitting it leaves the current values alone. It is
  per hardware *kind*, not per screen, because `matrix.brightness` and
  `setBrightness8` are whole-canvas properties.
- Screens outside `screens[]` keep whatever they were showing.

### Validation

`422` on: an unknown `screenId`; a `selectionKind` that doesn't match the kinds
of the selected screens; an empty selection; an unknown `format`; or a `data`
string that is not valid base64 or not a decodable bitmap block. The block is
decoded here on the way in, so a payload that would fail on a panel — where
nobody would see the error — fails at the API instead.

`brightness` is clamped rather than rejected: `0` becomes `5`, `999` becomes
`100`.

### `GET /api/limits` → `200`

```json
{
	"brightness": { "min": 5, "max": 100 },
	"bitmap": { "maxWidthPx": 16384, "maxHeightPx": 256, "formats": ["mask1", "pal4"] },
	"screens": [{ "id": "01", "kind": "small", "pixelSize": 32, "physicalSizeMm": 128 }]
}
```

### `GET /api/health` → `200`

```json
{
	"status": "ok",
	"state_file": "/var/lib/ledwall/state.json",
	"state_file_writable": true,
	"updated_at": "2026-09-16T09:31:00Z",
	"auth": { "enabled": true },
	"mqtt": {
		"enabled": true,
		"connected": true,
		"broker": "127.0.0.1:1883",
		"topic_prefix": "ledwall/screen",
		"last_error": null
	}
}
```

`auth.enabled` is what the frontend reads to decide whether to show a password
gate.

### Status codes

| Code  | When                                                              |
| ----- | ----------------------------------------------------------------- |
| `200` | success                                                           |
| `307` | `/` redirects to `/docs`                                          |
| `401` | missing or wrong password, when `LEDWALL_PASSWORD` is set         |
| `405` | a retired route — `PUT`/`PATCH /api/state` no longer exist        |
| `422` | payload failed validation (see above)                             |
| `500` | the state file could not be written                               |

## Display script

`pi_display.py` is a **compositor, not a renderer**. The frontend rasterises
content and the backend stores a bitmap per screen, so this process decodes
those bitmaps, pans the scrolling ones, and blits each screen into its fixed
rectangle of the 128x128 canvas. It does not know what text or a template is,
and it no longer needs a BDF font.

The geometry that is easy to get wrong lives in `app/compositor.py` rather than
in the display loop, so it can be tested without a wall attached — including
the seam case, where two screens of one composite must pan in step.

- **It no longer publishes MQTT.** The backend owns the `ledwall/screen/<id>`
  topics now, and two publishers writing a retained message to one topic would
  overwrite each other. One less dependency running as root.
- **It re-reads state every 200 ms** and redraws every frame. Because the four
  panels are one physical canvas, the whole frame is recomposed each tick
  regardless of which screens changed — "already-applied screens are left
  untouched" (CONTEXT.md) is a guarantee about state, not frame composition.
- **A bad state file is survivable.** Missing, truncated or malformed —
  `read_state` returns the last good state and the wall keeps running. An
  individual screen whose payload will not decode renders black rather than
  taking the frame down.
- **Every screen pans off one clock.** `marquee_offset_px` is a pure function
  of elapsed time (mirrored in `domain/scroll.ts` and the firmware), which is
  what keeps a multi-screen Lauftext in step across the seams without any
  per-screen bookkeeping.

### Matrix config

`rows=64`, `cols=64`, `gpio_slowdown=4`, `drop_privileges=False`, and the
geometry has to match how the panels are physically chained.

This wall is two bonnet outputs with two panels each, which is two parallel
chains of two — a single 128x128 canvas:

```python
options.chain_length = 2
options.parallel = 2
options.hardware_mapping = "regular"
```

`hardware_mapping` describes the adapter board, not the panels. `adafruit-hat`
and `adafruit-hat-pwm` drive exactly **one** chain: asking them for
`parallel > 1` aborts the process with

```
The adafruit-hat-pwm GPIO mapping only supports 1 parallel chain, but 2 was requested.
```

which systemd shows as `status=6/ABRT` in a restart loop, not as a Python
traceback. A multi-port adapter wants `regular`.

Getting this wrong is quiet rather than loud. Driving these same four panels as
`chain_length=4, parallel=1` lays them out as one 256x64 row, so half the
canvas is off-screen and only two panels light up.

**Which physical panel is which quadrant** is a separate question from the
canvas geometry, and it is recorded in `app/hardware.py`. That table is an
assumption until bench-checked; run

```bash
sudo python3 -m app.hardware
```

from `apps/backend` to light one quadrant at a time and note which panel
responds. If a chain is cabled in the reverse direction, two ids swap — the
symptom is subtle, with Lauftext jumping backwards at the seam rather than
obviously breaking. Fix it by editing that table, not by changing any other
code.

`ledwall-display.service` runs it straight out of the repo at
`/home/pi/ledwall/apps/backend/pi_display.py` rather than from a copy at
`/home/pi/ledwall/pi_display.py`, so a `git pull` followed by

```bash
sudo systemctl restart ledwall-display
```

is the whole update path and there is no second copy to drift. If you prefer
the old location, copy the file there and edit `ExecStart` in the unit.

It needs `rgbmatrix` and `Pillow` importable by the _system_ Python — it runs
as root, outside the backend venv:

```bash
sudo pip3 install --break-system-packages Pillow
```

## MQTT

On every successful apply the backend publishes **one retained message per
screen** to `ledwall/screen/<id>` (prefix configurable via
`LEDWALL_MQTT_TOPIC_PREFIX`). Retained-per-topic is what lets a device that
reboots recover its own content immediately on subscribe, without the backend
being up.

The payload is **binary, not JSON** — a fixed 19-byte header (colour, window,
scroll) followed by the bitmap block, specified in
[`docs/wire-format.md`](../../docs/wire-format.md). It is binary because a
worst-case Lauftext filmstrip is ~9 KB, and parsing that as JSON on an ESP32
would cost roughly twice that in heap for the document plus the decoded
base64 string.

Publishing happens after the state file write, and its failure is logged per
screen rather than raised: the state file stays authoritative.

```bash
# watch one screen's payload size (binary, so -v prints raw bytes)
mosquitto_sub -h localhost -t 'ledwall/screen/+' -F '%t %l bytes'
```

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
