# Screen layout is fixed at install time, not editable

The 7 screens' physical positions are now permanent, matching how the wall is actually mounted — so the drag-to-rearrange UI ("Layout bearbeiten"), its `PUT`/`GET /api/layout` backend persistence, and the reducer's generation-tracking for in-flight layout edits have all been removed. The layout lives only as a frontend constant (`DEFAULT_LAYOUT` in `apps/frontend/src/domain/layout.ts`), seeded from the positions last saved on the physical wall before this change.

## Considered Options

- Keep a read-only `GET /api/layout` on the backend so another client could still learn the wall's arrangement. Rejected: nothing reads per-screen positions on the backend today (`compose.py`/`compositor.py` only ever consult the pixel `window` the frontend already computed and sent per apply), and there are no other consumers of this API — keeping it would mean maintaining a second copy of the same 7 numbers for no reader.

## Consequences

- Re-enabling layout editing later (e.g. if a screen is physically remounted) means re-adding the drag UI, the backend endpoints/state field, and the reducer's race-tracking from scratch — this is a one-way door, not a flag to flip.
- `apps/backend/app/models.py`'s `WallState` no longer has a `layout` field; a state file written by an older backend version still carries one, but it's silently ignored (`extra="ignore"`).
