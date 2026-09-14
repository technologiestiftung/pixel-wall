# @pixel-wall/backend

Node service that runs on the Raspberry Pi driving the pixel wall. It owns the
wall state, talks to the LED hardware and exposes the API the web interface uses.

## Layout

| Path            | Purpose                                                  |
| --------------- | -------------------------------------------------------- |
| `src/api/`      | HTTP and websocket endpoints                              |
| `src/services/` | Wall state and application logic, independent of hardware |
| `src/hardware/` | LED driver and GPIO access — the only Pi-specific code    |
| `src/config/`   | Environment and wall configuration                        |
| `deploy/`       | Systemd unit and provisioning notes for the Pi            |

## Development

```sh
npm run dev --workspace @pixel-wall/backend
```

Copy `.env.example` to `.env` first. On a machine without the LED hardware the
driver in `src/hardware/` is expected to fall back to a no-op implementation.
