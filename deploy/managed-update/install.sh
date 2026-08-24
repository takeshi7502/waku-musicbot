#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_DIR="${1:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
BRANCH="${2:-v5}"

[[ "$EUID" -eq 0 ]] || {
  echo "Run with sudo: sudo bash deploy/managed-update/install.sh /absolute/path/to/musicbot v5" >&2
  exit 1
}
[[ "$REPOSITORY_DIR" = /* && -d "$REPOSITORY_DIR/.git" ]] || {
  echo "Repository directory must be an absolute path to a Git checkout." >&2
  exit 1
}

BOT_USER="$(stat -c '%U' "$REPOSITORY_DIR")"
runuser -u "$BOT_USER" -- git -C "$REPOSITORY_DIR" rev-parse --is-inside-work-tree >/dev/null
runuser -u "$BOT_USER" -- docker info >/dev/null || {
  echo "User $BOT_USER cannot access Docker. Add it to the docker group, then log in again before installing." >&2
  exit 1
}
mkdir -p "$REPOSITORY_DIR/data"
chown "$BOT_USER":"$BOT_USER" "$REPOSITORY_DIR/data"
chmod 755 "$REPOSITORY_DIR/data"
touch "$REPOSITORY_DIR/data/managed-update.enabled"
chown "$BOT_USER":"$BOT_USER" "$REPOSITORY_DIR/data/managed-update.enabled"
chmod 644 "$REPOSITORY_DIR/data/managed-update.enabled"

install -o root -g root -m 755 \
  "$SCRIPT_DIR/waku-musicbot-update.sh" \
  /usr/local/sbin/waku-musicbot-update

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

repo_escaped="$(escape_sed "$REPOSITORY_DIR")"
user_escaped="$(escape_sed "$BOT_USER")"
branch_escaped="$(escape_sed "$BRANCH")"

sed \
  -e "s|@BOT_REPO_DIR@|$repo_escaped|g" \
  -e "s|@BOT_USER@|$user_escaped|g" \
  -e "s|@BOT_BRANCH@|$branch_escaped|g" \
  "$SCRIPT_DIR/waku-musicbot-update.service" \
  >/etc/systemd/system/waku-musicbot-update.service
sed -e "s|@BOT_REPO_DIR@|$repo_escaped|g" \
  "$SCRIPT_DIR/waku-musicbot-update.path" \
  >/etc/systemd/system/waku-musicbot-update.path

systemctl daemon-reload
systemctl enable --now waku-musicbot-update.path
systemctl status waku-musicbot-update.path --no-pager

echo
echo "Managed updates are ready for $REPOSITORY_DIR (branch $BRANCH)."
echo "The /reload hard-update button is enabled after the bot uses this build."
