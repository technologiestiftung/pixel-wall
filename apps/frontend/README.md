# @pixel-wall/frontend

Vite + React web interface for the pixel wall. It is built as a static bundle and
hosted separately from the Pi; it talks to `@pixel-wall/backend` over the network.

## Development

```sh
npm run dev --workspace @pixel-wall/frontend
```

Copy `.env.example` to `.env` and point `VITE_API_URL` at the backend — a local
one during development, the Pi's address otherwise.
