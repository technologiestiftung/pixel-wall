import os
from pathlib import Path

STATE_FILE = Path(os.environ.get("LEDWALL_STATE_FILE", "/var/lib/ledwall/state.json"))

HOST = os.environ.get("LEDWALL_HOST", "0.0.0.0")
PORT = int(os.environ.get("LEDWALL_PORT", "5000"))

MQTT_HOST = os.environ.get("LEDWALL_MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.environ.get("LEDWALL_MQTT_PORT", "1883"))
MQTT_TOPIC = os.environ.get("LEDWALL_MQTT_TOPIC", "ledwall/message")
MQTT_USERNAME = os.environ.get("LEDWALL_MQTT_USERNAME") or None
MQTT_PASSWORD = os.environ.get("LEDWALL_MQTT_PASSWORD") or None
MQTT_ENABLED = os.environ.get("LEDWALL_MQTT_ENABLED", "1") != "0"

TEXT_MAX_LENGTH = 256
BRIGHTNESS_MIN, BRIGHTNESS_MAX = 5, 100
SPEED_MS_MIN, SPEED_MS_MAX = 5, 500

DEFAULT_STATE = {
    "text": "PIXEL WALL",
    "color": [255, 255, 255],
    "brightness": 60,
    "speed_ms": 30,
}
