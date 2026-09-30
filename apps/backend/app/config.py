import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

BASE_DIR = Path(__file__).resolve().parent.parent

if load_dotenv is not None:
    for candidate in (BASE_DIR / ".env", BASE_DIR / "app" / ".env"):
        if candidate.is_file():
            load_dotenv(candidate, override=False)

STATE_FILE = Path(os.environ.get("LEDWALL_STATE_FILE", "/var/lib/ledwall/state.json"))
#: The upload library lives in the repo checkout so it can be committed with
#: the code (see app/uploads.py).
UPLOADS_DIR = Path(os.environ.get("LEDWALL_UPLOADS_DIR", BASE_DIR / "uploads"))

HOST = os.environ.get("LEDWALL_HOST", "0.0.0.0")
PORT = int(os.environ.get("LEDWALL_PORT", "5000"))

PASSWORD = os.environ.get("LEDWALL_PASSWORD") or None
AUTH_REALM = os.environ.get("LEDWALL_AUTH_REALM", "Pixel Wall")
AUTH_ENABLED = PASSWORD is not None

#: How long a browser keeps control of the wall without a heartbeat (see
#: app/control.py). The editor sends one every 10 s.
CONTROL_TTL_S = float(os.environ.get("LEDWALL_CONTROL_TTL_S", "30"))

MQTT_HOST = os.environ.get("LEDWALL_MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.environ.get("LEDWALL_MQTT_PORT", "1883"))
MQTT_TOPIC_PREFIX = os.environ.get("LEDWALL_MQTT_TOPIC_PREFIX", "ledwall/screen")
MQTT_USERNAME = os.environ.get("LEDWALL_MQTT_USERNAME") or None
MQTT_PASSWORD = os.environ.get("LEDWALL_MQTT_PASSWORD") or None
MQTT_ENABLED = os.environ.get("LEDWALL_MQTT_ENABLED", "1") != "0"

#: Fixed per hardware kind; there is no user control for it.
BRIGHTNESS = {"small": 50, "large": 100}

#: Ceiling on a single content bitmap, so a malformed or hostile payload cannot
#: exhaust memory. A 256-char Lauftext filmstrip at 64px is ~10k px wide.
MAX_BITMAP_WIDTH_PX = 16384
MAX_BITMAP_HEIGHT_PX = 256

#: Upload library limits (see app/uploads.py). A sprite sheet is at most 128
#: frames of 128px, which as a PNG data URL stays well under the size cap.
MAX_UPLOADS = 50
MAX_UPLOAD_SHEET_CHARS = 4_000_000
