#!/usr/bin/env bash
# Publishes the backend to the hosted Supabase project (D-073, D-074): migrations, reference data
# (seeds) and every Edge Function. Run by .github/workflows/deploy.yml after CI passes on main, and
# by hand from a machine that has the credentials.
#
# Usage:
#   ./scripts/deploy-backend.sh            # db push --include-seed, then functions deploy
#   ./scripts/deploy-backend.sh --dry-run  # show the migrations and seeds that would run; no deploy
#
# Needs: SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN (or a prior `supabase login`) and
# SUPABASE_DB_PASSWORD. Locally, SUPABASE_PROJECT_REF is read from .env.production when unset.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT_DIR/supabase/functions"
ENV_FILE="$ROOT_DIR/.env.production"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

log() { printf '\033[1;34m[deploy-backend]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[1;31m[deploy-backend] %s\033[0m\n' "$*" >&2
  exit 1
}

# Every folder with an index.ts is a function; _shared is imported by them, never deployed. Listing
# them here means a new function is deployed without editing this script.
function_names() {
  local entry
  for entry in "$FUNCTIONS_DIR"/[!_]*/index.ts; do
    if [ -f "$entry" ]; then basename "$(dirname "$entry")"; fi
  done
}

if [ -z "${SUPABASE_PROJECT_REF:-}" ] && [ -f "$ENV_FILE" ]; then
  SUPABASE_PROJECT_REF="$(sed -n 's/^SUPABASE_PROJECT_REF=//p' "$ENV_FILE")"
fi
[ -n "${SUPABASE_PROJECT_REF:-}" ] || fail "SUPABASE_PROJECT_REF is empty (expected the project ref, e.g. abcdefghijklmnopqrst)."
[ -n "${SUPABASE_DB_PASSWORD:-}" ] || fail "SUPABASE_DB_PASSWORD is empty (expected the hosted database password)."
export SUPABASE_DB_PASSWORD

cd "$ROOT_DIR"
log "Linking project $SUPABASE_PROJECT_REF..."
pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF"

if $DRY_RUN; then
  pnpm exec supabase db push --include-seed --dry-run
  log "Dry run: would deploy the functions $(function_names | tr '\n' ' ')"
  exit 0
fi

# Seeds are upserts (on conflict … do update), and the CLI re-runs only seed files whose hash changed.
log "Pushing migrations and reference data..."
pnpm exec supabase db push --include-seed

# --import-map: without it the remote bundler cannot resolve zod / @supabase/supabase-js (D-073).
# verify_jwt per function comes from supabase/config.toml.
# A read loop, not mapfile: macOS still ships bash 3.2.
functions=()
while IFS= read -r name; do functions+=("$name"); done < <(function_names)
log "Deploying Edge Functions: ${functions[*]}"
pnpm exec supabase functions deploy "${functions[@]}" --project-ref "$SUPABASE_PROJECT_REF" \
  --use-api --import-map supabase/functions/deno.json
log "Done: https://$SUPABASE_PROJECT_REF.supabase.co"
