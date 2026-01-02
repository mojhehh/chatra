Verify Email Cloudflare Worker

This worker provides two endpoints:

- POST /send-verification
  Body JSON: { uid: string, email: string }
  Sends a verification email with a signed token using SendGrid.

- GET /verify?token=...
  Validates token and shows a simple success page.

Notes & configuration

1. Install Wrangler and configure your Cloudflare account.

2. Environment variables the worker expects (set in Wrangler/TOML or Cloudflare dashboard):
   - SENDGRID_API_KEY: your SendGrid API key
   - FROM_EMAIL: a verified from address in SendGrid
   - WORKER_SECRET: random secret used to sign tokens (keep private)

3. Deploy with Wrangler.

Example wrangler.toml (replace values):

name = "chatra-verify-worker"
main = "verify-email-worker.js"
compatibility_date = "2025-12-23"

[vars]
SENDGRID_API_KEY = "your-sendgrid-key"
FROM_EMAIL = "no-reply@yourdomain.com"
WORKER_SECRET = "a-long-random-secret"

4. After deployment, set `window.RECOVERY_WORKER_URL` in your frontend (or replace the placeholder) to point to the worker URL.

Security and next steps

- This worker currently does not write to Firebase. To finalize verification automatically, extend the worker to call a secure backend or Firebase Admin endpoint that marks `userProfiles/{uid}/recoveryEmailVerified`.
- Alternatively, have the app accept the token from the verify page and call a secure authenticated endpoint to finalize verification.
- Monitor deliverability and errors from SendGrid logs.

Updated flow (worker with service account):
- This repository now includes a Worker implementation that uses Resend for emails and a Firebase Service Account to update the Realtime Database directly.
- Secrets required (set with `wrangler secret put`): `RESEND_API_KEY`, `FROM_EMAIL`, `WORKER_SECRET`, `FIREBASE_SA` (the full service-account JSON), and `FIREBASE_DB_URL` (your RTDB URL, e.g. `https://project-id-default-rtdb.firebaseio.com`).

Wrangler / CLI deploy steps:

1. Install Wrangler (v2):

```bash
npm install -g wrangler
wrangler login
```

2. From `cloudflare-worker/` directory, create `wrangler.toml` (example):

```toml
name = "recovery-modmojheh"
main = "verify-email-worker.js"
compatibility_date = "2025-12-23"
```

3. Set secrets via Wrangler:

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put FROM_EMAIL
wrangler secret put WORKER_SECRET
wrangler secret put FIREBASE_SA   # paste the entire service account JSON when prompted
wrangler secret put FIREBASE_DB_URL
```

4. Publish the worker (this will give you a workers.dev subdomain like `recovery-modmojheh.workers.dev`):

```bash
wrangler publish
```

5. Update frontend `window.RECOVERY_WORKER_URL` to the worker URL, or set it in the code where used.

Security notes:
- The worker uses the provided service account JSON to mint OAuth tokens to call the Firebase Realtime Database REST API and will therefore be able to mark `recoveryEmailVerified`.
- Keep `FIREBASE_SA` secret and rotate keys if the secret is ever exposed.

If you'd like, I can add a `wrangler.toml` and a helper `deploy-worker.sh` script in the `cloudflare-worker/` folder to automate these steps.

Support: if users don't have a recovery email set, your frontend will instruct them to contact chatrahelpcenter@gmail.com as requested.