#!/usr/bin/env bash
set -Eeuo pipefail

# This script is deliberately fixed-purpose: the bot can only create a small
# JSON request; it never receives shell or Docker access from inside its
# container. Install this file outside the repository as root-owned.

REPOSITORY_DIR="${1:?Repository directory is required}"
BRANCH="${2:-v5}"
REQUEST_FILE="$REPOSITORY_DIR/data/managed-update-request.json"
PROCESSING_FILE="$REPOSITORY_DIR/data/managed-update-processing.json"
RESULT_FILE="$REPOSITORY_DIR/data/managed-update-result.json"
REQUEST_ID="unknown"
COMMIT=""

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

write_result() {
  local state="$1"
  local error_message="${2:-}"
  local temporary="${RESULT_FILE}.$$.tmp"
  local commit_json="null"
  local error_json="null"

  [[ -n "$COMMIT" ]] && commit_json="\"$(json_escape "$COMMIT")\""
  [[ -n "$error_message" ]] && error_json="\"$(json_escape "$error_message")\""

  umask 022
  cat >"$temporary" <<EOF
{
  "id": "$(json_escape "$REQUEST_ID")",
  "state": "$(json_escape "$state")",
  "commit": $commit_json,
  "error": $error_json,
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  mv -f "$temporary" "$RESULT_FILE"
}

fail_update() {
  local exit_code="$?"
  local line_number="$1"
  write_result "failed" "Update helper stopped at line ${line_number} (exit ${exit_code})." || true
  exit "$exit_code"
}

abort_update() {
  local error_message="$1"
  local exit_code="${2:-1}"
  write_result "failed" "$error_message" || true
  exit "$exit_code"
}

trap 'fail_update "$LINENO"' ERR

[[ -s "$REQUEST_FILE" ]] || exit 0
mv -f "$REQUEST_FILE" "$PROCESSING_FILE"

REQUEST_ID="$(sed -nE 's/^[[:space:]]*"id"[[:space:]]*:[[:space:]]*"([0-9A-Fa-f-]+)"[[:space:]]*,?$/\1/p' "$PROCESSING_FILE" | head -n 1)"
REQUEST_ACTION="$(sed -nE 's/^[[:space:]]*"action"[[:space:]]*:[[:space:]]*"([A-Za-z]+)"[[:space:]]*,?$/\1/p' "$PROCESSING_FILE" | head -n 1)"
[[ "$REQUEST_ID" =~ ^[0-9a-fA-F-]{36}$ && "$REQUEST_ACTION" == "update" ]] || \
  abort_update "Invalid update request." 4

write_result "running"

git -C "$REPOSITORY_DIR" rev-parse --is-inside-work-tree >/dev/null
git -C "$REPOSITORY_DIR" remote get-url origin >/dev/null

# Never discard local tracked edits. config.js and data are ignored and are not
# touched by this check.
if [[ -n "$(git -C "$REPOSITORY_DIR" status --porcelain --untracked-files=no)" ]]; then
  echo "Refusing update: the repository has local tracked changes." >&2
  abort_update "Repository has local tracked changes." 2
fi

git -C "$REPOSITORY_DIR" fetch origin "$BRANCH" --prune
git -C "$REPOSITORY_DIR" merge --ff-only "origin/$BRANCH"
COMMIT="$(git -C "$REPOSITORY_DIR" rev-parse --short HEAD)"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose is unavailable." >&2
  abort_update "Docker Compose is unavailable." 3
fi

cd "$REPOSITORY_DIR"
"${COMPOSE[@]}" build --pull waku-musicbot
"${COMPOSE[@]}" run --rm --no-deps waku-musicbot npm run deploy
"${COMPOSE[@]}" up -d --no-deps --force-recreate waku-musicbot

write_result "success"
rm -f "$PROCESSING_FILE"
