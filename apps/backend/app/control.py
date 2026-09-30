import threading
import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from . import config

SESSION_HEADER = "X-Wall-Session"
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CONTROL_PATH = "/api/control"


class ControlLease:
    """Which browser session may change the wall. Everyone can read; only the
    holder can write. A holder that stops sending heartbeats (closed tab,
    sleeping laptop) loses the lease after `CONTROL_TTL_S`, so nobody is locked
    out for good. In memory only: a backend restart frees the wall."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._holder: Optional[str] = None
        self._last_seen = 0.0

    def _held_by_other(self, session_id: Optional[str], now: float) -> bool:
        return (
            self._holder is not None
            and self._holder != session_id
            and now - self._last_seen < config.CONTROL_TTL_S
        )

    def claim(self, session_id: str, takeover: bool = False) -> bool:
        now = time.monotonic()
        with self._lock:
            if self._held_by_other(session_id, now) and not takeover:
                return False
            self._holder = session_id
            self._last_seen = now
            return True

    def may_write(self, session_id: Optional[str]) -> bool:
        """A write from the holder also counts as a heartbeat. When nobody
        holds the lease, writes pass, so scripts and curl keep working while
        no one has the editor open."""
        now = time.monotonic()
        with self._lock:
            if self._held_by_other(session_id, now):
                return False
            if session_id is not None and self._holder == session_id:
                self._last_seen = now
            return True

    def reset(self) -> None:
        with self._lock:
            self._holder = None
            self._last_seen = 0.0


lease = ControlLease()


class ControlLeaseMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if (
            request.method in WRITE_METHODS
            and request.url.path.startswith("/api/")
            and request.url.path != CONTROL_PATH
            and not lease.may_write(request.headers.get(SESSION_HEADER))
        ):
            return JSONResponse(
                {"detail": "Die Wand wird gerade von einem anderen Gerät gesteuert."},
                status_code=423,
            )
        return await call_next(request)
