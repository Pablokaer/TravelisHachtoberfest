#!/usr/bin/env bash
# Runs Wayfarer locally with one command: dependencies, Supabase stack
# (Postgres + Auth + seeds), Edge Functions and the Expo web app.
#
# Usage:
#   ./run-project.sh           # start everything, open the app on the web
#   ./run-project.sh --stop    # stop the local Supabase stack
#
# Ctrl+C stops the app and the Edge Functions; the Supabase stack keeps
# running (fast restarts) until `./run-project.sh --stop`.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
FUNCTIONS_LOG="$ROOT_DIR/.turbo/functions-serve.log"
DOCKER_WAIT_SECONDS=120
SUPABASE_START_ATTEMPTS=12
FUNCTIONS_PID=""

log() { printf '\033[1;34m[wayfarer]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[1;31m[wayfarer] %s\033[0m\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "'$1' not found. $2"
}

check_node_version() {
  require_command node "Install Node.js 22 (see .nvmrc)."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 22 ] || fail "Node.js >= 22 required, found $(node -v)."
}

ensure_pnpm() {
  command -v pnpm >/dev/null 2>&1 && return
  log "pnpm not found, enabling it through corepack..."
  corepack enable || fail "Could not enable pnpm. Run: corepack enable"
}

wait_for_docker() {
  local waited=0
  until docker info >/dev/null 2>&1; do
    [ "$waited" -lt "$DOCKER_WAIT_SECONDS" ] ||
      fail "Docker did not start within ${DOCKER_WAIT_SECONDS}s. Start Docker and try again."
    sleep 2
    waited=$((waited + 2))
  done
}

ensure_docker() {
  require_command docker "Install Docker Desktop or OrbStack."
  docker info >/dev/null 2>&1 && return
  log "Docker is not running, starting it..."
  if [ "$(uname)" = "Darwin" ]; then
    open -a OrbStack 2>/dev/null || open -a Docker 2>/dev/null ||
      fail "Could not open Docker Desktop / OrbStack. Start Docker and try again."
  fi
  wait_for_docker
}

install_dependencies() {
  log "Installing dependencies (pnpm install)..."
  pnpm install --frozen-lockfile
}

# Right after Docker boots, existing containers are still "starting" and
# `supabase start` exits with StatusDbNotReadyError, so it is retried.
start_supabase() {
  log "Starting the local Supabase stack (migrations + seeds on first run)..."
  local attempt
  for attempt in $(seq 1 "$SUPABASE_START_ATTEMPTS"); do
    pnpm exec supabase start && return
    log "Supabase not ready yet (attempt $attempt/$SUPABASE_START_ATTEMPTS), retrying in 5s..."
    sleep 5
  done
  fail "Supabase did not start after $SUPABASE_START_ATTEMPTS attempts. See 'pnpm exec supabase start --debug'."
}

# Reads one KEY from `supabase status -o env` (values are quoted there).
supabase_status_value() {
  pnpm exec supabase status -o env 2>/dev/null |
    grep "^$1=" | head -n1 | cut -d= -f2- | tr -d '"'
}

# Replaces KEY=... in .env in place (appends it when missing).
set_env_value() {
  local key="$1" value="$2"
  if ! grep -q "^$key=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
    return
  fi
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" 'index($0, k "=") == 1 { print k "=" v; next } { print }' \
    "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
}

current_env_value() {
  grep "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true
}

# A .env pointing at a hosted project is left untouched; only an empty or
# local URL is (re)filled with the keys of the local stack.
env_targets_local_stack() {
  local url
  url="$(current_env_value EXPO_PUBLIC_SUPABASE_URL)"
  [ -z "$url" ] || [[ "$url" == *127.0.0.1* ]] || [[ "$url" == *localhost* ]]
}

write_local_keys_to_env() {
  local api_url anon_key service_key
  api_url="$(supabase_status_value API_URL)"
  anon_key="$(supabase_status_value ANON_KEY)"
  service_key="$(supabase_status_value SERVICE_ROLE_KEY)"
  [ -n "$api_url" ] && [ -n "$anon_key" ] ||
    fail "Could not read API_URL / ANON_KEY from 'supabase status -o env'."
  set_env_value EXPO_PUBLIC_SUPABASE_URL "$api_url"
  set_env_value EXPO_PUBLIC_SUPABASE_ANON_KEY "$anon_key"
  set_env_value SUPABASE_SERVICE_ROLE_KEY "$service_key"
}

# Local email (D-066): an older .env has no email settings, and `supabase start` refuses a config
# whose Send Email Hook has no secret. Adds the .env.example defaults (Mailpit) when missing.
ensure_local_email_env() {
  local key
  [ -f "$ENV_FILE" ] || cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  env_targets_local_stack || return 0
  for key in MAILPIT_URL EMAIL_FROM SEND_EMAIL_HOOK_SECRET AUTH_PUBLIC_URL APP_URL; do
    grep -q "^$key=" "$ENV_FILE" && continue
    log "Adding the local default of $key to .env..."
    grep "^$key=" "$ROOT_DIR/.env.example" >>"$ENV_FILE"
  done
}

prepare_env_file() {
  [ -f "$ENV_FILE" ] || cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  if env_targets_local_stack; then
    log "Writing the local Supabase URL and keys to .env..."
    write_local_keys_to_env
  else
    log ".env points at a hosted Supabase project; keeping its values."
  fi
  # Expo reads .env from the app folder (README → Quick start).
  [ -e "$ROOT_DIR/apps/mobile/.env" ] || ln -s ../../.env "$ROOT_DIR/apps/mobile/.env"
}

start_edge_functions() {
  mkdir -p "$(dirname "$FUNCTIONS_LOG")"
  log "Serving Edge Functions in the background (log: ${FUNCTIONS_LOG#"$ROOT_DIR"/})..."
  pnpm functions:serve >"$FUNCTIONS_LOG" 2>&1 &
  FUNCTIONS_PID=$!
}

stop_edge_functions() {
  [ -n "$FUNCTIONS_PID" ] || return 0
  log "Stopping Edge Functions..."
  kill "$FUNCTIONS_PID" 2>/dev/null || true
  wait "$FUNCTIONS_PID" 2>/dev/null || true
}

print_urls() {
  log "Supabase API:    $(supabase_status_value API_URL)"
  log "Supabase Studio: http://127.0.0.1:54323"
  log "Mailpit (email): http://127.0.0.1:54324"
  log "Starting the app on the web (Expo will print the URL; press i / a for simulators)..."
}

start_app() {
  pnpm --filter @wayfarer/mobile web
}

stop_stack() {
  cd "$ROOT_DIR"
  log "Stopping the local Supabase stack..."
  pnpm exec supabase stop
}

main() {
  cd "$ROOT_DIR"
  if [ "${1:-}" = "--stop" ]; then
    stop_stack
    return
  fi
  check_node_version
  ensure_pnpm
  ensure_docker
  install_dependencies
  # Before the stack starts: config.toml reads SEND_EMAIL_HOOK_SECRET from .env.
  ensure_local_email_env
  start_supabase
  prepare_env_file
  trap stop_edge_functions EXIT
  start_edge_functions
  print_urls
  start_app
}

main "$@"
