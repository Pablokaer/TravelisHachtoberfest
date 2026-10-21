#!/usr/bin/env bash
# Builds the web app against production and publishes it to the VPS (D-073).
#
# Usage:
#   ./scripts/deploy-web.sh            # build with .env.production, then rsync to travelist-vps
#   ./scripts/deploy-web.sh --dry-run  # build and show what rsync would change
#
# Needs: the EXPO_PUBLIC_* values of the Supabase Cloud project, from .env.production (git-ignored)
# or, when that file is absent (GitHub Actions, D-074), from the environment; and an SSH host alias
# `travelist-vps` in ~/.ssh/config. Apache serves /var/www/travelist
# (deploy/apache/travelist.live-le-ssl.conf).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/mobile"
ENV_FILE="$ROOT_DIR/.env.production"
REMOTE="travelist-vps:/var/www/travelist/"
RSYNC_FLAGS=(-az --delete)

log() { printf '\033[1;34m[deploy-web]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[1;31m[deploy-web] %s\033[0m\n' "$*" >&2
  exit 1
}

[ "${1:-}" = "--dry-run" ] && RSYNC_FLAGS+=(--dry-run --itemize-changes)

# Production values only: EXPO_NO_DOTENV stops Expo from loading the local .env (which points at
# the local stack), and --clear stops Metro from reusing modules inlined with local values.
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi
export EXPO_NO_DOTENV=1
[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ] ||
  fail "EXPO_PUBLIC_SUPABASE_URL is empty (expected https://<ref>.supabase.co in $ENV_FILE or the environment)."
[ -n "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ] ||
  fail "EXPO_PUBLIC_SUPABASE_ANON_KEY is empty (expected the project's anon key in $ENV_FILE or the environment)."

log "Building the web app for $EXPO_PUBLIC_SUPABASE_URL..."
cd "$APP_DIR"
rm -rf dist
node scripts/copy-maplibre-worker.mjs
npx expo export --platform web --clear

grep -rqF "$EXPO_PUBLIC_SUPABASE_URL" dist/_expo ||
  fail "The bundle does not contain $EXPO_PUBLIC_SUPABASE_URL; refusing to publish."

log "Publishing to $REMOTE..."
rsync "${RSYNC_FLAGS[@]}" dist/ "$REMOTE"
[ "${1:-}" = "--dry-run" ] || ssh travelist-vps 'chown -R www-data:www-data /var/www/travelist'
log "Done: https://travelist.live"
