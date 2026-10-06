import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock, RLock
from typing import Any

from pydantic import ValidationError

from . import config
from .models import WallState

_write_lock = Lock()
#: Held across a read-modify-write of the state file, which the API and the
#: weather refresh (app/weather.py) both do from their own threads.
edit_lock = RLock()

#: Bumped on every successful write, so /api/changes can tell browsers the
#: wall changed without re-reading the file. `updated_at` alone can't do it:
#: it only has one-second resolution. In memory only — a backend restart
#: starts again from 0, which clients see as "changed" and simply re-sync.
_revision = 0
_revision_lock = Lock()


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
    global _revision
    payload = state.model_dump()
    payload["updated_at"] = _now()
    atomic_write_json(config.STATE_FILE, payload)
    with _revision_lock:
        _revision += 1
    return payload


def revision() -> int:
    return _revision


def atomic_write_json(target: Path, payload: Any) -> None:
    """Write-then-rename, so a crash or power cut mid-write leaves the previous
    file intact rather than a truncated one."""
    serialised = json.dumps(payload, indent=2, sort_keys=True) + "\n"

    directory = target.parent
    directory.mkdir(parents=True, exist_ok=True)

    with _write_lock:
        fd, temp_path = tempfile.mkstemp(dir=directory, prefix=f".{target.stem}-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(serialised)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp_path, 0o664)
            os.replace(temp_path, target)
        except BaseException:
            os.unlink(temp_path)
            raise

        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)


def state_file_writable() -> bool:
    target = config.STATE_FILE
    if target.exists():
        return os.access(target, os.W_OK)
    return target.parent.is_dir() and os.access(target.parent, os.W_OK | os.X_OK)
