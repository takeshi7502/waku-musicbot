#!/usr/bin/env bash
# Bootstrap a standalone Lavalink installation without cloning this repository.

set -Eeuo pipefail

REPOSITORY="takeshi7502/waku-musicbot"
BRANCH="lavalink"
GITHUB_CONTENTS_API="https://api.github.com/repos/${REPOSITORY}/contents"
INSTALL_DIR="${LAVALINK_DIR:-$HOME/lavalink}"

info() { printf '[lavalink] %s\n' "$*"; }
die() { printf '[lavalink] Error: %s\n' "$*" >&2; exit 1; }

fetch_file() {
  local source_url="$1" destination="$2" temporary_file
  temporary_file="${destination}.download.$$"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 \
      -H 'Accept: application/vnd.github.raw+json' \
      "$source_url" -o "$temporary_file"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --header='Accept: application/vnd.github.raw+json' -O "$temporary_file" "$source_url"
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
  fetch_file "$GITHUB_CONTENTS_API/$filename?ref=$BRANCH" "$destination"
}

mkdir -p "$INSTALL_DIR"
INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd)"

info "Installing setup files in $INSTALL_DIR"
install_file_if_missing "run.sh"
install_file_if_missing "example.application.yml"
chmod 700 "$INSTALL_DIR/run.sh"

# When this bootstrap is piped from curl, stdin is the downloaded script and
# reaches EOF before run.sh can ask its setup questions.  Hand the interactive
# script the controlling terminal instead, so `curl ... | bash` continues into
# the complete setup flow.
if [ ! -r /dev/tty ] || [ ! -w /dev/tty ]; then
  die "An interactive terminal is required. Run this command directly in a shell."
fi

exec bash "$INSTALL_DIR/run.sh" </dev/tty
