# Verify Email Cloudflare Worker

This worker provides email verification and AI chat endpoints.

## Endpoints

- **POST /send-verification**
  Body JSON: `{ uid: string, email: string }`
  Sends a verification email with a signed token using Resend.

- **GET /verify?token=...**
  Validates token and marks user as verified in Firebase.

- **POST /ai**
  Body JSON: `{ prompt: string, history?: array, username?: string }`
  AI chat endpoint using Cerebras.

## Configuration

### Required Secrets (set via `wrangler secret put`, NOT in wrangler.toml)

```bash
wrangler secret put RESEND_API_KEY      # Your Resend API key
wrangler secret put FROM_EMAIL          # Verified sender in Resend
wrangler secret put WORKER_SECRET       # Random secret for token signing
wrangler secret put FIREBASE_SA         # Full service account JSON
wrangler secret put FIREBASE_DB_URL     # e.g. https://project-id-default-rtdb.firebaseio.com
wrangler secret put CEREBRAS_API_KEY    # For AI endpoint (optional)
```

### Example wrangler.toml

```toml
name = "recovery-modmojheh"
main = "verify-email-worker.js"
compatibility_date = "2025-12-23"

# DO NOT put secrets in [vars] - use wrangler secret put instead
```

## Deploy Steps

1. Install Wrangler:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. From `cloudflare-worker/` directory:
   ```bash
   wrangler deploy
   ```

3. Or use the helper script:
   ```bash
   ./deploy-worker.sh
   ```

## Implementation Details

- The worker uses Resend for sending verification emails
- It writes directly to Firebase Realtime Database using a service account to set `userProfiles/{uid}/recoveryEmailVerified`
- Rate limiting is implemented to prevent abuse

## Security Notes

- Never put secrets in wrangler.toml or commit them to git
- Keep `FIREBASE_SA` secret and rotate keys if exposed
- The worker validates Firebase ID tokens for authenticated endpoints

## Support

If users don't have a recovery email set, direct them to contact chatrahelpcenter@gmail.com.
