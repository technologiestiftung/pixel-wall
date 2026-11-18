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
| `src/auth/`       | Connection gate and the edit-control lease                               |
| `src/lib/`        | `apiFetch` and session helpers                                            |

Domain vocabulary (screen, selection, layers, …) is defined in
[CONTEXT.md](../../CONTEXT.md).

## Connectivity

The backend runs unauthenticated; there is no login step. Instead, the app
only needs to know whether the Pi can be reached at all:

| File                              | Role                                                           |
| ---------------------------------- | --------------------------------------------------------------- |
| `src/lib/api.ts`                   | `apiFetch`, `ApiError` (carries the status), base URL          |
| `src/auth/ConnectionContext.tsx`   | probes `/api/health` on load and retries, exposes `request`    |
| `src/auth/ConnectionGate.tsx`      | renders its children once connected, otherwise a status screen |

`App.tsx` wraps everything in `ConnectionProvider` + `ConnectionGate`, so wall
controls you add inside it only ever render once the Pi answers. Use
`request()` from `useConnection()` for API calls.

If the initial probe fails — the Pi is off, or this device is on a different
network — `ConnectionGate` shows a "not connected" screen instead of the app,
and `ConnectionContext` keeps retrying in the background until it succeeds.

## Tests

```sh
npm run test:unit   # Vitest, tests/unit
npm run test:e2e    # Playwright, tests/e2e
npm run test:a11y   # Playwright + axe, tests/a11y
```

## Credits

The colour emoji glyphs in the "Schriftart" picker are
[FrankMoji](https://frankmoji.com) by Frank Rausch, licensed
CC BY-NC-ND 4.0 — see `public/fonts/FrankMoji-LICENSE.txt`.
