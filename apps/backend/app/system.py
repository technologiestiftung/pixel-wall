"""Powering the wall off from the web interface.

The backend runs unprivileged with NoNewPrivileges, so it cannot sudo. It asks
logind instead, which allows it because of the polkit rule that setup-pi.sh
installs (pi-config/ledwall-shutdown.rules).

Nothing saved is touched. ledwall-display clears the large panels when systemd
stops it, and the ESP32 blanks the small ones on a non-retained "off". On the
next boot both read the saved state again: the Pi from the state file, the
ESP32 from the retained screen topics.
"""

import subprocess

POWEROFF_COMMAND = ["systemctl", "poweroff"]


def power_off() -> None:
    """Returns once systemd has queued the poweroff, so the HTTP response still
    gets out. Raises if logind refused it."""
    subprocess.run(POWEROFF_COMMAND, check=True, capture_output=True, text=True, timeout=10)
