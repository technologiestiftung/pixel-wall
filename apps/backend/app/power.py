import logging
import subprocess

logger = logging.getLogger(__name__)

#: Exactly the command the sudoers rule installed by setup-pi.sh grants
#: NOPASSWD for (see pi-config/sudoers-ledwall-shutdown) — a soft shutdown,
#: never a hard power cut. See CONTEXT.md "Power".
SHUTDOWN_COMMAND = ["sudo", "/sbin/shutdown", "-h", "now"]


def shutdown_now() -> None:
    """Gracefully halts the Raspberry Pi's OS.

    Fire-and-forget: the shutdown sequence stops services (this one included)
    in the background, so we don't wait on it — doing so could race the
    process being torn down before the HTTP response is sent.
    """
    logger.warning("soft shutdown requested")
    subprocess.Popen(SHUTDOWN_COMMAND)
