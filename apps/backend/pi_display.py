#!/usr/bin/env python3
"""

Drives the four 64x64 P3 panels from a Raspberry Pi 4 with an Adafruit-style
triple HUB75 bonnet.

The message, colour, brightness and scroll speed come from the shared state
file written by the backend API. This process only reads that file, so the wall
keeps scrolling whatever was last written even if the backend is stopped or has
never run. MQTT is no longer published from here: the backend owns the
`ledwall/message` topic and the ESP32 syncs from its retained message.

Physical layout (see wiring-diagram.svg):
    bonnet output 1 -> chain 1: 64x64 #1 -> 64x64 #2
    bonnet output 2 -> chain 2: 64x64 #1 -> 64x64 #2
    bonnet output 3 -> spare

The library sees this as a single 128x128 canvas:
    chain=2 gives 128 px wide, parallel=2 gives 128 px tall.

Run with sudo (the library needs direct GPIO access):
    sudo python3 pi_display.py
"""

import json
import os
import signal
import sys
import time
from pathlib import Path

from rgbmatrix import RGBMatrix, RGBMatrixOptions, graphics

# ---------------------------------------------------------------- settings

STATE_FILE = Path(os.environ.get("LEDWALL_STATE_FILE", "/var/lib/ledwall/state.json"))

FONT_PATH = os.environ.get(
    "LEDWALL_FONT", "/home/pi/rpi-rgb-led-matrix/fonts/10x20.bdf"
)
MAX_BRIGHTNESS = 100         # hard ceiling on current draw
POLL_INTERVAL = 0.2          # seconds between state re-reads mid-scroll
IDLE_SLEEP = 0.5             # seconds to wait when there is nothing to show

# Used until the state file first appears, and whenever it cannot be read.
DEFAULT_STATE = {
    "text": "PIXEL WALL",
    "color": (255, 255, 255),
    "brightness": 60,
    "speed_ms": 30,
}


# ------------------------------------------------------------ shared state

def _clamp(value, low, high):
    return max(low, min(high, value))


def read_state(previous):
    """Return the state on disk, or `previous` if it is missing or unusable.

    Never raises: a half-written or hand-edited file must not take the wall
    down. The backend writes atomically, so a torn read should be impossible,
    but this stays defensive because the file is also editable by hand.
    """
    try:
        with STATE_FILE.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except (OSError, ValueError):
        return previous

    if not isinstance(raw, dict):
        return previous

    try:
        colour = raw["color"]
        if not isinstance(colour, (list, tuple)) or len(colour) != 3:
            return previous

        return {
            "text": str(raw["text"])[:256],
            "color": tuple(_clamp(int(channel), 0, 255) for channel in colour),
            "brightness": _clamp(int(raw["brightness"]), 5, MAX_BRIGHTNESS),
            "speed_ms": _clamp(int(raw["speed_ms"]), 5, 500),
        }
    except (KeyError, TypeError, ValueError):
        return previous


# ------------------------------------------------------------ matrix setup

def build_matrix(brightness):
    options = RGBMatrixOptions()

    # Panel geometry. All four panels are 64x64 at 1/32 scan.
    options.rows = 64
    options.cols = 64
    options.chain_length = 4
    options.parallel = 1

    # Bonnet-specific. Use "adafruit-hat-pwm" only if the GPIO4-GPIO18
    # solder bridge is made; otherwise fall back to "adafruit-hat".
    options.hardware_mapping = "regular"

    # Quality and stability.
    options.brightness = brightness
    options.pwm_bits = 11
    options.pwm_lsb_nanoseconds = 130
    options.gpio_slowdown = 4        # Pi 4 needs 3-5; raise if you see ghosting
    options.limit_refresh_rate_hz = 120
    options.drop_privileges = False

    return RGBMatrix(options=options)


# -------------------------------------------------------------------- main

def main():
    state = read_state(DEFAULT_STATE)

    matrix = build_matrix(state["brightness"])
    canvas = matrix.CreateFrameCanvas()

    font = graphics.Font()
    font.LoadFont(FONT_PATH)

    def shutdown(_signum, _frame):
        matrix.Clear()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        state = read_state(state)
        matrix.brightness = state["brightness"]

        text = state["text"]
        if not text:
            canvas.Clear()
            canvas = matrix.SwapOnVSync(canvas)
            time.sleep(IDLE_SLEEP)
            continue

        colour = graphics.Color(*state["color"])

        pos = canvas.width
        text_width = graphics.DrawText(canvas, font, 0, -50, colour, text)
        last_poll = time.monotonic()

        while pos + text_width > 0:
            canvas.Clear()
            row = canvas.height // 2
            graphics.DrawText(canvas, font, pos, row // 2 + 10, colour, text)
            graphics.DrawText(canvas, font, pos, row + row // 2 + 10, colour, text)
            canvas = matrix.SwapOnVSync(canvas)
            pos -= 1
            time.sleep(state["speed_ms"] / 1000)

            # Re-read mid-scroll so brightness and speed changes are visible
            # without waiting for a long message to finish. A change of text or
            # colour restarts the scroll from the right edge.
            now = time.monotonic()
            if now - last_poll >= POLL_INTERVAL:
                last_poll = now
                fresh = read_state(state)
                if fresh != state:
                    restart = (
                        fresh["text"] != state["text"]
                        or fresh["color"] != state["color"]
                    )
                    state = fresh
                    matrix.brightness = state["brightness"]
                    if restart:
                        break


if __name__ == "__main__":
    main()
