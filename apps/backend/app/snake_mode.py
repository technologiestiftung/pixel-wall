"""Snake mode: runs app/snake.py on a clock and puts it on the wall.

While it is on, the wall shows the game instead of its applied content, but
that content is never touched, so turning the mode off brings it straight back:

- Large screens: frames go to a live file next to the state file, which
  pi_display.py prefers while it is fresh. It is rewritten every tick, so if
  the backend dies mid-game the file goes stale within seconds and the Pi
  falls back to the applied content on its own.
- Small screens: non-retained MQTT messages on the usual per-screen topics.
  The broker keeps the retained content, and `stop()` republishes it.

Players connect over a websocket from the page at /snake. One player at a
time; everyone else connected watches the same map on their phone.
"""

import asyncio
import base64
import json
import logging
import os
import socket
import tempfile
import time
from contextlib import suppress
from typing import Any, Optional

from fastapi import WebSocket

from . import compose, config, screens as screen_inventory, state as state_store
from .mask import Mask, Palette4, encode_pal4
from .models import BrightnessByKind, WallState
from .mqtt import publisher
from .snake import DIRECTIONS, Board, Snake, interval_for, qr_tile, render
from .wire import ScreenFrame, Window, encode_frame

logger = logging.getLogger(__name__)

LOBBY_INTERVAL = 0.2
GAME_OVER_INTERVAL = 0.25
GAME_OVER_SECONDS = 2.5
#: How long a game survives its player's phone dropping off (screen lock, a
#: WiFi blip) before it is abandoned. Reconnecting with the same token resumes.
PLAYER_GRACE_SECONDS = 5.0
#: Unchanged small-screen frames are still resent this often, which repaints
#: an ESP32 that rebooted or was sent an apply in the middle of a game.
REPUBLISH_SECONDS = 2.0
WALL_REFRESH_SECONDS = 2.0

SMALL_SCREEN_IDS = [s["id"] for s in screen_inventory.SCREEN_SPECS if s["kind"] == "small"]
LARGE_SCREEN_IDS = [s["id"] for s in screen_inventory.SCREEN_SPECS if s["kind"] == "large"]


def lan_ip() -> str:
    """The address this machine uses to reach the LAN. Connecting a UDP socket
    sends nothing; it only makes the OS pick the outgoing interface."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("10.255.255.255", 1))
            return probe.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def join_url(port: Optional[int] = None) -> str:
    if config.PUBLIC_URL:
        return config.PUBLIC_URL
    return f"http://{lan_ip()}:{port or config.PORT}/snake"


def qr_screen_id() -> str:
    if config.SNAKE_QR_SCREEN in LARGE_SCREEN_IDS:
        return config.SNAKE_QR_SCREEN
    return LARGE_SCREEN_IDS[0]


class SnakeMode:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._clients: dict[WebSocket, Optional[str]] = {}
        self.join_url: Optional[str] = None
        self.best = 0
        self.phase = "lobby"
        self._player: Optional[str] = None
        self._player_missing_since: Optional[float] = None
        self._over_until = 0.0
        self._board: Optional[Board] = None
        self._snake: Optional[Snake] = None
        self._demo: Optional[Snake] = None
        self._qr: Optional[Palette4] = None
        self._brightness = BrightnessByKind()
        self._wall_read_at = 0.0
        self._frame = 0
        self._sent: dict[str, tuple[bytes, float]] = {}

    @property
    def enabled(self) -> bool:
        return self._task is not None

    @property
    def score(self) -> int:
        return self._snake.score if self._snake and self.phase != "lobby" else 0

    async def start(self, url: str) -> None:
        if self.join_url != url:
            self.join_url = url
            self._qr = None
        if self._task is not None:
            return
        self._enter_lobby()
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

        self._player = None
        self._sent.clear()
        with suppress(OSError):
            config.live_file().unlink(missing_ok=True)
        self._restore_small_screens()
        await self._broadcast()

    # ------------------------------------------------------------ players

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients[websocket] = None
        await self._send(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.pop(websocket, None)

    async def receive(self, websocket: WebSocket, message: Any) -> None:
        if not isinstance(message, dict):
            return
        kind = message.get("type")
        token = message.get("token")

        if kind == "hello" and isinstance(token, str) and token:
            self._clients[websocket] = token[:64]
        elif kind == "start" and self.enabled:
            if self.phase == "playing" and self._player_present():
                return
            self._clients[websocket] = self._clients.get(websocket) or os.urandom(8).hex()
            self._begin_game(self._clients[websocket])
        elif kind == "turn" and self.phase == "playing" and self._is_player(websocket):
            direction = message.get("direction")
            if direction in DIRECTIONS and self._snake is not None:
                self._snake.turn(direction)
        else:
            return
        await self._send(websocket)

    def _is_player(self, websocket: WebSocket) -> bool:
        return self._player is not None and self._clients.get(websocket) == self._player

    def _player_present(self) -> bool:
        return self._player is not None and self._player in self._clients.values()

    # ------------------------------------------------------------- game

    def _refresh_wall(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._wall_read_at < WALL_REFRESH_SECONDS:
            return
        self._wall_read_at = now
        state = WallState.model_validate(state_store.read_state())
        self._brightness = state.brightness
        if force or self._board is None:
            self._board = Board(
                [p.model_dump() for p in state.layout], config.SNAKE_CELL_MM
            )

    def _enter_lobby(self) -> None:
        self.phase = "lobby"
        self._player = None
        self._refresh_wall(force=True)
        assert self._board is not None
        self._demo = Snake(self._board, self._board.centre_of(qr_screen_id()), length=6)
        self._demo.food = None

    def _begin_game(self, token: str) -> None:
        self._refresh_wall(force=True)
        assert self._board is not None
        self.phase = "playing"
        self._player = token
        self._player_missing_since = None
        self._snake = Snake(self._board, self._board.centre_of(qr_screen_id()))

    def _end_game(self) -> None:
        self.phase = "over"
        self._over_until = time.monotonic() + GAME_OVER_SECONDS
        if self._snake is not None:
            self.best = max(self.best, self._snake.score)

    def _tick(self) -> None:
        self._refresh_wall()
        now = time.monotonic()

        if self.phase == "lobby" and self._demo is not None:
            self._demo.wander()
            self._demo.step()
            if not self._demo.alive:
                self._enter_lobby()
        elif self.phase == "playing" and self._snake is not None:
            if self._player_present():
                self._player_missing_since = None
            elif self._player_missing_since is None:
                self._player_missing_since = now
            elif now - self._player_missing_since > PLAYER_GRACE_SECONDS:
                self._snake.alive = False

            self._snake.step()
            if not self._snake.alive:
                self._end_game()
        elif self.phase == "over" and now >= self._over_until:
            self._enter_lobby()

    def _interval(self) -> float:
        if self.phase == "playing" and self._snake is not None:
            return interval_for(self._snake.score)
        if self.phase == "over":
            return GAME_OVER_INTERVAL
        return LOBBY_INTERVAL

    def _frames(self) -> dict[str, Palette4]:
        assert self._board is not None
        if self.phase == "lobby" and self._demo is not None:
            qr_id = qr_screen_id()
            frames = render(self._board, self._demo, skip=[qr_id], show_food=False)
            if self._qr is None:
                self._qr = qr_tile(self.join_url or "", self._board.screens[qr_id].size_px)
            frames[qr_id] = self._qr
            return frames
        assert self._snake is not None
        blink = self.phase == "over" and self._frame % 2 == 0
        return render(self._board, self._snake, dead=blink)

    async def _run(self) -> None:
        while True:
            started = time.monotonic()
            try:
                self._tick()
                self._output(self._frames())
            except Exception:
                logger.exception("snake mode tick failed")
                await asyncio.sleep(1)
                continue
            await self._broadcast()
            await asyncio.sleep(max(0.0, self._interval() - (time.monotonic() - started)))

    # ------------------------------------------------------------ output

    def _output(self, frames: dict[str, Palette4]) -> None:
        self._frame += 1
        self._write_live({k: v for k, v in frames.items() if k in LARGE_SCREEN_IDS})

        now = time.monotonic()
        for screen_id in SMALL_SCREEN_IDS:
            image = frames.get(screen_id)
            if image is None:
                continue
            payload = encode_frame(
                ScreenFrame(
                    color=(255, 255, 255),
                    window=Window(0, 0, image.width_px, image.height_px),
                    mask=image,
                    brightness=self._brightness.small,
                )
            )
            last = self._sent.get(screen_id)
            if last and last[0] == payload and now - last[1] < REPUBLISH_SECONDS:
                continue
            if publisher.publish_screen(screen_id, payload, retain=False):
                self._sent[screen_id] = (payload, now)

    def _write_live(self, frames: dict[str, Palette4]) -> None:
        """Same shape as the state file's `screens`, so pi_display.py renders
        it with the code it already has."""
        live = {
            "frame": self._frame,
            "brightness": self._brightness.model_dump(),
            "screens": {
                screen_id: {
                    "window": {
                        "offsetXPx": 0,
                        "offsetYPx": 0,
                        "widthPx": image.width_px,
                        "heightPx": image.height_px,
                    },
                    "content": {
                        "format": "pal4",
                        "widthPx": image.width_px,
                        "heightPx": image.height_px,
                        "data": base64.b64encode(encode_pal4(image)).decode(),
                    },
                }
                for screen_id, image in frames.items()
            },
        }
        target = config.live_file()
        target.parent.mkdir(parents=True, exist_ok=True)
        # No fsync, unlike the state file: a frame lost to a power cut is
        # meant to be thrown away anyway.
        fd, temp_path = tempfile.mkstemp(dir=target.parent, prefix=".live-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(live, handle)
            os.replace(temp_path, target)
        except BaseException:
            with suppress(OSError):
                os.unlink(temp_path)
            raise

    def _restore_small_screens(self) -> None:
        state = WallState.model_validate(state_store.read_state())
        for screen_id in SMALL_SCREEN_IDS:
            entry = state.screens.get(screen_id)
            if entry is not None:
                frame = compose.frame_for_screen(
                    entry.content, entry.window, state.brightness.small
                )
                publisher.publish_screen(screen_id, encode_frame(frame))
                continue
            size = screen_inventory.SPEC_BY_ID[screen_id]["pixelSize"]
            blank = ScreenFrame(
                color=(255, 255, 255),
                window=Window(0, 0, size, size),
                mask=Mask.blank(size, size),
                brightness=state.brightness.small,
            )
            publisher.publish_screen(screen_id, encode_frame(blank), retain=False)

    # ------------------------------------------------------------ clients

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "joinUrl": self.join_url if self.enabled else None,
            "phase": self.phase if self.enabled else "off",
            "playing": self.enabled and self.phase == "playing",
            "score": self.score,
            "best": self.best,
        }

    def _snapshot(self, websocket: WebSocket) -> dict[str, Any]:
        snapshot: dict[str, Any] = {"type": "state", **self.status()}
        snapshot["you"] = self._is_player(websocket)
        snapshot["token"] = self._clients.get(websocket)
        board = self._board
        snake = self._demo if self.phase == "lobby" else self._snake
        if not self.enabled or board is None or snake is None:
            return snapshot
        snapshot["board"] = {
            "columns": board.columns,
            "rows": board.rows,
            "screens": [
                {"id": s.screen_id, "x": s.x, "y": s.y, "width": s.width, "height": s.height}
                for s in board.screens.values()
            ],
        }
        snapshot["snake"] = [board.position(cell) for cell in snake.body]
        snapshot["food"] = board.position(snake.food) if snake.food is not None else None
        return snapshot

    async def _send(self, websocket: WebSocket) -> bool:
        try:
            await websocket.send_json(self._snapshot(websocket))
            return True
        except Exception:
            self.disconnect(websocket)
            return False

    async def _broadcast(self) -> None:
        for websocket in list(self._clients):
            await self._send(websocket)


snake_mode = SnakeMode()
