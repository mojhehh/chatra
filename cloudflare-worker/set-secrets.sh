#!/usr/bin/env bash
# Read secrets from cloudflare-worker/secrets.env and push them to Wrangler (Cloudflare) as secrets,
# then publish the worker. Requires `wrangler` CLI and that you're already logged in.

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f secrets.env ]; then
  echo "ERROR: secrets.env not found. Copy secrets.env.example -> secrets.env and fill values."
  exit 1
fi

# shellcheck disable=SC1091
. ./secrets.env

# Helper to put secret (value via stdin)
put_secret() {
  local key="$1"
  local val="$2"
  if [ -z "${val:-}" ]; then
    echo "Skipping $key: empty"
    return
  fi
  printf '%s' "$val" | wrangler secret put "$key"
}

# FIREBASE_SA handling: priority FIREBASE_SA_FILE, then FIREBASE_SA_B64, then FIREBASE_SA
if [ -n "${FIREBASE_SA_FILE:-}" ] && [ -f "$FIREBASE_SA_FILE" ]; then
  FIREBASE_SA=$(cat "$FIREBASE_SA_FILE")
elif [ -n "${FIREBASE_SA_B64:-}" ]; then
  FIREBASE_SA_RAW=$(printf '%s' "$FIREBASE_SA_B64" | base64 --decode)
  FIREBASE_SA="$FIREBASE_SA_RAW"
elif [ -z "${FIREBASE_SA:-}" ]; then
  echo "Warning: No FIREBASE_SA source configured"
fi

# Push secrets
put_secret RESEND_API_KEY "${RESEND_API_KEY:-}"
put_secret FROM_EMAIL "${FROM_EMAIL:-}"
put_secret WORKER_SECRET "${WORKER_SECRET:-}"
put_secret FIREBASE_SA "${FIREBASE_SA:-}"
put_secret FIREBASE_DB_URL "${FIREBASE_DB_URL:-}"
put_secret CEREBRAS_API_KEY "${CEREBRAS_API_KEY:-}"

# Publish
echo "Publishing worker..."
wrangler deploy

echo "Done. Worker published." 
