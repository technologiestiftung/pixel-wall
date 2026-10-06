# Browsers sync live via a long poll on `/api/changes`

Every open editor now picks up a change to the wall as soon as it happens, instead of up to 20 seconds later. The frontend (`apps/frontend/src/state/useWallSync.ts`) keeps one request to `GET /api/changes?since=<revision>` open at a time; the backend (`apps/backend/app/main.py`) answers it the moment its in-memory state revision moves past `since` — bumped on every state write in `app/state.py` — or after 25 s with nothing changed, and the browser immediately re-syncs and opens the next one. This replaces CONTEXT.md's earlier "polling, brief staleness is acceptable" stance for **Client sync**. Window-focus and 20 s interval re-syncs stay as a fallback for when the long poll is down.

## Considered Options

- **Server-sent events (`EventSource`).** Rejected: `EventSource` cannot send an `Authorization` header, so it would bypass the optional HTTP Basic auth (`app/auth.py`) every other request uses — fixing that means a token in the query string or a cookie, i.e. a second auth path. A long poll goes through the same `Requester`/`apiFetch` as every other call and needs nothing new on that front.
- **WebSocket.** Rejected for the same auth reason, plus a reconnect protocol on both sides, for what is only ever a "something changed, re-fetch" signal.
- **Shorter polling interval (e.g. 2 s).** Rejected: still up to 2 s stale, and every open device keeps hitting `/api/state` (a file read and validation on the Pi) whether or not anything changed.

## Consequences

- The revision lives in memory, so it restarts at 0 when the backend restarts; clients see that as "changed" and simply re-sync once. It also assumes one backend process — running uvicorn with several workers would give each its own counter and miss writes made by the others.
- Each open editor holds one idle connection to the backend; held requests check the in-memory counter every 0.2 s and never touch the state file.
- Live sync only covers clients talking to the same backend: a browser pointed at a local dev backend does not see the Pi's state, and vice versa.
