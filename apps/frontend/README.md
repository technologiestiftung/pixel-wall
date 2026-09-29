# @pixel-wall/frontend

Vite + React web interface for the pixel wall. It is built as a static bundle and
hosted separately from the Pi; it talks to `@pixel-wall/backend` over the network.

## Development

```sh
npm run dev --workspace @pixel-wall/frontend
```

Copy `.env.example` to `.env` and point `VITE_API_URL` at the backend on port
5000 — the Pi on the LAN, or a local dev instance. The API contract is in
[../backend/README.md](../backend/README.md), and served live at `/docs`.

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
