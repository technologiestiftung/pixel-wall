# Pixel Wall ESP32

Three chained 32x32 HUB75 panels (96x32) driven by a single ESP32-WROOM. The
board subscribes to one MQTT topic per screen and renders the bitmap published
there — it does not render text or know what a template is; the frontend
rasterises everything.

```
backend (Pi) ──publish retain=true──▶ mosquitto ledwall/screen/<id> ──▶ ESP32
```

The topics are retained, so the board gets each screen's current content the
moment it subscribes — no request to the API, and a reboot picks the message back up on
its own. Nothing here talks to the HTTP API, and nothing here publishes.

## Libraries

Install via the Arduino IDE Library Manager:

| Library                          | Author        |
| -------------------------------- | ------------- |
| `ESP32-HUB75-MatrixPanel-I2S-DMA` | mrcodetastic  |
| `PubSubClient`                    | Nick O'Leary  |
| `ArduinoJson`                     | Benoit Blanchon (v7) |

Board: **ESP32 Dev Module**.

## Wi-Fi credentials

`secrets.h` is gitignored. Copy the example and fill it in:

```bash
cp pixel_wall_esp32/secrets.h.example pixel_wall_esp32/secrets.h
```

The broker address is not a secret and lives in the sketch as `MQTT_HOST` —
change it there if the Pi's IP moves. Give the Pi a DHCP reservation if you
would rather not reflash the ESP32 when the lease changes.

## Message contract

Each screen has its own retained topic, `ledwall/screen/<id>`, where `<id>` is
`01`, `02` or `03`. The board subscribes to all three: a selection can be a
subset (apply to `01` and `02`, and `03` must keep what it was showing), so one
shared topic would not work even though a single board drives all three panels.

The payload is **binary, not JSON** — a fixed 19-byte header carrying colour,
window and scroll, followed by a bitmap block. It is specified in full in
[`docs/wire-format.md`](../../docs/wire-format.md), and the shared test vectors
in `docs/wire-format-fixtures.json` are what the decoder should be tested
against.

Binary rather than JSON because a worst-case Lauftext filmstrip is ~9 KB;
parsing that with `ArduinoJson` would need roughly twice that in heap for the
document plus the decoded base64 string. Decoding the binary form needs neither
a JSON parser nor a base64 step, so `ArduinoJson` is no longer a dependency.

Two bitmap formats exist. `mask1` is 1 bit per pixel plus one RGB colour and
carries all text; `pal4` is 4 bits per pixel with a 16-entry palette and carries
multi-colour template artwork. A decoder dispatches on the block's first byte
(`0x50` for `mask1`, `0x51` for `pal4`) and **must reject anything else, keeping
the last good frame** rather than attempting to render it.

`PubSubClient`'s default buffer is 256 bytes. The sketch must call
`setBufferSize(16384)` — a filmstrip will not fit in less, and an oversized
message is dropped silently.

## Broker access

Mosquitto 2.x binds to localhost and refuses anonymous remote clients by
default, which the ESP32 cannot work with. `/etc/mosquitto/conf.d/ledwall.conf`
on the Pi opens it to the LAN:

```
listener 1883 0.0.0.0
allow_anonymous true
```

That leaves the broker open to anyone on the network — the same trade already
made for the HTTP API, and acceptable only because this is LAN-only.

## Troubleshooting

Watch the serial monitor at 115200 baud. The sketch logs the Wi-Fi IP, the
subscribe, and every state change it parses.

| Symptom                        | Cause                                               |
| ------------------------------ | --------------------------------------------------- |
| `mqtt: failed, rc=-2`          | broker unreachable — check `MQTT_HOST` and the listener |
| Connects, but no state logged  | nothing has been published yet; the topic has no retained message |
| Long messages truncate         | `setBufferSize` was removed or lowered              |
| Image shifted one pixel across | flip `mxconfig.clkphase`                            |
| Nothing lights up              | try `mxconfig.driver = HUB75_I2S_CFG::FM6126A`      |
