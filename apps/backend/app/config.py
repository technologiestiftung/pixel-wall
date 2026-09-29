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

HOST = os.environ.get("LEDWALL_HOST", "0.0.0.0")
PORT = int(os.environ.get("LEDWALL_PORT", "5000"))

PASSWORD = os.environ.get("LEDWALL_PASSWORD") or None
AUTH_REALM = os.environ.get("LEDWALL_AUTH_REALM", "Pixel Wall")
AUTH_ENABLED = PASSWORD is not None

MQTT_HOST = os.environ.get("LEDWALL_MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.environ.get("LEDWALL_MQTT_PORT", "1883"))
MQTT_TOPIC_PREFIX = os.environ.get("LEDWALL_MQTT_TOPIC_PREFIX", "ledwall/screen")
MQTT_USERNAME = os.environ.get("LEDWALL_MQTT_USERNAME") or None
MQTT_PASSWORD = os.environ.get("LEDWALL_MQTT_PASSWORD") or None
MQTT_ENABLED = os.environ.get("LEDWALL_MQTT_ENABLED", "1") != "0"

BRIGHTNESS_MIN, BRIGHTNESS_MAX = 5, 100
DEFAULT_BRIGHTNESS = 60

#: Ceiling on a single content bitmap, so a malformed or hostile payload cannot
#: exhaust memory. A 256-char Lauftext filmstrip at 64px is ~10k px wide.
MAX_BITMAP_WIDTH_PX = 16384
MAX_BITMAP_HEIGHT_PX = 256

#: Snake mode. The grid cell is in mm so it is one physical size on both
#: pixel pitches; 24 mm is 8 px on a large screen and 6 px on a small one.
SNAKE_CELL_MM = float(os.environ.get("LEDWALL_SNAKE_CELL_MM", "24"))
#: The large screen that shows the join QR code while nobody is playing.
SNAKE_QR_SCREEN = os.environ.get("LEDWALL_SNAKE_QR_SCREEN", "04")
#: What the QR code links to. Unset means http://<this machine's LAN IP>:<port>/snake,
#: which is right unless the backend sits behind a proxy or a hostname.
PUBLIC_URL = os.environ.get("LEDWALL_PUBLIC_URL") or None


def live_file() -> Path:
    """Short-lived frames that override the state file on the Pi's panels —
    see app/snake_mode.py. A function so it follows a patched STATE_FILE."""
    override = os.environ.get("LEDWALL_LIVE_FILE")
    return Path(override) if override else STATE_FILE.with_name("live.json")
