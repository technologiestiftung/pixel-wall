import json
import os
import tempfile
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from . import config
from pydantic import ValidationError

from .models import WallState

_write_lock = Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def read_state() -> dict[str, Any]:
    """Never raises: a hand-edited or partially-migrated file must not take the
    API down, so anything unusable falls back to a valid empty wall."""
    try:
        with config.STATE_FILE.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except (OSError, json.JSONDecodeError):
        raw = {}

    if not isinstance(raw, dict):
        raw = {}

    try:
        state = WallState.model_validate(raw).model_dump()
    except ValidationError:
        state = WallState().model_dump()

    state["updated_at"] = raw.get("updated_at") or _now()
    return state


def write_state(state: WallState) -> dict[str, Any]:
    payload = state.model_dump()
    payload["updated_at"] = _now()
    serialised = json.dumps(payload, indent=2, sort_keys=True) + "\n"

    directory = config.STATE_FILE.parent
    directory.mkdir(parents=True, exist_ok=True)

    with _write_lock:
        fd, temp_path = tempfile.mkstemp(dir=directory, prefix=".state-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(serialised)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp_path, 0o664)
            os.replace(temp_path, config.STATE_FILE)
        except BaseException:
            os.unlink(temp_path)
            raise

        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)

    return payload


def state_file_writable() -> bool:
    target = config.STATE_FILE
    if target.exists():
        return os.access(target, os.W_OK)
    return target.parent.is_dir() and os.access(target.parent, os.W_OK | os.X_OK)
