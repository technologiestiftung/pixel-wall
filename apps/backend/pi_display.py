#!/usr/bin/env python3
"""

Drives the four 64x64 P3 panels from a Raspberry Pi 4 with an Adafruit-style
triple HUB75 bonnet.

This process is a compositor, not a renderer. The frontend rasterises content
and the backend stores a bitmap per screen (see docs/wire-format.md); here we
decode those bitmaps, pan the scrolling ones, and blit each screen into its
fixed rectangle of the matrix canvas. Nothing here knows what text or a
template is.

It only reads the shared state file, so the wall keeps showing whatever was
last applied even if the backend is stopped or has never run. MQTT is not
published from here: the backend owns the `ledwall/screen/<id>` topics and the
ESP32 syncs from their retained messages.

Physical layout: two bonnet outputs, two panels each.
    bonnet output 1 -> chain 1: 64x64 -> 64x64
    bonnet output 2 -> chain 2: 64x64 -> 64x64

The library sees this as a single 128x128 canvas: chain_length=2 gives 128 px
wide, parallel=2 gives 128 px tall. Which physical panel lands in which
quadrant is recorded in app/hardware.py and needs a one-time bench check.

Run with sudo (the library needs direct GPIO access):
    sudo python3 pi_display.py
"""

import json
import os
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rgbmatrix import RGBMatrix, RGBMatrixOptions  # noqa: E402

from app.compositor import (  # noqa: E402
    brightness_for_large,
    has_scrolling,
    render_frame,
)

# ---------------------------------------------------------------- settings

STATE_FILE = Path(os.environ.get("LEDWALL_STATE_FILE", "/var/lib/ledwall/state.json"))

MAX_BRIGHTNESS = 100         # hard ceiling on current draw
DEFAULT_BRIGHTNESS = 60
STATE_POLL_INTERVAL = 0.2    # seconds between state re-reads
TARGET_FRAME_INTERVAL = 1 / 60

# Panel tuning, overridable without editing code because the right values are
# specific to the wiring and can only be found by looking at the wall. Lower
# PWM_BITS is the usual first move against flicker: it cuts the refresh work
# per frame at the cost of colour depth.
PWM_BITS = int(os.environ.get("LEDWALL_PWM_BITS", "11"))
PWM_LSB_NANOSECONDS = int(os.environ.get("LEDWALL_PWM_LSB_NS", "130"))
GPIO_SLOWDOWN = int(os.environ.get("LEDWALL_GPIO_SLOWDOWN", "4"))
LIMIT_REFRESH_HZ = int(os.environ.get("LEDWALL_REFRESH_HZ", "120"))

# "regular" suits a generic multi-port adapter. An Adafruit HAT/bonnet needs
# "adafruit-hat" (or "adafruit-hat-pwm" with the GPIO4-GPIO18 bridge made) —
# but those drive only ONE chain, so they are incompatible with parallel=2.
# Wrong mapping shows up as missing colour channels, not as a failure to start.
HARDWARE_MAPPING = os.environ.get("LEDWALL_HARDWARE_MAPPING", "regular")

# Diagnostics. SHOW_REFRESH prints the achieved refresh rate to stderr, which
# is the number that actually decides whether flicker is visible — below about
# 100 Hz the eye starts to see it. DISABLE_HARDWARE_PULSING falls back to
# software timing; on some adapter boards the hardware PWM pin is not the one
# wired to OE, and the fallback is steadier.
SHOW_REFRESH = os.environ.get("LEDWALL_SHOW_REFRESH", "0") == "1"
DISABLE_HARDWARE_PULSING = os.environ.get("LEDWALL_NO_HARDWARE_PULSE", "0") == "1"

EMPTY_STATE: dict = {"screens": {}, "brightness": {"small": 60, "large": 60}}


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

    if not isinstance(raw, dict) or not isinstance(raw.get("screens"), dict):
        return previous

    return raw


# ------------------------------------------------------------ matrix setup

def build_matrix(brightness):
    options = RGBMatrixOptions()

    # Panel geometry: two chains of two, one per bonnet output, presented as a
    # single 128x128 canvas. This must match the physical wiring — driving the
    # same four panels as chain_length=4, parallel=1 would lay them out as one
    # 256x64 row instead.
    options.rows = 64
    options.cols = 64
    options.chain_length = 2
    options.parallel = 2

    options.hardware_mapping = HARDWARE_MAPPING

    # Quality and stability.
    options.brightness = brightness
    options.pwm_bits = PWM_BITS
    options.pwm_lsb_nanoseconds = PWM_LSB_NANOSECONDS
    options.gpio_slowdown = GPIO_SLOWDOWN
    options.limit_refresh_rate_hz = LIMIT_REFRESH_HZ
    options.drop_privileges = False
    options.show_refresh_rate = SHOW_REFRESH
    options.disable_hardware_pulsing = DISABLE_HARDWARE_PULSING

    return RGBMatrix(options=options)


# -------------------------------------------------------------------- main

def main():
    state = read_state(EMPTY_STATE)

    brightness = _clamp(
        brightness_for_large(state) or DEFAULT_BRIGHTNESS, 5, MAX_BRIGHTNESS
    )
    matrix = build_matrix(brightness)
    canvas = matrix.CreateFrameCanvas()

    def shutdown(_signum, _frame):
        matrix.Clear()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Every screen pans off one clock, which is what keeps a multi-screen
    # Lauftext in step across the seams without any per-screen bookkeeping.
    started = time.monotonic()
    last_poll = 0.0
    last_signature = None

    while True:
        now = time.monotonic()

        if now - last_poll >= STATE_POLL_INTERVAL:
            last_poll = now
            state = read_state(state)
            fresh = brightness_for_large(state)
            if fresh is not None:
                wanted = _clamp(fresh, 5, MAX_BRIGHTNESS)
                if wanted != matrix.brightness:
                    matrix.brightness = wanted

        # Redraw only when the frame can actually differ. The matrix library
        # refreshes the panels from its own thread, and redrawing static
        # content at 60 fps starves that thread — which looks like flicker,
        # not like slowness.
        animating = has_scrolling(state)
        signature = (state.get("updated_at"), matrix.brightness)

        if animating or signature != last_signature:
            canvas.SetImage(render_frame(state, (now - started) * 1000))
            canvas = matrix.SwapOnVSync(canvas)
            last_signature = signature

        if animating:
            elapsed = time.monotonic() - now
            if elapsed < TARGET_FRAME_INTERVAL:
                time.sleep(TARGET_FRAME_INTERVAL - elapsed)
        else:
            time.sleep(STATE_POLL_INTERVAL)


if __name__ == "__main__":
    main()
