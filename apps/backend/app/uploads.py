"""The shared library of user-uploaded images/animations.

Stored as plain files in the repo checkout (`apps/backend/uploads/` by
default): each upload is `<id>.png`, its sprite sheet as a real image, plus
`<id>.json` with the rest of its metadata — so the library can be committed
alongside the code. Nothing on a panel reads it, and a screen showing an
upload carries its own copy in `source`, so deleting an entry never changes
what the wall shows.
"""

import base64
import binascii
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from pydantic import ValidationError

from . import config
from .models import UploadModel, UploadRequest
from .state import atomic_write_json

_lock = Lock()
_DATA_URL_PREFIX = "data:image/png;base64,"
_ID = re.compile(r"^[0-9a-f]{32}$")


def _dir() -> Path:
    return config.UPLOADS_DIR


def list_uploads() -> list[dict[str, Any]]:
    """Newest first. Never raises, like state.read_state: an entry whose files
    are missing or unreadable is skipped rather than failing the whole list."""
    uploads = []
    for meta_path in _dir().glob("*.json"):
        entry = _read(meta_path.stem)
        if entry is not None:
            uploads.append(entry)
    return sorted(uploads, key=lambda u: u["createdAt"], reverse=True)


def add_upload(request: UploadRequest) -> dict[str, Any]:
    with _lock:
        if len(list(_dir().glob("*.json"))) >= config.MAX_UPLOADS:
            raise LibraryFullError(config.MAX_UPLOADS)

        upload_id = uuid.uuid4().hex
        entry = UploadModel(
            **request.model_dump(),
            id=upload_id,
            createdAt=datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"),
        ).model_dump()
        png = base64.b64decode(entry["sheetDataUrl"][len(_DATA_URL_PREFIX):], validate=True)

        directory = _dir()
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"{upload_id}.png").write_bytes(png)
        # Written last: an entry only counts once its metadata exists, so a
        # crash between the two leaves a stray PNG rather than a broken entry.
        atomic_write_json(
            directory / f"{upload_id}.json",
            {k: v for k, v in entry.items() if k != "sheetDataUrl"},
        )
        return entry


def delete_upload(upload_id: str) -> bool:
    if not _ID.match(upload_id):
        return False
    with _lock:
        meta_path = _dir() / f"{upload_id}.json"
        if not meta_path.exists():
            return False
        meta_path.unlink()
        (_dir() / f"{upload_id}.png").unlink(missing_ok=True)
        return True


def _read(upload_id: str) -> dict[str, Any] | None:
    if not _ID.match(upload_id):
        return None
    try:
        meta = json.loads((_dir() / f"{upload_id}.json").read_text(encoding="utf-8"))
        png = (_dir() / f"{upload_id}.png").read_bytes()
        sheet = _DATA_URL_PREFIX + base64.b64encode(png).decode()
        return UploadModel.model_validate({**meta, "sheetDataUrl": sheet, "id": upload_id}).model_dump()
    except (OSError, json.JSONDecodeError, binascii.Error, ValidationError, TypeError):
        return None


class LibraryFullError(Exception):
    def __init__(self, limit: int):
        super().__init__(f"the upload library is full ({limit} entries); delete one first")
