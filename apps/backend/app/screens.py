"""Fixed screen inventory.

Mirrors the hardware facts in `apps/frontend/src/domain/layout.ts`
(`SCREEN_SPECS`). The wall's physical arrangement (`DEFAULT_LAYOUT` on the
frontend) is fixed at install time and lives there only — the backend never
reads screen positions, only the per-screen pixel `window` the frontend
computes from them (see CONTEXT.md "Layout").
"""

from typing import Literal, TypedDict

ScreenKind = Literal["small", "large"]


class ScreenSpec(TypedDict):
    id: str
    kind: ScreenKind
    pixelSize: int
    physicalSizeMm: int


SCREEN_SPECS: list[ScreenSpec] = [
    {"id": "01", "kind": "small", "pixelSize": 32, "physicalSizeMm": 128},
    {"id": "02", "kind": "small", "pixelSize": 32, "physicalSizeMm": 128},
    {"id": "03", "kind": "small", "pixelSize": 32, "physicalSizeMm": 128},
    {"id": "04", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192},
    {"id": "05", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192},
    {"id": "06", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192},
    {"id": "07", "kind": "large", "pixelSize": 64, "physicalSizeMm": 192},
]

SCREEN_IDS = [spec["id"] for spec in SCREEN_SPECS]
SPEC_BY_ID = {spec["id"]: spec for spec in SCREEN_SPECS}


def kind_of(screen_id: str) -> ScreenKind:
    return SPEC_BY_ID[screen_id]["kind"]
