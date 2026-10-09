import logging
import subprocess

from shutdown_schedule import is_valid_shutdown_time, read_shutdown_at

from . import config
from .state import atomic_write_json

logger = logging.getLogger(__name__)

#: Exactly the command the sudoers rule installed by setup-pi.sh grants
#: NOPASSWD for (see pi-config/sudoers-ledwall-shutdown) — a soft shutdown,
#: never a hard power cut. See CONTEXT.md "Power".
SHUTDOWN_COMMAND = ["sudo", "/sbin/shutdown", "-h", "now"]


class InvalidShutdownTime(ValueError):
    pass


def shutdown_now() -> None:
    """Gracefully halts the Raspberry Pi's OS.

    Fire-and-forget: the shutdown sequence stops services (this one included)
    in the background, so we don't wait on it — doing so could race the
    process being torn down before the HTTP response is sent.
    """
    logger.warning("soft shutdown requested")
    subprocess.Popen(SHUTDOWN_COMMAND)


def get_shutdown_at() -> str:
    """The daily soft-shutdown time, HH:MM local time — read by the frontend's
    schedule dialog and, independently, by ledwall_shutdown_check.py (the
    root-run script that actually acts on it every minute)."""
    return read_shutdown_at(config.SHUTDOWN_AT_FILE)


def set_shutdown_at(value: str) -> None:
    """Needs no elevated privilege: SHUTDOWN_AT_FILE lives in the same
    group-writable directory as state.json (see app/config.py). Only the
    shutdown itself (shutdown_now) requires the sudoers rule."""
    if not is_valid_shutdown_time(value):
        raise InvalidShutdownTime(f"expected HH:MM, got {value!r}")
    atomic_write_json(config.SHUTDOWN_AT_FILE, {"at": value})
