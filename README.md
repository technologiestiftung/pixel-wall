![](https://img.shields.io/badge/Built%20with%20%E2%9D%A4%EF%B8%8F-at%20Technologiestiftung%20Berlin-blue)

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-0-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

# Pixel Wall

A wall of 7 physical LED panels — 4 large 64×64 HUB75 panels driven by a
Raspberry Pi and 3 small 32×32 panels chained off an ESP32 — controlled
through a web interface. The app lets you arrange the panels' real-world
layout, select one or more of them, and push text, template
animations/images, or a background colour to the wall.

## Repository structure

This is an npm workspaces monorepo:

| Package                            | Description                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| [`apps/backend`](./apps/backend)   | Python/FastAPI service on the Raspberry Pi: state API, MQTT fan-out, HUB75 display driver |
| [`apps/frontend`](./apps/frontend) | Vite + React web interface, built as a static bundle and hosted separately                |
| [`apps/esp32`](./apps/esp32)       | Arduino sketch for the ESP32 driving 3x 32x32 panels over MQTT                            |

Further documentation:

- [CONTEXT.md](./CONTEXT.md) — domain glossary (screens, layout, selection, content, layers)
- [HARDWARE.md](./HARDWARE.md) — physical wiring, power, and network architecture
- [RENDERING.md](./RENDERING.md) — how a selection/content edit becomes pixels on the panels
- [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md) — status of the frontend → backend → panels integration
- [docs/wire-format.md](./docs/wire-format.md) — the wire payload shared by the TypeScript encoder and the Python/C++ decoders

## Prerequisites

- Node.js as pinned in [.nvmrc](./.nvmrc) for the frontend
- Python 3.11+ for the backend, on a Raspberry Pi 4 with the HUB75 panels wired up
- Arduino IDE for the ESP32, if you are flashing that half — see
  [apps/esp32/README.md](./apps/esp32/README.md)

## Installation

The two halves install independently — the frontend is Node, the backend is Python
and only runs on the Pi.

```bash
npm install                                    # frontend
cd apps/backend && python3 -m venv .venv \
  && .venv/bin/pip install -r requirements.txt # backend
```

## Usage or Deployment

The backend is deployed onto the Raspberry Pi; see
[apps/backend/README.md](./apps/backend/README.md). The frontend is built
to a static bundle and hosted; see
[apps/frontend/README.md](./apps/frontend/README.md).

## Development

```bash
npm run dev        # frontend on :5173
npm run dev:api    # backend on :5001, no MQTT, state in /tmp
```

The backend uses **5001** locally, not the 5000 it uses on the Pi: on macOS the
AirPlay Receiver holds port 5000 and answers requests without CORS headers,
which looks exactly like a backend that is down. `apps/frontend/.env` points at
5001 to match.

To exercise the login screen, set a password in `apps/backend/app/.env`:

```
LEDWALL_PASSWORD=demo123
```

With that line empty or absent the backend runs unauthenticated and the
frontend skips its password gate on purpose.

The backend runs off the Pi for development — point `VITE_API_URL` at it, or at
the real Pi. The API contract is documented in
[apps/backend/README.md](./apps/backend/README.md) and served live at
`/docs`.

## Tests

```bash
npm run test:unit
npm run test:e2e
npm run test:a11y
npm run test:backend  # pytest, needs apps/backend/.venv set up (see Installation)
```

CI does not yet run anything against the Python backend.

## Contributing

Before you create a pull request, write an issue so we can discuss your changes.

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
  </tr>
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
