addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// Simple in-memory rate limit store (works in a Cloudflare Worker warm instance)
const RATE_LIMIT_MAP = new Map();

function rateAllowed(ip, bucket, limit, windowMs) {
  try {
    const key = `${ip}::${bucket}`;
    const now = Date.now();
    const rec = RATE_LIMIT_MAP.get(key) || { count: 0, start: now };
    if (now - rec.start > windowMs) {
      rec.count = 1;
      rec.start = now;
    } else {
      rec.count += 1;
    }
    RATE_LIMIT_MAP.set(key, rec);
    return rec.count <= limit;
  } catch (e) {
    // On any error, fail open (allow) but log
    console.error('rateAllowed error', e);
    return true;
  }
}

// Expected secrets (set via Wrangler or Cloudflare dashboard):
// RESEND_API_KEY, FROM_EMAIL, WORKER_SECRET, FIREBASE_SA (service account JSON), FIREBASE_DB_URL

async function handleRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  function respond(body, init) {
    init = init || {};
    init.headers = Object.assign({}, init.headers || {}, corsHeaders);
    return new Response(body, init);
  }
  if (request.method === 'POST' && url.pathname === '/send-verification') {
    try {
      // Basic auth requirement: require an Authorization header (e.g. Firebase ID token)
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.trim()) {
        return respond('Unauthorized', { status: 401 });
      }

      // Basic per-IP rate limit for sending verification tokens
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      if (!rateAllowed(ip, 'send-verification', 10, 60 * 60 * 1000)) {
        return respond('Too many requests', { status: 429 });
      }
      const body = await request.json();
      const uid = body.uid;
      const email = body.email;
      if (!uid || !email) return respond('Missing uid or email', { status: 400 });

      // Create a token entry and save to Firebase Realtime DB
      // Generate a cryptographically-strong, URL-safe token (32 bytes -> base64url ~43 chars)
      const tokenId = randomId(32);
      const now = Date.now();
      // Short token lifetime for password resets: 15 minutes
      const expiresAt = now + (15 * 60 * 1000); // 15 minutes

      const firebaseAccess = await getFirebaseAccessToken();
      if (!firebaseAccess) return respond('Firebase access unavailable', { status: 500 });

      const dbUrl = FIREBASE_DB_URL || FIREBASE_DB_URL_FROM_ENV();
      if (!dbUrl) return respond('FIREBASE_DB_URL not configured', { status: 500 });

      const tokenObj = { uid, email, createdAt: now, expiresAt };
      const tokenPut = await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenObj)
      });
      if (!tokenPut.ok) {
        const txt = await tokenPut.text();
        console.error('Failed to store token (detail):', txt);
        return respond('Failed to store token', { status: 502 });
      }

      // Return the verification token to the client; the client will
      // construct the reset link (e.g., `${location.origin}/reset.html?token=`)
      return respond(JSON.stringify({ ok: true, tokenId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
      return respond('Error: ' + e.message, { status: 500 });
    }
  }

  // POST /verify-token - validate a token and return uid/email (no side-effects)
  if (request.method === 'POST' && url.pathname === '/verify-token') {
    try {
      // Basic per-IP rate limit for token verification attempts
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      if (!rateAllowed(ip, 'verify-token', 60, 60 * 60 * 1000)) {
        return respond('Too many requests', { status: 429 });
      }
      const body = await request.json();
      const tokenId = body.tokenId;
      if (!tokenId) return respond('Missing tokenId', { status: 400 });
      const firebaseAccess = await getFirebaseAccessToken();
      if (!firebaseAccess) return respond('Firebase access unavailable', { status: 500 });
      const dbUrl = FIREBASE_DB_URL || FIREBASE_DB_URL_FROM_ENV();
      if (!dbUrl) return respond('FIREBASE_DB_URL not configured', { status: 500 });
      const tokRes = await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`);
      if (!tokRes.ok) return respond('Token not found', { status: 404 });
      const tok = await tokRes.json();
      if (!tok || !tok.uid || !tok.email) return respond('Invalid token', { status: 400 });
      if (Date.now() > (tok.expiresAt || 0)) return respond('Token expired', { status: 400 });
      // Do not leak email/uid to callers — return minimal success.
      return respond(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('verify-token error', e);
      return respond('Error', { status: 500 });
    }
  }

  // POST /reset-password - validate token and set new password for uid
  if (request.method === 'POST' && url.pathname === '/reset-password') {
    try {
      // Basic per-IP rate limit for reset attempts
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      if (!rateAllowed(ip, 'reset-password', 30, 60 * 60 * 1000)) {
        return respond('Too many requests', { status: 429 });
      }
      const body = await request.json();
      const tokenId = body.tokenId;
      const newPassword = body.newPassword;
      if (!tokenId || !newPassword) return respond('Missing tokenId or newPassword', { status: 400 });
      if (typeof newPassword !== 'string' || newPassword.length < 6) return respond('Password must be at least 6 characters', { status: 400 });

      const firebaseAccess = await getFirebaseAccessToken();
      if (!firebaseAccess) return respond('Firebase access unavailable', { status: 500 });
      const dbUrl = FIREBASE_DB_URL || FIREBASE_DB_URL_FROM_ENV();
      if (!dbUrl) return respond('FIREBASE_DB_URL not configured', { status: 500 });

      // Read token
      const tokRes = await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`);
      if (!tokRes.ok) return respond('Token not found', { status: 404 });
      const tok = await tokRes.json();
      if (!tok || !tok.uid) return respond('Invalid token', { status: 400 });
      if (Date.now() > (tok.expiresAt || 0)) return respond('Token expired', { status: 400 });

      // Use Identity Toolkit to update password for the user (admin-level)
      const sa = await getServiceAccount();
      const projectId = sa && sa.project_id ? sa.project_id : null;
      if (!projectId) return respond('Service account project_id missing', { status: 500 });

      const updateUrl = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`;
      const updateRes = await fetch(updateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firebaseAccess}`
        },
        body: JSON.stringify({ localId: tok.uid, password: newPassword, returnSecureToken: false })
      });
      if (!updateRes.ok) {
        const txt = await updateRes.text();
        console.error('IdentityToolkit password update failed (detail):', txt);
        return respond('Password update failed', { status: 502 });
      }

      // Delete token after successful password reset
      await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`, { method: 'DELETE' });

      return respond(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return respond('Error: ' + e.message, { status: 500 });
    }
  }

  if (request.method === 'GET' && url.pathname === '/verify') {
    const tokenId = url.searchParams.get('tokenId');
    if (!tokenId) return respond('Missing tokenId', { status: 400 });
    try {
      const firebaseAccess = await getFirebaseAccessToken();
      if (!firebaseAccess) return respond('Firebase access unavailable', { status: 500 });
      const dbUrl = FIREBASE_DB_URL || FIREBASE_DB_URL_FROM_ENV();
      if (!dbUrl) return respond('FIREBASE_DB_URL not configured', { status: 500 });

      // Read token
      const tokRes = await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`);
      if (!tokRes.ok) return respond('Token not found', { status: 404 });
      const tok = await tokRes.json();
      if (!tok || !tok.uid || !tok.email) return respond('Invalid token', { status: 400 });
      if (Date.now() > (tok.expiresAt || 0)) return respond('Token expired', { status: 400 });

      // Mark verified
      const verifyRes = await fetch(`${dbUrl}/userProfiles/${tok.uid}/recoveryEmailVerified.json?access_token=${firebaseAccess}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(true)
      });
      if (!verifyRes.ok) {
        const txt = await verifyRes.text();
        return respond('Failed to set verified: ' + txt, { status: 502 });
      }

      // Delete token
      await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`, { method: 'DELETE' });

      const body = `<html><body><h1>Verification successful</h1><p>Your recovery email (${escapeHtml(tok.email)}) has been verified for account id ${escapeHtml(tok.uid)}.</p><p>Return to the app.</p></body></html>`;
      return respond(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
      return respond('Invalid token format', { status: 400 });
    }
  }

  // POST /ai - proxy endpoint. Uses Cerebras API when `CEREBRAS_API_KEY` secret is set.
  if (request.method === 'POST' && url.pathname === '/ai') {
    try {
      const body = await request.json();
      const prompt = (body && (body.prompt || body.message || body.text)) || '';
      const history = (body && Array.isArray(body.history)) ? body.history : [];
      if (!prompt) return respond(JSON.stringify({ error: 'Missing prompt' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      // Prefer Cerebras API key
      const cerebrasKey = (typeof CEREBRAS_API_KEY !== 'undefined' ? CEREBRAS_API_KEY : (typeof CEREBRAS_API_KEY_FROM_ENV !== 'undefined' ? CEREBRAS_API_KEY_FROM_ENV() : null));
      if (!cerebrasKey) {
        // No Cerebras key configured — fallback safe mock so UI still functions
        const mock = `Hi — AI not configured on the server; echo: ${prompt}`;
        return respond(JSON.stringify({ ok: true, reply: mock }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Build conversation messages from history
      const messages = [
        {
          role: 'system',
          content: 'You are Chatra AI, the assistant for the Chatra chat application. Respond in English and identify yourself as Chatra AI when appropriate. Be helpful, concise, and follow community guidelines. Keep responses compact without excessive line breaks - use single line breaks sparingly. Remember context from previous messages in this conversation.'
        }
      ];
      
      // Add conversation history (already has role and content)
      for (const msg of history.slice(-10)) { // Max 10 messages for context
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Build Cerebras request payload
      const cereReqBody = {
        model: 'zai-glm-4.6',
        stream: false,
        max_tokens: 2048,
        temperature: 0.6,
        top_p: 0.95,
        messages
      };

      const cereRes = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cerebrasKey}`
        },
        body: JSON.stringify(cereReqBody)
      });

      if (!cereRes.ok) {
        const txt = await cereRes.text();
        console.error('/ai Cerebras error', txt);
        return respond(JSON.stringify({ error: 'Cerebras error', detail: txt }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }

      const cereJson = await cereRes.json();
      // Attempt to extract assistant text (Cerebras response shape may vary)
      let replyText = null;
      try {
        if (cereJson && cereJson.choices && cereJson.choices[0]) {
          // GLM-style: choices[0].message.content or choices[0].text
          replyText = (cereJson.choices[0].message && cereJson.choices[0].message.content) || cereJson.choices[0].text || null;
        }
      } catch (e) { replyText = null; }

      return respond(JSON.stringify({ ok: true, reply: replyText || JSON.stringify(cereJson), raw: cereJson }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('/ai handler error', e);
      return respond(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return respond('Not found', { status: 404 });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function randomId(len = 24) {
  // If len looks small (< 24) treat as number of bytes; default 24 bytes.
  const bytes = typeof len === 'number' ? len : 24;
  const rnd = crypto.getRandomValues(new Uint8Array(bytes));
  return base64UrlEncode(rnd);
}

// Get Google OAuth access token using service account JSON stored in secret FIREBASE_SA
async function getFirebaseAccessToken() {
  try {
    // Support either raw JSON in FIREBASE_SA or base64-encoded JSON in FIREBASE_SA_B64
    let sa = null;
    try {
      if (typeof FIREBASE_SA_B64 !== 'undefined' && FIREBASE_SA_B64) {
        sa = JSON.parse(atob(FIREBASE_SA_B64));
      }
    } catch (e) {
      sa = null;
    }
    if (!sa) {
      const envB64 = typeof FIREBASE_SA_B64_FROM_ENV !== 'undefined' ? FIREBASE_SA_B64_FROM_ENV() : null;
      if (envB64) {
        try { sa = JSON.parse(atob(envB64)); } catch (e) { sa = null; }
      }
    }
    if (!sa) {
      const saJson = (typeof FIREBASE_SA !== 'undefined' ? FIREBASE_SA : null) || (typeof FIREBASE_SA_FROM_ENV !== 'undefined' ? FIREBASE_SA_FROM_ENV() : null);
      if (!saJson) return null;
      sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/identitytoolkit',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };
    const jwt = await signJwt(header, payload, sa.private_key);
    const form = new URLSearchParams();
    form.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    form.set('assertion', jwt);
    const tokRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: form });
    if (!tokRes.ok) return null;
    const tokJson = await tokRes.json();
    return tokJson.access_token;
  } catch (e) {
    console.error('getFirebaseAccessToken error', e);
    return null;
  }
}

function base64UrlEncode(buf) {
  // buf is Uint8Array or ArrayBuffer
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwt(header, payload, privateKeyPem) {
  const enc = new TextEncoder();
  const h = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const p = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const toSign = `${h}.${p}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, enc.encode(toSign));
  const s = base64UrlEncode(new Uint8Array(sig));
  return `${toSign}.${s}`;
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem) {
  const pkcs8 = pemToArrayBuffer(pem);
  return await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

// Helpers to read secrets in both Wrangler and older environments
function FIREBASE_DB_URL_FROM_ENV() { try { return FIREBASE_DB_URL; } catch(e) { return null; } }
function FIREBASE_SA_FROM_ENV() { try { return FIREBASE_SA; } catch(e) { return null; } }

// Parse and return service account object from secrets
async function getServiceAccount() {
  try {
    let sa = null;
    try {
      if (typeof FIREBASE_SA_B64 !== 'undefined' && FIREBASE_SA_B64) {
        sa = JSON.parse(atob(FIREBASE_SA_B64));
      }
    } catch (e) { sa = null; }
    if (!sa) {
      const envB64 = typeof FIREBASE_SA_B64_FROM_ENV !== 'undefined' ? FIREBASE_SA_B64_FROM_ENV() : null;
      if (envB64) {
        try { sa = JSON.parse(atob(envB64)); } catch (e) { sa = null; }
      }
    }
    if (!sa) {
      const saJson = (typeof FIREBASE_SA !== 'undefined' ? FIREBASE_SA : null) || (typeof FIREBASE_SA_FROM_ENV !== 'undefined' ? FIREBASE_SA_FROM_ENV() : null);
      if (!saJson) return null;
      sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson;
    }
    return sa;
  } catch (e) {
    return null;
  }
}
