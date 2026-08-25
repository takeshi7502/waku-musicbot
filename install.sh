#!/usr/bin/env bash
# Bootstrap a standalone Lavalink installation without cloning this repository.

set -Eeuo pipefail

REPOSITORY="takeshi7502/waku-musicbot"
BRANCH="lavalink"
RAW_BASE="https://raw.githubusercontent.com/${REPOSITORY}/${BRANCH}"
INSTALL_DIR="${LAVALINK_DIR:-$HOME/lavalink}"

info() { printf '[lavalink] %s\n' "$*"; }
die() { printf '[lavalink] Error: %s\n' "$*" >&2; exit 1; }

fetch_file() {
  local source_url="$1" destination="$2" temporary_file
  temporary_file="${destination}.download.$$"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 "$source_url" -o "$temporary_file"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$temporary_file" "$source_url"
  else
    die "curl or wget is required."
  fi

  [ -s "$temporary_file" ] || die "Downloaded file is empty: $(basename "$destination")"
  mv "$temporary_file" "$destination"
}

install_file_if_missing() {
  local filename destination
  filename="$1"
  destination="$INSTALL_DIR/$filename"

  if [ -f "$destination" ]; then
    info "Keeping existing $filename"
    return
  fi

  info "Downloading $filename"
  fetch_file "$RAW_BASE/$filename" "$destination"
}

mkdir -p "$INSTALL_DIR"
INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd)"

info "Installing setup files in $INSTALL_DIR"
install_file_if_missing "run.sh"
install_file_if_missing "example.application.yml"
chmod 700 "$INSTALL_DIR/run.sh"

exec bash "$INSTALL_DIR/run.sh"
