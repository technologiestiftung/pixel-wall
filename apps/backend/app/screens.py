"""Fixed screen inventory and the default wall arrangement.

Mirrors `apps/frontend/src/domain/layout.ts`. The ids and physical sizes are
hardware facts; the default layout is only the starting arrangement, which the
user then drags and which is persisted in the state file (CONTEXT.md
"Layout persistence").
"""

from typing import Literal, TypedDict

ScreenKind = Literal["small", "large"]


class ScreenSpec(TypedDict):
    id: str
    kind: ScreenKind
    pixelSize: int
    physicalSizeMm: int


class LayoutPosition(TypedDict):
    screenId: str
    xMm: float
    yMm: float


SCREEN_SPECS: list[ScreenSpec] = [
    {"id": "01", "kind": "small", "pixelSize": 32, "physicalSizeMm": 128},
    {"id": "02", "kind": "small", "pixelSize": 32, "physicalSizeMm": 128},
    {"id": "03", "kind": "small", "pixelSize": 32, "physicalSizeMm": 128},
    {"id": "04", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192},
    {"id": "05", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192},
    {"id": "06", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192},
    {"id": "07", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192},
]

DEFAULT_LAYOUT: list[LayoutPosition] = [
    {"screenId": "01", "xMm": 508, "yMm": 3},
    {"screenId": "02", "xMm": 7, "yMm": 91},
    {"screenId": "03", "xMm": 482, "yMm": 399},
    {"screenId": "04", "xMm": 255, "yMm": 91},
    {"screenId": "05", "xMm": 453, "yMm": 140},
    {"screenId": "06", "xMm": 57, "yMm": 246},
    {"screenId": "07", "xMm": 255, "yMm": 290},
]

SCREEN_IDS = [spec["id"] for spec in SCREEN_SPECS]
SPEC_BY_ID = {spec["id"]: spec for spec in SCREEN_SPECS}


def kind_of(screen_id: str) -> ScreenKind:
    return SPEC_BY_ID[screen_id]["kind"]
