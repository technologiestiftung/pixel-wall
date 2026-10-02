# @pixel-wall/frontend

Vite + React web interface for the pixel wall. It is built as a static bundle and
hosted separately from the Pi; it talks to the backend over the network.

The frontend is the only part of the system that renders: it rasterises text,
templates, uploads and weather icons into bitmaps and encodes them in the
[wire format](../../docs/wire-format.md) the backend and ESP32 decode.

## Development

From the repo root:

```sh
npm run dev
```

Copy `.env.example` to `.env` and point `VITE_API_URL` at a backend:

| Backend                      | `VITE_API_URL`                  |
| ---------------------------- | ------------------------------- |
| The Pi on the LAN            | `http://raspberrypi.local:5000` |
| Local, via `npm run dev:api` | `http://127.0.0.1:5001`         |
| None — in-memory mock API    | set `VITE_USE_MOCKS=1` instead  |

The mock API (`src/api/mocks/`) only runs in development. The API contract is
in [../backend/README.md](../backend/README.md), and served live at `/docs`.

## Source layout

| Directory         | Contents                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| `src/domain/`     | Pure logic: screens, layout, selection mapping, content, masks, scrolling |
| `src/render/`     | Rasterising content to pixels, animation sampling, wire encoding          |
| `src/state/`      | `WallProvider`, the reducer, selectors and data-syncing hooks             |
| `src/components/` | UI: `Header`, `Menu` (edit panel), `Preview` (wall stage)                 |
| `src/api/`        | Typed API calls and the MSW mock backend                                  |
| `src/auth/`       | Password gate and the edit-control lease                                  |
| `src/lib/`        | `apiFetch` and session helpers                                            |

Domain vocabulary (screen, selection, layers, …) is defined in
[CONTEXT.md](../../CONTEXT.md).

## Authentication

The API is behind a single shared password (no username). A cross-origin
`fetch()` never triggers the browser's own password prompt, so this app
collects the password itself:

| File                        | Role                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `src/lib/api.ts`            | `apiFetch`, `ApiError` (carries the status), base URL               |
| `src/auth/AuthContext.tsx`  | holds the password, probes on load, exposes `request` and `signOut` |
| `src/auth/PasswordGate.tsx` | the unlock form; renders its children once unlocked                 |

`App.tsx` wraps everything in `AuthProvider` + `PasswordGate`, so wall controls
you add inside it only ever render signed in. Use `request()` from `useAuth()`
for API calls — it attaches the header and signs out automatically on a `401`,
so an expired or changed password returns the user to the form.

On load the provider first tries an unauthenticated read: if the backend runs
without a password it skips the gate entirely rather than asking for one that
does not exist.

The password is kept in `sessionStorage`, so it survives a reload but not
closing the tab. Never put it in `.env` — Vite bakes those values into the
built bundle.

## Tests

```sh
npm run test:unit   # Vitest, tests/unit
npm run test:e2e    # Playwright, tests/e2e
npm run test:a11y   # Playwright + axe, tests/a11y
```
