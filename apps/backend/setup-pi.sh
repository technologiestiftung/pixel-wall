#!/usr/bin/env bash
# One-shot, re-runnable Pi setup. Run as your normal login user, not with sudo:
#   ./apps/backend/setup-pi.sh
set -euo pipefail

BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$BACKEND/../.." && pwd)"
SVC_USER="$(whoami)"

if [[ $EUID -eq 0 ]]; then
  echo "Run this as your login user, not root. It calls sudo where needed." >&2
  exit 1
fi

step() { printf '\n==> %s\n' "$*"; }

if [[ -z "${LEDWALL_SETUP_PULLED:-}" ]]; then
  step "Updating repo ($REPO) to latest main"
  git -C "$REPO" checkout main
  git -C "$REPO" pull --ff-only
  # The pull may have changed this script; restart with the new version.
  LEDWALL_SETUP_PULLED=1 exec "$BACKEND/setup-pi.sh" "$@"
fi

step "Setting system timezone"
# The daily shutdown schedule (LEDWALL_SHUTDOWN_AT below) means local time;
# a fresh Pi image otherwise defaults to UTC.
sudo timedatectl set-timezone Europe/Berlin

step "Installing system packages"
sudo apt update
sudo apt install -y python3-venv mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto
sudo pip3 install --break-system-packages Pillow

if ! sudo python3 -c 'import rgbmatrix' 2>/dev/null; then
  echo "WARNING: rgbmatrix is not importable by the system Python." >&2
  echo "         Install rpi-rgb-led-matrix's Python bindings, or ledwall-display will fail." >&2
fi

step "Creating backend virtualenv"
[[ -d "$BACKEND/.venv" ]] || python3 -m venv "$BACKEND/.venv"
"$BACKEND/.venv/bin/pip" install -r "$BACKEND/requirements.txt"

step "Creating ledwall group and shared state directory"
sudo groupadd -f ledwall
sudo usermod -aG ledwall "$SVC_USER"
sudo install -d -o root -g ledwall -m 2775 /var/lib/ledwall

step "Checking API password file"
sudo install -d -m 755 /etc/ledwall
if sudo test -f /etc/ledwall/backend.env; then
  echo "/etc/ledwall/backend.env exists, leaving it unchanged."
else
  read -rsp "Choose an API password (empty = no auth): " pw
  echo
  if [[ -n "$pw" ]]; then
    printf 'LEDWALL_PASSWORD=%s\n' "$pw" | sudo tee /etc/ledwall/backend.env >/dev/null
  else
    sudo touch /etc/ledwall/backend.env
  fi
  unset pw
fi
sudo chmod 600 /etc/ledwall/backend.env

step "Allowing $SVC_USER to trigger a soft shutdown without a password"
# Scoped to exactly one fixed command — see pi-config/sudoers-ledwall-shutdown.
sed "s|@USER@|$SVC_USER|" "$BACKEND/pi-config/sudoers-ledwall-shutdown" \
  | sudo tee /etc/sudoers.d/ledwall-shutdown >/dev/null
sudo chmod 440 /etc/sudoers.d/ledwall-shutdown
sudo visudo -cf /etc/sudoers.d/ledwall-shutdown

step "Opening MQTT broker to the LAN"
sudo tee /etc/mosquitto/conf.d/ledwall.conf >/dev/null <<'EOF'
listener 1883 0.0.0.0
allow_anonymous true
EOF
sudo systemctl restart mosquitto

step "Applying Pi boot settings for the matrix"
BOOT=/boot/firmware
reboot_needed=0

if ! grep -qsx 'blacklist snd_bcm2835' /etc/modprobe.d/blacklist-rgb-matrix.conf; then
  sudo install -m 644 "$BACKEND/pi-config/blacklist-rgb-matrix.conf" /etc/modprobe.d/
  reboot_needed=1
fi

if ! grep -q '^dtparam=audio=off' "$BOOT/config.txt"; then
  sudo sed -i 's/^dtparam=audio=on/dtparam=audio=off/' "$BOOT/config.txt"
  grep -q '^dtparam=audio=off' "$BOOT/config.txt" \
    || echo 'dtparam=audio=off' | sudo tee -a "$BOOT/config.txt" >/dev/null
  reboot_needed=1
fi

if ! grep -qw 'isolcpus=3' "$BOOT/cmdline.txt"; then
  # A broken cmdline.txt stops the Pi booting; keep the original to restore from.
  sudo cp "$BOOT/cmdline.txt" "$BOOT/cmdline.txt.bak"
  sudo sed -i '1 s/$/ isolcpus=3/' "$BOOT/cmdline.txt"
  reboot_needed=1
fi

step "Installing systemd units"
for u in ledwall-backend ledwall-display; do
  sed -e "s|/home/pi/ledwall|$REPO|g" -e "s|^User=pi$|User=$SVC_USER|" \
      "$BACKEND/systemd/$u.service" | sudo tee "/etc/systemd/system/$u.service" >/dev/null
done
sudo install -m 644 "$BACKEND/systemd/ledwall-shutdown.service" /etc/systemd/system/
# LEDWALL_SHUTDOWN_AT overrides the daily off-time (HH:MM, local time), e.g.:
#   LEDWALL_SHUTDOWN_AT=22:00 ./apps/backend/setup-pi.sh
sed "s|@SHUTDOWN_AT@|${LEDWALL_SHUTDOWN_AT:-18:00}|" "$BACKEND/systemd/ledwall-shutdown.timer" \
  | sudo tee /etc/systemd/system/ledwall-shutdown.timer >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable ledwall-display ledwall-backend ledwall-shutdown.timer
sudo systemctl restart ledwall-display ledwall-backend
sudo systemctl restart ledwall-shutdown.timer

step "Status"
systemctl --no-pager --lines=0 status ledwall-display ledwall-backend ledwall-shutdown.timer mosquitto || true
ss -tln | grep -q '0.0.0.0:1883' && echo "MQTT listening on 0.0.0.0:1883" \
  || echo "WARNING: MQTT is not listening on 0.0.0.0:1883" >&2

cat <<EOF

Done. If this was the first run, log out and back in so $SVC_USER picks up the
ledwall group for interactive shells. Health check:
  curl -su :<password> http://localhost:5000/api/health | python3 -m json.tool

Wall shuts down daily at ${LEDWALL_SHUTDOWN_AT:-18:00} (Europe/Berlin). Turning
it back on is physical — a mains timer or the power switch — not this script.
EOF

if (( reboot_needed )); then
  echo
  echo "Boot settings changed: run 'sudo reboot' for them to take effect."
fi
