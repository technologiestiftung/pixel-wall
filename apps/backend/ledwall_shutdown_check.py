#!/usr/bin/env python3
"""Shuts the Pi down once a day at the configured time.

Run every minute, as root, by ledwall-shutdown-check.timer. Reads the same
file app/power.py's get_shutdown_at/set_shutdown_at (used by the frontend's
schedule dialog) maintains — see shutdown_schedule.py and CONTEXT.md "Power".

Checking for an exact HH:MM match, not "at or past", means a Pi powered on
after today's target time has already passed just stays on until the next
day's occurrence, instead of shutting back down within the next minute.
"""

import datetime
import os
import subprocess
import sys
from pathlib import Path

from shutdown_schedule import read_shutdown_at

SHUTDOWN_AT_FILE = Path(
    os.environ.get("LEDWALL_SHUTDOWN_AT_FILE", "/var/lib/ledwall/shutdown_at")
)


def main() -> None:
    now = datetime.datetime.now().strftime("%H:%M")
    if now == read_shutdown_at(SHUTDOWN_AT_FILE):
        subprocess.run(["/sbin/shutdown", "-h", "now"], check=True)


if __name__ == "__main__":
    sys.exit(main())
