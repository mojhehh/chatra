addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})


const ALLOWED_ORIGINS = [
  'https://chat-app-710f0.web.app',
  'https://chat-app-710f0.firebaseapp.com',
  'https://mojhehh.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];



async function rateAllowed(ip, bucket, limit, windowMs, kvBinding) {
  try {
    const key = `ratelimit::${ip}::${bucket}`;
    const now = Date.now();
    
    
    if (!kvBinding) {
      console.warn('Rate limit KV not configured, allowing request');
      return true;
    }
    
    let rec = await kvBinding.get(key, 'json');
    if (!rec || now - rec.start > windowMs) {
      rec = { count: 1, start: now };
    } else {
      rec.count += 1;
    }
    
    
    const ttlSeconds = Math.ceil(windowMs / 1000) + 60;
    await kvBinding.put(key, JSON.stringify(rec), { expirationTtl: ttlSeconds });
    
    return rec.count <= limit;
  } catch (e) {
    
    console.error('rateAllowed error', e);
    return true;
  }
}


async function verifyFirebaseIdToken(idToken, expectedProjectId) {
  try {
    if (!idToken) return null;
    
    
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      console.warn('Token expired');
      return null;
    }
    if (!payload.iat || payload.iat > now + 300) {
      console.warn('Token iat in future');
      return null;
    }
    if (payload.aud !== expectedProjectId) {
      console.warn('Token audience mismatch:', payload.aud, '!==', expectedProjectId);
      return null;
    }
    if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length === 0) {
      console.warn('Token missing sub');
      return null;
    }
    
    
    const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
    if (payload.iss !== expectedIssuer) {
      console.warn('Token issuer mismatch');
      return null;
    }
    
    
    const keysRes = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (!keysRes.ok) {
      console.error('Failed to fetch Google public keys');
      return null;
    }
    const keys = await keysRes.json();
    const certPem = keys[header.kid];
    if (!certPem) {
      console.warn('Key ID not found in Google keys');
      return null;
    }
    
    
    const publicKey = await importPublicKeyFromCert(certPem);
    const signatureValid = await verifyJwtSignature(idToken, publicKey);
    
    if (!signatureValid) {
      console.warn('Token signature invalid');
      return null;
    }
    
    return { uid: payload.sub, email: payload.email || null };
  } catch (e) {
    console.error('verifyFirebaseIdToken error:', e);
    return null;
  }
}

async function importPublicKeyFromCert(certPem) {
  
  const b64 = certPem.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  
  
  return await crypto.subtle.importKey(
    'spki',
    extractPublicKeyFromCert(bytes.buffer),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

function extractPublicKeyFromCert(certDer) {
  
  
  const cert = new Uint8Array(certDer);
  
  const rsaOid = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  
  for (let i = 0; i < cert.length - rsaOid.length - 50; i++) {
    let match = true;
    for (let j = 0; j < rsaOid.length; j++) {
      if (cert[i + j] !== rsaOid[j]) { match = false; break; }
    }
    if (match) {
      
      let seqStart = i - 4; 
      while (seqStart > 0 && cert[seqStart] !== 0x30) seqStart--;
      
      
      if (cert[seqStart] === 0x30) {
        let lenByte = cert[seqStart + 1];
        let spkiLen, dataStart;
        if (lenByte < 0x80) {
          spkiLen = lenByte;
          dataStart = seqStart + 2;
        } else if (lenByte === 0x81) {
          spkiLen = cert[seqStart + 2];
          dataStart = seqStart + 3;
        } else if (lenByte === 0x82) {
          spkiLen = (cert[seqStart + 2] << 8) | cert[seqStart + 3];
          dataStart = seqStart + 4;
        } else {
          continue;
        }
        
        
        const spki = cert.slice(seqStart, dataStart + spkiLen);
        return spki.buffer;
      }
    }
  }
  throw new Error('Could not extract public key from certificate');
}

async function verifyJwtSignature(jwt, publicKey) {
  const parts = jwt.split('.');
  const signedData = parts[0] + '.' + parts[1];
  const signature = base64UrlDecode(parts[2]);
  
  return await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    signature,
    new TextEncoder().encode(signedData)
  );
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}






const FIREBASE_PROJECT_ID = 'chat-app-710f0';

async function handleRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  
  
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Vary': 'Origin'
  };
  
  if (allowedOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
  }
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  function respond(body, init) {
    init = init || {};
    init.headers = Object.assign({}, init.headers || {}, corsHeaders);
    return new Response(body, init);
  }
  
  
  const kvBinding = typeof RATE_LIMIT_KV !== 'undefined' ? RATE_LIMIT_KV : null;
  
  if (request.method === 'POST' && url.pathname === '/send-verification') {
    try {
      
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return respond('Unauthorized: Missing or invalid Authorization header', { status: 401 });
      }
      
      const idToken = authHeader.slice(7).trim();
      const verifiedUser = await verifyFirebaseIdToken(idToken, FIREBASE_PROJECT_ID);
      if (!verifiedUser) {
        return respond('Unauthorized: Invalid or expired token', { status: 401 });
      }

      
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      if (!await rateAllowed(ip, 'send-verification', 10, 60 * 60 * 1000, kvBinding)) {
        return respond('Too many requests', { status: 429 });
      }
      const body = await request.json();
      const uid = body.uid;
      const email = body.email;
      if (!uid || !email) return respond('Missing uid or email', { status: 400 });
      
      
      if (verifiedUser.uid !== uid) {
        return respond('Unauthorized: UID mismatch', { status: 401 });
      }

      
      
      const tokenId = randomId(32);
      const now = Date.now();
      
      const expiresAt = now + (15 * 60 * 1000); 

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

      
      
      return respond(JSON.stringify({ ok: true, tokenId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
      return respond('Error: ' + e.message, { status: 500 });
    }
  }

  
  if (request.method === 'POST' && url.pathname === '/verify-token') {
    try {
      
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      if (!await rateAllowed(ip, 'verify-token', 60, 60 * 60 * 1000, kvBinding)) {
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
      
      return respond(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('verify-token error', e);
      return respond('Error', { status: 500 });
    }
  }

  
  if (request.method === 'POST' && url.pathname === '/reset-password') {
    try {
      
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      if (!await rateAllowed(ip, 'reset-password', 30, 60 * 60 * 1000, kvBinding)) {
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

      
      const tokRes = await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`);
      if (!tokRes.ok) return respond('Token not found', { status: 404 });
      const tok = await tokRes.json();
      if (!tok || !tok.uid) return respond('Invalid token', { status: 400 });
      if (Date.now() > (tok.expiresAt || 0)) return respond('Token expired', { status: 400 });

      
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

      
      const tokRes = await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`);
      if (!tokRes.ok) return respond('Token not found', { status: 404 });
      const tok = await tokRes.json();
      if (!tok || !tok.uid || !tok.email) return respond('Invalid token', { status: 400 });
      if (Date.now() > (tok.expiresAt || 0)) return respond('Token expired', { status: 400 });

      
      const verifyRes = await fetch(`${dbUrl}/userProfiles/${tok.uid}/recoveryEmailVerified.json?access_token=${firebaseAccess}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(true)
      });
      if (!verifyRes.ok) {
        const txt = await verifyRes.text();
        return respond('Failed to set verified: ' + txt, { status: 502 });
      }

      
      await fetch(`${dbUrl}/recoveryTokens/${tokenId}.json?access_token=${firebaseAccess}`, { method: 'DELETE' });

      const body = `<html><body><h1>Verification successful</h1><p>Your recovery email (${escapeHtml(tok.email)}) has been verified for account id ${escapeHtml(tok.uid)}.</p><p>Return to the app.</p></body></html>`;
      return respond(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
      return respond('Invalid token format', { status: 400 });
    }
  }

  
  
  if (request.method === 'POST' && url.pathname === '/check-fingerprint-ban') {
    try {
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      if (!await rateAllowed(ip, 'check-fp-ban', 30, 60 * 1000, kvBinding)) {
        return respond(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
      
      const body = await request.json();
      const fingerprint = body && body.fingerprint;
      if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.length < 32) {
        return respond(JSON.stringify({ banned: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      const firebaseAccess = await getFirebaseAccessToken();
      if (!firebaseAccess) {
        
        return respond(JSON.stringify({ banned: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      const dbUrl = FIREBASE_DB_URL || FIREBASE_DB_URL_FROM_ENV();
      if (!dbUrl) {
        return respond(JSON.stringify({ banned: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      
      const safeFingerprint = encodeURIComponent(fingerprint);
      const banRes = await fetch(`${dbUrl}/bannedFingerprints/${safeFingerprint}.json?access_token=${firebaseAccess}`);
      if (banRes.ok) {
        const banData = await banRes.json();
        const isBanned = banData !== null && typeof banData === 'object';
        return respond(JSON.stringify({ banned: isBanned }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      return respond(JSON.stringify({ banned: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('check-fingerprint-ban error', e);
      
      return respond(JSON.stringify({ banned: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  
  if (request.method === 'POST' && url.pathname === '/ai') {
    try {
      const body = await request.json();
      const prompt = (body && (body.prompt || body.message || body.text)) || '';
      const history = (body && Array.isArray(body.history)) ? body.history : [];
      const username = (body && body.username) ? String(body.username).slice(0, 50) : 'User';
      if (!prompt) return respond(JSON.stringify({ error: 'Missing prompt' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      // Rate limit check before processing AI request
      const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      const aiRateOk = await rateAllowed(clientIp, 'ai', 30, 60000, kvBinding);
      if (!aiRateOk) {
        return respond(JSON.stringify({ error: 'Rate limit exceeded. Please wait before sending more requests.' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }

      const cerebrasKey = (typeof CEREBRAS_API_KEY !== 'undefined' ? CEREBRAS_API_KEY : (typeof CEREBRAS_API_KEY_FROM_ENV !== 'undefined' ? CEREBRAS_API_KEY_FROM_ENV() : null));
      if (!cerebrasKey) {
        
        const mock = `Hi ${username} — AI not configured on the server; echo: ${prompt}`;
        return respond(JSON.stringify({ ok: true, reply: mock }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      
      const messages = [
        {
          role: 'system',
          content: `You are Chatra AI, the friendly assistant for the Chatra chat application. You are currently talking to a user named "${username}". Only use their name occasionally (once every few messages) - don't start every reply with their name. Respond in English and identify yourself as Chatra AI only if directly asked who you are. Be helpful, concise, and follow community guidelines. Keep responses compact without excessive line breaks - use single line breaks sparingly. Remember context from previous messages in this conversation.`
        }
      ];
      
      
      for (const msg of history.slice(-10)) { 
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      
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
      
      let replyText = null;
      try {
        if (cereJson && cereJson.choices && cereJson.choices[0]) {
          
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
  
  const bytes = typeof len === 'number' ? len : 24;
  const rnd = crypto.getRandomValues(new Uint8Array(bytes));
  return base64UrlEncode(rnd);
}


async function getFirebaseAccessToken() {
  try {
    
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


function FIREBASE_DB_URL_FROM_ENV() { try { return FIREBASE_DB_URL; } catch(e) { return null; } }
function FIREBASE_SA_FROM_ENV() { try { return FIREBASE_SA; } catch(e) { return null; } }


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
