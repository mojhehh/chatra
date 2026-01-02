#!/usr/bin/env bash
# Deploy Cloudflare Worker and set required secrets interactively.
# Usage: ./deploy-worker.sh

set -e
cd "$(dirname "$0")"

echo "Login to Cloudflare (if not already):"
wrangler login

echo "Publishing worker..."
wrangler publish

echo "Now set secrets (you will be prompted for values):"
wrangler secret put RESEND_API_KEY
wrangler secret put FROM_EMAIL
wrangler secret put WORKER_SECRET
echo "Paste the full Firebase service account JSON when prompted (one line or multiline):"
wrangler secret put FIREBASE_SA
wrangler secret put FIREBASE_DB_URL

echo "Finished. Your worker should be available at https://recovery-modmojheh.workers.dev"
