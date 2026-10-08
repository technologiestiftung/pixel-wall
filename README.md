![](https://img.shields.io/badge/Built%20with%20%E2%9D%A4%EF%B8%8F-at%20Technologiestiftung%20Berlin-blue)

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

# Pixel Wall

A wall of 7 physical LED panels controlled through a web interface:

- **4 large panels** (64×64, HUB75) driven by a Raspberry Pi
- **3 small panels** (32×32) chained off an ESP32

In the web interface you arrange the panels' real-world layout, select one or
more of them, and push text, animations/images, live weather, Game of Life or a
background colour to the wall.

## How it works

```
 web interface ──POST /api/apply──▶ backend (FastAPI on the Pi)
 (renders pixels)                      │                  │
                              state.json│                  │MQTT, retained
                                       ▼                  ▼
                              pi_display.py            ESP32
                              4× 64×64 panels          3× 32×32 panels
```

The frontend is the only thing that renders: it rasterises content into
bitmaps and sends **pixels**, not text. The backend stores them and fans them
out; neither the Pi display nor the ESP32 knows what a font or template is.
The display keeps running when the backend is stopped.

## Repository structure

An npm workspaces monorepo (only the frontend is an npm workspace; the backend
is Python and the ESP32 is an Arduino sketch).

| Path                               | What it is                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| [`apps/frontend`](./apps/frontend) | Vite + React web interface, built as a static bundle and hosted separately      |
| [`apps/backend`](./apps/backend)   | Python/FastAPI service on the Pi: state API, MQTT fan-out, HUB75 display driver |
| [`apps/esp32`](./apps/esp32)       | Arduino sketch for the ESP32 driving the 3 small panels over MQTT               |
| [`docs`](./docs)                   | Wire format, architecture decisions (ADRs), deferred plans, debugging notes     |

## Documentation

**Start here**

- [CONTEXT.md](./CONTEXT.md) — domain glossary: screens, layout, selection, content, layers
- [HARDWARE.md](./HARDWARE.md) — wiring, power and network architecture
- [RENDERING.md](./RENDERING.md) — how a content edit becomes pixels on the panels

**Per app**

- [apps/frontend/README.md](./apps/frontend/README.md) — frontend setup and authentication
- [apps/backend/README.md](./apps/backend/README.md) — Pi install, API contract, display driver, MQTT
- [apps/esp32/README.md](./apps/esp32/README.md) — libraries, flashing, message contract

**Reference**

- [docs/wire-format.md](./docs/wire-format.md) — the payload shared by the TypeScript encoder and the Python/C++ decoders
- [docs/adr/](./docs/adr) — architecture decision records
- [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md) — history and status of the frontend → backend → panels integration

## Prerequisites

- Node.js as pinned in [.nvmrc](./.nvmrc)
- Python 3.11+ for the backend (production runs on a Raspberry Pi 4)
- Arduino IDE, only if you flash the ESP32

## Getting started

The frontend and backend install independently:

```bash
npm install

cd apps/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

Then, from the repo root, in two terminals:

```bash
npm run dev:api    # backend on http://127.0.0.1:5001 — no MQTT, state in /tmp
npm run dev        # frontend on http://localhost:5173
```

Copy [`apps/frontend/.env.example`](./apps/frontend/.env.example) to
`apps/frontend/.env` and point `VITE_API_URL` at the backend.

> **Why port 5001?** On macOS the AirPlay Receiver holds port 5000 and answers
> requests without CORS headers, which looks exactly like a backend that is
> down. The Pi itself uses 5000.

To work on the frontend without any backend, set `VITE_USE_MOCKS=1` in
`apps/frontend/.env` to use the in-memory mock API.

### Password

The backend runs unauthenticated unless a password is set, and the frontend
then skips its password gate on purpose. To exercise the login screen locally,
create `apps/backend/app/.env`:

```
LEDWALL_PASSWORD=demo123
```

All backend settings are listed in
[`apps/backend/.env.example`](./apps/backend/.env.example). The API contract is
documented in [apps/backend/README.md](./apps/backend/README.md) and served
live at `/docs`.

## Scripts

All run from the repo root:

| Command                | What it does                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`          | Frontend dev server                                                                          |
| `npm run dev:api`      | Backend dev server (needs `apps/backend/.venv`)                                              |
| `npm run build`        | Type-check and build the frontend                                                            |
| `npm run lint`         | ESLint on the frontend                                                                       |
| `npm run prettier`     | Format everything                                                                            |
| `npm run test:unit`    | Frontend unit tests (Vitest)                                                                 |
| `npm run test:backend` | Backend tests (pytest); also compiles and tests the ESP32 decoder if a C++ compiler is found |
| `npm run test:e2e`     | Frontend end-to-end tests (Playwright)                                                       |
| `npm run test:a11y`    | Frontend accessibility tests (Playwright + axe)                                              |

CI runs build, Prettier, lint and unit tests for the frontend, and pytest for
the backend. Both suites check the wire-format codecs against the same
fixtures in [`docs/wire-format-fixtures.json`](./docs/wire-format-fixtures.json),
so keep them passing together.

## Deployment

- **Backend** — runs on the Raspberry Pi as two systemd services (API and
  display driver). `apps/backend/setup-pi.sh` installs or updates everything;
  see [apps/backend/README.md](./apps/backend/README.md#install).
- **Frontend** — `npm run build` produces a static bundle in
  `apps/frontend/dist`, hosted separately from the Pi.
- **ESP32** — flashed from the Arduino IDE; see
  [apps/esp32/README.md](./apps/esp32/README.md).

## Contributing

Before you create a pull request, write an issue so we can discuss your changes.

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/aeschi"><img src="https://avatars.githubusercontent.com/u/56318362?v=4?s=64" width="64px;" alt="aeschi"/><br /><sub><b>aeschi</b></sub></a><br /><a href="https://github.com/technologiestiftung/template-default/commits?author=aeschi" title="Code">💻</a> <a href="https://github.com/technologiestiftung/template-default/commits?author=aeschi" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/zainab-tariq"><img src="https://avatars.githubusercontent.com/u/15946816?v=4?s=64" width="64px;" alt="Zainab Tariq"/><br /><sub><b>Zainab Tariq</b></sub></a><br /><a href="https://github.com/technologiestiftung/template-default/commits?author=zainab-tariq" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## Content Licensing

Texts and content available as [CC BY](https://creativecommons.org/licenses/by/3.0/de/).

## Credits

<table>
  <tr>
    <td>
      Made by <a href="https://citylab-berlin.org/de/start/">
        <br />
        <br />
        <img width="140" src="https://logos.citylab-berlin.org/logo-citylab-color.svg" alt="Link to the CityLAB Berlin website" />
      </a>
    </td>
    <td>
      A project by <a href="https://www.technologiestiftung-berlin.de/">
        <br />
        <br />
        <img width="150" src="https://logos.citylab-berlin.org/logo-technologiestiftung-berlin-de.svg" alt="Link to the Technologiestiftung Berlin website" />
      </a>
    </td>
    <td>
      Supported by <a href="https://www.berlin.de/rbmskzl/">
        <br />
        <br />
        <img width="80" src="https://logos.citylab-berlin.org/logo-berlin-senatskanzelei-de.svg" alt="Link to the Senate Chancellery of Berlin"/>
      </a>
    </td>
  </tr>
</table>
