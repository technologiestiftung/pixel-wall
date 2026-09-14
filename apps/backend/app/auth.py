import base64
import binascii
import hmac
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from . import config

logger = logging.getLogger(__name__)


def _challenge() -> JSONResponse:
    return JSONResponse(
        {"detail": "Password required. Leave the username box empty."},
        status_code=401,
        headers={"WWW-Authenticate": f'Basic realm="{config.AUTH_REALM}", charset="UTF-8"'},
    )


def password_valid(password: str) -> bool:
    if config.PASSWORD is None:
        return True
    return hmac.compare_digest(password, config.PASSWORD)


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """HTTP Basic on every route, so the browser prompts for a password.

    Only the password half is checked; whatever the browser sends as the
    username is ignored, so the prompt's username box can be left empty.

    Applied as middleware rather than a per-route dependency so that /docs,
    /openapi.json and / are covered too, not just the API itself.
    """

    async def dispatch(self, request, call_next):
        if not config.AUTH_ENABLED or request.method == "OPTIONS":
            return await call_next(request)

        header = request.headers.get("Authorization", "")
        scheme, _, encoded = header.partition(" ")

        if scheme.lower() != "basic" or not encoded:
            return _challenge()

        try:
            decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return _challenge()

        _, separator, password = decoded.partition(":")
        if not separator or not password_valid(password):
            logger.warning("rejected login from %s", request.client.host if request.client else "?")
            return _challenge()

        return await call_next(request)
