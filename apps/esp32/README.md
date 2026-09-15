# Pixel Wall ESP32

Three chained 32x32 HUB75 panels (96x32) driven by an ESP32-WROOM. The board
subscribes to the backend's MQTT topic and scrolls whatever message is
published there.

```
backend (Pi) ──publish retain=true──▶ mosquitto ledwall/message ──▶ ESP32
```

The topic is retained, so the board gets the current message the moment it
subscribes — no request to the API, and a reboot picks the message back up on
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

The payload is JSON with sorted keys, as documented in
[../backend/README.md](../backend/README.md):

```json
{ "brightness": 60, "color": [255, 0, 128], "speed_ms": 30, "text": "HELLO BERLIN" }
```

Ranges are `brightness` 5-100, `speed_ms` 5-500, `text` up to 256 characters.
The sketch clamps everything again on arrival, so a malformed or out-of-range
message degrades rather than breaking the display. A change of `text` or
`color` restarts the scroll from the right edge; `brightness` and `speed_ms`
apply immediately without interrupting it — the same behaviour as the Pi's
`pi_display.py`.

`PubSubClient`'s default buffer is 256 bytes, which a full-length message
overflows silently. The sketch calls `setBufferSize(1024)`; don't remove it.

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
