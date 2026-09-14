# systemd units

Two units, deliberately independent: `ledwall-display` is the wall, and
`ledwall-backend` is only a way to change what the wall shows. Stopping the
backend leaves the display running on the last written state.

## The shared state file

`/var/lib/ledwall/state.json` is written by the backend (as `pi`) and read by the
display script (as `root`). Root reads anything, so the only real problem is
making the file writable by `pi` without making it writable by everyone.

The approach used here is a dedicated `ledwall` group:

- `/var/lib/ledwall` is owned `root:ledwall`, mode `2775`
- the setgid bit means every file created inside inherits group `ledwall`
- `pi` is a member of `ledwall`, and the backend unit sets `UMask=0002`, so the
  state file lands as `0664 pi:ledwall`
- the atomic write in `app/state.py` chmods the temp file to `0664` before
  `os.replace`, because `mkstemp` would otherwise leave it `0600`

Alternatives rejected: running the backend as root (a network-facing service
with no auth should not be root), making the file world-writable (any LAN user
with a shell on the Pi could drive the wall), and having the display drop
privileges after matrix init (`rpi-rgb-led-matrix` needs root for the duration).
