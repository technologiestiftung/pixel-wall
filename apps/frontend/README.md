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
