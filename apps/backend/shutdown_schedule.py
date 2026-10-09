"""The daily soft-shutdown time: read and written by app/power.py (the API,
for the frontend's schedule dialog) and read every minute by the standalone,
root-run ledwall_shutdown_check.py. Lives here, outside the `app` package and
free of third-party imports, so the root-run script never has to trust the
web app's dependencies (pydantic, FastAPI) — see CONTEXT.md "Power".
"""

import json
import re
from pathlib import Path

DEFAULT_SHUTDOWN_AT = "18:00"
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def is_valid_shutdown_time(value: str) -> bool:
    return bool(_TIME_RE.match(value))


def read_shutdown_at(path: Path) -> str:
    """Never raises: a missing or hand-edited file just falls back to the
    documented default."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            value = json.load(handle).get("at")
    except (OSError, ValueError, AttributeError):
        return DEFAULT_SHUTDOWN_AT
    return value if isinstance(value, str) and is_valid_shutdown_time(value) else DEFAULT_SHUTDOWN_AT
