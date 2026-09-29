"""Snake across the whole wall — the game itself, with no I/O.

The playing field is one grid laid over the bounding box of the user's
Layout, in mm, so a cell is the same physical size on a 3 mm and a 4 mm pitch
panel and the snake keeps its speed as it crosses from one to the other. Cells
in the gaps between screens are part of the field but unlit: the snake can
tunnel through them, and the phone shows the whole grid so the player never
loses it. The field wraps at its edges; only biting yourself ends a game.

`app/snake_mode.py` runs this on a clock and ships the frames out.
"""

import logging
import math
import random
from collections import deque
from dataclasses import dataclass
from typing import Iterable, Optional

import segno

from .mask import Palette4
from .screens import SPEC_BY_ID

logger = logging.getLogger(__name__)

PITCH_MM = {"small": 4.0, "large": 3.0}

DIRECTIONS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
OPPOSITE = {"up": "down", "down": "up", "left": "right", "right": "left"}

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
HEAD = (250, 231, 55)
BODY = (149, 227, 169)
FOOD = (254, 68, 65)
DEAD = (254, 68, 65)

#: Index 0 must stay black: both panel compositors treat it as "nothing here".
PALETTE = [BLACK, HEAD, BODY, FOOD, DEAD]
EMPTY, HEAD_INDEX, BODY_INDEX, FOOD_INDEX, DEAD_INDEX = range(len(PALETTE))


@dataclass(frozen=True)
class ScreenCells:
    screen_id: str
    size_px: int
    #: The grid cell each pixel samples, row-major. Precomputed once per
    #: board so rendering a frame is a lookup per pixel, not geometry.
    pixel_cells: tuple[int, ...]
    #: The screen's rectangle in cell units, for the phone's map.
    x: float
    y: float
    width: float
    height: float


class Board:
    def __init__(self, layout: Iterable[dict], cell_mm: float) -> None:
        positions = [
            (p["screenId"], p["xMm"], p["yMm"], SPEC_BY_ID[p["screenId"]]) for p in layout
        ]
        min_x = min(x for _, x, _, _ in positions)
        min_y = min(y for _, _, y, _ in positions)
        max_x = max(x + spec["physicalSizeMm"] for _, x, _, spec in positions)
        max_y = max(y + spec["physicalSizeMm"] for _, _, y, spec in positions)

        self.cell_mm = cell_mm
        self.columns = max(1, math.ceil((max_x - min_x) / cell_mm))
        self.rows = max(1, math.ceil((max_y - min_y) / cell_mm))

        self.screens: dict[str, ScreenCells] = {}
        for screen_id, x_mm, y_mm, spec in sorted(positions):
            size = spec["pixelSize"]
            pitch = PITCH_MM[spec["kind"]]
            columns = [
                min(self.columns - 1, int((x_mm - min_x + (px + 0.5) * pitch) // cell_mm))
                for px in range(size)
            ]
            rows = [
                min(self.rows - 1, int((y_mm - min_y + (py + 0.5) * pitch) // cell_mm))
                for py in range(size)
            ]
            self.screens[screen_id] = ScreenCells(
                screen_id=screen_id,
                size_px=size,
                pixel_cells=tuple(r * self.columns + c for r in rows for c in columns),
                x=(x_mm - min_x) / cell_mm,
                y=(y_mm - min_y) / cell_mm,
                width=spec["physicalSizeMm"] / cell_mm,
                height=spec["physicalSizeMm"] / cell_mm,
            )

        self.visible_cells = sorted(
            {cell for screen in self.screens.values() for cell in screen.pixel_cells}
        )

    def cell(self, column: int, row: int) -> int:
        return (row % self.rows) * self.columns + (column % self.columns)

    def position(self, cell: int) -> tuple[int, int]:
        return cell % self.columns, cell // self.columns

    def neighbour(self, cell: int, direction: str) -> int:
        column, row = self.position(cell)
        dx, dy = DIRECTIONS[direction]
        return self.cell(column + dx, row + dy)

    def centre_of(self, screen_id: str) -> int:
        screen = self.screens[screen_id]
        return self.cell(
            int(screen.x + screen.width / 2), int(screen.y + screen.height / 2)
        )


class Snake:
    def __init__(
        self,
        board: Board,
        start: int,
        direction: str = "right",
        length: int = 3,
        rng: Optional[random.Random] = None,
    ) -> None:
        self.board = board
        self.rng = rng or random.Random()
        self.direction = direction
        self._turns: deque[str] = deque(maxlen=2)
        backwards = OPPOSITE[direction]
        body = [start]
        for _ in range(length - 1):
            body.append(board.neighbour(body[-1], backwards))
        self.body: deque[int] = deque(body)
        self.alive = True
        self.score = 0
        self.food: Optional[int] = None
        self.place_food()

    @property
    def head(self) -> int:
        return self.body[0]

    def turn(self, direction: str) -> None:
        """Queues rather than overwrites, so two quick taps between ticks
        (up, then left) both land instead of the first being lost."""
        if direction not in DIRECTIONS:
            return
        last = self._turns[-1] if self._turns else self.direction
        if direction in (last, OPPOSITE[last]):
            return
        self._turns.append(direction)

    def place_food(self) -> None:
        occupied = set(self.body)
        free = [cell for cell in self.board.visible_cells if cell not in occupied]
        self.food = self.rng.choice(free) if free else None

    def step(self) -> bool:
        """Advances one cell. Returns whether food was eaten."""
        if not self.alive:
            return False
        if self._turns:
            self.direction = self._turns.popleft()

        ahead = self.board.neighbour(self.head, self.direction)
        eats = ahead == self.food
        # The tail moves out of the way this tick unless the snake is growing,
        # so following your own tail closely is allowed.
        blocking = list(self.body) if eats else list(self.body)[:-1]
        if ahead in blocking:
            self.alive = False
            return False

        self.body.appendleft(ahead)
        if eats:
            self.score += 1
            self.place_food()
            if self.food is None:
                self.alive = False
        else:
            self.body.pop()
        return eats

    def wander(self) -> None:
        """Attract-mode steering for the demo snake shown while nobody plays:
        mostly straight, sometimes a turn, never into itself."""
        sideways = [d for d in DIRECTIONS if d not in (self.direction, OPPOSITE[self.direction])]
        self.rng.shuffle(sideways)
        options = [self.direction, *sideways]
        if self.rng.random() < 0.12:
            options = [*sideways, self.direction]
        body = list(self.body)[:-1]
        for direction in options:
            if self.board.neighbour(self.head, direction) not in body:
                self.direction = direction
                return


def interval_for(score: int) -> float:
    """Seconds per tick: starts at 5 cells/s and speeds up as the snake eats."""
    return max(0.08, 0.2 - score * 0.006)


def render(
    board: Board,
    snake: Snake,
    dead: bool = False,
    skip: Iterable[str] = (),
    show_food: bool = True,
) -> dict[str, Palette4]:
    lookup: dict[int, int] = {}
    if show_food and snake.food is not None:
        lookup[snake.food] = FOOD_INDEX
    body_index = DEAD_INDEX if dead else BODY_INDEX
    for cell in snake.body:
        lookup[cell] = body_index
    lookup[snake.head] = DEAD_INDEX if dead else HEAD_INDEX

    skipped = set(skip)
    frames = {}
    for screen_id, screen in board.screens.items():
        if screen_id in skipped:
            continue
        indices = bytearray(lookup.get(cell, EMPTY) for cell in screen.pixel_cells)
        frames[screen_id] = Palette4(screen.size_px, screen.size_px, list(PALETTE), indices)
    return frames


def qr_tile(url: str, size_px: int) -> Palette4:
    """The join link as a QR code filling one screen.

    Dark modules are unlit pixels on a lit field, not the other way round:
    inverted codes are not read by every phone camera. Everything around the
    code is lit too, which is what serves as its quiet zone.
    """
    code = segno.make(url, error="l", micro=False, boost_error=False)
    matrix = list(code.matrix_iter(border=0))
    modules = len(matrix)
    scale = max(1, size_px // (modules + 2))
    if scale == 1:
        logger.warning(
            "join URL %r needs a %d-module QR code, drawn at 1 px per module — "
            "set a shorter LEDWALL_PUBLIC_URL if phones cannot scan it",
            url,
            modules,
        )
    offset = (size_px - modules * scale) // 2

    indices = bytearray([1]) * (size_px * size_px)
    for row, line in enumerate(matrix):
        for column, dark in enumerate(line):
            if not dark:
                continue
            for dy in range(scale):
                y = offset + row * scale + dy
                if not 0 <= y < size_px:
                    continue
                for dx in range(scale):
                    x = offset + column * scale + dx
                    if 0 <= x < size_px:
                        indices[y * size_px + x] = 0
    return Palette4(size_px, size_px, [BLACK, WHITE], indices)

