
      // --- GLOBAL ERROR LOGGING ---
      window.addEventListener("error", (event) => {
        console.error(
          "[window error]",
          event.message,
          "at",
          event.filename + ":" + event.lineno,
          "details:",
          event.error
        );
      });

      window.addEventListener("unhandledrejection", (event) => {
        console.error("[unhandled rejection]", event.reason);
      });

      // --- iPad/Safari Compatibility Fixes ---
      (function() {
        // Detect iPad Safari
        const isIPad = /iPad/.test(navigator.userAgent) || 
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        if (isIOS || (isIPad && isSafari)) {
          document.documentElement.classList.add('ios-device');
          console.log('[safari] iOS/iPad detected, applying fixes');
          
          // Fix 100vh issue - set CSS variable with actual viewport height
          function setViewportHeight() {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
            document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
          }
          setViewportHeight();
          window.addEventListener('resize', setViewportHeight);
          window.addEventListener('orientationchange', () => {
            setTimeout(setViewportHeight, 100);
          });
          
          // Handle visual viewport changes (keyboard open/close)
          if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
              const vh = window.visualViewport.height * 0.01;
              document.documentElement.style.setProperty('--vh', `${vh}px`);
              document.documentElement.style.setProperty('--keyboard-height', 
                `${window.innerHeight - window.visualViewport.height}px`);
              // Toggle keyboard-open class for CSS position:fixed rule
              const keyboardOpen = window.visualViewport.height < window.innerHeight * 0.75;
              document.body.classList.toggle('keyboard-open', keyboardOpen);
            });
          }
          
          // Fix iOS keyboard scroll issue
          document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
              // Small delay to let keyboard appear
              setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 300);
            }
          });
          
          // Prevent iOS bounce/overscroll on body
          document.body.addEventListener('touchmove', (e) => {
            if (e.target === document.body || e.target === document.documentElement) {
              e.preventDefault();
            }
          }, { passive: false });
          
          // Fix double-tap zoom on buttons
          let lastTouchEnd = 0;
          document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
              e.preventDefault();
            }
            lastTouchEnd = now;
          }, { passive: false });
        }
      })();

      // Helper function for detailed error logging
      function logDetailedError(context, error, additionalInfo = {}) {
        const errorObj = {
          timestamp: new Date().toISOString(),
          context,
          message: error?.message || String(error),
          code: error?.code,
          type: error?.constructor?.name,
          ...additionalInfo
        };
        console.error(`[ERROR] ${context}:`, errorObj);
        return errorObj;
      }

      // Simple local AI response generator (mock)
      function generateAiReply(query) {
        try {
          const q = (query || '').toLowerCase();
          if (!q) return "I'm here — ask me anything!";
          if (q.includes('hello') || q.includes('hi')) return 'Hello! How can I help you today?';
          if (q.includes('help')) return 'Sure — what do you need help with?';
          if (q.includes('rules')) return 'You can find the community rules in the header or ask a moderator.';
          if (q.includes('joke')) return 'Why did the developer go broke? Because he used up all his cache. 😄';
          if (q.length < 30) return `You asked: "${query}" — I think that sounds interesting. Tell me more.`;
          return `AI summary: ${query.slice(0, 140)}${query.length > 140 ? '...' : ''}`;
        } catch (e) {
          return "Sorry, I couldn't process that.";
        }
      }

      // Helper: convert data URL to Blob
      function dataURLToBlob(dataURL) {
        const parts = dataURL.split(',');
        const meta = parts[0];
        const base64 = parts[1];
        const isBase64 = meta.indexOf('base64') !== -1;
        const contentType = meta.split(':')[1].split(';')[0];
        let raw;
        if (isBase64) {
          raw = atob(base64);
        } else {
          raw = decodeURIComponent(parts[1]);
        }
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
          uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: contentType });
      }

      // Firebase configuration
      const firebaseConfig = {
        apiKey: "AIzaSyC945jY7UEh4sOOuuk7OMZVXeIh333kxVk",
        authDomain: "chat-app-710f0.firebaseapp.com",
        projectId: "chat-app-710f0",
        storageBucket: "chat-app-710f0.firebasestorage.app",
        messagingSenderId: "225892837672",
        appId: "1:225892837672:web:f190f3585c4ffbd0f1c81d",
        databaseURL: "https://chat-app-710f0-default-rtdb.firebaseio.com",
      };

      console.log("[init] starting firebase init");

      // Initialize Firebase
      firebase.initializeApp(firebaseConfig);
      // Initialize Firebase Analytics (skip on localhost to avoid Tracking Prevention warnings)
      if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        try {
          if (firebase && firebase.analytics) {
            try { firebase.analytics(); } catch (e) { console.warn('[analytics] firebase.analytics init failed', e); }
          }
        } catch (e) {}
      }
      const auth = firebase.auth();
      const db = firebase.database();

      // === Browser Fingerprint System (for hardware bans) ===
      // Device fingerprinting is used to prevent ban evasion.
      // This is disclosed in the Terms of Service and Privacy Policy.
      // By using Chatra, users agree to this security measure.
      
      // Feature toggle - can be disabled via config
      const FINGERPRINT_ENABLED = true; // Set to false to disable entire feature
      
      // Fail-closed mode: if true, server errors result in treating device as banned
      // If false (default), server errors allow access (fail-open)
      const FINGERPRINT_FAIL_CLOSED = false;
      
      let cachedFingerprint = null;
      
      // Canvas fingerprint is opt-in (more regulated under CCPA)
      // Consent stored in Firebase so it persists across devices/browsers
      let canvasConsentCache = null; // Cache to avoid repeated Firebase reads
      
      async function checkCanvasConsentFromFirebase(uid) {
        if (!uid) return false;
        try {
          // First check canvasConsentRecord (newer format with version tracking)
          const recordSnap = await db.ref('users/' + uid + '/canvasConsentRecord').once('value');
          const record = recordSnap.val();
          
          if (record && typeof record === 'object') {
            // If declined at current version, don't prompt again
            if (record.granted === false && (record.version || 0) >= CANVAS_CONSENT_VERSION) {
              return 'declined'; // Special value to indicate user declined
            }
            // If granted at current version, return true
            if (record.granted === true && (record.version || 0) >= CANVAS_CONSENT_VERSION) {
              return true;
            }
            // Version mismatch - re-prompt (return false to show modal)
          }
          
          // Fallback to legacy canvasConsent boolean
          const snap = await db.ref('users/' + uid + '/canvasConsent').once('value');
          return snap.val() === true;
        } catch (e) {
          return false;
        }
      }
      
      function hasCanvasConsent() {
        return canvasConsentCache === true;
      }
      
      // Consent version for tracking - increment when consent terms change
      const CANVAS_CONSENT_VERSION = 1;
      
      async function grantCanvasConsent(uid) {
        canvasConsentCache = true;
        cachedFingerprint = null; // Clear cache to regenerate with canvas
        if (uid) {
          try {
            // Record consent with timestamp, version, and user id for compliance
            await db.ref('users/' + uid + '/canvasConsent').set(true);
            await db.ref('users/' + uid + '/canvasConsentRecord').set({
              granted: true,
              timestamp: firebase.database.ServerValue.TIMESTAMP,
              version: CANVAS_CONSENT_VERSION,
              uid: uid
            });
            // Also record device consent (allows fingerprint storage)
            await db.ref('users/' + uid + '/deviceConsentRecord').set({
              granted: true,
              timestamp: firebase.database.ServerValue.TIMESTAMP,
              version: CANVAS_CONSENT_VERSION,
              uid: uid
            });
          } catch (e) {
            console.warn('[fingerprint] failed to save consent to Firebase:', e);
          }
        }
      }
      
      async function revokeCanvasConsent(uid) {
        canvasConsentCache = false;
        cachedFingerprint = null;
        if (uid) {
          try {
            await db.ref('users/' + uid + '/canvasConsent').set(false);
            await db.ref('users/' + uid + '/canvasConsentRecord').set({
              granted: false,
              revokedAt: firebase.database.ServerValue.TIMESTAMP,
              version: CANVAS_CONSENT_VERSION,
              uid: uid
            });
            // Also revoke device consent to prevent fingerprint re-storage on login
            await db.ref('users/' + uid + '/deviceConsentRecord').set({
              granted: false,
              revokedAt: firebase.database.ServerValue.TIMESTAMP,
              version: CANVAS_CONSENT_VERSION,
              uid: uid
            });
            // Remove stored fingerprint
            await db.ref('users/' + uid + '/fingerprint').remove();
            showToast('Device identification disabled and fingerprint data deleted', 'success');
          } catch (e) {
            console.warn('[fingerprint] failed to revoke consent:', e);
          }
        }
      }
      
      // Helper: Check if device consent is granted before storing fingerprint
      // Returns true if fingerprint can be stored, false if consent was revoked or on error
      async function hasDeviceConsent(uid) {
        if (!uid) return false;
        try {
          const snap = await db.ref('users/' + uid + '/deviceConsentRecord').once('value');
          const record = snap.val();
          // If record exists and was explicitly revoked, don't store fingerprint
          if (record && record.granted === false) {
            return false;
          }
          // Default to allowing fingerprint storage (security feature, not opt-in like canvas)
          // Users can opt-out via privacy settings which sets deviceConsentRecord.granted = false
          return true;
        } catch (e) {
          console.warn('[fingerprint] consent check failed, defaulting to deny:', e);
          return false; // fail-closed: no fingerprinting without confirmed consent
        }
      }
      
      // Helper: Store fingerprint only if device consent is granted
      async function storeFingerprint(uid) {
        if (!uid || !FINGERPRINT_ENABLED) return false;
        try {
          // Check if user has revoked device consent
          const hasConsent = await hasDeviceConsent(uid);
          if (!hasConsent) {
            console.log('[fingerprint] device consent revoked, not storing fingerprint');
            return false;
          }
          const fp = await generateBrowserFingerprint();
          if (fp) {
            await db.ref('users/' + uid + '/fingerprint').set(fp);
            console.log('[fingerprint] stored successfully');
            return true;
          }
        } catch (e) {
          console.warn('[fingerprint] storage failed:', e);
        }
        return false;
      }
      
      // Show/hide canvas consent modal (called from auth)
      function showCanvasConsentModal() {
        const modal = document.getElementById("canvasConsentModal");
        if (modal) {
          modal.classList.remove("modal-closed");
          modal.classList.add("modal-open");
        }
      }
      
      function hideCanvasConsentModal() {
        const modal = document.getElementById("canvasConsentModal");
        if (modal) {
          modal.classList.remove("modal-open");
          modal.classList.add("modal-closed");
        }
      }
      
      // Core fingerprint computation
      async function computeFingerprintHash() {
        const components = [];
        
        // === MANDATORY signals (always collected, disclosed in ToS/Privacy) ===
        
        // Screen properties
        components.push('scr:' + screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
        components.push('avail:' + screen.availWidth + 'x' + screen.availHeight);
        
        // Timezone
        components.push('tz:' + Intl.DateTimeFormat().resolvedOptions().timeZone);
        components.push('tzo:' + new Date().getTimezoneOffset());
        
        // Language
        components.push('lang:' + navigator.language);
        components.push('langs:' + (navigator.languages || []).join(','));
        
        // Platform
        components.push('plat:' + navigator.platform);
        
        // Hardware concurrency (CPU cores)
        components.push('cores:' + (navigator.hardwareConcurrency || 'unknown'));
        
        // Device memory (if available)
        components.push('mem:' + (navigator.deviceMemory || 'unknown'));
        
        // Touch support
        components.push('touch:' + ('ontouchstart' in window ? 'yes' : 'no'));
        components.push('maxt:' + (navigator.maxTouchPoints || 0));
        
        // WebGL fingerprint (vendor/renderer info - not as regulated as canvas)
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
              components.push('glv:' + gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
              components.push('glr:' + gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
            }
          }
        } catch (e) {
          components.push('webgl:error');
        }
        
        // === OPTIONAL signal (requires consent under CCPA) ===
        
        // Canvas fingerprint (unique to GPU/driver) - only if user consented
        if (hasCanvasConsent()) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 50;
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Chatra FP', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Browser', 4, 17);
            components.push('canvas:' + canvas.toDataURL().slice(-50));
          } catch (e) {
            components.push('canvas:error');
          }
        } else {
          components.push('canvas:not_consented');
        }
        
        // Create hash from components
        const fpString = components.join('|');
        return await hashString(fpString);
      }
      
      // Generate and cache fingerprint
      async function generateBrowserFingerprint() {
        if (!FINGERPRINT_ENABLED) return null;
        if (cachedFingerprint) return cachedFingerprint;
        
        try {
          const hash = await computeFingerprintHash();
          cachedFingerprint = hash;
          console.log('[fingerprint] generated browser fingerprint');
          return hash;
        } catch (e) {
          console.warn('[fingerprint] generation failed:', e);
          return null;
        }
      }
      
      async function hashString(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
      
      // Server-side fingerprint ban check (calls Cloud Function to avoid exposing ban list)
      // failClosed param overrides global FINGERPRINT_FAIL_CLOSED setting
      async function checkFingerprintBanViaServer(fp, failClosed = null) {
        const useFailClosed = failClosed !== null ? failClosed : FINGERPRINT_FAIL_CLOSED;
        
        try {
          // Call server endpoint that only returns boolean, not ban details
          const workerUrl = 'https://recovery-modmojheh.modmojheh.workers.dev';
          const res = await fetch(workerUrl + '/check-fingerprint-ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fingerprint: fp })
          });
          
          if (res.ok) {
            try {
              const data = await res.json();
              console.log('[fingerprint] server check success, banned:', data.banned);
              return { banned: data.banned === true, reason: data.banned ? 'Device restricted' : null };
            } catch (parseErr) {
              // JSON parse error - server returned OK but invalid JSON
              console.error('[fingerprint] server response parse error:', parseErr);
              if (useFailClosed) {
                return { banned: true, reason: 'Device verification failed' };
              }
              return { banned: false };
            }
          } else {
            // Server returned error status (4xx/5xx)
            console.error('[fingerprint] server error status:', res.status);
            if (useFailClosed) {
              return { banned: true, reason: 'Device verification unavailable' };
            }
            return { banned: false };
          }
        } catch (networkErr) {
          // Network-level error (no connection, timeout, etc.)
          console.warn('[fingerprint] network error:', networkErr.message || networkErr);
          // Network errors are typically fail-open even in fail-closed mode
          // to avoid blocking users due to temporary connectivity issues
          if (useFailClosed) {
            return { banned: true, reason: 'Device verification failed - check connection' };
          }
          return { banned: false };
        }
      }
      
      async function checkFingerprintBan() {
        if (!FINGERPRINT_ENABLED) {
          return { banned: false };
        }
        
        try {
          const fp = await generateBrowserFingerprint();
          if (!fp) {
            console.warn('[fingerprint] could not generate fingerprint');
            if (FINGERPRINT_FAIL_CLOSED) {
              return { banned: true, reason: 'Device verification failed' };
            }
            return { banned: false };
          }
          
          return await checkFingerprintBanViaServer(fp);
        } catch (e) {
          console.warn('[fingerprint] check failed:', e);
          if (FINGERPRINT_FAIL_CLOSED) {
            return { banned: true, reason: 'Device verification error' };
          }
          return { banned: false };
        }
      }
      
      async function banFingerprint(reason = 'Ban evasion') {
        if (!isAdmin) {
          console.error('[fingerprint] only admins can ban fingerprints');
          return false;
        }
        if (!FINGERPRINT_ENABLED) {
          console.error('[fingerprint] feature disabled');
          return false;
        }
        try {
          const fp = await generateBrowserFingerprint();
          if (!fp) {
            console.error('[fingerprint] cannot ban - no fingerprint available');
            return false;
          }
          await db.ref('bannedFingerprints/' + fp).set({
            reason: reason,
            timestamp: Date.now(),
            bannedBy: currentUserId
          });
          // Audit log
          await db.ref('auditLog/fingerprintBans').push({
            action: 'ban',
            fpHash: fp.slice(0, 16) + '...',
            reason: reason,
            adminUid: currentUserId,
            timestamp: Date.now()
          });
          console.log('[fingerprint] banned fingerprint:', fp.slice(0, 16) + '...');
          return true;
        } catch (e) {
          console.error('[fingerprint] failed to ban:', e);
          return false;
        }
      }
      
      async function banTargetFingerprint(targetFp, reason = 'Admin ban') {
        if (!isAdmin) {
          console.error('[fingerprint] only admins can ban fingerprints');
          return false;
        }
        if (!FINGERPRINT_ENABLED) {
          console.error('[fingerprint] feature disabled');
          return false;
        }
        if (!targetFp || targetFp.length < 32) {
          console.error('[fingerprint] invalid fingerprint hash');
          return false;
        }
        try {
          await db.ref('bannedFingerprints/' + targetFp).set({
            reason: reason,
            timestamp: Date.now(),
            bannedBy: currentUserId
          });
          // Audit log
          await db.ref('auditLog/fingerprintBans').push({
            action: 'ban',
            fpHash: targetFp.slice(0, 16) + '...',
            reason: reason,
            adminUid: currentUserId,
            timestamp: Date.now()
          });
          console.log('[fingerprint] banned target fingerprint:', targetFp.slice(0, 16) + '...');
          return true;
        } catch (e) {
          console.error('[fingerprint] failed to ban target:', e);
          return false;
        }
      }
      
      async function unbanFingerprint(fpHash) {
        if (!isAdmin) {
          console.error('[fingerprint] only admins can unban fingerprints');
          return false;
        }
        try {
          await db.ref('bannedFingerprints/' + fpHash).remove();
          // Audit log
          await db.ref('auditLog/fingerprintBans').push({
            action: 'unban',
            fpHash: fpHash.slice(0, 16) + '...',
            adminUid: currentUserId,
            timestamp: Date.now()
          });
          console.log('[fingerprint] unbanned fingerprint:', fpHash.slice(0, 16) + '...');
          return true;
        } catch (e) {
          console.error('[fingerprint] failed to unban:', e);
          return false;
        }
      }

      // === Online Presence System ===
      let presenceRef = null;
      let connectedRef = null;
      
      function setupPresence(uid) {
        console.log('[presence] setupPresence called for uid:', uid);
        // Track user's online presence
        presenceRef = db.ref('presence/' + uid);
        connectedRef = db.ref('.info/connected');
        
        connectedRef.on('value', (snap) => {
          console.log('[presence] .info/connected value:', snap.val());
          if (snap.val() === true) {
            // User is online
            console.log('[presence] Setting online status for', uid);
            presenceRef.set({
              state: 'online',
              lastChanged: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
              console.log('[presence] Successfully set online status');
            }).catch((err) => {
              console.error('[presence] Error setting online status:', err);
            });
            
            // Remove presence on disconnect
            presenceRef.onDisconnect().set({
              state: 'offline',
              lastChanged: firebase.database.ServerValue.TIMESTAMP
            });
          }
        });
      }
      
      // Cache of online users for quick lookup
      let onlineUsersCache = {};
      
      function startOnlineCountListener() {
        console.log('[presence] startOnlineCountListener called');
        // Listen to all presence entries and count online users
        db.ref('presence').on('value', (snap) => {
          const data = snap.val() || {};
          console.log('[presence] Raw presence data:', data);
          let onlineCount = 0;
          
          // Update cache
          onlineUsersCache = {};
          Object.entries(data).forEach(([uid, presence]) => {
            console.log('[presence] User', uid, 'state:', presence.state);
            if (presence.state === 'online') {
              onlineCount++;
              onlineUsersCache[uid] = true;
            }
          });
          
          console.log('[presence] Online count:', onlineCount);
          
          // Update UI
          const countEl = document.getElementById('onlineCount');
          console.log('[presence] Count element found:', !!countEl);
          if (countEl) {
            countEl.textContent = onlineCount;
          }
        }, (err) => {
          console.error('[presence] Error listening to presence:', err);
        });
      }
      
      function isUserOnline(uid) {
        return onlineUsersCache[uid] === true;
      }

      // AI bot UID - this is the account the AI posts messages as
      const AI_BOT_UID = 'aEY7gNeuGcfBErxOHNEQYFzvhpp2';
      // AI admin UID (can edit AI settings)
      const AI_ADMIN_UID = 'aEY7gNeuGcfBErxOHNEQYFzvhpp2';
      
      // AI bot profile - loaded from the actual user's profile
      let aiProfile = { name: 'Chatra AI', avatar: null, bio: '', username: 'AI' };
      
      // AI short-term memory per user (max 1000 chars per user)
      const AI_MEMORY_LIMIT = 1000;
      const aiConversationMemory = new Map(); // userId -> { username: string, history: [{role: 'user'|'assistant', content: string}] }
      
      function addToAiMemory(userId, role, content, username = null) {
        if (!aiConversationMemory.has(userId)) {
          aiConversationMemory.set(userId, { username: username || 'User', history: [] });
        }
        const memEntry = aiConversationMemory.get(userId);
        if (username) memEntry.username = username;
        memEntry.history.push({ role, content });
        // Trim to keep under 1000 chars total
        let totalChars = memEntry.history.reduce((sum, m) => sum + m.content.length, 0);
        while (totalChars > AI_MEMORY_LIMIT && memEntry.history.length > 1) {
          const removed = memEntry.history.shift();
          totalChars -= removed.content.length;
        }
      }
      
      function getAiMemory(userId) {
        const memEntry = aiConversationMemory.get(userId);
        return memEntry ? memEntry.history : [];
      }
      
      function getAiUsername(userId) {
        const memEntry = aiConversationMemory.get(userId);
        return memEntry ? memEntry.username : 'User';
      }
      
      function clearAiMemory(userId) {
        aiConversationMemory.delete(userId);
      }
      
      // Load AI bot's actual user profile
      function loadAiBotProfile() {
        db.ref('users/' + AI_BOT_UID).once('value').then(snap => {
          if (snap.exists()) {
            aiProfile.username = 'Chatra AI';
          }
        });
        db.ref('userProfiles/' + AI_BOT_UID).on('value', snap => {
          if (snap.exists()) {
            const p = snap.val();
            aiProfile.avatar = p.avatarUrl || p.profilePic || null;
            aiProfile.bio = p.bio || '';
          }
          updateAiEditButtonVisibility();
        });
      }
      loadAiBotProfile();

      // Add an admin-only button to edit AI profile
      function ensureAiEditButton() {
        if (document.getElementById('editAiProfileBtn')) return document.getElementById('editAiProfileBtn');
        const btn = document.createElement('button');
        btn.id = 'editAiProfileBtn';
        btn.textContent = 'Edit AI Profile';
        btn.style.marginLeft = '8px';
        btn.className = 'ai-edit-btn';
        btn.addEventListener('click', async () => {
          try {
            const action = prompt("Edit AI profile. Type one of: name, url, upload, bio (cancel to exit)", "name");
            if (!action) return;
            const a = action.trim().toLowerCase();
            if (a === 'name') {
              const newName = prompt('AI display name:', aiProfile.name || 'AI Assistant');
              if (newName === null) return;
              await aiProfileRef.child('name').set(newName.trim() || 'AI Assistant');
              showToast('AI name updated', 'success');
              return;
            }
            if (a === 'bio') {
              const newBio = prompt('AI bio/description (optional):', aiProfile.bio || '');
              if (newBio === null) return;
              await aiProfileRef.child('bio').set(newBio.trim() || '');
              showToast('AI bio updated', 'success');
              return;
            }
            if (a === 'url') {
              const newAvatar = prompt('AI avatar image URL (optional):', aiProfile.avatar || '');
              if (newAvatar === null) return;
              await aiProfileRef.child('avatar').set(newAvatar.trim() || null);
              showToast('AI avatar URL updated', 'success');
              return;
            }

            if (a === 'upload') {
              // Upload an image via the Cloudflare Worker upload endpoint
              const uploadWorkerUrl = 'https://chatra.modmojheh.workers.dev';
              if (!uploadWorkerUrl || uploadWorkerUrl.includes('your-worker-subdomain')) {
                showToast('Upload worker not configured', 'error');
                return;
              }

              const file = await new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
                input.click();
              });
              if (!file) return;

              try {
                const processed = await prepareFileForUpload(file);
                const fd = new FormData();
                fd.append('file', processed);
                const res = await fetch(uploadWorkerUrl + '/upload', { method: 'POST', body: fd });
                let data;
                try { data = await res.json(); } catch (e) { const txt = await res.text(); throw new Error('Upload failed: ' + txt); }
                if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed');
                await aiProfileRef.child('avatar').set(data.url);
                showToast('AI avatar uploaded', 'success');
              } catch (upErr) {
                console.error('[AI] upload error', upErr);
                showToast('AI avatar upload failed: ' + upErr.message, 'error');
              }
              return;
            }

            showToast('Unknown action. Valid: name, url, upload, bio', 'error');
          } catch (e) {
            console.error('[AI] error updating profile', e);
            showToast('Failed to update AI profile', 'error');
          }
        });

        // Prefer placing near logout button if present
        try {
          const container = document.getElementById('chatUserLabel')?.parentElement || document.body;
          container.appendChild(btn);
        } catch (e) {
          document.body.appendChild(btn);
        }
        return btn;
      }

      function updateAiEditButtonVisibility() {
        const btn = document.getElementById('editAiProfileBtn') || ensureAiEditButton();
        const uid = auth.currentUser ? auth.currentUser.uid : null;
        if (uid === AI_ADMIN_UID) {
          btn.style.display = '';
        } else {
          btn.style.display = 'none';
        }
      }

      // Analytics helper: sends to gtag and firebase.analytics (if available)
      // Skip entirely on localhost to avoid Tracking Prevention console spam
      function sendAnalyticsEvent(name, params = {}) {
        // Skip analytics on localhost
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
        try {
          if (window.gtag) {
            try { window.gtag('event', name, params); } catch (e) { /* ignore */ }
          }
        } catch (e) {}
        try {
          if (firebase && firebase.analytics) {
            try { firebase.analytics().logEvent(name, params); } catch (e) { /* ignore */ }
          }
        } catch (e) {}
      }

      console.log("[init] firebase initialized");

      // DOM elements
      const loginForm = document.getElementById("loginForm");
      const registerForm = document.getElementById("registerForm");
      const chatInterface = document.getElementById("chatInterface");
      const loadingScreen = document.getElementById("loadingScreen");

      // Ensure loading screen is visible immediately while we check auth state
      if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
      }

      const loginUsernameInput = document.getElementById("loginUsername");
      const loginPasswordInput = document.getElementById("loginPassword");
      const rememberMeCheckbox = document.getElementById("rememberMe");
      const loginBtn = document.getElementById("loginBtn");
      const requestRecoveryBtn = document.getElementById("requestRecoveryBtn");
      const loginError = document.getElementById("loginError");
      const loginInfo = document.getElementById("loginInfo");

      const regUsernameInput = document.getElementById("regUsername");
      const regPasswordInput = document.getElementById("regPassword");
      const regPasswordConfirmInput =
        document.getElementById("regPasswordConfirm");
      const regRecoveryEmailInput = document.getElementById("regRecoveryEmail");
      const registerBtn = document.getElementById("registerBtn");
      const registerError = document.getElementById("registerError");

      const msgInput = document.getElementById("msgInput");
      const sendBtn = document.getElementById("sendBtn");
      const messagesDiv = document.getElementById("messages");
      const messageForm = document.getElementById("messageForm");
      const sendWarningEl = document.getElementById("sendWarning");
      const typingIndicatorEl = document.getElementById("typingIndicator");
      const warningPopup = document.getElementById("warningPopup");
      const warningReason = document.getElementById("warningReason");
      const warningAgree = document.getElementById("warningAgree");
      const closeWarningBtn = document.getElementById("closeWarningBtn");
      const muteInlineBanner = document.getElementById("muteInlineBanner");
      const muteInlineText = document.getElementById("muteInlineText");
      const ratingModal = document.getElementById("ratingModal");
      const ratingStars = Array.from(document.querySelectorAll("#ratingStars .rating-star"));
      const ratingFeedbackWrap = document.getElementById("ratingFeedbackWrap");
      const ratingFeedbackInput = document.getElementById("ratingFeedback");
      const ratingDontShowCheckbox = document.getElementById("ratingDontShow");
      const ratingErrorEl = document.getElementById("ratingError");
      const ratingCloseBtn = document.getElementById("ratingCloseBtn");
      const ratingLaterBtn = document.getElementById("ratingLaterBtn");
      const ratingSubmitBtn = document.getElementById("ratingSubmitBtn");

      const registerLink = document.getElementById("registerLink");
      const loginLink = document.getElementById("loginLink");
      const logoutBtn = document.getElementById("logoutBtn");
      const chatUserLabel = document.getElementById("chatUserLabel");

      // Community Guidelines modal elements (shown once per account, saved to Firebase)
      const guidelinesModal = document.getElementById("guidelinesModal");
      const guidelinesAgreeBtn = document.getElementById("guidelinesAgreeBtn");
      const guidelinesCheckbox = document.getElementById("guidelinesCheckbox");

      // Enable/disable agree button based on checkbox
      if (guidelinesCheckbox && guidelinesAgreeBtn) {
        guidelinesCheckbox.addEventListener('change', () => {
          if (guidelinesCheckbox.checked) {
            guidelinesAgreeBtn.disabled = false;
            guidelinesAgreeBtn.classList.remove('bg-slate-700', 'text-slate-500', 'cursor-not-allowed');
            guidelinesAgreeBtn.classList.add('bg-sky-600', 'hover:bg-sky-700', 'text-slate-100', 'cursor-pointer');
            guidelinesAgreeBtn.textContent = 'I Agree - Continue to Chatra';
          } else {
            guidelinesAgreeBtn.disabled = true;
            guidelinesAgreeBtn.classList.add('bg-slate-700', 'text-slate-500', 'cursor-not-allowed');
            guidelinesAgreeBtn.classList.remove('bg-sky-600', 'hover:bg-sky-700', 'text-slate-100', 'cursor-pointer');
            guidelinesAgreeBtn.textContent = 'Check the box above to continue';
          }
        });
      }

      // Helper to reset guidelines modal to initial state
      function resetGuidelinesModal() {
        if (guidelinesCheckbox) {
          guidelinesCheckbox.checked = false;
        }
        if (guidelinesAgreeBtn) {
          guidelinesAgreeBtn.disabled = true;
          guidelinesAgreeBtn.classList.remove('bg-sky-600', 'hover:bg-sky-700', 'text-slate-100', 'cursor-pointer');
          guidelinesAgreeBtn.classList.add('bg-slate-700', 'text-slate-500', 'cursor-not-allowed');
          guidelinesAgreeBtn.textContent = 'Check the box above to continue';
        }
      }

      // Show guidelines modal if user hasn't accepted (check Firebase)
      // Returns a Promise that resolves when guidelines are accepted (or immediately if already accepted)
      let guidelinesAcceptedResolver = null;
      async function checkAndShowGuidelines(uid) {
        if (!uid || !guidelinesModal) return Promise.resolve();
        try {
          const snap = await firebase.database().ref(`users/${uid}/guidelinesAccepted`).once('value');
          if (!snap.exists() || snap.val() !== true) {
            // Reset modal state before showing
            resetGuidelinesModal();
            // Show modal - user hasn't accepted yet
            guidelinesModal.classList.remove('modal-closed');
            guidelinesModal.classList.add('modal-open');
            // Return a promise that resolves when user accepts
            return new Promise(resolve => {
              guidelinesAcceptedResolver = resolve;
            });
          }
        } catch (e) {
          console.error('Error checking guidelines acceptance:', e);
        }
        return Promise.resolve();
      }

      // Save guidelines acceptance to Firebase
      if (guidelinesAgreeBtn) {
        guidelinesAgreeBtn.addEventListener('click', async () => {
          if (guidelinesAgreeBtn.disabled) return;
          const user = firebase.auth().currentUser;
          if (!user) return;
          
          try {
            // Save to Firebase
            await firebase.database().ref(`users/${user.uid}/guidelinesAccepted`).set(true);
            await firebase.database().ref(`users/${user.uid}/guidelinesAcceptedAt`).set(firebase.database.ServerValue.TIMESTAMP);
            
            // Also save to localStorage as backup
            try { localStorage.setItem('chatra_guidelines_ack', '1'); } catch (e) {}
            
            // Close modal
            guidelinesModal.classList.add('modal-closed');
            guidelinesModal.classList.remove('modal-open');
            
            // Reset modal state for next time
            resetGuidelinesModal();
            
            // Resolve the waiting promise so walkthrough can start
            if (guidelinesAcceptedResolver) {
              guidelinesAcceptedResolver();
              guidelinesAcceptedResolver = null;
            }
          } catch (e) {
            console.error('Error saving guidelines acceptance:', e);
            showToast('Error saving. Please try again.', 'error');
          }
        });
      }

      // Global state
      let currentUsername = null; // SINGLE SOURCE for username
      let currentUserId = null;

      // DM state
      let activeDMThread = null;
      let activeDMTarget = null; // { uid, username }
      let dmMessagesRef = null;
      let dmMessagesListener = null;
      let dmInboxRef = null;
      let dmInboxListener = null;
      let dmUnreadCounts = {}; // threadId -> count
      let dmLastSeenByThread = {};
      let dmLastUpdateTimeByThread = {}; // Track last update time per thread to avoid duplicate notifs
      let dmInboxInitialLoaded = false;

      // Groups state
      let activeGroupId = null;
      let groupMessagesRef = null;
      let groupMessagesListener = null;
      let groupsPageInitialLoaded = false;
      let cachedGroups = {}; // Cache groups for search filtering

      // Toast notification system (styled inline alerts)
      function showToast(message, type = 'info', duration = 4000) {
        // Remove existing toast if any
        const existing = document.getElementById('globalToast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.id = 'globalToast';
        const bgColor = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-slate-700';
        toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-[9999] text-sm font-medium max-w-xs text-center animate-fade-in`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s';
          setTimeout(() => toast.remove(), 300);
        }, duration);
      }

      // Moderation state
      let isAdmin = false;
      let isMuted = false;
      let adminRef = null;
      let adminListener = null;
      let muteRef = null;
      let muteListener = null;
      let warningRef = null;
      let warningListener = null;
      let banRef = null;
      let banListener = null;
      let banCountdownInterval = null;
      let banLogoutTimeout = null;

      // User settings stored in Firebase (no localStorage)
      let userSettingsRef = null;
      async function saveUserSetting(key, value) {
        if (!currentUserId) return;
        try {
          const ref = db.ref("userSettings/" + currentUserId + "/" + key);
          await ref.set(value);
        } catch (err) {
          console.warn("[settings] failed to save", key, err);
        }
      }

      async function loadUserSettings() {
        if (!currentUserId) return { theme: "dark", messageSize: "medium", fastMode: false, ratingOptOut: false, ratingLastPrompt: 0 };
        userSettingsRef = db.ref("userSettings/" + currentUserId);
        try {
          const snap = await userSettingsRef.once("value");
          const data = snap.val() || {};
          return {
            theme: data.theme || "dark",
            messageSize: data.messageSize || "medium",
            fastMode: data.fastMode === true,
            ratingOptOut: data.ratingOptOut === true,
            ratingLastPrompt: data.ratingLastPrompt || 0,
          };
        } catch (err) {
          console.warn("[settings] failed to load user settings", err);
          return { theme: "dark", messageSize: "medium", fastMode: false, ratingOptOut: false, ratingLastPrompt: 0 };
        }
      }

      // Friends + notifications
      let friendsCache = new Set();
      let notificationHistory = [];
      let clearedNotificationThreads = new Set(); // Track cleared DM threads
      
      function loadClearedNotifications() {
        if (!currentUserId) return;
        db.ref("userSettings/" + currentUserId + "/clearedNotifications").once("value", (snap) => {
          const cleared = snap.val() || [];
          clearedNotificationThreads = new Set(Array.isArray(cleared) ? cleared : []);
        }).catch(() => {
          clearedNotificationThreads = new Set();
        });
      }
      
      async function saveClearedNotifications() {
        if (!currentUserId) return;
        try {
          await db.ref("userSettings/" + currentUserId + "/clearedNotifications").set(Array.from(clearedNotificationThreads));
        } catch (err) {}
      }
      let originalProfilePic = null;
      let originalProfilePicDeleteToken = null;

      // Message removal listener
      let messagesRemoveRef = null;
      let messagesRemoveListener = null;

      // Real-time messages
      let messagesRef = null;      // realtime ref for new messages
      let messagesListener = null; // child_added listener
      const seenMessageKeys = new Set();
      let blockedUsersCache = new Set(); // Cache of blocked user UIDs
      let reportedMessages = new Set(); // locally-track reported message IDs to prevent duplicate reports

      // @Mention system state
      let mentionAutocomplete = null; // DOM element for autocomplete dropdown
      let mentionUsers = new Map(); // Map of username -> { username, profilePic, uid }
      let mentionSelectedIndex = 0;
      let mentionQuery = "";
      let mentionStartPos = -1;
      let activeMentionInput = null; // Track which input is currently being used for mentions
      // Track which mention message IDs we've already notified for (persist across refresh in sessionStorage)
      let mentionNotified = new Set();

      // GIF helper functions
      function isGifUrl(url) {
        if (!url) return false;
        const lower = url.toLowerCase();
        return lower.includes('.gif') || lower.includes('gif');
      }

      function replayGif(imgElement) {
        if (!imgElement || !imgElement.src) return;
        // Remove any existing cache-busting param
        let src = imgElement.src.split('?')[0];
        // Add cache-busting param to force full reload
        const cacheBuster = '?t=' + Date.now();
        imgElement.src = '';
        // Small delay to ensure browser reloads
        setTimeout(() => {
          imgElement.src = src + cacheBuster;
        }, 50);
      }

      function loadMentionedNotifsFromStorage() {
        try {
          const raw = localStorage.getItem('mentions-notified');
          if (raw) {
            const arr = JSON.parse(raw);
            mentionNotified = new Set(Array.isArray(arr) ? arr : []);
          }
        } catch (e) {
          mentionNotified = new Set();
        }
      }

      function markMentionNotified(id) {
        try {
          if (!id) return;
          mentionNotified.add(id);
          localStorage.setItem('mentions-notified', JSON.stringify(Array.from(mentionNotified)));
        } catch (e) {
          // ignore
        }
      }

      // === PAGE NAVIGATION (Global Chat <-> DMs) ===
      let currentPage = 'global'; // 'global' or 'dms'
      let dmPageMessagesRef = null;
      let dmPageMessagesListener = null;

      // Update nav slider position for the sliding tab indicator
      function updateNavSlider(activeTab) {
        const slider = document.getElementById('navSlider');
        const container = document.getElementById('navTabsContainer');
        if (!slider || !container || !activeTab) return;
        
        const containerRect = container.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        const leftOffset = tabRect.left - containerRect.left;
        
        // Check if fast mode is on
        const fastMode = localStorage.getItem('fastMode') === 'true';
        
        if (fastMode) {
          slider.style.transition = 'none';
        } else {
          slider.style.transition = 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }
        
        slider.style.left = leftOffset + 'px';
        slider.style.width = tabRect.width + 'px';
      }

      function switchToPage(page) {
        currentPage = page;
        const chatInterface = document.getElementById('chatInterface');
        const dmPage = document.getElementById('dmPage');
        
        // Nav buttons in both headers
        const navGlobal = document.getElementById('navGlobalChat');
        const navDMs = document.getElementById('navDMs');
        const navGroups = document.getElementById('navGroups');
        const navGlobal2 = document.getElementById('navGlobalChat2');
        const navDMs2 = document.getElementById('navDMs2');
        const navGroups2 = document.getElementById('navGroups2');
        
        if (page === 'global') {
          // Show Global Chat, hide DMs and Groups
          if (chatInterface) chatInterface.classList.remove('hidden');
          if (dmPage) dmPage.classList.add('hidden');
          const groupsPage = document.getElementById('groupsPage');
          if (groupsPage) groupsPage.classList.add('hidden');
          
          // Update active states
          navGlobal?.classList.add('active');
          navDMs?.classList.remove('active');
          navGroups?.classList.remove('active');
          navGlobal2?.classList.add('active');
          navDMs2?.classList.remove('active');
          navGroups2?.classList.remove('active');
          // Update slider position
          updateNavSlider(navGlobal);
          // Show header Staff Applications button on Global page
          const headerStaffApp = document.getElementById('headerStaffApp');
          if (headerStaffApp) headerStaffApp.classList.remove('hidden');
        } else if (page === 'dms') {
          // Hide Global Chat, show DMs
          if (chatInterface) chatInterface.classList.add('hidden');
          if (dmPage) dmPage.classList.remove('hidden');
          const groupsPage = document.getElementById('groupsPage');
          if (groupsPage) groupsPage.classList.add('hidden');
          
          // Update active states
          navGlobal?.classList.remove('active');
          navDMs?.classList.add('active');
          navGroups?.classList.remove('active');
          navGlobal2?.classList.remove('active');
          navDMs2?.classList.add('active');
          navGroups2?.classList.remove('active');
          // Update slider position
          updateNavSlider(navDMs);
          
          // Initialize DM page
          initDmPage();
          // Hide header Staff Applications button when in DMs
          const headerStaffApp = document.getElementById('headerStaffApp');
          if (headerStaffApp) headerStaffApp.classList.add('hidden');
        } else if (page === 'groups') {
          // Hide Global Chat and DMs, show Groups
          if (chatInterface) chatInterface.classList.add('hidden');
          if (dmPage) dmPage.classList.add('hidden');
          const groupsPage = document.getElementById('groupsPage');
          if (groupsPage) groupsPage.classList.remove('hidden');

          // Update active states
          navGlobal?.classList.remove('active');
          navDMs?.classList.remove('active');
          navGroups?.classList.add('active');
          navGlobal2?.classList.remove('active');
          navDMs2?.classList.remove('active');
          navGroups2?.classList.add('active');
          // Update slider position
          updateNavSlider(navGroups);

          // Initialize Groups page
          initGroupsPage();
          const headerStaffApp = document.getElementById('headerStaffApp');
          if (headerStaffApp) headerStaffApp.classList.add('hidden');
        }
      }

      function initDmPage() {
        // Set username in DM page header
        const dmPageUserLabel = document.getElementById('dmPageUserLabel');
        if (dmPageUserLabel && currentUsername) {
          dmPageUserLabel.textContent = currentUsername;
        }
        // Ensure inbox listener exists (re-attach if modal closed detached it)
        if (!dmInboxRef) {
          loadDmInbox().catch(() => {});
        }
        // Load conversations
        loadDmPageConversations();
      }

      // === Groups Page ===
      async function initGroupsPage() {
        const label = document.getElementById('groupsPageUserLabel');
        if (label && currentUsername) label.textContent = currentUsername;
        
        // Setup search input listener
        const searchInput = document.getElementById('groupsPageInputSearch');
        if (searchInput && !searchInput.dataset.listenerAdded) {
          searchInput.dataset.listenerAdded = 'true';
          searchInput.addEventListener('input', () => {
            filterGroupsList(searchInput.value);
          });
        }
        
        if (!groupsPageInitialLoaded) {
          groupsPageInitialLoaded = true;
          loadGroupsPageConversations().catch(() => {});
        }
      }
      
      function filterGroupsList(query) {
        const listEl = document.getElementById('groupsPageConversationList');
        if (!listEl) return;
        
        const q = (query || '').toLowerCase().trim();
        
        // Render filtered groups from cache
        renderGroupsList(cachedGroups, q);
      }
      
      // Track which tab is active: 'yours' or 'discover'
      let activeGroupTab = 'yours';
      
      function renderGroupsList(groups, filterQuery = '') {
        const listEl = document.getElementById('groupsPageConversationList');
        if (!listEl) return;
        
        listEl.innerHTML = '';
        
        // Separate groups into "yours" and "discover"
        const yourGroups = [];
        const publicGroups = [];
        
        Object.entries(groups).forEach(([groupId, info]) => {
          if (!info) return;
          const isMember = info.members && info.members[currentUserId];
          const isPublic = info.isPublic === true;
          
          // Compute memberCount once and cache it
          const memberCount = info.members ? Object.keys(info.members).filter(k => info.members[k]).length : 0;
          
          // Filter by search query
          const name = info.name || ('Group ' + groupId);
          if (filterQuery && !name.toLowerCase().includes(filterQuery) && !groupId.toLowerCase().includes(filterQuery)) {
            return;
          }
          
          // Your Groups: ALL groups you're a member of (public AND private)
          if (isMember) {
            yourGroups.push({ groupId, info, memberCount });
          }
          // Discover: all PUBLIC groups (including ones you're in, shown with 'Joined' badge)
          if (isPublic || isAdmin) {
            publicGroups.push({ groupId, info, memberCount });
          }
        });
        
        // Sort public groups by member count (most popular first) - use cached count
        publicGroups.sort((a, b) => b.memberCount - a.memberCount);
        
        const groupsToShow = activeGroupTab === 'yours' ? yourGroups : publicGroups;
        
        if (groupsToShow.length === 0) {
          listEl.innerHTML = activeGroupTab === 'yours'
            ? '<p class="text-xs text-slate-500 text-center py-4">You haven\'t joined any groups yet</p>'
            : '<p class="text-xs text-slate-500 text-center py-4">No public groups available</p>';
          return;
        }
        
        groupsToShow.forEach(({ groupId, info, memberCount }) => {
          const name = info.name || ('Group ' + groupId);
          const maxMembers = info.maxMembers || 0;
          const isFull = maxMembers > 0 && memberCount >= maxMembers;
          const isMember = info.members && info.members[currentUserId];
          const isPrivate = info.isPublic !== true;
          
          const row = document.createElement('div');
          row.className = 'w-full px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-slate-700/50 rounded-lg transition-colors flex items-center gap-3';
          
          // Group avatar
          const avatar = document.createElement('div');
          avatar.className = 'w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0';
          if (info.photo) {
            avatar.innerHTML = `<img src="${info.photo}" class="w-full h-full object-cover" alt="" />`;
          } else {
            avatar.textContent = name.charAt(0).toUpperCase();
          }
          
          // Group info
          const infoDiv = document.createElement('div');
          infoDiv.className = 'flex-1 min-w-0 cursor-pointer';
          
          // Name with privacy indicator for Your Groups
          const nameP = document.createElement('p');
          nameP.className = 'font-medium truncate flex items-center gap-1.5';
          nameP.textContent = name;
          if (activeGroupTab === 'yours' && isPrivate) {
            const lockIcon = document.createElement('span');
            lockIcon.className = 'text-slate-500 text-xs';
            lockIcon.textContent = '🔒';
            lockIcon.title = 'Private group';
            nameP.appendChild(lockIcon);
          }
          
          // Description or member count
          const descP = document.createElement('p');
          descP.className = 'text-xs text-slate-400 truncate';
          
          // In Discover tab, show description if available, otherwise member count
          if (activeGroupTab === 'discover' && info.description) {
            descP.textContent = info.description.substring(0, 60) + (info.description.length > 60 ? '...' : '');
          } else {
            descP.textContent = maxMembers > 0 
              ? `${memberCount}/${maxMembers} members` 
              : (memberCount === 1 ? '1 member' : memberCount + ' members');
          }
          
          infoDiv.appendChild(nameP);
          infoDiv.appendChild(descP);
          
          row.appendChild(avatar);
          row.appendChild(infoDiv);
          
          // For discover tab, show join button or joined badge
          if (activeGroupTab === 'discover') {
            if (isMember) {
              const joinedBadge = document.createElement('span');
              joinedBadge.className = 'px-3 py-1.5 rounded-lg bg-slate-600 text-slate-300 text-xs font-medium';
              joinedBadge.textContent = 'Joined';
              row.appendChild(joinedBadge);
            } else {
              const joinBtn = document.createElement('button');
              joinBtn.className = isFull 
                ? 'px-3 py-1.5 rounded-lg bg-slate-600 text-slate-400 text-xs font-medium cursor-not-allowed'
                : 'px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium';
              joinBtn.textContent = isFull ? 'Full' : 'Join';
              joinBtn.disabled = isFull;
              if (!isFull) {
                joinBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  await joinPublicGroup(groupId, info);
                });
              }
              row.appendChild(joinBtn);
            }
          }
          
          // Click on row to open group (if member or in your groups tab)
          if (isMember || activeGroupTab === 'yours') {
            infoDiv.addEventListener('click', () => openGroupsPageThread(groupId, info));
            avatar.style.cursor = 'pointer';
            avatar.addEventListener('click', () => openGroupsPageThread(groupId, info));
          }
          
          listEl.appendChild(row);
        });
      }
      
      // Centralized capacity check - returns true if user can join, false if full
      // Owners and site admins bypass the limit
      function canJoinGroup(groupInfo, joiningUserId) {
        if (!groupInfo) return false;
        const maxMembers = groupInfo.maxMembers || 0;
        if (maxMembers <= 0) return true; // No limit
        
        // Owners and site admins bypass
        if (groupInfo.owner === joiningUserId || isAdmin) return true;
        
        const memberCount = groupInfo.memberCount || (groupInfo.members ? Object.keys(groupInfo.members).filter(k => groupInfo.members[k]).length : 0);
        return memberCount < maxMembers;
      }
      
      // Atomic join with memberCount transaction - returns true if joined, false if full/failed
      async function atomicJoinGroup(groupId, uid) {
        const memberRef = db.ref('groups/' + groupId + '/members/' + uid);
        const countRef = db.ref('groups/' + groupId + '/memberCount');
        
        // First set membership
        await memberRef.set(true);
        
        // Then atomically increment memberCount (rules enforce capacity)
        try {
          await countRef.transaction((count) => (count || 0) + 1);
          return true;
        } catch (e) {
          // If transaction fails due to capacity, remove membership
          console.error('memberCount transaction failed:', e);
          await memberRef.remove();
          return false;
        }
      }
      
      // Atomic leave - decrement memberCount
      async function atomicLeaveGroup(groupId, uid) {
        const memberRef = db.ref('groups/' + groupId + '/members/' + uid);
        const countRef = db.ref('groups/' + groupId + '/memberCount');
        
        await memberRef.remove();
        
        try {
          await countRef.transaction((count) => Math.max(0, (count || 1) - 1));
        } catch (e) {
          console.warn('memberCount decrement failed:', e);
        }
      }
      
      async function joinPublicGroup(groupId, info) {
        if (!currentUserId || !groupId) return;
        
        // Check if already a member
        if (info.members && info.members[currentUserId]) {
          showToast('You\'re already in this group!', 'info');
          activeGroupTab = 'yours';
          updateGroupTabs();
          openGroupsPageThread(groupId, info);
          return;
        }
        
        // Check capacity (pre-check, atomic enforcement via memberCount)
        if (!canJoinGroup(info, currentUserId)) {
          showToast('This group is full', 'error');
          return;
        }
        
        try {
          // Atomic join with memberCount transaction (rules enforce capacity)
          const joined = await atomicJoinGroup(groupId, currentUserId);
          if (!joined) {
            showToast('This group is full', 'error');
            return;
          }
          
          // Add system message
          await db.ref('groups/' + groupId + '/messages').push({
            fromUid: 'system',
            fromUsername: 'System',
            text: `${currentUsername} joined the group`,
            time: Date.now(),
            isSystem: true
          });
          
          showToast('Joined group!', 'success');
          await loadGroupsPageConversations();
          
          // Switch to your groups tab and open with fresh data
          activeGroupTab = 'yours';
          updateGroupTabs();
          openGroupsPageThread(groupId, cachedGroups[groupId] || info);
        } catch (e) {
          console.error('Join group error:', e);
          showToast('Failed to join: ' + e.message, 'error');
        }
      }
      
      function updateGroupTabs() {
        const yoursBtn = document.getElementById('groupTabYours');
        const discoverBtn = document.getElementById('groupTabDiscover');
        if (yoursBtn && discoverBtn) {
          if (activeGroupTab === 'yours') {
            yoursBtn.className = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-sky-600 text-white transition-colors';
            yoursBtn.setAttribute('aria-selected', 'true');
            discoverBtn.className = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-md text-slate-400 hover:text-slate-200 transition-colors';
            discoverBtn.setAttribute('aria-selected', 'false');
          } else {
            yoursBtn.className = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-md text-slate-400 hover:text-slate-200 transition-colors';
            yoursBtn.setAttribute('aria-selected', 'false');
            discoverBtn.className = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-sky-600 text-white transition-colors';
            discoverBtn.setAttribute('aria-selected', 'true');
          }
        }
        // Re-render list with current tab
        const searchInput = document.getElementById('groupsPageInputSearch');
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        renderGroupsList(cachedGroups, query);
      }

      async function loadGroupsPageConversations() {
        const listEl = document.getElementById('groupsPageConversationList');
        if (!listEl || !currentUserId) return;
        listEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">Loading groups...</p>';
        try {
          const snap = await db.ref('groups').once('value');
          const groups = snap.val() || {};
          cachedGroups = groups; // Cache for search
          
          // Get current search query
          const searchInput = document.getElementById('groupsPageInputSearch');
          const query = searchInput ? searchInput.value : '';
          
          renderGroupsList(groups, query.toLowerCase().trim());
        } catch (e) {
          console.error('loadGroupsPageConversations error', e);
          // Friendly handling for permission errors which can occur briefly
          const msg = (e && (e.code || '')).toString().toLowerCase() + ' ' + (e && e.message ? e.message : '');
          if (msg.indexOf('permission_denied') !== -1 || msg.indexOf('permission-denied') !== -1) {
            const attempts = parseInt(listEl.dataset.groupLoadAttempts || '0', 10) || 0;
            listEl.dataset.groupLoadAttempts = attempts + 1;
            listEl.innerHTML = '<p class="text-xs text-yellow-300 text-center py-4">Unable to load groups yet — retrying...</p>';
            if (attempts < 3) {
              // retry after a short delay (may be due to auth/rules timing)
              setTimeout(() => loadGroupsPageConversations(), 800 + attempts * 400);
              return;
            }
            listEl.innerHTML = '<p class="text-xs text-red-400 text-center py-4">Permission denied reading groups. Please reload the page or sign in.</p>';
          } else {
            listEl.innerHTML = '<p class="text-xs text-red-400 text-center py-4">Failed to load groups</p>';
          }
        }
      }

      function openGroupsPageThread(groupId, info) {
        activeGroupId = groupId;
        currentGroupInfo = info || {};
        const title = (info && info.name) ? info.name : ('Group ' + groupId);
        
        // Update header
        const activeEl = document.getElementById('groupsPageActiveGroup');
        if (activeEl) activeEl.textContent = title;
        
        // Update header avatar
        updateGroupHeaderAvatar();
        
        // Update member count
        updateGroupHeaderMemberCount();
        
        const messagesEl = document.getElementById('groupsPageMessages');
        if (messagesEl) messagesEl.innerHTML = '';
        startGroupMessagesListener(groupId);
      }

      function startGroupMessagesListener(groupId) {
        if (groupMessagesRef && groupMessagesListener) {
          groupMessagesRef.off('child_added', groupMessagesListener);
        }
          groupMessagesRef = db.ref('groups/' + groupId + '/messages');
          groupMessagesListener = groupMessagesRef.on('child_added', snap => {
            const msg = snap.val();
            const messagesEl = document.getElementById('groupsPageMessages');
            if (!messagesEl) return;
            
            // Handle system messages (join/leave) as small inline notifications
            if (msg.isSystem) {
              const systemRow = document.createElement('div');
              systemRow.className = 'w-full flex justify-center my-2';
              systemRow.innerHTML = `<span class="text-[10px] text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">${escapeHtml(msg.text)}</span>`;
              messagesEl.appendChild(systemRow);
              messagesEl.scrollTop = messagesEl.scrollHeight;
              return;
            }
            
            // Map group message shape to the global message shape
            const mapped = {
              user: msg.fromUsername || msg.fromUid || 'Unknown',
              userId: msg.fromUid || null,
              text: msg.text || '',
              media: msg.media || null,
              time: msg.time || msg.timestamp || Date.now(),
              replyTo: msg.replyTo || null,
              deleteToken: msg.deleteToken || null
            };
            const row = createMessageRow(mapped, snap.key, messagesEl);
            messagesEl.appendChild(row);
            // scroll to bottom
            messagesEl.scrollTop = messagesEl.scrollHeight;
          });
      }

      async function sendGroupMessage(groupId, text, replyTo = null) {
        if (!groupId || !currentUserId) throw new Error('No active group or user');
        const payload = {
          fromUid: currentUserId,
          fromUsername: currentUsername || '',
          text: String(text).slice(0,2000),
          time: Date.now()
        };
        
        // Add reply data if replying
        if (replyTo) {
          payload.replyTo = replyTo;
        }

        // Ensure the current user is a member before sending. Check capacity first.
        try {
          const memSnap = await db.ref('groups/' + groupId + '/members/' + currentUserId).once('value');
          if (!memSnap.exists()) {
            // Check capacity before auto-joining
            const groupSnap = await db.ref('groups/' + groupId).once('value');
            const groupInfo = groupSnap.val();
            if (!canJoinGroup(groupInfo, currentUserId)) {
              throw new Error('This group is full. You cannot send messages.');
            }
            try {
              // Atomic join with memberCount transaction
              const joined = await atomicJoinGroup(groupId, currentUserId);
              if (!joined) {
                throw new Error('This group is full. You cannot send messages.');
              }
            } catch (joinErr) {
              console.warn('[groups] auto-join failed', joinErr);
              throw new Error('You are not a member of this group and could not join automatically. Request to join or ask the group owner to add you.');
            }
          }
        } catch (e) {
          // If membership check failed due to permissions, surface a helpful message
          console.error('[groups] membership check failed', e);
          throw e;
        }

        // Push message after membership ensured
        await db.ref('groups/' + groupId + '/messages').push(payload);
        
        // Check if AI was mentioned - trigger AI response in group
        const mentionsAI = /@ai\b/i.test(text);
        const isReplyToAI = replyTo && replyTo.username === 'Chatra AI';
        
        if (mentionsAI || isReplyToAI) {
          // Extract the query (remove @AI from text)
          let aiQuery = text.replace(/@ai\b/i, '').trim();
          if (!aiQuery && isReplyToAI) aiQuery = text.trim();
          
          if (aiQuery) {
            // AI auto-joins the group if not already a member
            try {
              const aiMemberSnap = await db.ref('groups/' + groupId + '/members/' + AI_BOT_UID).once('value');
              if (!aiMemberSnap.exists()) {
                await db.ref('groups/' + groupId + '/members/' + AI_BOT_UID).set(true);
                // Post join message for AI
                await db.ref('groups/' + groupId + '/messages').push({
                  fromUid: 'system',
                  fromUsername: 'System',
                  text: 'Chatra AI has joined the group',
                  time: Date.now(),
                  isSystem: true
                });
              }
            } catch (e) {
              console.warn('[groups] AI auto-join failed', e);
            }
            
            // Fetch AI response
            (async () => {
              let botReply = null;
              addToAiMemory(currentUserId, 'user', aiQuery, currentUsername);
              const conversationHistory = getAiMemory(currentUserId);
              const talkingToUsername = getAiUsername(currentUserId) || currentUsername || 'User';
              
              try {
                const aiWorkerUrl = 'https://recovery-modmojheh.modmojheh.workers.dev';
                if (aiWorkerUrl && !aiWorkerUrl.includes('your-worker-subdomain')) {
                  const r = await fetch(aiWorkerUrl + '/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: aiQuery, history: conversationHistory, username: talkingToUsername })
                  });
                  if (r.ok) {
                    const jr = await r.json();
                    if (jr && jr.reply) botReply = String(jr.reply).trim();
                  }
                }
              } catch (e) {
                console.warn('[AI] group chat AI call failed', e);
              }
              
              if (!botReply) botReply = generateAiReply(aiQuery);
              
              // Sanitize response
              botReply = botReply.replace(/\n{3,}/g, '\n\n').trim();
              botReply = botReply.replace(/@everyone/gi, '@​everyone');
              
              addToAiMemory(currentUserId, 'assistant', botReply, currentUsername);
              
              // Post AI response in group
              try {
                await db.ref('groups/' + groupId + '/messages').push({
                  fromUid: AI_BOT_UID,
                  fromUsername: 'Chatra AI',
                  text: botReply,
                  time: Date.now()
                });
              } catch (e) {
                console.error('[AI] failed to post group message', e);
              }
            })();
          }
        }
      }

      async function createOrJoinGroup(name) {
        if (!currentUserId) throw new Error('Not signed in');
        const key = name.replace(/[^A-Za-z0-9_-]/g, '_').toLowerCase();
        const groupRef = db.ref('groups/' + key);
        const snap = await groupRef.once('value');
        if (!snap.exists()) {
          // Creating new group - set memberCount to 1 for owner
          await groupRef.set({ name: name, owner: currentUserId, isPublic: true, members: { [currentUserId]: true }, memberCount: 1, createdAt: Date.now() });
        } else {
          // Joining existing group - check capacity
          const groupInfo = snap.val();
          
          // Check if already a member
          if (groupInfo.members && groupInfo.members[currentUserId]) {
            // Already a member, just open
            await loadGroupsPageConversations();
            openGroupsPageThread(key, cachedGroups[key] || { name });
            return;
          }
          
          if (!canJoinGroup(groupInfo, currentUserId)) {
            showToast('This group is full', 'error');
            return;
          }
          
          // Atomic join with memberCount transaction
          const joined = await atomicJoinGroup(key, currentUserId);
          if (!joined) {
            showToast('This group is full', 'error');
            return;
          }
          
          // Post join message
          await db.ref('groups/' + key + '/messages').push({
            fromUid: 'system',
            fromUsername: 'System',
            text: `${currentUsername || 'Someone'} has joined the group`,
            time: Date.now(),
            isSystem: true
          });
        }
        // refresh list and open
        await loadGroupsPageConversations();
        openGroupsPageThread(key, cachedGroups[key] || { name });
      }

      // Add a username to a group's members. If username is current user, allow self-join.
      async function addMemberToGroupByUsername(groupId, username) {
        if (!groupId) throw new Error('No group selected');
        if (!username) throw new Error('No username');
        // Find user by username
        const usersSnap = await db.ref('users').orderByChild('username').equalTo(username).once('value');
        const users = usersSnap.val();
        if (!users) throw new Error('User not found');
        const targetUid = Object.keys(users)[0];
        return addMemberToGroupByUid(groupId, targetUid);
      }

      async function addMemberToGroupByUid(groupId, uid, showJoinMessage = true) {
        if (!groupId || !uid) throw new Error('Missing params');
        
        // Get username for join message
        let username = 'Someone';
        try {
          const userSnap = await db.ref('users/' + uid + '/username').once('value');
          username = userSnap.val() || 'Someone';
        } catch (e) {}
        
        // Fetch group info for capacity check
        const groupSnap = await db.ref('groups/' + groupId).once('value');
        const groupInfo = groupSnap.val();
        if (!groupInfo) throw new Error('Group not found');
        
        // If targeting self, allow setting your own membership with capacity check
        if (uid === currentUserId) {
          if (!canJoinGroup(groupInfo, currentUserId)) {
            throw new Error('This group is full');
          }
          const wasAlreadyMember = groupInfo.members && groupInfo.members[currentUserId];
          if (!wasAlreadyMember) {
            // Atomic join with memberCount transaction
            const joined = await atomicJoinGroup(groupId, currentUserId);
            if (!joined) {
              throw new Error('This group is full');
            }
            
            // Post join message
            if (showJoinMessage) {
              await db.ref('groups/' + groupId + '/messages').push({
                fromUid: 'system',
                fromUsername: 'System',
                text: `${currentUsername || username} has joined the group`,
                time: Date.now(),
                isSystem: true
              });
            }
          }
          return;
        }
        // Otherwise, only group owner or admins may add others
        const ownerUid = groupInfo.owner;
        if (ownerUid === currentUserId || isAdmin) {
          // Owners/admins bypass capacity when adding others but still track memberCount
          const wasAlreadyMember = groupInfo.members && groupInfo.members[uid];
          if (!wasAlreadyMember) {
            await db.ref('groups/' + groupId + '/members/' + uid).set(true);
            // Increment memberCount (owners bypass capacity check in rules)
            try {
              await db.ref('groups/' + groupId + '/memberCount').transaction((count) => (count || 0) + 1);
            } catch (e) {
              console.warn('memberCount increment failed:', e);
            }
            
            // Post join message
            if (showJoinMessage) {
              await db.ref('groups/' + groupId + '/messages').push({
                fromUid: 'system',
                fromUsername: 'System',
                text: `${username} has joined the group`,
                time: Date.now(),
                isSystem: true
              });
            }
          }
          return;
        }
        throw new Error('Only group owner or admins can add other users');
      }

      // === Group Settings Modal ===
      let currentGroupInfo = null;
      
      function openGroupSettingsModal() {
        if (!activeGroupId || !currentGroupInfo) return;
        const modal = document.getElementById('groupSettingsModal');
        if (!modal) return;
        
        // Reset confirmation UI
        hideLeaveConfirm();
        hideDeleteConfirm();
        
        // Populate modal with current group info
        updateGroupSettingsModal();
        
        modal.classList.remove('modal-closed');
        modal.classList.add('modal-open');
      }
      
      function closeGroupSettingsModal() {
        const modal = document.getElementById('groupSettingsModal');
        if (modal) {
          modal.classList.remove('modal-open');
          modal.classList.add('modal-closed');
        }
      }
      
      async function updateGroupSettingsModal() {
        if (!activeGroupId) return;
        
        // Fetch fresh group data
        try {
          const snap = await db.ref('groups/' + activeGroupId).once('value');
          currentGroupInfo = snap.val() || {};
        } catch (e) {
          console.error('Failed to load group info', e);
          return;
        }
        
        const info = currentGroupInfo;
        const nameInput = document.getElementById('groupSettingsNameInput');
        const descInput = document.getElementById('groupSettingsDescInput');
        const avatar = document.getElementById('groupSettingsAvatar');
        const initial = document.getElementById('groupSettingsInitial');
        const ownerEl = document.getElementById('groupSettingsOwner');
        const createdEl = document.getElementById('groupSettingsCreated');
        const publicStatus = document.getElementById('groupSettingsPublicStatus');
        const deleteBtn = document.getElementById('groupSettingsDeleteBtn');
        const transferBtn = document.getElementById('groupTransferOwnershipBtn');
        const photoLabel = document.getElementById('groupPhotoUploadLabel');
        
        // Set name
        if (nameInput) nameInput.value = info.name || '';
        
        // Set description
        if (descInput) descInput.value = info.description || '';
        
        // Set avatar
        if (avatar && initial) {
          if (info.photo) {
            avatar.innerHTML = `<img src="${info.photo}" class="w-full h-full object-cover" alt="Group photo" />`;
          } else {
            initial.textContent = (info.name || 'G').charAt(0).toUpperCase();
            avatar.innerHTML = '';
            avatar.appendChild(initial);
          }
        }
        
        // Owner info
        if (ownerEl) {
          if (info.owner) {
            try {
              const ownerSnap = await db.ref('users/' + info.owner + '/username').once('value');
              ownerEl.textContent = ownerSnap.val() || info.owner;
            } catch (e) {
              ownerEl.textContent = info.owner;
            }
          } else {
            ownerEl.textContent = '-';
          }
        }
        
        // Created date
        if (createdEl && info.createdAt) {
          createdEl.textContent = new Date(info.createdAt).toLocaleDateString();
        }
        
        // Visibility toggle - owner only
        const visibilityToggle = document.getElementById('groupVisibilityToggle');
        const visibilityLabel = document.getElementById('groupVisibilityLabel');
        if (visibilityToggle && visibilityLabel) {
          visibilityToggle.checked = info.isPublic === true;
          visibilityLabel.textContent = info.isPublic ? 'Public' : 'Private';
          
          // Only owner can change visibility
          const visibilityContainer = document.getElementById('groupVisibilityContainer');
          if (visibilityContainer) {
            if (info.owner === currentUserId || isAdmin) {
              visibilityContainer.classList.remove('hidden');
            } else {
              visibilityContainer.classList.add('hidden');
            }
          }
        }
        
        // Public status display
        if (publicStatus) {
          publicStatus.textContent = info.isPublic ? 'Public Group' : 'Private Group';
        }
        
        // Check if current user can edit (owner, site admin, or group admin)
        const groupAdmins = info.groupAdmins || {};
        const canEdit = info.owner === currentUserId || isAdmin || groupAdmins[currentUserId] === true;
        
        // Show delete button only for owner or site admin
        if (deleteBtn) {
          if (info.owner === currentUserId || isAdmin) {
            deleteBtn.classList.remove('hidden');
          } else {
            deleteBtn.classList.add('hidden');
          }
        }
        
        // Show transfer button only for owner or site admin
        if (transferBtn) {
          if (info.owner === currentUserId || isAdmin) {
            transferBtn.classList.remove('hidden');
          } else {
            transferBtn.classList.add('hidden');
          }
        }
        
        // Show/hide photo upload and name edit based on permissions
        if (photoLabel) {
          if (canEdit) {
            photoLabel.classList.remove('pointer-events-none', 'hidden');
          } else {
            photoLabel.classList.add('pointer-events-none');
          }
        }
        
        // Show/hide name save button based on permissions
        const saveNameBtn = document.getElementById('groupSettingsSaveNameBtn');
        if (saveNameBtn) {
          if (canEdit) {
            saveNameBtn.classList.remove('hidden');
          } else {
            saveNameBtn.classList.add('hidden');
          }
        }
        
        // Make name input readonly if no edit permission
        if (nameInput) {
          nameInput.readOnly = !canEdit;
        }
        
        // Member limit display
        const memberLimitDisplay = document.getElementById('groupMemberLimitDisplay');
        const members = info.members || {};
        const memberCount = Object.keys(members).filter(k => members[k]).length;
        const maxMembers = info.maxMembers || 0;
        if (memberLimitDisplay) {
          memberLimitDisplay.textContent = maxMembers > 0 
            ? `${memberCount}/${maxMembers}` 
            : `${memberCount} total`;
        }
        
        // Max members setting (owner only)
        const maxMembersContainer = document.getElementById('groupMaxMembersContainer');
        const maxMembersInput = document.getElementById('groupMaxMembersInput');
        if (maxMembersContainer && maxMembersInput) {
          if (info.owner === currentUserId || isAdmin) {
            maxMembersContainer.classList.remove('hidden');
            maxMembersInput.value = info.maxMembers || '';
          } else {
            maxMembersContainer.classList.add('hidden');
          }
        }
        
        // Invite codes section (owner only)
        const inviteCodesContainer = document.getElementById('groupInviteCodesContainer');
        if (inviteCodesContainer) {
          if (info.owner === currentUserId || isAdmin) {
            inviteCodesContainer.classList.remove('hidden');
            await loadGroupInviteCodes();
          } else {
            inviteCodesContainer.classList.add('hidden');
          }
        }
        
        // Load members
        await loadGroupMembers();
      }
      
      // === Invite Code Functions ===
      async function loadGroupInviteCodes() {
        const listEl = document.getElementById('groupInviteCodesList');
        if (!listEl || !activeGroupId) return;
        
        try {
          const snap = await db.ref('groupInviteCodes').orderByChild('groupId').equalTo(activeGroupId).once('value');
          const codes = snap.val() || {};
          
          if (Object.keys(codes).length === 0) {
            listEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-2">No invite codes</p>';
            return;
          }
          
          listEl.innerHTML = '';
          Object.entries(codes).forEach(([code, data]) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/50';
            
            const usesText = data.maxUses > 0 && data.maxUses < 999999
              ? `${data.uses || 0}/${data.maxUses} uses` 
              : `${data.uses || 0} uses (∞)`;
            
            row.innerHTML = `
              <code class="flex-1 text-xs text-emerald-400 font-mono">${code}</code>
              <span class="text-xs text-slate-400">${usesText}</span>
              <button class="copy-code-btn p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200" data-code="${code}" title="Copy">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                  <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061V11.5A1.5 1.5 0 0 1 15.5 13H8.5A1.5 1.5 0 0 1 7 11.5v-8Z" />
                  <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h2a.5.5 0 0 0 0-1h-2Z" />
                </svg>
              </button>
              <button class="delete-code-btn p-1 hover:bg-red-600/30 rounded text-red-400" data-code="${code}" title="Delete">✕</button>
            `;
            listEl.appendChild(row);
          });
          
          // Add copy handlers
          listEl.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const code = btn.dataset.code;
              navigator.clipboard.writeText(code).then(() => {
                showToast('Code copied!', 'success');
              }).catch(() => {
                showToast('Failed to copy', 'error');
              });
            });
          });
          
          // Add delete handlers
          listEl.querySelectorAll('.delete-code-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const code = btn.dataset.code;
              
              // Create inline popup confirmation
              const popup = document.createElement('div');
              popup.className = 'absolute z-50 bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl';
              popup.style.cssText = 'right: 0; top: 100%; margin-top: 4px; min-width: 160px;';
              popup.innerHTML = `
                <p class="text-xs text-slate-300 mb-2">Delete this code?</p>
                <div class="flex gap-2">
                  <button class="confirm-delete flex-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded">Delete</button>
                  <button class="cancel-delete flex-1 px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded">Cancel</button>
                </div>
              `;
              
              // Position relative to button
              btn.parentElement.style.position = 'relative';
              btn.parentElement.appendChild(popup);
              
              popup.querySelector('.cancel-delete').addEventListener('click', () => popup.remove());
              popup.querySelector('.confirm-delete').addEventListener('click', async () => {
                popup.remove();
                try {
                  await db.ref('groupInviteCodes/' + code).remove();
                  await loadGroupInviteCodes();
                  showToast('Code deleted', 'success');
                } catch (e) {
                  showToast('Failed to delete: ' + e.message, 'error');
                }
              });
              
              // Auto-close after 5 seconds
              setTimeout(() => popup.remove(), 5000);
            });
          });
        } catch (e) {
          console.error('Load invite codes error:', e);
          listEl.innerHTML = '<p class="text-xs text-red-400 text-center py-2">Failed to load codes</p>';
        }
      }
      
      function generateInviteCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      }
      
      async function createGroupInviteCode(maxUses = 999999) {
        if (!activeGroupId || !currentGroupInfo) return;
        
        // Only owner can create codes
        if (currentGroupInfo.owner !== currentUserId && !isAdmin) {
          showToast('Only the group owner can create invite codes', 'error');
          return;
        }
        
        // Prevent invalid codes (must be at least 1)
        if (maxUses < 1) {
          showToast('Max uses must be at least 1 (or leave empty for unlimited)', 'error');
          return;
        }
        
        const code = generateInviteCode();
        
        try {
          await db.ref('groupInviteCodes/' + code).set({
            groupId: activeGroupId,
            createdBy: currentUserId,
            createdAt: Date.now(),
            maxUses: maxUses,
            uses: 0
          });
          
          showToast('Invite code created: ' + code, 'success');
          await loadGroupInviteCodes();
        } catch (e) {
          showToast('Failed to create code: ' + e.message, 'error');
        }
      }
      
      async function joinGroupByInviteCode(code) {
        if (!currentUserId || !code) throw new Error('Please sign in first');
        
        // Look up the invite code
        const codeSnap = await db.ref('groupInviteCodes/' + code).once('value');
        const codeData = codeSnap.val();
        
        if (!codeData) {
          throw new Error('Invalid invite code');
        }
        
        const groupId = codeData.groupId;
        
        // Check if code has reached max uses (0 is invalid, high numbers like 999999 = unlimited)
        if (codeData.maxUses === 0) {
          throw new Error('This invite code is invalid');
        }
        if (codeData.maxUses > 0 && codeData.maxUses < 999999 && (codeData.uses || 0) >= codeData.maxUses) {
          throw new Error('This invite code has expired');
        }
        
        // Get group info
        const groupSnap = await db.ref('groups/' + groupId).once('value');
        const groupInfo = groupSnap.val();
        
        if (!groupInfo) {
          throw new Error('Group no longer exists');
        }
        
        // Check if already a member
        if (groupInfo.members && groupInfo.members[currentUserId]) {
          showToast('You\'re already in this group!', 'info');
          activeGroupTab = 'yours';
          updateGroupTabs();
          openGroupsPageThread(groupId, groupInfo);
          return;
        }
        
        // Check capacity using centralized function
        if (!canJoinGroup(groupInfo, currentUserId)) {
          throw new Error('This group is full');
        }
        
        // Atomic join with memberCount transaction (rules enforce capacity)
        const joined = await atomicJoinGroup(groupId, currentUserId);
        if (!joined) {
          throw new Error('This group is full');
        }
        
        // Increment invite code uses atomically
        await db.ref('groupInviteCodes/' + code + '/uses').transaction((uses) => (uses || 0) + 1);
        
        // Add system message
        await db.ref('groups/' + groupId + '/messages').push({
          fromUid: 'system',
          fromUsername: 'System',
          text: `${currentUsername} joined via invite code`,
          time: Date.now(),
          isSystem: true
        });
        
        showToast('Joined ' + (groupInfo.name || 'group') + '!', 'success');
        await loadGroupsPageConversations();
        
        // Switch to your groups and open with fresh data
        activeGroupTab = 'yours';
        updateGroupTabs();
        openGroupsPageThread(groupId, cachedGroups[groupId] || groupInfo);
      }
      
      async function loadGroupMembers() {
        const listEl = document.getElementById('groupSettingsMemberList');
        if (!listEl || !activeGroupId) return;
        
        const info = currentGroupInfo || {};
        const members = info.members || {};
        const memberUids = Object.keys(members).filter(uid => members[uid]);
        
        if (memberUids.length === 0) {
          listEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-2">No members</p>';
          return;
        }
        
        listEl.innerHTML = '';
        const groupAdmins = info.groupAdmins || {};
        const isCurrentUserOwner = info.owner === currentUserId;
        
        for (const uid of memberUids) {
          const row = document.createElement('div');
          row.className = 'flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700/50';
          
          // Fetch username and profile pic
          let username = uid;
          let profilePic = null;
          try {
            const userSnap = await db.ref('users/' + uid).once('value');
            const userData = userSnap.val() || {};
            username = userData.username || uid;
            profilePic = userData.profilePic;
          } catch (e) {}
          
          const isOwner = info.owner === uid;
          const isGroupAdmin = groupAdmins[uid] === true;
          
          // Build badges HTML
          let badgesHtml = '';
          if (isOwner) {
            badgesHtml = '<span class="text-xs px-2 py-0.5 rounded bg-sky-600/30 text-sky-300">Owner</span>';
          } else if (isGroupAdmin) {
            badgesHtml = '<span class="text-xs px-2 py-0.5 rounded bg-purple-600/30 text-purple-300">Admin</span>';
          }
          
          // Build actions HTML - owner can toggle admin status, owner/admin can remove members
          let actionsHtml = '';
          if (!isOwner && (isCurrentUserOwner || isAdmin)) {
            actionsHtml += `<button class="toggle-admin-btn text-xs px-2 py-0.5 rounded ${isGroupAdmin ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40' : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/40'}" data-uid="${uid}">${isGroupAdmin ? 'Remove Admin' : 'Make Admin'}</button>`;
            actionsHtml += `<button class="remove-member-btn text-xs px-2 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40" data-uid="${uid}">Remove</button>`;
          }
          
          row.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
              ${profilePic ? `<img src="${profilePic}" class="w-full h-full object-cover" />` : `<span class="text-xs text-slate-300">${username.charAt(0).toUpperCase()}</span>`}
            </div>
            <span class="flex-1 text-sm text-slate-200 truncate">${escapeHtml(username)}</span>
            ${badgesHtml}
            ${actionsHtml}
          `;
          
          listEl.appendChild(row);
        }
        
        // Add toggle admin handlers
        listEl.querySelectorAll('.toggle-admin-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const uid = e.target.dataset.uid;
            if (!uid || !activeGroupId) return;
            const currentlyAdmin = (currentGroupInfo?.groupAdmins || {})[uid] === true;
            try {
              if (currentlyAdmin) {
                await db.ref('groups/' + activeGroupId + '/groupAdmins/' + uid).remove();
                showToast('Removed admin privileges', 'success');
              } else {
                await db.ref('groups/' + activeGroupId + '/groupAdmins/' + uid).set(true);
                showToast('Made user a group admin', 'success');
              }
              await updateGroupSettingsModal();
            } catch (err) {
              showToast('Failed to update admin status: ' + err.message, 'error');
            }
          });
        });
        
        // Add remove member handlers
        listEl.querySelectorAll('.remove-member-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const uid = e.target.dataset.uid;
            if (!uid || !activeGroupId) return;
            if (!confirm('Remove this member from the group?')) return;
            try {
              // Use atomic leave to decrement memberCount
              await atomicLeaveGroup(activeGroupId, uid);
              // Also remove from groupAdmins if they were one
              await db.ref('groups/' + activeGroupId + '/groupAdmins/' + uid).remove();
              await loadGroupMembers();
              updateGroupHeaderMemberCount();
            } catch (err) {
              showToast('Failed to remove member: ' + err.message, 'error');
            }
          });
        });
      }
      
      async function updateGroupName(newName) {
        if (!activeGroupId || !newName.trim()) return;
        
        const info = currentGroupInfo || {};
        const groupAdmins = info.groupAdmins || {};
        const canEdit = info.owner === currentUserId || isAdmin || groupAdmins[currentUserId] === true;
        if (!canEdit) {
          showToast('Only the group owner or admins can change the name', 'error');
          return;
        }
        
        try {
          await db.ref('groups/' + activeGroupId + '/name').set(newName.trim());
          currentGroupInfo.name = newName.trim();
          
          // Update header
          const activeEl = document.getElementById('groupsPageActiveGroup');
          if (activeEl) activeEl.textContent = newName.trim();
          
          const headerInitial = document.getElementById('groupHeaderInitial');
          if (headerInitial && !currentGroupInfo.photo) {
            headerInitial.textContent = newName.trim().charAt(0).toUpperCase();
          }
          
          // Refresh group list
          await loadGroupsPageConversations();
        } catch (e) {
          showToast('Failed to update name: ' + e.message, 'error');
        }
      }
      
      async function uploadGroupPhoto(file) {
        if (!activeGroupId || !file) return;
        
        const info = currentGroupInfo || {};
        const groupAdmins = info.groupAdmins || {};
        const canEdit = info.owner === currentUserId || isAdmin || groupAdmins[currentUserId] === true;
        if (!canEdit) {
          showToast('Only the group owner or admins can change the photo', 'error');
          return;
        }
        
        // Convert to base64 (simple approach, for larger apps use Firebase Storage)
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target.result;
          
          // Resize image if too large
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const maxSize = 200;
            let w = img.width, h = img.height;
            if (w > h) {
              if (w > maxSize) { h = h * maxSize / w; w = maxSize; }
            } else {
              if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const resized = canvas.toDataURL('image/jpeg', 0.8);
            
            try {
              await db.ref('groups/' + activeGroupId + '/photo').set(resized);
              currentGroupInfo.photo = resized;
              
              // Update avatars
              updateGroupSettingsModal();
              updateGroupHeaderAvatar();
              await loadGroupsPageConversations();
            } catch (err) {
              showToast('Failed to upload photo: ' + err.message, 'error');
            }
          };
          img.src = base64;
        };
        reader.readAsDataURL(file);
      }
      
      function updateGroupHeaderAvatar() {
        const avatar = document.getElementById('groupHeaderAvatar');
        const initial = document.getElementById('groupHeaderInitial');
        if (!avatar || !currentGroupInfo) return;
        
        if (currentGroupInfo.photo) {
          avatar.innerHTML = `<img src="${currentGroupInfo.photo}" class="w-full h-full object-cover" alt="Group" />`;
        } else {
          const name = currentGroupInfo.name || 'G';
          avatar.innerHTML = `<span id="groupHeaderInitial" class="text-white font-bold text-sm">${name.charAt(0).toUpperCase()}</span>`;
        }
      }
      
      function updateGroupHeaderMemberCount() {
        const countEl = document.getElementById('groupsPageMemberCount');
        if (!countEl || !currentGroupInfo) return;
        
        const members = currentGroupInfo.members || {};
        const count = Object.keys(members).filter(k => members[k]).length;
        countEl.textContent = count === 1 ? '1 member' : count + ' members';
      }
      
      function showLeaveConfirm() {
        const btns = document.getElementById('groupActionButtons');
        const confirm = document.getElementById('groupLeaveConfirm');
        if (btns) btns.classList.add('hidden');
        if (confirm) confirm.classList.remove('hidden');
      }
      
      function hideLeaveConfirm() {
        const btns = document.getElementById('groupActionButtons');
        const confirm = document.getElementById('groupLeaveConfirm');
        if (btns) btns.classList.remove('hidden');
        if (confirm) confirm.classList.add('hidden');
      }
      
      async function leaveGroup() {
        if (!activeGroupId || !currentUserId) return;
        
        const info = currentGroupInfo || {};
        if (info.owner === currentUserId) {
          showToast('You are the owner. Transfer ownership or delete the group instead.', 'error');
          return;
        }
        
        showLeaveConfirm();
      }
      
      async function confirmLeaveGroup() {
        if (!activeGroupId || !currentUserId) return;
        
        try {
          // Use atomic leave to decrement memberCount
          await atomicLeaveGroup(activeGroupId, currentUserId);
          hideLeaveConfirm();
          closeGroupSettingsModal();
          activeGroupId = null;
          currentGroupInfo = null;
          
          // Reset header
          const activeEl = document.getElementById('groupsPageActiveGroup');
          if (activeEl) activeEl.textContent = 'Select a group';
          const countEl = document.getElementById('groupsPageMemberCount');
          if (countEl) countEl.textContent = 'Click to view settings';
          const messagesEl = document.getElementById('groupsPageMessages');
          if (messagesEl) messagesEl.innerHTML = '';
          
          showToast('Left group', 'success');
          await loadGroupsPageConversations();
        } catch (e) {
          showToast('Failed to leave group: ' + e.message, 'error');
        }
      }
      
      function showDeleteConfirm() {
        const btns = document.getElementById('groupActionButtons');
        const confirm = document.getElementById('groupDeleteConfirm');
        if (btns) btns.classList.add('hidden');
        if (confirm) confirm.classList.remove('hidden');
      }
      
      function hideDeleteConfirm() {
        const btns = document.getElementById('groupActionButtons');
        const confirm = document.getElementById('groupDeleteConfirm');
        if (btns) btns.classList.remove('hidden');
        if (confirm) confirm.classList.add('hidden');
      }
      
      async function deleteGroup() {
        if (!activeGroupId) return;
        
        const info = currentGroupInfo || {};
        if (info.owner !== currentUserId && !isAdmin) {
          showToast('Only the group owner can delete the group', 'error');
          return;
        }
        
        showDeleteConfirm();
      }
      
      async function confirmDeleteGroup() {
        if (!activeGroupId) return;
        
        try {
          await db.ref('groups/' + activeGroupId).remove();
          hideDeleteConfirm();
          closeGroupSettingsModal();
          activeGroupId = null;
          currentGroupInfo = null;
          
          // Reset header
          const activeEl = document.getElementById('groupsPageActiveGroup');
          if (activeEl) activeEl.textContent = 'Select a group';
          const countEl = document.getElementById('groupsPageMemberCount');
          if (countEl) countEl.textContent = 'Click to view settings';
          const messagesEl = document.getElementById('groupsPageMessages');
          if (messagesEl) messagesEl.innerHTML = '';
          
          showToast('Group deleted', 'success');
          await loadGroupsPageConversations();
        } catch (e) {
          showToast('Failed to delete group: ' + e.message, 'error');
        }
      }
      
      // Transfer ownership functions
      function showTransferConfirm() {
        const el = document.getElementById('groupTransferConfirm');
        if (el) el.classList.remove('hidden');
        
        // Populate member dropdown
        const select = document.getElementById('groupTransferSelect');
        if (select && currentGroupInfo) {
          select.innerHTML = '<option value="">Select a member...</option>';
          const members = currentGroupInfo.members || {};
          Object.keys(members).filter(uid => members[uid] && uid !== currentUserId).forEach(async (uid) => {
            try {
              const snap = await db.ref('users/' + uid + '/username').once('value');
              const username = snap.val() || uid;
              const option = document.createElement('option');
              option.value = uid;
              option.textContent = username;
              select.appendChild(option);
            } catch (e) {}
          });
        }
      }
      
      function hideTransferConfirm() {
        const el = document.getElementById('groupTransferConfirm');
        if (el) el.classList.add('hidden');
      }
      
      async function confirmTransferOwnership() {
        if (!activeGroupId || !currentGroupInfo) return;
        
        const select = document.getElementById('groupTransferSelect');
        const newOwnerId = select ? select.value : '';
        
        if (!newOwnerId) {
          showToast('Please select a member', 'error');
          return;
        }
        
        try {
          await db.ref('groups/' + activeGroupId + '/owner').set(newOwnerId);
          hideTransferConfirm();
          showToast('Ownership transferred!', 'success');
          await updateGroupSettingsModal();
        } catch (e) {
          showToast('Failed to transfer: ' + e.message, 'error');
        }
      }
      
      // Initialize group settings event listeners
      function initGroupSettingsListeners() {
        // Header click opens settings
        const headerBtn = document.getElementById('groupsPageHeaderBtn');
        if (headerBtn) {
          headerBtn.addEventListener('click', () => {
            if (activeGroupId) openGroupSettingsModal();
          });
        }
        
        // Close button
        const closeBtn = document.getElementById('groupSettingsCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeGroupSettingsModal);
        
        // Modal backdrop click
        const modal = document.getElementById('groupSettingsModal');
        if (modal) {
          modal.addEventListener('click', (e) => {
            if (e.target === modal) closeGroupSettingsModal();
          });
        }
        
        // Visibility toggle (owner only)
        const visibilityToggle = document.getElementById('groupVisibilityToggle');
        if (visibilityToggle) {
          visibilityToggle.addEventListener('change', async () => {
            if (!activeGroupId || !currentGroupInfo) return;
            
            // Double-check owner permission
            if (currentGroupInfo.owner !== currentUserId && !isAdmin) {
              showToast('Only the group owner can change visibility', 'error');
              visibilityToggle.checked = currentGroupInfo.isPublic === true;
              return;
            }
            
            const newValue = visibilityToggle.checked;
            try {
              await db.ref('groups/' + activeGroupId + '/isPublic').set(newValue);
              currentGroupInfo.isPublic = newValue;
              
              // Update label
              const label = document.getElementById('groupVisibilityLabel');
              if (label) label.textContent = newValue ? 'Public' : 'Private';
              
              // Update status text
              const status = document.getElementById('groupSettingsPublicStatus');
              if (status) status.textContent = newValue ? 'Public Group' : 'Private Group';
              
              showToast(newValue ? 'Group is now public' : 'Group is now private', 'success');
              await loadGroupsPageConversations();
            } catch (e) {
              showToast('Failed to update visibility: ' + e.message, 'error');
              visibilityToggle.checked = currentGroupInfo.isPublic === true;
            }
          });
        }
        
        // Save name
        const saveNameBtn = document.getElementById('groupSettingsSaveNameBtn');
        if (saveNameBtn) {
          saveNameBtn.addEventListener('click', async () => {
            const input = document.getElementById('groupSettingsNameInput');
            if (input) {
              await updateGroupName(input.value);
              showToast('Group name saved', 'success');
            }
          });
        }
        
        // Save description
        const saveDescBtn = document.getElementById('groupSettingsSaveDescBtn');
        if (saveDescBtn) {
          saveDescBtn.addEventListener('click', async () => {
            if (!activeGroupId || !currentGroupInfo) return;
            if (currentGroupInfo.owner !== currentUserId && !isAdmin && !currentGroupInfo.groupAdmins?.[currentUserId]) {
              showToast('Only owner/admins can change description', 'error');
              return;
            }
            const input = document.getElementById('groupSettingsDescInput');
            if (input) {
              const desc = input.value.trim();
              try {
                if (desc) {
                  await db.ref('groups/' + activeGroupId + '/description').set(desc);
                } else {
                  await db.ref('groups/' + activeGroupId + '/description').remove();
                }
                currentGroupInfo.description = desc || null;
                showToast('Description saved', 'success');
              } catch (e) {
                showToast('Failed to save: ' + e.message, 'error');
              }
            }
          });
        }
        
        // Photo upload
        const photoInput = document.getElementById('groupPhotoInput');
        if (photoInput) {
          photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) uploadGroupPhoto(file);
          });
        }
        
        // Add member - inline search
        const addMemberInput = document.getElementById('groupAddMemberInput');
        const addMemberResults = document.getElementById('groupAddMemberResults');
        let addMemberDebounce = null;
        
        if (addMemberInput && addMemberResults) {
          addMemberInput.addEventListener('input', () => {
            const query = addMemberInput.value.trim().toLowerCase();
            clearTimeout(addMemberDebounce);
            
            if (!query) {
              addMemberResults.classList.add('hidden');
              addMemberResults.innerHTML = '';
              return;
            }
            
            addMemberDebounce = setTimeout(async () => {
              try {
                // Search users by username
                const usersSnap = await db.ref('users').orderByChild('username').startAt(query).endAt(query + '\uf8ff').limitToFirst(10).once('value');
                const users = usersSnap.val() || {};
                
                // Filter out current members
                const currentMembers = currentGroupInfo?.members || {};
                const results = Object.entries(users).filter(([uid]) => !currentMembers[uid]);
                
                if (results.length === 0) {
                  addMemberResults.innerHTML = '<p class="text-xs text-slate-500 p-3">No users found</p>';
                } else {
                  addMemberResults.innerHTML = results.map(([uid, user]) => `
                    <div class="add-member-result flex items-center gap-2 px-3 py-2 hover:bg-slate-700/50 cursor-pointer" data-uid="${uid}">
                      <div class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                        ${user.profilePic ? `<img src="${user.profilePic}" class="w-full h-full object-cover" />` : `<span class="text-xs text-slate-300">${(user.username || 'U').charAt(0).toUpperCase()}</span>`}
                      </div>
                      <div class="flex-1 min-w-0">
                        <span class="text-sm text-slate-200 block truncate">${escapeHtml(user.username || uid)}</span>
                        ${user.displayName ? `<span class="text-xs text-slate-500 block truncate">${escapeHtml(user.displayName)}</span>` : ''}
                      </div>
                      <span class="text-xs text-sky-400">+ Add</span>
                    </div>
                  `).join('');
                  
                  // Add click handlers
                  addMemberResults.querySelectorAll('.add-member-result').forEach(el => {
                    el.addEventListener('click', async () => {
                      const uid = el.dataset.uid;
                      try {
                        await addMemberToGroupByUid(activeGroupId, uid);
                        await updateGroupSettingsModal();
                        updateGroupHeaderMemberCount();
                        addMemberInput.value = '';
                        addMemberResults.classList.add('hidden');
                        showToast('Member added', 'success');
                      } catch (e) {
                        showToast('Failed to add member: ' + e.message, 'error');
                      }
                    });
                  });
                }
                
                addMemberResults.classList.remove('hidden');
              } catch (e) {
                console.error('Add member search error:', e);
              }
            }, 300);
          });
          
          // Hide results when clicking outside
          document.addEventListener('click', (e) => {
            if (!addMemberInput.contains(e.target) && !addMemberResults.contains(e.target)) {
              addMemberResults.classList.add('hidden');
            }
          });
        }
        
        // Legacy add member button (if exists)
        const addMemberBtn = document.getElementById('groupSettingsAddMemberBtn');
        if (addMemberBtn) {
          addMemberBtn.addEventListener('click', async () => {
            const username = prompt('Enter username to add:');
            if (!username) return;
            try {
              await addMemberToGroupByUsername(activeGroupId, username.trim());
              await updateGroupSettingsModal();
              updateGroupHeaderMemberCount();
            } catch (e) {
              showToast('Failed to add member: ' + e.message, 'error');
            }
          });
        }
        
        // Leave group
        const leaveBtn = document.getElementById('groupSettingsLeaveBtn');
        if (leaveBtn) leaveBtn.addEventListener('click', leaveGroup);
        const leaveCancelBtn = document.getElementById('groupLeaveCancelBtn');
        if (leaveCancelBtn) leaveCancelBtn.addEventListener('click', hideLeaveConfirm);
        const leaveConfirmBtn = document.getElementById('groupLeaveConfirmBtn');
        if (leaveConfirmBtn) leaveConfirmBtn.addEventListener('click', confirmLeaveGroup);
        
        // Delete group
        const deleteBtn = document.getElementById('groupSettingsDeleteBtn');
        if (deleteBtn) deleteBtn.addEventListener('click', deleteGroup);
        const deleteCancelBtn = document.getElementById('groupDeleteCancelBtn');
        if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', hideDeleteConfirm);
        const deleteConfirmBtn = document.getElementById('groupDeleteConfirmBtn');
        if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', confirmDeleteGroup);
        
        // Transfer ownership
        const transferBtn = document.getElementById('groupTransferOwnershipBtn');
        if (transferBtn) transferBtn.addEventListener('click', showTransferConfirm);
        const transferCancelBtn = document.getElementById('groupTransferCancelBtn');
        if (transferCancelBtn) transferCancelBtn.addEventListener('click', hideTransferConfirm);
        const transferConfirmBtn = document.getElementById('groupTransferConfirmBtn');
        if (transferConfirmBtn) transferConfirmBtn.addEventListener('click', confirmTransferOwnership);
        
        // Group reply cancel button
        const groupReplyCancelBtn = document.getElementById('groupReplyCancelBtn');
        if (groupReplyCancelBtn) {
          groupReplyCancelBtn.addEventListener('click', clearGroupReply);
        }
        
        // Max members save button
        const maxMembersSaveBtn = document.getElementById('groupMaxMembersSaveBtn');
        if (maxMembersSaveBtn) {
          maxMembersSaveBtn.addEventListener('click', async () => {
            if (!activeGroupId || !currentGroupInfo) return;
            if (currentGroupInfo.owner !== currentUserId && !isAdmin) {
              showToast('Only the owner can change max members', 'error');
              return;
            }
            
            const input = document.getElementById('groupMaxMembersInput');
            const rawValue = input ? input.value.trim() : '';
            
            // Handle empty input = remove limit
            if (rawValue === '' || rawValue === '0') {
              try {
                await db.ref('groups/' + activeGroupId + '/maxMembers').remove();
                currentGroupInfo.maxMembers = null;
                showToast('Member limit removed', 'success');
                await updateGroupSettingsModal();
              } catch (e) {
                showToast('Failed to save: ' + e.message, 'error');
              }
              return;
            }
            
            // Validate input
            const value = parseInt(rawValue, 10);
            if (isNaN(value) || value < 0) {
              showToast('Please enter a valid number (0 or empty for no limit)', 'error');
              return;
            }
            
            // Clamp to reasonable range (1-10000)
            const maxVal = Math.min(Math.max(value, 1), 10000);
            if (maxVal !== value) {
              showToast(`Value clamped to ${maxVal} (range: 1-10000)`, 'info');
            }
            
            try {
              await db.ref('groups/' + activeGroupId + '/maxMembers').set(maxVal);
              currentGroupInfo.maxMembers = maxVal;
              showToast(`Max members set to ${maxVal}`, 'success');
              await updateGroupSettingsModal();
            } catch (e) {
              showToast('Failed to save: ' + e.message, 'error');
            }
          });
        }
        
        // Invite code buttons
        const createInviteBtn = document.getElementById('groupCreateInviteBtn');
        const createInviteForm = document.getElementById('groupCreateInviteForm');
        const inviteCodeCancelBtn = document.getElementById('inviteCodeCancelBtn');
        const inviteCodeConfirmBtn = document.getElementById('inviteCodeConfirmBtn');
        
        if (createInviteBtn && createInviteForm) {
          createInviteBtn.addEventListener('click', () => {
            createInviteForm.classList.remove('hidden');
          });
        }
        if (inviteCodeCancelBtn && createInviteForm) {
          inviteCodeCancelBtn.addEventListener('click', () => {
            createInviteForm.classList.add('hidden');
          });
        }
        if (inviteCodeConfirmBtn) {
          inviteCodeConfirmBtn.addEventListener('click', async () => {
            const maxUsesInput = document.getElementById('inviteCodeMaxUses');
            const rawValue = maxUsesInput ? maxUsesInput.value.trim() : '';
            
            // Validate maxUses input - empty or 0 = unlimited (999999)
            let maxUses = 999999; // Default to unlimited
            if (rawValue !== '' && rawValue !== '0') {
              const parsed = parseInt(rawValue, 10);
              if (isNaN(parsed) || parsed < 1) {
                showToast('Please enter at least 1 use (leave empty for unlimited)', 'error');
                return;
              }
              maxUses = Math.min(parsed, 10000); // Clamp to reasonable max
            }
            
            // Disable button while processing
            inviteCodeConfirmBtn.disabled = true;
            inviteCodeConfirmBtn.textContent = 'Creating...';
            
            try {
              await createGroupInviteCode(maxUses);
              if (createInviteForm) createInviteForm.classList.add('hidden');
              if (maxUsesInput) maxUsesInput.value = '0';
            } catch (e) {
              showToast('Failed to create invite code: ' + e.message, 'error');
            } finally {
              inviteCodeConfirmBtn.disabled = false;
              inviteCodeConfirmBtn.textContent = 'Create';
            }
          });
        }
        
        // === Create Group Modal ===
        const createGroupModal = document.getElementById('createGroupModal');
        const createGroupCloseBtn = document.getElementById('createGroupCloseBtn');
        const createGroupCancelBtn = document.getElementById('createGroupCancelBtn');
        const createGroupSubmitBtn = document.getElementById('createGroupSubmitBtn');
        const createGroupNameInput = document.getElementById('createGroupNameInput');
        const createGroupError = document.getElementById('createGroupError');
        
        function openCreateGroupModal() {
          if (createGroupModal) {
            createGroupModal.classList.remove('modal-closed');
            createGroupModal.classList.add('modal-open');
            if (createGroupNameInput) {
              createGroupNameInput.value = '';
              createGroupNameInput.focus();
            }
            if (createGroupError) createGroupError.textContent = '';
          }
        }
        
        function closeCreateGroupModal() {
          if (createGroupModal) {
            createGroupModal.classList.remove('modal-open');
            createGroupModal.classList.add('modal-closed');
          }
        }
        
        if (createGroupCloseBtn) createGroupCloseBtn.addEventListener('click', closeCreateGroupModal);
        if (createGroupCancelBtn) createGroupCancelBtn.addEventListener('click', closeCreateGroupModal);
        if (createGroupModal) {
          createGroupModal.addEventListener('click', (e) => {
            if (e.target === createGroupModal) closeCreateGroupModal();
          });
        }
        
        if (createGroupSubmitBtn) {
          createGroupSubmitBtn.addEventListener('click', async () => {
            const name = createGroupNameInput?.value?.trim();
            if (!name) {
              if (createGroupError) createGroupError.textContent = 'Please enter a group name';
              return;
            }
            
            const isPublic = document.querySelector('input[name="groupVisibility"]:checked')?.value === 'public';
            
            createGroupSubmitBtn.disabled = true;
            createGroupSubmitBtn.textContent = 'Creating...';
            if (createGroupError) createGroupError.textContent = '';
            
            try {
              const key = name.replace(/[^A-Za-z0-9_-]/g, '_').toLowerCase();
              const groupRef = db.ref('groups/' + key);
              const snap = await groupRef.once('value');
              
              if (snap.exists()) {
                if (createGroupError) createGroupError.textContent = 'A group with this name already exists';
                createGroupSubmitBtn.disabled = false;
                createGroupSubmitBtn.textContent = 'Create Group';
                return;
              }
              
              await groupRef.set({
                name: name,
                owner: currentUserId,
                isPublic: isPublic,
                members: { [currentUserId]: true },
                createdAt: Date.now()
              });
              
              closeCreateGroupModal();
              showToast('Group created!', 'success');
              await loadGroupsPageConversations();
              openGroupsPageThread(key, { name });
            } catch (e) {
              console.error('Create group error:', e);
              if (createGroupError) createGroupError.textContent = 'Failed to create group: ' + e.message;
            } finally {
              createGroupSubmitBtn.disabled = false;
              createGroupSubmitBtn.textContent = 'Create Group';
            }
          });
        }
        
        // Wire up the Start Group button to open the modal
        window.openCreateGroupModal = openCreateGroupModal;
      }

      // === Group Reply System ===
      let pendingGroupReply = null;
      
      function setGroupReply(messageId, username, text) {
        pendingGroupReply = {
          messageId: messageId,
          username: username,
          text: text
        };
        
        const preview = document.getElementById('groupReplyPreview');
        const usernameEl = document.getElementById('groupReplyUsername');
        const textEl = document.getElementById('groupReplyText');
        
        if (preview) preview.classList.remove('hidden');
        if (usernameEl) usernameEl.textContent = username;
        if (textEl) textEl.textContent = text.length > 60 ? text.slice(0, 60) + '...' : text;
        
        // Focus input
        const input = document.getElementById('groupsPageInput');
        if (input) input.focus();
      }
      
      function clearGroupReply() {
        pendingGroupReply = null;
        const preview = document.getElementById('groupReplyPreview');
        if (preview) preview.classList.add('hidden');
      }

      async function loadDmPageConversations() {
        const listEl = document.getElementById('dmPageConversationList');
        if (!listEl || !currentUserId) return;

        if (!dmInboxRef) {
          listEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">No conversations yet</p>';
          return;
        }

        try {
          const snap = await dmInboxRef.once('value');
          const data = snap.val() || {};
          let threads = Object.entries(data).map(([threadId, info]) => ({ threadId, ...info }));

          // Also include all friends so the DM list shows every friend even when unread === 0
          try {
            const friendsSnap = await db.ref('friends/' + currentUserId).once('value');
            const friends = friendsSnap.val() || {};
            Object.keys(friends).forEach(friendUid => {
              const tid = makeThreadId(currentUserId, friendUid);
              if (!threads.some(t => t.threadId === tid)) {
                // Use null for withUsername - it will be fetched from database
                threads.push({ threadId: tid, withUid: friendUid, withUsername: null, lastTime: 0, lastMsg: '', unread: 0 });
              }
            });
          } catch (e) {
            // ignore errors fetching friends
          }

          // Normalize and deduplicate threads by canonical thread id.
          // Some entries may have mismatched keys or missing withUid; compute a canonical id
          const canonicalMap = {};
          function canonicalIdFor(thread) {
            if (thread.threadId && typeof thread.threadId === 'string' && thread.threadId.includes('__')) {
              if (thread.withUid) return makeThreadId(currentUserId, thread.withUid);
              const parts = thread.threadId.split('__');
              if (parts.length === 2) {
                if (parts[0] === currentUserId) return makeThreadId(currentUserId, parts[1]);
                if (parts[1] === currentUserId) return makeThreadId(currentUserId, parts[0]);
              }
              return thread.threadId;
            }
            if (thread.withUid) return makeThreadId(currentUserId, thread.withUid);
            return thread.threadId || null;
          }

          threads.forEach(thread => {
            const cid = canonicalIdFor(thread);
            if (!cid) return;
            if (!canonicalMap[cid]) {
              canonicalMap[cid] = Object.assign({}, thread, { threadId: cid });
              if (!canonicalMap[cid].withUid && thread.withUid) canonicalMap[cid].withUid = thread.withUid;
              if (!canonicalMap[cid].withUsername && thread.withUsername) canonicalMap[cid].withUsername = thread.withUsername;
            } else {
              const existing = canonicalMap[cid];
              if ((thread.lastTime || 0) > (existing.lastTime || 0)) {
                canonicalMap[cid] = Object.assign({}, existing, thread, { threadId: cid });
              } else {
                if (typeof thread.unread === 'number') existing.unread = thread.unread;
                if (thread.lastMsg) existing.lastMsg = thread.lastMsg;
              }
            }
          });

          // Rebuild threads from canonicalMap
          threads = Object.keys(canonicalMap).map(k => canonicalMap[k]);

          if (threads.length === 0) {
            listEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">No conversations yet</p>';
            return;
          }

          // Fetch message counts for better sorting (most talked to first)
          const threadPromises = threads.map(async thread => {
            try {
              const msgSnap = await db.ref('dms/' + thread.threadId + '/messages').once('value');
              thread.messageCount = msgSnap.numChildren() || 0;
            } catch (e) {
              thread.messageCount = 0;
            }
            return thread;
          });
          threads = await Promise.all(threadPromises);

          // Sort by: most recent activity first (use lastTime from existing system), then by message count
          threads.sort((a, b) => {
            const timeDiff = (b.lastTime || b.lastUpdate || 0) - (a.lastTime || a.lastUpdate || 0);
            if (timeDiff !== 0) return timeDiff;
            return (b.messageCount || 0) - (a.messageCount || 0);
          });

          listEl.innerHTML = '';

          function looksLikeUid(str) {
            if (!str || typeof str !== 'string') return false;
            return str.length >= 20 && /^[a-zA-Z0-9]+$/.test(str);
          }

          threads.forEach(thread => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors' +
              (activeDMThread === thread.threadId ? ' bg-slate-800/70' : '');

            let otherUid = thread.withUid || thread.otherUid || null;
            if (!otherUid && thread.threadId && thread.threadId.includes('__')) {
              const parts = thread.threadId.split('__');
              otherUid = parts[0] === currentUserId ? parts[1] : parts[0];
            }
            
            let displayName = thread.withUsername || thread.displayName || thread.otherUsername || 'Unknown';
            if (looksLikeUid(displayName)) {
              displayName = 'Loading...';
            }
            
            let profilePic = thread.profilePic || null;

            const avatar = document.createElement('div');
            avatar.className = 'w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden';
            if (profilePic) {
              const img = document.createElement('img');
              img.src = profilePic;
              img.className = 'w-full h-full object-cover';
              img.onerror = () => { avatar.textContent = displayName.slice(0,2).toUpperCase(); };
              avatar.appendChild(img);
            } else {
              avatar.textContent = displayName !== 'Unknown' ? displayName.slice(0,2).toUpperCase() : '?';
            }

            const info = document.createElement('div');
            info.className = 'flex-1 min-w-0';
            const title = document.createElement('p');
            title.className = 'text-sm font-medium text-slate-100 truncate';
            const usernameSpan = document.createElement('span');
            usernameSpan.textContent = displayName;
            title.appendChild(usernameSpan);
            const unread = dmUnreadCounts[thread.threadId] || (typeof thread.unread === 'number' ? thread.unread : 0);
            if (unread && unread > 0) {
              const ub = document.createElement('span');
              ub.className = 'ml-2 inline-flex items-center justify-center bg-red-500 text-white text-[11px] rounded-full w-5 h-5';
              ub.textContent = unread > 9 ? '9+' : String(unread);
              title.appendChild(ub);
            }
            const excerpt = document.createElement('p');
            excerpt.className = 'text-xs text-slate-400 truncate';
            excerpt.textContent = thread.lastMsg || '';
            info.appendChild(title);
            info.appendChild(excerpt);

            row.appendChild(avatar);
            row.appendChild(info);

            let actualUsername = displayName;
            row.addEventListener('click', () => openDmPageThread(otherUid, actualUsername, thread.threadId));
            row.addEventListener('touchend', (e) => { e.preventDefault(); openDmPageThread(otherUid, actualUsername, thread.threadId); });

            if (otherUid) {
              db.ref('users/' + otherUid).once('value').then(userSnap => {
                const user = userSnap.val() || {};
                const realUsername = user.displayName || user.username;
                if (realUsername) {
                  usernameSpan.textContent = realUsername;
                  actualUsername = realUsername;
                  if (!profilePic && avatar.textContent) {
                    avatar.textContent = realUsername.slice(0,2).toUpperCase();
                  }
                }
              }).catch(() => {});
              db.ref('userProfiles/' + otherUid).once('value').then(profSnap => {
                const prof = profSnap.val() || {};
                if (prof.profilePic) {
                  avatar.innerHTML = '';
                  const img = document.createElement('img');
                  img.src = prof.profilePic;
                  img.className = 'w-full h-full object-cover';
                  avatar.appendChild(img);
                }
              }).catch(() => {});
            }

            listEl.appendChild(row);
          });
        } catch (err) {
          console.error('[DM] loadDmPageConversations error', err);
          listEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">No conversations yet</p>';
        }
      }

      function openDmPageThread(otherUid, otherUsername, threadId) {
        activeDMThread = threadId;
        activeDMTarget = { uid: otherUid, username: otherUsername };

        // Analytics: DM opened (fullscreen)
        try { sendAnalyticsEvent('dm_open', { thread_id: threadId, other_uid: otherUid, mode: 'page' }); } catch (e) {}

        const activeUserEl = document.getElementById('dmPageActiveUser');
        const blockBtn = document.getElementById('dmPageBlockBtn');
        const messagesEl = document.getElementById('dmPageMessages');

        if (activeUserEl) activeUserEl.textContent = otherUsername || 'Unknown';
        if (blockBtn) blockBtn.classList.remove('hidden');
        if (messagesEl) messagesEl.innerHTML = '';

        // Mark this thread as seen and clear unread count
        try {
          const now = Date.now();
          if (currentUserId && threadId) {
            // Clear unread count when opening the thread
            db.ref('dmInbox/' + currentUserId + '/' + threadId).update({
              withUid: otherUid || null,
              withUsername: otherUsername || null,
              unread: 0
            }).catch(() => {});
            // Update local unread tracking
            dmUnreadCounts[threadId] = 0;
            updateDmTabBadge();
            // Track last seen time locally
            dmLastSeenByThread[threadId] = now;
          }
        } catch (e) {
          // ignore update errors
        }

        // Refresh conversation list UI to reflect new ordering
        loadDmPageConversations();

        // Start listening to messages
        startDmPageMessagesListener(threadId);
      }

      function startDmPageMessagesListener(threadId) {
        console.log('[DM Page] startDmPageMessagesListener called with threadId:', threadId);
        
        // Detach old listener
        if (dmPageMessagesRef && dmPageMessagesListener) {
          dmPageMessagesRef.off('child_added', dmPageMessagesListener);
          dmPageMessagesRef = null;
          dmPageMessagesListener = null;
        }

        const messagesEl = document.getElementById('dmPageMessages');
        if (!messagesEl) {
          console.error('[DM Page] messagesEl not found!');
          return;
        }
        
        if (!threadId) {
          console.error('[DM Page] No threadId provided!');
          return;
        }

        // Clear messages first
        messagesEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">Loading messages...</p>';

        // Use same path as existing DM system: dms/ not directMessages/
        const msgPath = 'dms/' + threadId + '/messages';
        console.log('[DM Page] Listening to:', msgPath);
        
        dmPageMessagesRef = db.ref(msgPath);
        
        // First load existing messages
        dmPageMessagesRef.orderByChild('time').limitToLast(100).once('value').then(snapshot => {
          messagesEl.innerHTML = '';
          const messages = [];
          snapshot.forEach(childSnap => {
            messages.push({ key: childSnap.key, ...childSnap.val() });
          });
          console.log('[DM Page] Loaded', messages.length, 'messages');
          
          messages.forEach(msg => {
            renderDmPageMessage(msg, messagesEl);
          });
          
          messagesEl.scrollTop = messagesEl.scrollHeight;
          
          // Now listen for new messages
          dmPageMessagesListener = dmPageMessagesRef.orderByChild('time').limitToLast(1).on('child_added', snap => {
            const msg = snap.val();
            if (!msg) return;
            // Check if already rendered
            if (messagesEl.querySelector(`[data-msg-key="${snap.key}"]`)) return;
            renderDmPageMessage({ key: snap.key, ...msg }, messagesEl);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          });
        }).catch(err => {
          console.error('[DM Page] Error loading messages:', err);
          messagesEl.innerHTML = '<p class="text-xs text-red-400 text-center py-4">Error loading messages</p>';
        });
      }
      
      function renderDmPageMessage(msg, messagesEl) {
        if (!msg) return;
        
        const isMine = msg.fromUid === currentUserId;
        const row = document.createElement('div');
        row.className = isMine ? 'flex justify-end gap-1 items-center' : 'flex justify-start gap-1 items-center';
        row.dataset.msgKey = msg.key || '';

        // Avatar (match global chat style)
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity overflow-hidden';
        avatarDiv.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        avatarDiv.style.minWidth = '1.75rem';
        avatarDiv.style.minHeight = '1.75rem';

        // Hide avatar for own messages to match global chat
        if (isMine) {
          avatarDiv.style.display = 'none';
        }

        // Load profile picture async
        try {
          const nameToFetch = msg.fromUsername || msg.fromUid || null;
          if (nameToFetch) {
            setTimeout(() => {
              fetchUserProfile(nameToFetch).then(profile => {
                if (profile?.profilePic) {
                  try {
                    const img = document.createElement('img');
                    img.className = 'h-full w-full object-cover';
                    img.crossOrigin = 'anonymous';
                    img.src = profile.profilePic;
                    img.onerror = () => { /* keep default avatar */ };
                    img.onload = () => {
                      if (avatarDiv.innerHTML && avatarDiv.querySelector('img')?.src !== img.src) {
                        avatarDiv.innerHTML = '';
                        avatarDiv.appendChild(img);
                      }
                    };
                  } catch (e) {}
                }
              }).catch(() => {});
            }, 50);
          }
        } catch (e) {}

        // Click to view profile
        avatarDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          const uname = msg.fromUsername || msg.fromUid;
          if (uname) viewUserProfile(uname);
        });

        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.className = 'relative group max-w-[80%]';

        const bubble = document.createElement('div');
        bubble.className = `message-bubble-anim px-4 py-2 rounded-2xl text-sm font-medium border ${
          isMine
            ? 'mine bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-600 shadow-lg shadow-sky-900/40'
            : 'bg-slate-800/90 text-slate-100 border-slate-700'
        }`;

        // Add media if present
        if (msg.media) {
          const mediaUrl = msg.media;
          const lower = (mediaUrl || '').toLowerCase();
          const isVideo = lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm') || lower.includes('video');
          const isGif = isGifUrl(mediaUrl);

          if (isVideo) {
            const video = document.createElement('video');
            video.src = mediaUrl;
            video.controls = true;
            video.className = 'w-full rounded-lg mb-2';
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            bubble.appendChild(video);
          } else {
            const img = document.createElement('img');
            img.src = mediaUrl;
            img.className = 'w-full rounded-lg mb-2 cursor-pointer';
            img.onclick = () => openImageViewer(mediaUrl);
            // GIF replay button
            if (isGif) {
              const wrapper = document.createElement('div');
              wrapper.className = 'relative';
              wrapper.appendChild(img);
              const replayBtn = document.createElement('button');
              replayBtn.className = 'absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded';
              replayBtn.textContent = 'â†» GIF';
              replayBtn.onclick = (e) => { e.stopPropagation(); replayGif(img); };
              wrapper.appendChild(replayBtn);
              bubble.appendChild(wrapper);
            } else {
              bubble.appendChild(img);
            }
          }
        }

        // Add text
        if (msg.text) {
          const textEl = document.createElement('span');
          textEl.className = 'message-text-reveal font-medium';
          textEl.textContent = msg.text;
          bubble.appendChild(textEl);
        }

        // Add small timestamp/date under the message (same logic as populateDmBubble)
        try {
          const ts = msg && (msg.time || msg.timestamp) ? Number(msg.time || msg.timestamp) : null;
          if (ts) {
            const now = Date.now();
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const d = new Date(ts);
            let metaText = '';
            if (now - ts < ONE_DAY) {
              metaText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
              const opts = { month: 'short', day: 'numeric' };
              if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
              metaText = d.toLocaleDateString([], opts);
            }
            const meta = document.createElement('div');
            meta.className = 'text-[11px] text-slate-400 mt-1 select-none';
            meta.textContent = metaText;
            bubble.appendChild(meta);
          }
        } catch (e) {
          // ignore
        }

        bubbleWrapper.appendChild(bubble);

        // Own actions: delete + edit (positioned inside bubble area)
        if (isMine && msg.key) {
          // detect touch-capable devices
          const isTouchDevice = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0));

          // helper to attach deduplicated touch/click handlers and ensure visibility on touch devices
          function attachActionHandler(btn, handler) {
            let touchFired = false;
            btn.addEventListener('touchstart', (e) => {
              touchFired = true;
              // Show action buttons for the whole message group when touched
              const grp = btn.closest('.group');
              if (grp) {
                grp.classList.add('touch-active');
                // visibility is cleared when user touches elsewhere (no fixed timeout)
              }
            }, { passive: true });
            btn.addEventListener('touchend', (e) => {
              e.preventDefault();
              e.stopPropagation();
              handler(e);
              // reset flag shortly after
              setTimeout(() => { touchFired = false; }, 500);
            });
            btn.addEventListener('click', (e) => {
              if (touchFired) return; // avoid duplicate action after touch
              handler(e);
            });
            // do not force visibility by default; touch will add 'touch-active' to show buttons
          }

          const deleteBtn = document.createElement('button');
          // DM buttons: match global chat style - bigger, better positioned
          deleteBtn.className = 'absolute -top-3 -right-3 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500 active:bg-red-500 text-sm cursor-pointer';
          deleteBtn.textContent = '🗑️';
          deleteBtn.title = 'Delete message';
          attachActionHandler(deleteBtn, () => {
            openDeleteMessageModal(msg.key, msg.deleteToken, { isDm: true, threadId: activeDMThread });
          });
          bubbleWrapper.appendChild(deleteBtn);

          const editBtn = document.createElement('button');
          // DM edit button: match global chat style
          editBtn.className = 'absolute -top-3 right-5 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500 active:bg-sky-500 cursor-pointer';
          editBtn.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\" fill=\"currentColor\" class=\"w-3.5 h-3.5\"><path d=\"M15.502 1.94a1.5 1.5 0 0 1 2.122 2.12l-1.06 1.062-2.122-2.122 1.06-1.06Zm-2.829 2.828-9.192 9.193a2 2 0 0 0-.518.94l-.88 3.521a.5.5 0 0 0 .607.607l3.52-.88a2 2 0 0 0 .942-.518l9.193-9.193-2.672-2.67Z\"/></svg>";
          editBtn.title = 'Edit message';
          attachActionHandler(editBtn, () => {
            editDmMessage(activeDMThread, msg.key, msg.text || '', messagesEl);
          });
          bubbleWrapper.appendChild(editBtn);
        }

        // Report + Admin delete for other users' messages
        if (!isMine && msg.key) {
          // Report button
          const reportBtn = document.createElement('button');
          reportBtn.className = 'absolute -top-3 -left-3 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-amber-500 active:bg-amber-500 text-sm cursor-pointer';
          reportBtn.textContent = '⚠️';
          reportBtn.title = 'Report message';
          // reuse attachActionHandler if available in this scope, otherwise fallback
          if (typeof attachActionHandler === 'function') {
            attachActionHandler(reportBtn, () => {
              reportDmMessage(msg.key, msg, msg.fromUsername || 'Unknown');
            });
          } else {
            reportBtn.addEventListener('click', () => {
              reportDmMessage(msg.key, msg, msg.fromUsername || 'Unknown');
            });
            reportBtn.addEventListener('touchend', (e) => { e.preventDefault(); reportDmMessage(msg.key, msg, msg.fromUsername || 'Unknown'); });
          }
          bubbleWrapper.appendChild(reportBtn);

          // Admin delete
          if (isAdmin) {
            const adminDeleteBtn = document.createElement('button');
            adminDeleteBtn.className = 'absolute -top-3 -right-3 z-20 w-7 h-7 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-700 active:bg-red-700 text-sm cursor-pointer';
            adminDeleteBtn.textContent = '🗑️';
            adminDeleteBtn.title = 'Admin delete';
            if (typeof attachActionHandler === 'function') {
              attachActionHandler(adminDeleteBtn, () => {
                openDeleteMessageModal(msg.key, msg.deleteToken, { isDm: true, threadId: activeDMThread });
              });
            } else {
              adminDeleteBtn.addEventListener('click', () => {
                openDeleteMessageModal(msg.key, msg.deleteToken, { isDm: true, threadId: activeDMThread });
              });
            }
            bubbleWrapper.appendChild(adminDeleteBtn);
          }
        }

        // Append avatar then bubble (avatar hidden for own messages)
        row.appendChild(avatarDiv);
        row.appendChild(bubbleWrapper);

        // Align DM row vertically depending on whether message is single-line
        try {
          const textContent = (msg.text || '');
          const looksSingleLine = !textContent.includes('\n') && textContent.length <= 60 && !msg.media;
          if (looksSingleLine) {
            row.classList.remove('items-start');
            row.classList.add('items-center');
          } else {
            row.classList.remove('items-center');
            row.classList.add('items-start');
          }
        } catch (e) {}

        messagesEl.appendChild(row);
      }

      // Setup page nav event listeners (called after DOM is ready)
      function setupPageNavListeners() {
        // Global Chat header tabs
        const navGlobal = document.getElementById('navGlobalChat');
        const navDMs = document.getElementById('navDMs');
        const navGroups = document.getElementById('navGroups');
        // DM Page header tabs
        const navGlobal2 = document.getElementById('navGlobalChat2');
        const navDMs2 = document.getElementById('navDMs2');
        const navGroups2 = document.getElementById('navGroups2');

        // Initialize slider position on the active tab (Global Chat by default)
        setTimeout(() => {
          updateNavSlider(navGlobal);
        }, 100);

        // Add click + touch listeners
        [navGlobal, navGlobal2].forEach(btn => {
          if (btn) {
            btn.addEventListener('click', () => switchToPage('global'));
            btn.addEventListener('touchend', (e) => { e.preventDefault(); switchToPage('global'); });
          }
        });
        [navDMs, navDMs2].forEach(btn => {
          if (btn) {
            btn.addEventListener('click', () => switchToPage('dms'));
            btn.addEventListener('touchend', (e) => { e.preventDefault(); switchToPage('dms'); });
          }
        });
        [navGroups, navGroups2].forEach(btn => {
          if (btn) {
            btn.addEventListener('click', () => switchToPage('groups'));
            btn.addEventListener('touchend', (e) => { e.preventDefault(); switchToPage('groups'); });
          }
        });

        // Also wire tabs on the Groups page header if present
        const navGlobal3 = document.getElementById('navGlobalChat3');
        const navGroups3 = document.getElementById('navGroups3');
        const navDMs3 = document.getElementById('navDMs3');
        [navGlobal3, navGlobal, navGlobal2].forEach(btn => {
          if (btn) btn.addEventListener('click', () => switchToPage('global'));
        });
        [navGroups3, navGroups, navGroups2].forEach(btn => {
          if (btn) btn.addEventListener('click', () => switchToPage('groups'));
        });
        [navDMs3, navDMs, navDMs2].forEach(btn => {
          if (btn) btn.addEventListener('click', () => switchToPage('dms'));
        });

        // DM Page logout button
        const dmPageLogoutBtn = document.getElementById('dmPageLogoutBtn');
        if (dmPageLogoutBtn) {
          dmPageLogoutBtn.addEventListener('click', () => auth.signOut());
          dmPageLogoutBtn.addEventListener('touchend', (e) => { e.preventDefault(); auth.signOut(); });
        }

        // Groups Page logout button
        const groupsPageLogoutBtn = document.getElementById('groupsPageLogoutBtn');
        if (groupsPageLogoutBtn) {
          groupsPageLogoutBtn.addEventListener('click', () => auth.signOut());
          groupsPageLogoutBtn.addEventListener('touchend', (e) => { e.preventDefault(); auth.signOut(); });
        }

        // DM Page menu (hamburger) should open the same side panel
        const dmPageMenuToggle = document.getElementById('dmPageMenuToggle');
        if (dmPageMenuToggle) {
          dmPageMenuToggle.addEventListener('click', openSidePanel);
          dmPageMenuToggle.addEventListener('touchend', (e) => { e.preventDefault(); openSidePanel(); });
        }

        // Groups page menu toggle
        const groupsPageMenuToggle = document.getElementById('groupsPageMenuToggle');
        if (groupsPageMenuToggle) {
          groupsPageMenuToggle.addEventListener('click', openSidePanel);
          groupsPageMenuToggle.addEventListener('touchend', (e) => { e.preventDefault(); openSidePanel(); });
        }

        // Initialize group settings modal listeners
        initGroupSettingsListeners();
        
        // Start online count listener (works even before login)
        startOnlineCountListener();

        // Side panel Update Log removed

        // Side panel Groups button
        const sidePanelGroups = document.getElementById('sidePanelGroups');
        if (sidePanelGroups) {
          sidePanelGroups.addEventListener('click', () => { switchToPage('groups'); closeSidePanel(); });
        }

        // DM Page send form
        const dmPageForm = document.getElementById('dmPageForm');
        const dmPageInput = document.getElementById('dmPageInput');
        const dmPageError = document.getElementById('dmPageError');

        // Groups page controls
        const groupsPageForm = document.getElementById('groupsPageForm');
        const groupsPageInput = document.getElementById('groupsPageInput');
        const groupsPageError = document.getElementById('groupsPageError');
        const groupsPageStartBtn = document.getElementById('groupsPageStartBtn');
        if (groupsPageStartBtn) {
          groupsPageStartBtn.addEventListener('click', () => {
            if (typeof openCreateGroupModal === 'function') {
              openCreateGroupModal();
            } else if (window.openCreateGroupModal) {
              window.openCreateGroupModal();
            } else {
              // Fallback to old behavior
              const name = document.getElementById('groupsPageUserSearch')?.value || prompt('Enter group name:');
              if (!name) return;
              createOrJoinGroup(name.trim()).catch(e => { console.error(e); showToast('Group create/join failed', 'error'); });
            }
          });
        }
        
        // Group tabs: Your Groups / Discover
        const groupTabYours = document.getElementById('groupTabYours');
        const groupTabDiscover = document.getElementById('groupTabDiscover');
        if (groupTabYours) {
          groupTabYours.addEventListener('click', () => {
            activeGroupTab = 'yours';
            updateGroupTabs();
          });
        }
        if (groupTabDiscover) {
          groupTabDiscover.addEventListener('click', () => {
            activeGroupTab = 'discover';
            updateGroupTabs();
          });
        }
        
        // Join by invite code
        const groupInviteCodeInput = document.getElementById('groupInviteCodeInput');
        const groupJoinByCodeBtn = document.getElementById('groupJoinByCodeBtn');
        const inviteCodeError = document.getElementById('inviteCodeError');
        
        function showInviteCodeError(msg) {
          if (inviteCodeError) {
            inviteCodeError.textContent = msg;
            inviteCodeError.classList.remove('hidden');
          }
        }
        function hideInviteCodeError() {
          if (inviteCodeError) {
            inviteCodeError.textContent = '';
            inviteCodeError.classList.add('hidden');
          }
        }
        
        if (groupJoinByCodeBtn && groupInviteCodeInput) {
          groupInviteCodeInput.addEventListener('input', hideInviteCodeError);
          
          groupJoinByCodeBtn.addEventListener('click', async () => {
            hideInviteCodeError();
            const code = groupInviteCodeInput.value.trim().toUpperCase();
            if (!code) {
              showInviteCodeError('Please enter an invite code');
              return;
            }
            
            groupJoinByCodeBtn.disabled = true;
            groupJoinByCodeBtn.textContent = 'Joining...';
            
            try {
              await joinGroupByInviteCode(code);
              groupInviteCodeInput.value = '';
            } catch (e) {
              showInviteCodeError(e.message || 'Invalid or expired code');
            } finally {
              groupJoinByCodeBtn.disabled = false;
              groupJoinByCodeBtn.textContent = 'Join';
            }
          });
          groupInviteCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              groupJoinByCodeBtn.click();
            }
          });
        }

        if (groupsPageForm) {
          // Add mention support to group chat input
          if (groupsPageInput) {
            groupsPageInput.addEventListener('input', () => {
              handleMentionInput(groupsPageInput);
            });
            groupsPageInput.addEventListener('keydown', (e) => {
              if (mentionAutocomplete && mentionAutocomplete.style.display !== 'none') {
                if (e.key === 'ArrowDown') { e.preventDefault(); updateMentionSelection(1); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); updateMentionSelection(-1); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { if (confirmMentionSelection()) { e.preventDefault(); return; } }
                if (e.key === 'Escape') { e.preventDefault(); hideMentionAutocomplete(); return; }
              }
            });
            groupsPageInput.addEventListener('blur', () => {
              setTimeout(() => hideMentionAutocomplete(), 150);
            });
          }
          
          groupsPageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!activeGroupId) return;
            const txt = (groupsPageInput && groupsPageInput.value) ? groupsPageInput.value.trim() : '';
            if (!txt) return;
            
            // Clear any previous error
            if (groupsPageError) groupsPageError.textContent = '';
            
            // Build reply data if replying
            let replyData = null;
            if (pendingGroupReply) {
              replyData = {
                messageId: pendingGroupReply.messageId,
                username: pendingGroupReply.username,
                text: pendingGroupReply.text
              };
            }
            
            try {
              await sendGroupMessage(activeGroupId, txt, replyData);
              if (groupsPageInput) groupsPageInput.value = '';
              clearGroupReply();
            } catch (err) {
              console.error(err);
              if (groupsPageError) groupsPageError.textContent = err.message || 'Send failed';
            }
          });
        }
        // DM media preview elements & pending state
        const dmMediaPreview = document.getElementById('dmMediaPreview');
        const dmMediaPreviewContent = document.getElementById('dmMediaPreviewContent');
        const dmCancelMediaBtn = document.getElementById('dmCancelMediaBtn');
        let pendingDmMediaUrl = null;
        let pendingDmMediaFileId = null;
        if (dmPageForm) {
          dmPageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!activeDMThread || !dmPageInput || !activeDMTarget) return;
            const text = dmPageInput.value.trim();
            // Allow sending if there's text or pending media
            if (!text && !pendingDmMediaUrl) return;

            try {
              // Check privacy settings first
              const privacyCheck = await checkDmPrivacy(activeDMTarget.uid);
              if (!privacyCheck.allowed) {
                if (dmPageError) dmPageError.textContent = privacyCheck.reason;
                return;
              }
              
              // Use same path as existing DM system: dms/
              const msgRef = db.ref('dms/' + activeDMThread + '/messages').push();
              const payload = {
                fromUid: currentUserId,
                fromUsername: currentUsername,
                toUid: activeDMTarget.uid,
                toUsername: activeDMTarget.username || '',
                time: firebase.database.ServerValue.TIMESTAMP
              };
              if (text) payload.text = text;
              if (pendingDmMediaUrl) {
                payload.media = pendingDmMediaUrl;
                if (pendingDmMediaFileId) payload.mediaFileId = pendingDmMediaFileId;
              }
              await msgRef.set(payload);
              // Analytics: message sent (fullscreen)
              try { sendAnalyticsEvent('message_sent', { thread_id: activeDMThread, has_media: Boolean(pendingDmMediaUrl), media_file_id: pendingDmMediaFileId || null }); } catch (e) {}
              // Update inbox for both users
              const now = Date.now();
              const lastMsgPreview = text || (pendingDmMediaUrl ? '(media)' : '');
              if (activeDMTarget && activeDMTarget.uid) {
                db.ref('dmInbox/' + currentUserId + '/' + activeDMThread).update({
                    lastMsg: lastMsgPreview,
                    lastTime: now
                  }).catch(() => {});
                // Update recipient inbox using set() - we can't read their unread count due to permissions
                // so we just set unread to 1 (recipient will see badge, clicking clears it)
                const recipientInboxRef = db.ref('dmInbox/' + activeDMTarget.uid + '/' + activeDMThread);
                recipientInboxRef.set({
                  withUid: currentUserId,
                  withUsername: currentUsername || currentUserId,
                  lastMsg: lastMsgPreview,
                  lastTime: now,
                  unread: 1
                }).catch(err => console.error('[DM] failed to update recipient inbox:', err));
                // Prevent local inbox listener from treating this as an incoming message
                dmLastUpdateTimeByThread[activeDMThread] = now;
              }
              // Clear input and pending media preview after sending
              dmPageInput.value = '';
              if (dmMediaPreview) {
                dmMediaPreview.classList.add('hidden');
              }
              if (dmMediaPreviewContent) dmMediaPreviewContent.innerHTML = '';
              // Clear pending media state
              pendingDmMediaUrl = null;
              pendingDmMediaFileId = null;
              if (dmPageError) dmPageError.textContent = '';
            } catch (err) {
              console.error('[DM] send error', err);
              if (err.message && err.message.includes('PERMISSION_DENIED')) {
                if (dmPageError) dmPageError.textContent = 'Cannot send message. User may have DMs disabled or you are not friends.';
              } else {
                if (dmPageError) dmPageError.textContent = 'Failed to send message';
              }
            }
          });
        }

        // Update Log removed: no handlers or DOM lookups remain

        // DM Page media upload (reuse global upload flow / ImageKit)
        let dmUploadInProgress = false;
        const dmPageMediaBtn = document.getElementById('dmPageMediaUploadBtn');
        const dmPageMediaInput = document.getElementById('dmPageMediaInput');
        if (dmPageMediaBtn && dmPageMediaInput) {
          dmPageMediaBtn.addEventListener('click', () => dmPageMediaInput.click());
          dmPageMediaInput.addEventListener('change', async () => {
            const file = dmPageMediaInput.files[0];
            if (!file || !activeDMThread) {
              dmPageMediaInput.value = '';
              return;
            }

            // Prevent duplicate uploads
            if (dmUploadInProgress) {
              return;
            }
            dmUploadInProgress = true;
            dmPageMediaInput.value = ''; // Clear immediately to prevent re-triggering

            try {
              if (!(await canUpload())) {
                showToast('Slow down! Wait a few seconds', 'error');
                return;
              }

              // Enforce 30s video limit on DM uploads
              if (file.type && file.type.startsWith('video/')) {
                const dur = await getVideoDuration(file);
                if (dur > 30) {
                  showToast('Video is too long. Max 30 seconds', 'error');
                  dmUploadInProgress = false;
                  return;
                }
              }

              // Show spinner state while uploading/moderating
              try {
                dmPageMediaBtn.disabled = true;
                dmPageMediaBtn.innerHTML = '<svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/></svg>';
              } catch (e) {}

              const processed = await prepareFileForUpload(file);
              const uploadResult = await uploadToImageKit(processed);
              storeUploadTime();

              // Reset button state
              try {
                dmPageMediaBtn.disabled = false;
                dmPageMediaBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>';
              } catch (e) {}

              if (uploadResult && uploadResult.url) {
                // Store pending media and show preview; do NOT auto-send — user will press Send
                pendingDmMediaUrl = uploadResult.url;
                pendingDmMediaFileId = uploadResult.fileId || null;

                // Analytics: image uploaded (preview stored)
                try { sendAnalyticsEvent('image_uploaded', { thread_id: activeDMThread || null, media_file_id: pendingDmMediaFileId || null }); } catch (e) {}

                // Show preview UI
                if (dmMediaPreviewContent && dmMediaPreview) {
                  dmMediaPreviewContent.innerHTML = '';
                  const isVideo = file.type.startsWith('video/');
                  if (isVideo) {
                    const video = document.createElement('video');
                    video.src = pendingDmMediaUrl;
                    video.controls = true;
                    video.className = 'max-h-20 rounded-lg';
                    dmMediaPreviewContent.appendChild(video);
                  } else {
                    const img = document.createElement('img');
                    img.src = pendingDmMediaUrl;
                    img.className = 'max-h-20 rounded-lg';
                    dmMediaPreviewContent.appendChild(img);
                  }
                  dmMediaPreview.classList.remove('hidden');
                  // Focus input so user can add caption
                  try { dmPageInput && dmPageInput.focus(); } catch(e) {}
                }
              }
            } catch (err) {
              console.error('[DM] media upload error', err);
              if (err && err.message) showToast('Media upload failed: ' + err.message, 'error');
            } finally {
              dmUploadInProgress = false;
            }
          });

          // Cancel pending DM media upload
          if (dmCancelMediaBtn) {
            dmCancelMediaBtn.addEventListener('click', async () => {
              if (pendingDmMediaFileId) {
                try {
                  await deleteFromImageKit(pendingDmMediaFileId);
                } catch (e) { console.error('[DM] delete ImageKit error', e); }
              }
              pendingDmMediaUrl = null;
              pendingDmMediaFileId = null;
              if (dmMediaPreview) dmMediaPreview.classList.add('hidden');
              if (dmMediaPreviewContent) dmMediaPreviewContent.innerHTML = '';
            });
          }
        }

        // DM Page start new conversation with live search
        const dmPageStartBtn = document.getElementById('dmPageStartBtn');
        const dmPageUserSearch = document.getElementById('dmPageUserSearch');
        let dmSearchResults = null;
        
        if (dmPageUserSearch) {
          // Create search results dropdown
          dmSearchResults = document.createElement('div');
          dmSearchResults.className = 'absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto hidden';
          dmPageUserSearch.parentElement.style.position = 'relative';
          dmPageUserSearch.parentElement.appendChild(dmSearchResults);
          
          // Live search as user types
          dmPageUserSearch.addEventListener('input', async () => {
            const query = dmPageUserSearch.value.trim().toLowerCase();
            if (query.length < 1) {
              dmSearchResults.classList.add('hidden');
              return;
            }
            
            // Search through mentionUsers (already loaded)
            let matches = [];
            for (const [key, user] of mentionUsers) {
              if (key.includes(query) || user.username.toLowerCase().includes(query)) {
                matches.push(user);
                if (matches.length >= 8) break;
              }
            }
            
            // If no results from mentionUsers, search database directly
            if (matches.length === 0) {
              try {
                const [usersSnap, profilesSnap] = await Promise.all([
                  db.ref('users').once('value'),
                  db.ref('userProfiles').once('value')
                ]);
                const allUsers = usersSnap.val() || {};
                const allProfiles = profilesSnap.val() || {};
                
                Object.entries(allUsers).forEach(([uid, val]) => {
                  const uname = val?.username || val?.displayName;
                  if (!uname || uid === currentUserId) return;
                  if (uname.toLowerCase().includes(query)) {
                    const prof = allProfiles[uid] || {};
                    matches.push({ username: uname, uid, profilePic: prof.profilePic || null });
                    // Also add to mentionUsers for future searches
                    mentionUsers.set(uname.toLowerCase(), { username: uname, uid, profilePic: prof.profilePic || null });
                  }
                });
                matches = matches.slice(0, 8);
              } catch (err) {
                console.warn('[DM search] database search failed', err);
              }
            }
            
            if (matches.length === 0) {
              dmSearchResults.innerHTML = '<p class="text-xs text-slate-500 p-3">No users found</p>';
            } else {
              dmSearchResults.innerHTML = matches.map(user => `
                <div class="dm-search-result flex items-center gap-2 p-2 hover:bg-slate-700 cursor-pointer" data-uid="${user.uid}" data-username="${escapeHtml(user.username)}">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                    ${user.profilePic ? `<img src="${escapeHtml(user.profilePic)}" class="w-full h-full object-cover">` : user.username.slice(0,2).toUpperCase()}
                  </div>
                  <span class="text-sm text-slate-200">${escapeHtml(user.username)}</span>
                </div>
              `).join('');
            }
            dmSearchResults.classList.remove('hidden');
            
            // Click handlers for results
            dmSearchResults.querySelectorAll('.dm-search-result').forEach(el => {
              el.addEventListener('click', () => startDmWithUser(el.dataset.uid, el.dataset.username));
              el.addEventListener('touchend', (e) => { e.preventDefault(); startDmWithUser(el.dataset.uid, el.dataset.username); });
            });
          });
          
          // Hide on blur
          dmPageUserSearch.addEventListener('blur', () => {
            setTimeout(() => dmSearchResults.classList.add('hidden'), 200);
          });
        }
        
        async function startDmWithUser(otherUid, otherUsername) {
          if (!otherUid || otherUid === currentUserId) {
            showToast('Cannot start conversation', 'error');
            return;
          }
          try {
            const threadId = makeThreadId(currentUserId, otherUid);
            // Use same path as existing DM system: dms/
            await db.ref('dms/' + threadId + '/participants/' + currentUserId).set(true);
            await db.ref('dms/' + threadId + '/participants/' + otherUid).set(true);
            const now = Date.now();
            await db.ref('dmInbox/' + currentUserId + '/' + threadId).update({
              withUid: otherUid,
              withUsername: otherUsername,
              lastTime: now
            });
            await db.ref('dmInbox/' + otherUid + '/' + threadId).update({
              withUid: currentUserId,
              withUsername: currentUsername,
              lastTime: now
            });
            if (dmPageUserSearch) dmPageUserSearch.value = '';
            if (dmSearchResults) dmSearchResults.classList.add('hidden');
            openDmPageThread(otherUid, otherUsername, threadId);
          } catch (err) {
            console.error('[DM] start conversation error', err);
            showToast('Error starting conversation', 'error');
          }
        }
        
        if (dmPageStartBtn && dmPageUserSearch) {
          dmPageStartBtn.addEventListener('click', async () => {
            const searchVal = dmPageUserSearch.value.trim();
            if (!searchVal) return;
            // Find user by username (exact match)
            try {
              const usersSnap = await db.ref('users').orderByChild('username').equalTo(searchVal).once('value');
              const users = usersSnap.val();
              if (!users) {
                showToast('User not found', 'error');
                return;
              }
              const otherUid = Object.keys(users)[0];
              startDmWithUser(otherUid, searchVal);
            } catch (err) {
              console.error('[DM] start conversation error', err);
              showToast('Error starting conversation', 'error');
            }
          });
        }

        // DM Page block button
        const dmPageBlockBtn = document.getElementById('dmPageBlockBtn');
        if (dmPageBlockBtn) {
          dmPageBlockBtn.addEventListener('click', async () => {
            if (!activeDMTarget || !activeDMTarget.uid) return;
            if (confirm('Block this user?')) {
              try {
                await db.ref('blocks/' + currentUserId + '/' + activeDMTarget.uid).set(true);
                showToast('User blocked', 'success');
              } catch (err) {
                console.error('[DM] block error', err);
              }
            }
          });
        }
      }

      // Pagination / infinite scroll
      let PAGE_SIZE = 75; // default page size
      let FAST_MODE_ENABLED = false;
      let oldestTime = null;
      let newestTime = null;
      let isLoadingOlder = false;
      let allHistoryLoaded = false;
      let scrollListenerAttached = false;

      // --- Scroll-to-bottom button ---
      let scrollToBottomBtn = null;
      let scrollBtnListenerAttached = false;

      function createScrollToBottomBtn() {
        if (scrollToBottomBtn) return;
        const wrapper = messagesDiv.parentElement;
        if (!wrapper) return;
        if (getComputedStyle(wrapper).position === "static") {
          wrapper.style.position = "relative";
        }
        const btn = document.createElement("button");
        btn.id = "scrollToBottomBtn";
        // Centered above the send box, slightly higher
        btn.className = "absolute bottom-28 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-500 shadow-lg flex items-center justify-center text-white transition-all z-30";
        // Start hidden with inline style to ensure it doesn't flash
        btn.style.opacity = "0";
        btn.style.pointerEvents = "none";
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clip-rule="evenodd"/></svg>';
        btn.title = "Scroll to bottom";
        btn.addEventListener("click", () => {
          messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: "smooth" });
        });
        wrapper.appendChild(btn);
        scrollToBottomBtn = btn;
      }

      function updateScrollToBottomBtn() {
        if (!scrollToBottomBtn) createScrollToBottomBtn();
        if (!scrollToBottomBtn) return;
        const distance = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight;
        // Only show when NOT at bottom (more than 50px away)
        const isAtBottom = distance <= 50;
        if (isAtBottom) {
          scrollToBottomBtn.style.opacity = "0";
          scrollToBottomBtn.style.pointerEvents = "none";
        } else {
          scrollToBottomBtn.style.opacity = "1";
          scrollToBottomBtn.style.pointerEvents = "auto";
        }
      }

      // Attach scroll listener once
      function ensureScrollButtonListeners() {
        createScrollToBottomBtn();
        if (!scrollBtnListenerAttached) {
          messagesDiv.addEventListener("scroll", updateScrollToBottomBtn);
          scrollBtnListenerAttached = true;
        }
        // Initial state - delay to let layout settle
        setTimeout(updateScrollToBottomBtn, 100);
      }

      // --- @MENTION SYSTEM ---
      // Track users who have sent messages for mention suggestions
      function trackUserForMentions(username, uid, profilePic = null) {
        if (!username || username === currentUsername) return;
        mentionUsers.set(username.toLowerCase(), { username, uid, profilePic });
      }

      // Load all users from database for mention suggestions
      async function loadUsersForMentions() {
        try {
          const [usersSnap, profilesSnap] = await Promise.all([
            db.ref("users").once("value"),
            db.ref("userProfiles").once("value")
          ]);
          const allUsers = usersSnap.val() || {};
          const allProfiles = profilesSnap.val() || {};
          
          Object.entries(allUsers).forEach(([uid, val]) => {
            const uname = val?.username;
            if (!uname || uid === currentUserId) return;
            const prof = allProfiles[uid] || {};
            mentionUsers.set(uname.toLowerCase(), { username: uname, uid, profilePic: prof.profilePic || null });
          });
          console.log("[mentions] loaded", mentionUsers.size, "users for mentions");
        } catch (err) {
          console.warn("[mentions] failed to load users for mentions", err);
        }
      }

      // Get mention suggestions based on query
      function getMentionSuggestions(query) {
        const q = (query || "").toLowerCase();
        const suggestions = [];
        
        // Add @AI option at the top if query matches
        if ('ai'.includes(q) || q === '') {
          suggestions.push({ username: 'AI', uid: AI_BOT_UID, profilePic: aiProfile.avatar, isAI: true });
        }
        
        // Add @everyone option for admins at the top if query matches
        if (isAdmin && 'everyone'.includes(q)) {
          suggestions.push({ username: 'everyone', uid: null, profilePic: null, isEveryone: true });
        }
        
        for (const [key, user] of mentionUsers) {
          if (key.includes(q) || user.username.toLowerCase().includes(q)) {
            suggestions.push(user);
          }
        }
        console.debug(`[mentions] getMentionSuggestions q='${q}' -> ${suggestions.length} suggestions`);
        // Sort by relevance (starts with query first, then alphabetically) but keep @AI and @everyone at top
        suggestions.sort((a, b) => {
          if (a.isAI) return -1;
          if (b.isAI) return 1;
          if (a.isEveryone) return -1;
          if (b.isEveryone) return 1;
          const aStarts = a.username.toLowerCase().startsWith(q);
          const bStarts = b.username.toLowerCase().startsWith(q);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.username.localeCompare(b.username);
        });
        return suggestions.slice(0, 8); // Max 8 suggestions
      }

      // Create/update the mention autocomplete dropdown
      function showMentionAutocomplete(suggestions) {
        console.debug('[mentions] showMentionAutocomplete suggestions=', suggestions && suggestions.length);
        if (!mentionAutocomplete) {
          mentionAutocomplete = document.createElement("div");
          mentionAutocomplete.className = "mention-autocomplete";
          mentionAutocomplete.id = "mentionAutocomplete";
          // Always append to body to avoid clipping/overflow issues in parent containers
          document.body.appendChild(mentionAutocomplete);
          mentionAutocomplete.style.position = 'absolute';
          mentionAutocomplete.style.display = 'none';
          mentionAutocomplete.style.zIndex = '99999'; // Ensure highest z-index for iPad Safari
        }

        if (suggestions.length === 0) {
          // Show a hint if we have no users to mention at all
          if (mentionUsers.size === 0) {
            mentionAutocomplete.innerHTML = `
              <div class="mention-item" style="cursor: default; opacity: 0.7;">
                <div class="mention-info">
                  <div class="mention-username" style="color: #94a3b8;">No users to mention yet</div>
                  <div class="mention-hint">Users will appear as they chat</div>
                </div>
              </div>
            `;
            mentionAutocomplete.style.display = "block";
          } else {
            hideMentionAutocomplete();
          }
          return;
        }

        mentionSelectedIndex = 0;
        mentionAutocomplete.innerHTML = suggestions.map((user, i) => {
          const initials = user.isEveryone ? 'ðŸ“¢' : user.username.slice(0, 2).toUpperCase();
          const avatarContent = user.isEveryone
            ? 'ðŸ“¢'
            : (user.profilePic 
              ? `<img src="${escapeHtml(user.profilePic)}" alt="" onerror="this.parentElement.innerHTML='${initials}'">` 
              : initials);
          const hintText = user.isEveryone ? 'Mention everyone (admin only)' : 'Click to mention';
          return `
            <div class="mention-item ${i === 0 ? 'selected' : ''}${user.isEveryone ? ' everyone-option' : ''}" data-username="${escapeHtml(user.username)}" data-index="${i}">
              <div class="mention-avatar" ${user.isEveryone ? 'style="font-size:18px;background:linear-gradient(135deg,#f59e0b,#d97706);"' : ''}>${avatarContent}</div>
              <div class="mention-info">
                <div class="mention-username" ${user.isEveryone ? 'style="color:#fbbf24"' : ''}>@${escapeHtml(user.username)}</div>
                <div class="mention-hint">${hintText}</div>
              </div>
            </div>
          `;
        }).join('');

        mentionAutocomplete.style.display = "block";
        // Debug: log where the element lives and its position
        try {
          const parentName = mentionAutocomplete.parentElement ? mentionAutocomplete.parentElement.tagName : 'null';
          console.debug('[mentions] dropdown parent=', parentName, 'position=', mentionAutocomplete.style.position);
        } catch (e) {}

        // Position the dropdown near the input field (absolute, with scroll offsets for iPad Safari)
        const targetInput = activeMentionInput || msgInput;
        if (mentionAutocomplete && targetInput) {
          requestAnimationFrame(() => {
            try {
              const rect = targetInput.getBoundingClientRect();
              const viewportW = window.innerWidth || document.documentElement.clientWidth;
              const viewportH = window.innerHeight || document.documentElement.clientHeight;
              const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
              const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

              // Width: at least 220px, otherwise match input width
              const width = Math.max(rect.width, 220);
              mentionAutocomplete.style.width = width + 'px';

              // Horizontal position: clamp to viewport with 8px padding
              const rawLeft = rect.left + scrollX;
              const maxLeft = viewportW + scrollX - width - 8;
              const clampedLeft = Math.max(scrollX + 8, Math.min(rawLeft, maxLeft));
              mentionAutocomplete.style.left = clampedLeft + 'px';

              // Vertical position: prefer below, fall back to above if not enough room
              const h = mentionAutocomplete.offsetHeight || 200;
              const belowTop = rect.bottom + scrollY + 6;
              const aboveTop = rect.top + scrollY - h - 6;
              const fitsBelow = belowTop + h <= viewportH + scrollY - 6;
              const fitsAbove = aboveTop >= scrollY + 6;
              if (fitsBelow || !fitsAbove) {
                mentionAutocomplete.style.top = belowTop + 'px';
              } else {
                mentionAutocomplete.style.top = aboveTop + 'px';
              }
              console.debug('[mentions] positioned dropdown at', mentionAutocomplete.style.left, mentionAutocomplete.style.top, 'width', mentionAutocomplete.style.width);
            } catch (e) {
              // ignore positioning errors
            }
          });
        }

        // Add click handlers (and touch handlers for iPad)
        mentionAutocomplete.querySelectorAll('.mention-item').forEach(item => {
          // Click handler for desktop
          item.addEventListener('click', () => {
            selectMention(item.dataset.username);
          });
          // Touch handler for iPad/mobile
          item.addEventListener('touchend', (e) => {
            e.preventDefault();
            selectMention(item.dataset.username);
          });
          item.addEventListener('mouseenter', () => {
            mentionAutocomplete.querySelectorAll('.mention-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            mentionSelectedIndex = parseInt(item.dataset.index);
          });
        });
      }

      function hideMentionAutocomplete() {
        if (mentionAutocomplete) {
          mentionAutocomplete.style.display = "none";
        }
        mentionStartPos = -1;
        mentionQuery = "";
      }

      function selectMention(username) {
        if (!username || mentionStartPos < 0) return;
        const targetInput = activeMentionInput || msgInput;
        if (!targetInput) return;
        
        const beforeMention = targetInput.value.slice(0, mentionStartPos);
        const afterMention = targetInput.value.slice(targetInput.selectionStart);
        
        targetInput.value = beforeMention + '@' + username + ' ' + afterMention;
        
        // Set cursor position after the mention
        const newPos = mentionStartPos + username.length + 2; // +2 for @ and space
        targetInput.setSelectionRange(newPos, newPos);
        targetInput.focus();
        
        hideMentionAutocomplete();
      }

      function updateMentionSelection(delta) {
        if (!mentionAutocomplete || mentionAutocomplete.style.display === "none") return false;
        
        const items = mentionAutocomplete.querySelectorAll('.mention-item');
        if (items.length === 0) return false;
        
        items[mentionSelectedIndex]?.classList.remove('selected');
        mentionSelectedIndex = (mentionSelectedIndex + delta + items.length) % items.length;
        items[mentionSelectedIndex]?.classList.add('selected');
        items[mentionSelectedIndex]?.scrollIntoView({ block: 'nearest' });
        
        return true;
      }

      function confirmMentionSelection() {
        if (!mentionAutocomplete || mentionAutocomplete.style.display === "none") return false;
        
        const selected = mentionAutocomplete.querySelector('.mention-item.selected');
        if (selected) {
          selectMention(selected.dataset.username);
          return true;
        }
        return false;
      }

      // Notify user when they are mentioned
      function notifyMention(msg) {
        try {
          const from = msg.user || 'Someone';
          const snippet = previewText((msg.text || '').replace(/\s+/g, ' ').trim(), 120);

          // Inline banner near the input
          try {
            const formWrapper = messageForm?.parentElement || document.body;
            let existing = document.getElementById('mentionInlineBanner');
            if (existing && existing.parentElement) existing.parentElement.removeChild(existing);

            const banner = document.createElement('div');
            banner.id = 'mentionInlineBanner';
            banner.className = 'inline-report-anim mb-2 rounded-lg border border-amber-500/50 bg-amber-600/10 p-2 flex items-center gap-3 text-sm';
            // If fast mode is enabled, omit the animated class on the name
            const nameHtml = FAST_MODE_ENABLED ?
              `<span style="font-weight:600;color:#f59e0b">${escapeHtml(from)}</span>` :
              `<span class="mention-from">${escapeHtml(from)}</span>`;
            banner.innerHTML = `<strong style="color:#f59e0b">Mentioned</strong> by ${nameHtml}: <span style="color:#f1f5f9">${escapeHtml(snippet)}</span>`;
            // insert before messageForm
            if (formWrapper && messageForm && formWrapper.contains(messageForm)) {
              formWrapper.insertBefore(banner, messageForm);
            } else {
              document.body.appendChild(banner);
            }

            setTimeout(() => {
              banner.classList.add('fade-out');
              setTimeout(() => { if (banner.parentElement) banner.parentElement.removeChild(banner); }, 600);
            }, 4000);
          } catch (e) {}

          // Browser notification
          if ("Notification" in window && Notification.permission === 'granted') {
            const n = new Notification(`${from} mentioned you`, { body: snippet });
            n.onclick = () => window.focus();
          }
        } catch (err) {
          console.warn('[mentions] notifyMention error', err);
        }
      }

      // Parse @mentions in text and return HTML with highlighted mentions
      function renderTextWithMentions(text, isMine = false) {
        if (!text) return "";
        
        // Match @username pattern (letters, numbers, underscores, dashes) or @everyone
        const mentionRegex = /@(everyone|[a-zA-Z0-9_-]{2,12})\b/g;
        
        let result = "";
        let lastIndex = 0;
        let match;
        
        while ((match = mentionRegex.exec(text)) !== null) {
          // Add text before the mention
          result += escapeHtml(text.slice(lastIndex, match.index));
          
          const mentionedUsername = match[1];
          // @everyone highlights for everyone (orange like mention-me)
          const isEveryone = mentionedUsername.toLowerCase() === 'everyone';
          const isMe = mentionedUsername.toLowerCase() === (currentUsername || "").toLowerCase();
          const mentionClass = (isMe || isEveryone) ? "mention-highlight mention-me" : "mention-highlight";
          
          result += `<span class="${mentionClass}" data-mention="${escapeHtml(mentionedUsername)}">@${escapeHtml(mentionedUsername)}</span>`;
          
          lastIndex = match.index + match[0].length;
        }
        
        // Add remaining text
        result += escapeHtml(text.slice(lastIndex));
        
        return result;
      }

      // Handle mention input detection
      function handleMentionInput(inputEl) {
        const targetInput = inputEl || msgInput;
        if (!targetInput) return;
        activeMentionInput = targetInput;
        const value = targetInput.value;
        const cursorPos = targetInput.selectionStart;
        
        // Find the @ symbol before cursor
        let atPos = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
          const char = value[i];
          if (char === '@') {
            // Check if @ is at start or after whitespace
            if (i === 0 || /\s/.test(value[i - 1])) {
              atPos = i;
            }
            break;
          }
          if (/\s/.test(char)) break; // Stop at whitespace
        }
        
        if (atPos >= 0) {
          mentionStartPos = atPos;
          mentionQuery = value.slice(atPos + 1, cursorPos);

          // Debugging info
          console.debug('[mentions] handleMentionInput atPos=', atPos, 'cursorPos=', cursorPos, "query='"+mentionQuery+"'", 'mentionUsersSize=', mentionUsers.size);

          // Only show suggestions if query is at least 0 char (we allow empty for full list)
          const suggestions = getMentionSuggestions(mentionQuery);
          console.debug('[mentions] suggestions returned=', suggestions.length);
          showMentionAutocomplete(suggestions);
        } else {
          console.debug('[mentions] no @ before cursor (atPos=-1)');
          hideMentionAutocomplete();
        }
      }

      // Insert @mention at cursor position (for shift+click on username)
      function insertMentionAtCursor(username) {
        if (!username || !msgInput) return;
        
        const value = msgInput.value;
        const cursorPos = msgInput.selectionStart;
        
        // Add space before @ if needed
        const needsSpace = cursorPos > 0 && !/\s/.test(value[cursorPos - 1]);
        const mention = (needsSpace ? ' ' : '') + '@' + username + ' ';
        
        const before = value.slice(0, cursorPos);
        const after = value.slice(cursorPos);
        
        msgInput.value = before + mention + after;
        
        const newPos = cursorPos + mention.length;
        msgInput.setSelectionRange(newPos, newPos);
        msgInput.focus();
      }

      // --- INLINE REPORT UI ---
      let activeInlineReport = null; // { messageId, container }

      function cancelInlineReport() {
        if (!activeInlineReport) return;
        const { container } = activeInlineReport;
        if (container && container.parentElement) container.parentElement.removeChild(container);
          const wrapper = document.createElement('div');
          wrapper.className = 'inline-report-anim mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2 flex flex-col gap-2';
      }

      function openInlineReport(messageId, messageData, reportedUsername, bubbleContainer) {
        if (!messageId || !bubbleContainer) return;
        // Close any existing inline report
        cancelInlineReport();

        const wrapper = document.createElement('div');
        wrapper.className = 'inline-report-anim mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2 flex flex-col gap-2';

        const label = document.createElement('div');
        label.className = 'text-xs text-amber-200 font-semibold flex items-center gap-2';
        label.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.647 1.276a.75.75 0 0 1 .706 0l7.5 4.167A.75.75 0 0 1 17 6H3a.75.75 0 0 1-.353-1.41l7.5-4.167ZM2.75 7.5A.75.75 0 0 0 2 8.25v8.5A1.25 1.25 0 0 0 3.25 18h13.5A1.25 1.25 0 0 0 18 16.75v-8.5a.75.75 0 0 0-.75-.75h-14.5Zm7.954 2.75a.75.75 0 0 1 .542.916l-.833 3.124a.75.75 0 1 1-1.458-.39l.833-3.124a.75.75 0 0 1 .916-.526Zm.546-2.522a1 1 0 1 0-1.5-1.316l-5 5.75a1 1 0 1 0 1.5 1.316l5-5.75Z" clip-rule="evenodd"/></svg><span>Report ${escapeHtml(reportedUsername)}</span>`;

        const textarea = document.createElement('textarea');
        textarea.className = 'w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-amber-400';
        textarea.placeholder = 'Describe the issue (brief)';
        textarea.rows = 3;

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-2 justify-end';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm';
        cancelBtn.textContent = 'Cancel';

        const submitBtn = document.createElement('button');
        submitBtn.className = 'px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-semibold';
        submitBtn.textContent = 'Submit';

        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);

        wrapper.appendChild(label);
        wrapper.appendChild(textarea);
        wrapper.appendChild(actions);

        bubbleContainer.appendChild(wrapper);
        activeInlineReport = { messageId, container: wrapper };
        textarea.focus();

        let submitting = false;
        const doSubmit = async () => {
          if (submitting) return;
          const reason = textarea.value.trim();
          if (!reason) {
            textarea.focus();
            return;
          }
          submitting = true;
          submitBtn.disabled = true;
          cancelBtn.disabled = true;
          submitBtn.textContent = 'Submitting...';
          try {
            await reportMessage(messageId, messageData, reportedUsername, reason);
            // reportMessage handles UI; remove inline report
            cancelInlineReport();
          } catch (err) {
            console.error('[inline-report] submit error', err);
            submitBtn.disabled = false;
            cancelBtn.disabled = false;
            submitBtn.textContent = 'Submit';
          } finally {
            submitting = false;
          }
        };

        submitBtn.addEventListener('click', doSubmit);
        cancelBtn.addEventListener('click', cancelInlineReport);
        textarea.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            doSubmit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelInlineReport();
          }
        });
      }

      // Rating prompt cadence
      const RATING_INTERVAL_MS = 10 * 60 * 1000;
      let ratingIntervalId = null;
      let ratingOptOut = false;
      let ratingLastPrompt = 0;
      let ratingPendingStars = null;

      // Load blocked users into cache
      async function loadBlockedUsersCache() {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        try {
          const snap = await db.ref("blockedUsers/" + uid).once("value");
          blockedUsersCache.clear();
          
          if (snap.exists()) {
            const blocked = snap.val();
            Object.keys(blocked).forEach(blockedUid => {
              blockedUsersCache.add(blockedUid);
            });
            console.log("[block] loaded", blockedUsersCache.size, "blocked users into cache");
          }
        } catch (err) {
          console.error("[block] error loading blocked users cache:", err);
        }
      }

      // Load friends into cache for quick checks (notifications, etc.)
      async function loadFriendsCache() {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        try {
          const snap = await db.ref("friends/" + uid).once("value");
          friendsCache.clear();
          if (snap.exists()) {
            Object.keys(snap.val()).forEach((fid) => friendsCache.add(fid));
          }
          console.log("[friends] loaded", friendsCache.size, "friends into cache");
        } catch (err) {
          console.error("[friends] error loading friends cache:", err);
        }
      }

      // Check if current user can DM target based on their privacy settings
      // Returns { allowed: boolean, reason?: string }
      async function checkDmPrivacy(targetUid) {
        try {
          const privacySnap = await db.ref("userPrivacy/" + targetUid).once("value");
          const privacy = privacySnap.val() || {};
          
          // Handle legacy boolean allowDMs
          if (privacy.allowDMs === false) {
            return { allowed: false, reason: "This user is not accepting DMs." };
          }
          
          // New dmPrivacy setting: 'anyone' (default), 'friends', 'none'
          const dmPrivacy = privacy.dmPrivacy || 'anyone';
          
          if (dmPrivacy === 'none') {
            return { allowed: false, reason: "This user has DMs disabled." };
          }
          
          if (dmPrivacy === 'friends') {
            // Check if we're friends with this user
            const friendSnap = await db.ref("friends/" + targetUid + "/" + currentUserId).once("value");
            if (!friendSnap.exists()) {
              return { allowed: false, reason: "This user only accepts DMs from friends." };
            }
          }
          
          return { allowed: true };
        } catch (err) {
          console.error("[dm] privacy check error:", err);
          return { allowed: true }; // Allow on error to not block legitimate DMs
        }
      }

      // --- Moderation helpers (admin, ban, mute, warnings) ---
      function detachModerationListeners() {
        if (adminRef && adminListener) adminRef.off("value", adminListener);
        if (muteRef && muteListener) muteRef.off("value", muteListener);
        if (warningRef && warningListener) warningRef.off("value", warningListener);
        if (banRef && banListener) banRef.off("value", banListener);
        if (banCountdownInterval) {
          clearInterval(banCountdownInterval);
          banCountdownInterval = null;
        }
        if (banLogoutTimeout) {
          clearTimeout(banLogoutTimeout);
          banLogoutTimeout = null;
        }
        adminRef = muteRef = warningRef = banRef = null;
        adminListener = muteListener = warningListener = banListener = null;
        isAdmin = false;
        isMuted = false;
        if (msgInput) {
          msgInput.disabled = false;
          msgInput.placeholder = "Type a message...";
        }
        if (sendBtn) sendBtn.disabled = false;
        if (warningPopup) warningPopup.classList.add("hidden");
        if (warningAgree) warningAgree.checked = false;
        if (closeWarningBtn) {
          closeWarningBtn.disabled = true;
          closeWarningBtn.classList.add("opacity-50", "cursor-not-allowed");
        }
      }

      function checkAdmin() {
        const uid = firebase.auth().currentUser?.uid;
        if (!uid) return;
        console.log("[checkAdmin] Current user UID:", uid);
        adminRef = firebase.database().ref("admins/" + uid);
        adminListener = (snap) => {
          isAdmin = snap.exists();
          console.log("[checkAdmin] Admin check for uid", uid, "- exists:", isAdmin, "- snap.val():", snap.val());
          
          // Show/hide mod panel button
          const modPanelBtn = document.getElementById("adminModPanelBtn");
          if (modPanelBtn) {
            if (isAdmin) {
              modPanelBtn.classList.remove("hidden");
              modPanelBtn.classList.add("flex");
            } else {
              modPanelBtn.classList.add("hidden");
              modPanelBtn.classList.remove("flex");
            }
          }
          
          if (isAdmin) {
            // Add admin delete buttons to already-rendered non-owner messages
            try {
              refreshAdminControls();
            } catch (e) {
              console.warn("[admin] failed to refresh admin controls", e);
            }
          }
        };
        adminRef.on("value", adminListener);
      }

      function banUser(uid, durationMinutes = null, reason = "Rule break") {
        if (!isAdmin || !uid) return;

        if (durationMinutes === "permanent") {
          // Delete account permanently
          deleteUserAccount(uid, reason);
          return;
        }

        // Temporary ban (default 1 hour if not provided)
        const until = durationMinutes ? Date.now() + durationMinutes * 60 * 1000 : Date.now() + 3600000;
        firebase.database().ref("bannedUsers/" + uid).set({
          until: until,
          reason: reason,
        }).catch((err) => {
          console.error("[ban] failed to ban user", err);
        });
      }

      async function deleteUserAccount(uid, reason = "Permanent ban") {
        if (!isAdmin || !uid) return;
        
        try {
          console.log("[ban] deleting account for uid:", uid);
          
          // Get user data (username)
          const userSnap = await db.ref("users/" + uid).once("value");
          const userData = userSnap.val();
          console.log("[ban] user data:", userData);
          
          // Get fingerprint separately (it's stored directly under users/{uid}/fingerprint)
          const fpSnap = await db.ref("users/" + uid + "/fingerprint").once("value");
          const storedFingerprint = fpSnap.val();
          console.log("[ban] stored fingerprint:", storedFingerprint ? storedFingerprint.slice(0,16) + '...' : 'none');
          
          // Ban user's fingerprint if stored and feature enabled (hardware ban)
          if (FINGERPRINT_ENABLED && storedFingerprint && typeof storedFingerprint === 'string' && storedFingerprint.length >= 32) {
            try {
              await banTargetFingerprint(storedFingerprint, reason + ' (Account: ' + uid.slice(0,8) + ')');
              console.log("[ban] fingerprint banned for uid:", uid);
            } catch (e) {
              console.warn("[ban] failed to ban fingerprint:", e);
            }
          } else {
            console.log("[ban] no fingerprint to ban for this user");
          }
          
          // Delete all messages by this user
          const msgsSnap = await db.ref("messages").orderByChild("userId").equalTo(uid).once("value");
          msgsSnap.forEach((childSnap) => {
            db.ref("messages/" + childSnap.key).remove();
          });
          
          // Delete user account
          await db.ref("users/" + uid).remove();
          
          // Block username from being used again (use encoded key)
          if (userData && userData.username) {
            const encodedUsername = encodeFirebaseKey(userData.username);
            await db.ref("bannedUsernames/" + encodedUsername).set({
              uid: uid,
              reason: reason,
              timestamp: Date.now()
            });
          }
          
          // Mark as permanently banned so they can't re-register with same email (use encoded key)
          if (userData && userData.email) {
            const encodedEmail = encodeFirebaseKey(userData.email);
            await db.ref("bannedEmails/" + encodedEmail).set({
              uid: uid,
              reason: reason,
              timestamp: Date.now()
            });
          }
          
          // Add UID to bannedUsers so they're blocked at database level
          console.log("[ban] adding uid to bannedUsers:", uid);
          await db.ref("bannedUsers/" + uid).set({
            until: 9999999999999,
            reason: reason,
            username: userData?.username || 'Unknown',
            bannedAt: Date.now()
          });
          console.log("[ban] uid added to bannedUsers successfully");
          
          console.log("[ban] account deleted successfully");
        } catch (err) {
          console.error("[ban] failed to delete account:", err);
        }
      }

      let pendingBanUid = null;

      function showBanReasonModal(uid) {
        pendingBanUid = uid;
        const banReasonModal = document.getElementById("banReasonModal");
        const banReasonCustom = document.getElementById("banReasonCustom");
        const banDuration = document.getElementById("banDuration");
        banReasonCustom.value = "";
        banDuration.value = "60";
        banReasonModal.classList.remove("hidden");
      }

      function setupBanModal() {
        const banReasonModal = document.getElementById("banReasonModal");
        const banReasonConfirm = document.getElementById("banReasonConfirm");
        const banReasonCancel = document.getElementById("banReasonCancel");
        const banReasonCustom = document.getElementById("banReasonCustom");
        const banDuration = document.getElementById("banDuration");
        const banHardwareBan = document.getElementById("banHardwareBan");
        const banReasonSpam = document.getElementById("banReasonSpam");
        const banReasonAbuse = document.getElementById("banReasonAbuse");
        const banReasonDisruption = document.getElementById("banReasonDisruption");
        const banReasonHarassment = document.getElementById("banReasonHarassment");

        const setReason = (reason) => {
          banReasonCustom.value = reason;
        };

        banReasonSpam.onclick = () => setReason("Spam");
        banReasonAbuse.onclick = () => setReason("Abusive Language");
        banReasonDisruption.onclick = () => setReason("Disruption");
        banReasonHarassment.onclick = () => setReason("Harassment");

        banReasonConfirm.onclick = async () => {
          const reason = banReasonCustom.value.trim() || "Rule break";
          const duration = banDuration.value;
          const doHardwareBan = banHardwareBan && banHardwareBan.checked;
          
          if (pendingBanUid) {
            let chosenDuration;
            if (duration === "permanent") {
              chosenDuration = duration;
            } else {
              const parsed = parseInt(duration, 10);
              chosenDuration = Number.isFinite(parsed) ? parsed : 60;
            }

            // If hardware ban checkbox is checked, ban their fingerprint
            if (doHardwareBan && FINGERPRINT_ENABLED) {
              try {
                const fpSnap = await db.ref("users/" + pendingBanUid + "/fingerprint").once("value");
                const storedFp = fpSnap.val();
                if (storedFp && typeof storedFp === 'string' && storedFp.length >= 32) {
                  await banTargetFingerprint(storedFp, reason + ' (UID: ' + pendingBanUid.slice(0,8) + ')');
                  console.log("[ban] hardware banned user fingerprint");
                  showToast("Hardware ban applied", "success");
                } else {
                  console.warn("[ban] no fingerprint found for hardware ban");
                  showToast("No fingerprint stored for this user", "warning");
                }
              } catch (e) {
                console.error("[ban] hardware ban failed:", e);
              }
            }

            banUser(pendingBanUid, chosenDuration, reason);
            banReasonModal.classList.add("hidden");
            if (banHardwareBan) banHardwareBan.checked = false;
            viewProfileCloseBtn.click();
          }
        };

        banReasonCancel.onclick = () => {
          banReasonModal.classList.add("hidden");
          if (banHardwareBan) banHardwareBan.checked = false;
          pendingBanUid = null;
        };
      }

      function clearExpiredBan(uid, data) {
        // Remove an expired temp ban so the user is fully unbanned
        if (!uid || !data?.until) return;
        const now = Date.now();
        if (data.until <= now) {
          console.log("[ban] temp ban expired, clearing entry for", uid);
          db.ref("bannedUsers/" + uid).remove().catch((err) => {
            console.error("[ban] failed to clear expired ban", err);
          });
        }
      }

      async function unbanUser(uid) {
        if (!isAdmin || !uid) return;
        console.log("[ban] unbanning user", uid);
        try {
          const updates = { ["bannedUsers/" + uid]: null };

          // Clean up any blocked email/username entries tied to this uid
          const bannedEmailSnap = await db
            .ref("bannedEmails")
            .orderByChild("uid")
            .equalTo(uid)
            .once("value");
          bannedEmailSnap.forEach((childSnap) => {
            updates["bannedEmails/" + childSnap.key] = null;
          });

          const bannedUsernameSnap = await db
            .ref("bannedUsernames")
            .orderByChild("uid")
            .equalTo(uid)
            .once("value");
          bannedUsernameSnap.forEach((childSnap) => {
            updates["bannedUsernames/" + childSnap.key] = null;
          });

          await db.ref().update(updates);
          console.log("[ban] user unbanned");
        } catch (err) {
          console.error("[ban] failed to unban user", err);
        }
      }

      // ===== ADMIN MODERATION PANEL =====
      const OWNER_UID = 'u5yKqiZvioWuBGcGK3SWUBpUVrc2';
      let modPanelCurrentTab = 'banned';
      
      function setupModPanel() {
        const modPanelBtn = document.getElementById("adminModPanelBtn");
        const modPanelModal = document.getElementById("modPanelModal");
        const modPanelCloseBtn = document.getElementById("modPanelCloseBtn");
        const modPanelRefreshBtn = document.getElementById("modPanelRefreshBtn");
        const modPanelUnbanAllBtn = document.getElementById("modPanelUnbanAllBtn");
        const modPanelTabBanned = document.getElementById("modPanelTabBanned");
        const modPanelTabMuted = document.getElementById("modPanelTabMuted");
        const modPanelTabHardware = document.getElementById("modPanelTabHardware");
        const modPanelContent = document.getElementById("modPanelContent");
        
        if (!modPanelBtn || !modPanelModal) return;
        
        modPanelBtn.onclick = () => {
          modPanelModal.classList.remove("hidden");
          // Show Unban All button only for owner
          if (modPanelUnbanAllBtn && currentUserId === OWNER_UID) {
            modPanelUnbanAllBtn.classList.remove("hidden");
          }
          loadModPanelTab('banned');
        };
        
        modPanelCloseBtn.onclick = () => {
          modPanelModal.classList.add("hidden");
        };
        
        modPanelModal.onclick = (e) => {
          if (e.target === modPanelModal) modPanelModal.classList.add("hidden");
        };
        
        modPanelRefreshBtn.onclick = () => loadModPanelTab(modPanelCurrentTab);
        
        // Unban All - owner only
        if (modPanelUnbanAllBtn) {
          modPanelUnbanAllBtn.onclick = async () => {
            if (currentUserId !== OWNER_UID) {
              showToast("Only the owner can use this", "error");
              return;
            }
            if (!confirm(" UNBAN ALL?\n\nThis will remove ALL bans, mutes, and hardware bans. Are you sure?")) return;
            if (!confirm("Are you REALLY sure? This cannot be undone!")) return;
            
            modPanelUnbanAllBtn.disabled = true;
            modPanelUnbanAllBtn.textContent = "Clearing...";
            
            try {
              await Promise.all([
                db.ref("bannedUsers").remove(),
                db.ref("mutedUsers").remove(),
                db.ref("bannedFingerprints").remove()
              ]);
              showToast("All bans cleared!", "success");
              loadModPanelTab(modPanelCurrentTab);
            } catch (e) {
              console.error("[modPanel] unban all error:", e);
              showToast("Error clearing bans", "error");
            }
            
            modPanelUnbanAllBtn.disabled = false;
            modPanelUnbanAllBtn.textContent = " Unban All";
          };
        }
        
        const setTab = (tab) => {
          modPanelCurrentTab = tab;
          [modPanelTabBanned, modPanelTabMuted, modPanelTabHardware].forEach(btn => {
            btn.classList.remove('bg-red-600', 'bg-yellow-600', 'bg-purple-600', 'text-white');
            btn.classList.add('bg-slate-700', 'text-slate-300');
          });
          if (tab === 'banned') {
            modPanelTabBanned.classList.remove('bg-slate-700', 'text-slate-300');
            modPanelTabBanned.classList.add('bg-red-600', 'text-white');
          } else if (tab === 'muted') {
            modPanelTabMuted.classList.remove('bg-slate-700', 'text-slate-300');
            modPanelTabMuted.classList.add('bg-yellow-600', 'text-white');
          } else if (tab === 'hardware') {
            modPanelTabHardware.classList.remove('bg-slate-700', 'text-slate-300');
            modPanelTabHardware.classList.add('bg-purple-600', 'text-white');
          }
          loadModPanelTab(tab);
        };
        
        modPanelTabBanned.onclick = () => setTab('banned');
        modPanelTabMuted.onclick = () => setTab('muted');
        modPanelTabHardware.onclick = () => setTab('hardware');
      }
      
      async function loadModPanelTab(tab) {
        const modPanelContent = document.getElementById("modPanelContent");
        modPanelContent.innerHTML = '<div class="text-center py-8 text-slate-500">Loading...</div>';
        
        try {
          if (tab === 'banned') {
            await loadBannedUsers();
          } else if (tab === 'muted') {
            await loadMutedUsers();
          } else if (tab === 'hardware') {
            await loadHardwareBans();
          }
        } catch (e) {
          modPanelContent.innerHTML = '<div class="text-center py-8 text-red-400">Error loading data</div>';
          console.error("[modPanel] load error:", e);
        }
      }
      
      async function loadBannedUsers() {
        const modPanelContent = document.getElementById("modPanelContent");
        console.log('[modPanel] loading banned users...');
        const [banSnap, usersSnap, hwBanSnap] = await Promise.all([
          db.ref("bannedUsers").once("value"),
          db.ref("users").once("value"),
          db.ref("bannedFingerprints").once("value")
        ]);
        const banned = banSnap.val() || {};
        const users = usersSnap.val() || {};
        const hwBans = hwBanSnap.val() || {};
        
        // Filter out expired bans and auto-clean them
        const now = Date.now();
        const activeEntries = [];
        for (const [uid, data] of Object.entries(banned)) {
          const isPermanent = !data.until || data.until === 9999999999999;
          const isExpired = !isPermanent && data.until < now;
          if (isExpired) {
            // Auto-remove expired bans
            db.ref("bannedUsers/" + uid).remove().catch(() => {});
          } else {
            activeEntries.push([uid, data]);
          }
        }
        console.log('[modPanel] active banned entries:', activeEntries.length);
        
        if (activeEntries.length === 0) {
          modPanelContent.innerHTML = '<div class="flex flex-col items-center justify-center py-16 text-slate-400"><div class="w-20 h-20 rounded-full bg-green-600/20 flex items-center justify-center mb-4"><span class="text-4xl">✓</span></div><p class="text-xl font-medium">No Banned Users</p><p class="text-sm text-slate-500 mt-1">All clear!</p></div>';
          return;
        }
        
        let html = '<div class="space-y-4">';
        for (const [uid, data] of activeEntries) {
          const userObj = users[uid] || {};
          // Use stored username from ban record if account was deleted, fallback to users table
          const username = data.username || userObj.username || uid.slice(0, 8);
          const fp = userObj.fingerprint;
          const isPermanent = !data.until || data.until === 9999999999999;
          const expiresAt = isPermanent ? null : new Date(data.until).toLocaleString();
          const reason = data.reason || 'No reason';
          const isHardwareBanned = fp && hwBans[fp];
          const bannedAt = data.bannedAt ? new Date(data.bannedAt).toLocaleDateString() : null;
          
          html += `
            <div class="bg-slate-800/80 rounded-2xl p-5 border ${isPermanent ? 'border-red-500/30' : 'border-amber-500/30'} shadow-xl">
              <div class="flex items-start gap-4">
                <div class="w-14 h-14 rounded-xl bg-gradient-to-br ${isPermanent ? 'from-red-500 to-red-700' : 'from-amber-500 to-orange-600'} flex items-center justify-center text-2xl font-bold text-white shadow-lg flex-shrink-0">
                  ${escapeHtml(username.charAt(0).toUpperCase())}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-xl text-white">${escapeHtml(username)}</span>
                      ${isHardwareBanned ? '<span class="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full font-medium">ðŸ–¥ï¸ HW</span>' : ''}
                      ${isPermanent ? '<span class="px-2 py-0.5 bg-red-600 text-white text-xs rounded-full font-medium">PERMANENT</span>' : ''}
                    </div>
                  </div>
                  <div class="text-xs text-slate-400 font-mono mb-3">${uid}</div>
                  <div class="bg-slate-900/50 rounded-lg p-3 mb-3">
                    <div class="text-xs text-slate-500 uppercase tracking-wide mb-1">Reason</div>
                    <p class="text-slate-200">${escapeHtml(reason)}</p>
                  </div>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4 text-xs text-slate-400">
                      ${bannedAt ? '<span>ðŸ“… ' + bannedAt + '</span>' : ''}
                      ${!isPermanent && expiresAt ? '<span>â° Expires: ' + expiresAt + '</span>' : ''}
                    </div>
                  </div>
                </div>
              </div>
              <div class="flex gap-2 flex-wrap mt-4 pt-4 border-t border-slate-700">
                <button onclick="modPanelUnban('${uid}')" class="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-green-500/25 hover:scale-105">✓ Unban</button>
                <button onclick="modPanelExtendBan('${uid}')" class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-amber-500/25 hover:scale-105">â±ï¸ Extend</button>
                ${fp && !isHardwareBanned ? `<button onclick="modPanelHardwareBan('${fp}', '${uid}')" class="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-purple-500/25 hover:scale-105">ðŸ–¥ï¸ HW Ban</button>` : ''}
                ${fp && isHardwareBanned ? `<button onclick="modPanelUnHardwareBan('${fp}')" class="px-5 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:scale-105">ðŸ–¥ï¸ Remove HW</button>` : ''}
              </div>
            </div>
          `;
        }
        html += '</div>';
        modPanelContent.innerHTML = html;
      }
      
      async function loadMutedUsers() {
        const modPanelContent = document.getElementById("modPanelContent");
        console.log('[modPanel] loading muted users...');
        const [muteSnap, usersSnap] = await Promise.all([
          db.ref("mutedUsers").once("value"),
          db.ref("users").once("value")
        ]);
        const muted = muteSnap.val() || {};
        const users = usersSnap.val() || {};
        
        // Filter out expired mutes and auto-clean them
        const now = Date.now();
        const activeEntries = [];
        for (const [uid, data] of Object.entries(muted)) {
          const isPermanent = !data.until || data.until === 9999999999999;
          const isExpired = !isPermanent && data.until && data.until < now;
          if (isExpired) {
            // Auto-remove expired mutes
            db.ref("mutedUsers/" + uid).remove().catch(() => {});
          } else {
            activeEntries.push([uid, data]);
          }
        }
        console.log('[modPanel] active muted entries:', activeEntries.length);
        
        if (activeEntries.length === 0) {
          modPanelContent.innerHTML = '<div class="flex flex-col items-center justify-center py-16 text-slate-400"><div class="w-20 h-20 rounded-full bg-green-600/20 flex items-center justify-center mb-4"><span class="text-4xl">✓</span></div><p class="text-xl font-medium">No Muted Users</p><p class="text-sm text-slate-500 mt-1">All clear!</p></div>';
          return;
        }
        
        let html = '<div class="space-y-4">';
        for (const [uid, data] of activeEntries) {
          const userObj = users[uid] || {};
          const username = data.username || userObj.username || uid.slice(0, 8);
          const isPermanent = !data.until || data.until === 9999999999999;
          const expiresAt = isPermanent ? null : new Date(data.until).toLocaleString();
          const reason = data.reason || 'No reason';
          
          html += `
            <div class="bg-slate-800/80 rounded-2xl p-5 border ${isPermanent ? 'border-orange-500/30' : 'border-amber-500/30'} shadow-xl">
              <div class="flex items-start gap-4">
                <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-2xl shadow-lg flex-shrink-0">ðŸ”‡</div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-xl text-white">${escapeHtml(username)}</span>
                      ${isPermanent ? '<span class="px-2 py-0.5 bg-orange-600 text-white text-xs rounded-full font-medium">PERMANENT</span>' : ''}
                    </div>
                  </div>
                  <div class="text-xs text-slate-400 font-mono mb-3">${uid}</div>
                  <div class="bg-slate-900/50 rounded-lg p-3 mb-3">
                    <div class="text-xs text-slate-500 uppercase tracking-wide mb-1">Reason</div>
                    <p class="text-slate-200">${escapeHtml(reason)}</p>
                  </div>
                  ${!isPermanent && expiresAt ? `<div class="text-xs text-slate-400">â° Expires: ${expiresAt}</div>` : ''}
                </div>
              </div>
              <div class="flex gap-2 flex-wrap mt-4 pt-4 border-t border-slate-700">
                <button onclick="modPanelUnmute('${uid}')" class="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-green-500/25 hover:scale-105">✓ Unmute</button>
                <button onclick="modPanelExtendMute('${uid}')" class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-amber-500/25 hover:scale-105">â±ï¸ Extend</button>
              </div>
            </div>
          `;
        }
        html += '</div>';
        modPanelContent.innerHTML = html;
      }
      
      async function loadHardwareBans() {
        const modPanelContent = document.getElementById("modPanelContent");
        const snap = await db.ref("bannedFingerprints").once("value");
        const banned = snap.val() || {};
        const entries = Object.entries(banned);
        
        if (entries.length === 0) {
          modPanelContent.innerHTML = '<div class="flex flex-col items-center justify-center py-12 text-slate-400"><svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg><p class="text-lg">No hardware bans</p></div>';
          return;
        }
        
        let html = '<div class="space-y-3">';
        for (const [fpHash, data] of entries) {
          const reason = data.reason || 'No reason';
          const bannedAt = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
          const bannedBy = data.bannedBy ? data.bannedBy.slice(0, 8) + '...' : 'System';
          
          html += `
            <div class="bg-gradient-to-r from-purple-900/30 to-slate-800 rounded-xl p-4 border border-purple-700/50 backdrop-blur-sm shadow-lg">
              <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center text-lg">ðŸ–¥ï¸</div>
                  <div>
                    <span class="font-mono text-sm text-purple-300">${fpHash.slice(0, 20)}...</span>
                    <div class="text-xs text-slate-500">Banned by: ${bannedBy}</div>
                  </div>
                </div>
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-600/30 text-purple-300">ðŸ• ${bannedAt}</span>
              </div>
              <p class="text-sm text-slate-300 mb-4 pl-12">ðŸ“ ${escapeHtml(reason)}</p>
              <div class="flex gap-2 pl-12">
                <button onclick="modPanelUnHardwareBan('${fpHash}')" class="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg font-medium transition-colors shadow-md">✓ Remove HW Ban</button>
              </div>
            </div>
          `;
        }
        html += '</div>';
        modPanelContent.innerHTML = html;
      }
      
      // Mod panel action functions (global for onclick handlers)
      window.modPanelUnban = async (uid) => {
        if (!isAdmin) return;
        if (!confirm("Unban this user?")) return;
        const btn = event.target;
        const card = btn.closest('.bg-slate-800\\/80');
        if (card) card.style.opacity = '0.5';
        await unbanUser(uid);
        if (card) card.remove();
        showToast("User unbanned", "success");
        // Check if list is empty now
        const content = document.getElementById('modPanelContent');
        if (content && !content.querySelector('.bg-slate-800\\/80')) {
          content.innerHTML = '<div class="flex flex-col items-center justify-center py-16 text-slate-400"><div class="w-20 h-20 rounded-full bg-green-600/20 flex items-center justify-center mb-4"><span class="text-4xl">✓</span></div><p class="text-xl font-medium">No Banned Users</p><p class="text-sm text-slate-500 mt-1">All clear!</p></div>';
        }
      };
      
      window.modPanelExtendBan = async (uid) => {
        if (!isAdmin) return;
        const mins = prompt("Extend ban by how many minutes? (or 'permanent')");
        if (!mins) return;
        
        const banSnap = await db.ref("bannedUsers/" + uid).once("value");
        const current = banSnap.val() || {};
        
        if (mins.toLowerCase() === 'permanent') {
          await db.ref("bannedUsers/" + uid).update({ until: 9999999999999 });
        } else {
          const addMs = parseInt(mins) * 60 * 1000;
          const newUntil = Math.max(current.until || Date.now(), Date.now()) + addMs;
          await db.ref("bannedUsers/" + uid).update({ until: newUntil });
        }
        showToast("Ban extended", "success");
        loadModPanelTab('banned');
      };
      
      window.modPanelHardwareBan = async (fp, uid) => {
        if (!isAdmin) return;
        if (!confirm("Hardware ban this user's device?")) return;
        const reason = prompt("Reason for hardware ban:", "Ban evasion prevention") || "Ban evasion prevention";
        await banTargetFingerprint(fp, reason + ' (UID: ' + uid.slice(0,8) + ')');
        showToast("Hardware ban applied", "success");
        loadModPanelTab('banned');
      };
      
      window.modPanelUnHardwareBan = async (fp) => {
        if (!isAdmin) return;
        if (!confirm("Remove hardware ban?")) return;
        await unbanFingerprint(fp);
        showToast("Hardware ban removed", "success");
        loadModPanelTab(modPanelCurrentTab);
      };
      
      window.modPanelUnmute = async (uid) => {
        if (!isAdmin) return;
        if (!confirm("Unmute this user?")) return;
        const btn = event.target;
        const card = btn.closest('.bg-slate-800\\/80');
        if (card) card.style.opacity = '0.5';
        await db.ref("mutedUsers/" + uid).remove();
        if (card) card.remove();
        showToast("User unmuted", "success");
        // Check if list is empty now
        const content = document.getElementById('modPanelContent');
        if (content && !content.querySelector('.bg-slate-800\\/80')) {
          content.innerHTML = '<div class="flex flex-col items-center justify-center py-16 text-slate-400"><div class="w-20 h-20 rounded-full bg-green-600/20 flex items-center justify-center mb-4"><span class="text-4xl">✓</span></div><p class="text-xl font-medium">No Muted Users</p><p class="text-sm text-slate-500 mt-1">All clear!</p></div>';
        }
      };
      
      window.modPanelExtendMute = async (uid) => {
        if (!isAdmin) return;
        const mins = prompt("Extend mute by how many minutes?");
        if (!mins) return;
        
        const muteSnap = await db.ref("mutedUsers/" + uid).once("value");
        const current = muteSnap.val() || {};
        const addMs = parseInt(mins) * 60 * 1000;
        const newUntil = Math.max(current.until || Date.now(), Date.now()) + addMs;
        await db.ref("mutedUsers/" + uid).update({ until: newUntil });
        showToast("Mute extended", "success");
        loadModPanelTab('muted');
      };

      function watchBanStatus(uid) {
        if (!uid) return;
        console.log("[ban] setting up watchBanStatus for uid:", uid);
        banRef = firebase.database().ref("bannedUsers/" + uid);
        banListener = (snap) => {
          const data = snap.val();
          console.log("[ban] watchBanStatus fired - data:", data);

          // If no data or expired temp ban, clear popup and cleanup
          if (!data) {
            if (banCountdownInterval) {
              clearInterval(banCountdownInterval);
              banCountdownInterval = null;
            }
            if (banLogoutTimeout) {
              clearTimeout(banLogoutTimeout);
              banLogoutTimeout = null;
            }
            const banPopup = document.getElementById("banPopup");
            if (banPopup) banPopup.classList.add("hidden");
            return;
          }

          // Clear expired temp bans automatically

                // Update arrow visibility
                try { updateScrollToBottomBtn(); } catch (_) {}
          clearExpiredBan(uid, data);

          const now = Date.now();
          if (data.until && data.until <= now) {
            // After cleanup request, just hide any visible UI
            if (banCountdownInterval) {
              clearInterval(banCountdownInterval);
              banCountdownInterval = null;
            }
            if (banLogoutTimeout) {
              clearTimeout(banLogoutTimeout);
              banLogoutTimeout = null;
            }
            const banPopup = document.getElementById("banPopup");
            if (banPopup) banPopup.classList.add("hidden");
            return;
          }

          if (banCountdownInterval) {
            clearInterval(banCountdownInterval);
            banCountdownInterval = null;
          }
          if (banLogoutTimeout) {
            clearTimeout(banLogoutTimeout);
            banLogoutTimeout = null;
          }

          const banPopup = document.getElementById("banPopup");
          const banReason = document.getElementById("banReason");
          
          let isPermanent = false;
          let secondsLeft = 3;
          
          if (!data.until || data.until === 9999999999999) {
            // Permanent ban takes precedence over time-based logic
            isPermanent = true;
            banReason.textContent = "Reason: " + (data.reason || "Rule break") + " (PERMANENT)";
            console.log("[ban] permanent ban detected");
          } else if (data.until && data.until > now) {
            // Temporary ban still active
            secondsLeft = Math.ceil((data.until - now) / 1000);
            banReason.textContent = "Reason: " + (data.reason || "Rule break") + " (Temp ban expires in " + secondsLeft + "s)";
            console.log("[ban] temporary ban for", secondsLeft, "seconds");
          }
          
          banPopup.classList.remove("hidden");
          
          // Only auto-logout for permanent bans
          if (isPermanent) {
            console.log("[ban] showing ban popup, signing out in 3 seconds (permanent ban)");
            
            // Show countdown
            let countdown = 3;
            banCountdownInterval = setInterval(() => {
              countdown--;
              banReason.textContent = "Reason: " + (data.reason || "Rule break") + " (PERMANENT - Logging out in " + countdown + "s)";
              if (countdown <= 0) {
                clearInterval(banCountdownInterval);
                banCountdownInterval = null;
              }
            }, 1000);
            
            banLogoutTimeout = setTimeout(() => {
              console.log("[ban] auto-signing out permanently banned user");
              auth.signOut().catch(() => {});
              banLogoutTimeout = null;
            }, 3000);
          } else {
            // For temporary bans, just show the popup, don't logout
            console.log("[ban] temporary ban - user can try again after ban expires");
            
            // Update countdown
            let countdown = Math.ceil((data.until - Date.now()) / 1000);
            banCountdownInterval = setInterval(() => {
              countdown--;
              if (countdown > 0) {
                banReason.textContent = "Reason: " + (data.reason || "Rule break") + " (Ban expires in " + countdown + "s)";
              } else {
                clearInterval(banCountdownInterval);
                banCountdownInterval = null;
                banReason.textContent = "Reason: " + (data.reason || "Rule break");
                clearExpiredBan(uid, { until: data.until });
              }
            }, 1000);
          }
        };
        banRef.on("value", banListener);
      }

      function muteUser(uid, minutes = 10, reason = "Rule break") {
        if (!isAdmin || !uid) return;
        const until = Date.now() + minutes * 60 * 1000;
        firebase.database().ref("mutedUsers/" + uid).set({
          until: until,
          reason: reason,
        });
      }

      let pendingMuteUid = null;
      let muteTimerInterval = null;

      function showMuteReasonModal(uid) {
        pendingMuteUid = uid;
        const muteReasonModal = document.getElementById("muteReasonModal");
        const muteReasonCustom = document.getElementById("muteReasonCustom");
        const muteDuration = document.getElementById("muteDuration");
        muteReasonCustom.value = "";
        muteDuration.value = "10";
        muteReasonModal.classList.remove("hidden");
      }

      function setupMuteModal() {
        const muteReasonModal = document.getElementById("muteReasonModal");
        const muteReasonConfirm = document.getElementById("muteReasonConfirm");
        const muteReasonCancel = document.getElementById("muteReasonCancel");
        const muteReasonCustom = document.getElementById("muteReasonCustom");
        const muteDuration = document.getElementById("muteDuration");
        const muteReasonSpam = document.getElementById("muteReasonSpam");
        const muteReasonAbuse = document.getElementById("muteReasonAbuse");
        const muteReasonDisruption = document.getElementById("muteReasonDisruption");
        const muteReasonHarassment = document.getElementById("muteReasonHarassment");

        const setReason = (reason) => {
          muteReasonCustom.value = reason;
        };

        muteReasonSpam.onclick = () => setReason("Spam");
        muteReasonAbuse.onclick = () => setReason("Abusive Language");
        muteReasonDisruption.onclick = () => setReason("Disruption");
        muteReasonHarassment.onclick = () => setReason("Harassment");

        muteReasonConfirm.onclick = () => {
          const reason = muteReasonCustom.value.trim() || "Rule break";
          const minutes = parseInt(muteDuration.value) || 10;
          if (pendingMuteUid) {
            muteUser(pendingMuteUid, minutes, reason);
            muteReasonModal.classList.add("hidden");
            viewProfileCloseBtn.click();
          }
        };

        muteReasonCancel.onclick = () => {
          muteReasonModal.classList.add("hidden");
          pendingMuteUid = null;
        };
      }

      function watchMuteStatus(uid) {
        if (!uid) return;
        muteRef = firebase.database().ref("mutedUsers/" + uid);
        muteListener = (snap) => {
          const data = snap.val();
          const now = Date.now();
          const active = data && data.until && data.until > now;
          isMuted = !!active;

          if (active) {
            const timeLeft = Math.ceil((data.until - now) / 1000);
            msgInput.disabled = true;
            sendBtn.disabled = true;
            msgInput.placeholder = "You are muted for " + timeLeft + "s";
            if (muteInlineBanner && muteInlineText) {
              muteInlineBanner.classList.remove("hidden");
              muteInlineText.textContent = "Muted: " + (data.reason || "Rule break") + " — " + timeLeft + "s left";
            }
            
            // Show mute popup
            const mutePopup = document.getElementById("mutePopup");
            const muteReason = document.getElementById("muteReason");
            const muteTimer = document.getElementById("muteTimer");
            muteReason.textContent = "Reason: " + (data.reason || "Rule break");
            mutePopup.classList.remove("hidden");
            muteTimer.textContent = timeLeft + "s remaining";
            
            // Update timer every second
            if (muteTimerInterval) clearInterval(muteTimerInterval);
            muteTimerInterval = setInterval(() => {
              const now2 = Date.now();
              const timeLeft2 = Math.ceil((data.until - now2) / 1000);
              if (timeLeft2 <= 0) {
                clearInterval(muteTimerInterval);
                mutePopup.classList.add("hidden");
                msgInput.disabled = false;
                sendBtn.disabled = false;
                msgInput.placeholder = "Type a message...";
                if (muteInlineBanner) muteInlineBanner.classList.add("hidden");
                if (muteInlineText) muteInlineText.textContent = "";
              } else {
                muteTimer.textContent = timeLeft2 + "s remaining";
                msgInput.placeholder = "You are muted for " + timeLeft2 + "s";
                if (muteInlineText) {
                  muteInlineText.textContent = "Muted: " + (data.reason || "Rule break") + " — " + timeLeft2 + "s left";
                }
              }
            }, 1000);
          } else {
            if (muteTimerInterval) clearInterval(muteTimerInterval);
            msgInput.disabled = false;
            sendBtn.disabled = false;
            msgInput.placeholder = "Type a message...";
            const mutePopup = document.getElementById("mutePopup");
            mutePopup.classList.add("hidden");
            if (muteInlineBanner) muteInlineBanner.classList.add("hidden");
            if (muteInlineText) muteInlineText.textContent = "";
          }
        };
        muteRef.on("value", muteListener);
      }

      function warnUser(uid, reason) {
        if (!isAdmin || !uid) return;
        firebase.database().ref("warnings/" + uid).set({
          active: true,
          reason: reason || "Rule break",
        });
      }

      let pendingWarnUid = null;

      function showWarnReasonModal(uid) {
        pendingWarnUid = uid;
        const warnReasonModal = document.getElementById("warnReasonModal");
        const warnReasonCustom = document.getElementById("warnReasonCustom");
        warnReasonCustom.value = "";
        warnReasonModal.classList.remove("hidden");
      }

      function setupWarnModal() {
        const warnReasonModal = document.getElementById("warnReasonModal");
        const warnReasonConfirm = document.getElementById("warnReasonConfirm");
        const warnReasonCancel = document.getElementById("warnReasonCancel");
        const warnReasonCustom = document.getElementById("warnReasonCustom");
        const warnReasonSpam = document.getElementById("warnReasonSpam");
        const warnReasonAbuse = document.getElementById("warnReasonAbuse");
        const warnReasonDisruption = document.getElementById("warnReasonDisruption");
        const warnReasonHarassment = document.getElementById("warnReasonHarassment");

        const setReason = (reason) => {
          warnReasonCustom.value = reason;
        };

        warnReasonSpam.onclick = () => setReason("Spam");
        warnReasonAbuse.onclick = () => setReason("Abusive Language");
        warnReasonDisruption.onclick = () => setReason("Disruption");
        warnReasonHarassment.onclick = () => setReason("Harassment");

        warnReasonConfirm.onclick = () => {
          const reason = warnReasonCustom.value.trim() || "Rule break";
          if (pendingWarnUid) {
            warnUser(pendingWarnUid, reason);
            warnReasonModal.classList.add("hidden");
            viewProfileCloseBtn.click();
          }
        };

        warnReasonCancel.onclick = () => {
          warnReasonModal.classList.add("hidden");
          pendingWarnUid = null;
        };
      }

      let warningShownAlready = false;

      function watchWarnings(uid) {
        if (!uid) return;
        warningRef = firebase.database().ref("warnings/" + uid);
        warningListener = (snap) => {
          const data = snap.val();
          if (data && data.active && !warningShownAlready) {
            warningShownAlready = true;
            warningReason.textContent = "Reason: " + (data.reason || "Rule break");
            warningPopup.classList.remove("hidden");
            closeWarningBtn.disabled = true;
            closeWarningBtn.classList.add("opacity-50", "cursor-not-allowed");
            warningAgree.checked = false;
          } else if (!data || !data.active) {
            warningPopup.classList.add("hidden");
          }
        };
        warningRef.on("value", warningListener);
      }

      if (warningAgree && closeWarningBtn) {
        warningAgree.addEventListener("change", () => {
          if (warningAgree.checked) {
            closeWarningBtn.disabled = false;
            closeWarningBtn.classList.remove("opacity-50", "cursor-not-allowed");
          } else {
            closeWarningBtn.disabled = true;
            closeWarningBtn.classList.add("opacity-50", "cursor-not-allowed");
          }
        });

        closeWarningBtn.addEventListener("click", () => {
          const uid = firebase.auth().currentUser?.uid;
          if (!uid) return;
          warningShownAlready = false;
          firebase.database().ref("warnings/" + uid).remove().catch(() => {});
          warningPopup.classList.add("hidden");
        });
      }

      function updateNotifBadge() {
        if (!notifBellBadge || !currentUserId) {
          notifBellBadge?.classList.add("hidden");
          return;
        }
        const count = notificationHistory.filter(n => n.isDM).length;
        if (count > 0) {
          notifBellBadge.textContent = count;
          notifBellBadge.classList.remove("hidden");
        } else {
          notifBellBadge.classList.add("hidden");
        }
      }

      async function clearNotifications() {
        // Mark all current DM notifications as cleared
        notificationHistory.forEach(n => {
          if (n.isDM && n.threadId) {
            clearedNotificationThreads.add(n.threadId);
          }
        });
        await saveClearedNotifications();
        
        updateNotifBadge();
        renderNotificationHistory();
      }

      function renderNotificationHistory() {
        notifList.innerHTML = "";
        if (!notificationHistory.length) {
          notifList.innerHTML = '<p class="text-xs text-slate-400">No notifications yet.</p>';
          return;
        }
        notificationHistory
          .slice()
          .sort((a, b) => b.time - a.time)
          .forEach((item) => {
            const row = document.createElement("div");
            row.className = "p-3 rounded-lg bg-slate-800/70 border border-slate-700";
            const title = document.createElement("div");
            title.className = "text-sm text-slate-100 font-semibold";
            title.textContent = item.title;
            const body = document.createElement("div");
            body.className = "text-xs text-slate-300 mt-1";
            body.textContent = item.body;
            const time = document.createElement("div");
            time.className = "text-[11px] text-slate-500 mt-1";
            time.textContent = new Date(item.time).toLocaleString();
            if (item.threadId) {
              row.classList.add("cursor-pointer", "hover:bg-slate-700/70");
              row.addEventListener("click", () => {
                openDmModal();
                selectDmThread(item.threadId, item.withUid || null, item.withUsername || null);
              });
            }
            row.appendChild(title);
            row.appendChild(body);
            row.appendChild(time);
            notifList.appendChild(row);
          });
      }

      function addNotification(title, body, extra = {}) {
        notificationHistory.push({ title, body, time: Date.now(), ...extra });
        if (notificationHistory.length > 50) {
          notificationHistory = notificationHistory.slice(-50);
        }
        updateNotifBadge();
        renderNotificationHistory();
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(title, {
              body: body,
              icon: "https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f4ac.png",
              tag: extra.threadId || "chatra-notif"
            });
          } catch (err) {}
        }
      }

      // Check if a message is from a blocked user
      function isMessageFromBlockedUser(msg) {
        if (!msg || !msg.userId) return false;
        return blockedUsersCache.has(msg.userId);
      }

      // Typing status
      let typingTimeoutId = null;
      let typingListenerAttached = false;
      const TYPING_CLEANUP_INTERVAL = 5000; // Clean up stale typing status every 5s
      let typingCleanupInterval = null;

      // Rate-limit warning timeout + local last-sent time
      let sendWarningTimeoutId = null;
      let lastSentTime = 0; // for local rate limit
      const TEXT_COOLDOWN_MS = 500;   // 0.5s between text sends (matches rules)
      const MEDIA_COOLDOWN_MS = 1000; // 1s between media sends (matches rules)

      // Basic bad-word filter (client-side) - replaces detected words with stars
      const BAD_WORDS = [
        // Profanity only (NOT violence/threats - those go in THREAT_PATTERNS)
        "fuck", "fck", "shit", "bitch", "asshole", "bastard", "cunt",
        // Slurs and hate speech only (NOT violence/threats)
        "faggot", "fag", "nigger", "chink", "slut", "whore",
        // Additional hate speech and derogatory terms (NOT violence/threats)
        "retard", "retarded", "tranny", "homo", "dyke", "kike",
        // Short harassment words (context doesn't matter)
        "kys", "kms"
      ];

      // Create flexible patterns that catch leetspeak obfuscation and symbol/space obfuscation
      // This is more aggressive: it normalizes unicode, maps common leet substitutions,
      // allows short separators (symbols/spaces/digits) between letters, and permits repeated letters.
      function createFlexiblePattern(word) {
        // Build a map of common substitutions for letters
        const subs = {
          'a': '[a@4Ã Ã¡Ã¢Ã£Ã¤Ã¥Î±]',
          'b': '[b8ÃŸ]',
          'c': '[cÃ§(\[]',
          'd': '[dÎ´]',
          'e': '[e3Ã¨Ã©ÃªÃ«â‚¬]',
          'f': '[f]',
          'g': '[g9q]',
          'h': '[h#]',
          'i': '[i1!|Ã¬Ã­Ã®Ã¯]',
          'j': '[j]',
          'k': '[k]',
          'l': '[l1|!Ã¬Ã­Ã®Ã¯]',
          'm': '[m]',
          'n': '[nÃ±]',
          'o': '[o0Ã³Ã²Ã´ÃµÃ¶Ã¸]',
          'p': '[p]',
          'q': '[q9]',
          'r': '[r]',
          's': '[s5$]',
          't': '[t7+]',
          'u': '[uÃ¹ÃºÃ»Ã¼]',
          'v': '[v]',
          'w': '[w]',
          'x': '[x%Ã—]',
          'y': '[yÃ¿]',
          'z': '[z2]'
        };

        // Normalize word to ASCII lower (basic) and build per-char pattern
        const letters = word.toLowerCase().split('');
        // Allow up to 4 non-letter/digit characters between letters to catch obfuscation
        const gap = '[^a-z0-9]{0,4}';
        const parts = letters.map(ch => {
          const cls = subs[ch] || ('[' + ch + ']');
          // allow repeated same character (e.g., ggg)
          return cls + '+(' + gap + ')?';
        });
        let pattern = parts.join('');
        // Do not require word boundaries because users may embed chars; anchor loosely
        return new RegExp(pattern, 'iu');
      }

      // Generate flexible patterns for all bad words to catch leetspeak and symbol obfuscation
      const FLEXIBLE_BAD_WORD_PATTERNS = BAD_WORDS.map(word => createFlexiblePattern(word));

      // Treat a subset of slurs as severe: block messages completely (not merely star them out)
      const SEVERE_SLURS = ['nigger','faggot','kike','chink','tranny'];
      const FLEXIBLE_SEVERE_PATTERNS = SEVERE_SLURS.map(w => createFlexiblePattern(w));

      // Pattern-based threat/violence/harassment detection - CONTEXT MATTERS
      // Only block when violence is DIRECTED at someone
      const THREAT_PATTERNS = [
        // Direct threats with "you"
        /i'?m\s+(?:gonna|going\s+to|will)?\s+(?:kill|hurt|rape|beat|punch|stab|harm|destroy)\s+you\b/gi,
        /you\s+(?:better\s+)?(?:watch\s+your\s+back|watch\s+it)\b/gi,
        /(?:kill|hurt|harm)\s+(?:yourself|yourself)\b/gi,
        /you\s+deserve\s+to\s+(?:die|suffer|hurt|be\s+hurt)\b/gi,
        /i\s+(?:hope|wish|want)\s+(?:you|someone|people)\s+(?:dies?|dead|suffers?|gets?\s+hurt)\b/gi,
        /(?:death|kill|rape)\s+threat/gi,
        /neck\s+yourself|rope|hang\s+yourself|slit\s+your\s+wrist/gi,
        /go\s+(?:kill|die|kys)/gi,
      ];

      // Hate speech and harassment patterns - SPECIFIC to identity groups
      // Avoid false positives: "all people are disgusting" (normal) vs "all [race] are [slur]" (hate)
      const HATE_PATTERNS = [
        // Dehumanizing language targeting SPECIFIC identity groups
        /\b(?:all|every|these)\s+(?:blacks?|africans?|arabs?|mexicans?|jews?|gays?|lgbtq|women|men|gay|trans(?:gender)?|asians?|indians?|religions?)\s+(?:are\s+)?(?:scum|trash|subhuman|disgusting|worthless|deserve\s+to\s+(?:die|suffer|hurt))/gi,
        // Targeted exclusion based on identity/origin
        /(?:go\s+)?(?:back\s+to\s+)?(?:your\s+country|where\s+you\s+came\s+from)\b/gi,
        // Explicit harassment targeting specific groups
        /\b(?:kill\s+all|wipe\s+out)\s+(?:blacks?|jews?|gays?|women|trans|mexicans?|asians?)/gi,
      ];

      const badWordPattern = new RegExp("\\b(" + BAD_WORDS.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|") + ")\\b", "gi");

      function filterBadWords(text) {
        if (!text) return text;
        
        // Check for threats, violence, and serious harassment (block completely)
        for (let pattern of THREAT_PATTERNS) {
          if (pattern.test(text)) {
            console.warn("[filter] Threat/violence detected in message");
            return "[FILTERED - VIOLENT CONTENT NOT ALLOWED]";
          }
        }
        
        // Check for hate speech and targeting language (block completely)
        for (let pattern of HATE_PATTERNS) {
          if (pattern.test(text)) {
            console.warn("[filter] Hate speech/harassment detected in message");
            return "[FILTERED - HATEFUL/HARASSMENT CONTENT NOT ALLOWED]";
          }
        }
        
        // Check for severe slurs (block completely) using flexible patterns
        for (let pattern of FLEXIBLE_SEVERE_PATTERNS) {
          if (pattern.test(text)) {
            console.warn("[filter] Severe slur detected in message");
            return "[FILTERED - HATEFUL/HARASSMENT CONTENT NOT ALLOWED]";
          }
        }
        
        // Check for bad words including leetspeak variants (n1g, f4gg0t, etc.)
        // Star out ALL occurrences instead of just replacing once
        let hasFiltered = false;
        let filtered = text;
        
        for (let pattern of FLEXIBLE_BAD_WORD_PATTERNS) {
          if (pattern.test(filtered)) {
            hasFiltered = true;
            filtered = filtered.replace(pattern, (match) => {
              return '*'.repeat(match.length);
            });
            pattern.lastIndex = 0; // Reset regex state for global flag
          }
        }
        
        // Also try exact bad word pattern as fallback
        if (badWordPattern.test(filtered)) {
          filtered = filtered.replace(badWordPattern, (match) => {
            return '*'.repeat(match.length);
          });
        }
        
        return filtered;
      }

      // Local hard-blocked usernames (client-side only, case-insensitive). Edit this list as needed.
      const LOCAL_BLOCKED_USERNAMES = [
        "admin",
        "moderator",
        "support",
        "owner",
        "system",
        "staff",
        "fag",
        "faggot",
        "nigger",
        "chink"
      ];

      function isLocallyBlockedUsername(name) {
        if (!name) return false;
        const lower = name.toLowerCase();
        return LOCAL_BLOCKED_USERNAMES.some((n) => n.toLowerCase() === lower);
      }
      
      // Message rendering optimization
      let messageRenderQueue = [];
      let isRenderingMessages = false;

      // --- COMBINED STATUS BAR (typing + warning) ---
      let lastTypingText = "";
      let currentWarningText = "";

      function updateStatusBar() {
        const parts = [];
        if (lastTypingText) parts.push(lastTypingText);
        if (currentWarningText) {
          if (parts.length > 0) {
            // keep existing order when combining texts
          } else {
            parts.push(currentWarningText);
          }
        }
        typingIndicatorEl.textContent = parts.join(" ");
        if (sendWarningEl) sendWarningEl.textContent = "";
      }

      // Helper: clear messages
      function clearLoginMessages() {
        loginInfo.textContent = "";
      }

      // ===== AUTO-CREATE FIREBASE PATHS =====
      async function ensureUserProfilePath(uid) {
        try {
          const ref = db.ref("userProfiles/" + uid);
          const snap = await ref.once("value");
          if (!snap.exists()) {
            await ref.set({
              username: currentUsername,
              bio: "",
              profilePic: null,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
            });
            console.log("[init] auto-created userProfiles path for", uid);
          }
        } catch (err) {
          console.warn("[init] could not ensure profile path:", err);
        }
      }

      async function ensureUsernamePath(uid, username) {
        try {
          const ref = db.ref("users/" + uid + "/username");
          const snap = await ref.once("value");
          if (!snap.exists()) {
            await ref.set(username);
            console.log("[init] auto-created username path for", uid);
          }
        } catch (err) {
          console.warn("[init] could not ensure username path:", err);
        }
      }

      async function ensureFriendRequestsPaths(uid) {
        try {
          const ref = db.ref("friendRequests/" + uid + "/incoming");
          const snap = await ref.once("value");
          if (!snap.exists()) {
            await ref.set({});
            console.log("[init] auto-created friendRequests incoming path for", uid);
          }
        } catch (err) {
          console.warn("[init] could not ensure friendRequests path:", err);
        }
      }

      async function ensureFriendsList(uid) {
        try {
          const ref = db.ref("friends/" + uid);
          const snap = await ref.once("value");
          if (!snap.exists()) {
            await ref.set({});
            console.log("[init] auto-created friends list for", uid);
          }
        } catch (err) {
          console.warn("[init] could not ensure friends list:", err);
        }
      }

      // Try to ensure another user's incoming friendRequests path exists.
      // This is best-effort: if rules prevent creating it, we'll log and continue.
      async function ensureTargetFriendRequestsIncoming(targetUid) {
        try {
          // Only attempt to create these paths if we're the target user.
          // Creating other users' friendRequests nodes will usually be blocked by rules.
          if (auth.currentUser && auth.currentUser.uid === targetUid) {
            const parentRef = db.ref("friendRequests/" + targetUid);
            const parentSnap = await parentRef.once("value");
            if (!parentSnap.exists()) {
              await parentRef.set({});
              console.log("[init] auto-created friendRequests parent for target", targetUid);
            }

            // Then ensure the /incoming child exists
            const incomingRef = db.ref("friendRequests/" + targetUid + "/incoming");
            const incomingSnap = await incomingRef.once("value");
            if (!incomingSnap.exists()) {
              await incomingRef.set({});
              console.log("[init] auto-created friendRequests incoming for target", targetUid);
            }
          } else {
            // Not the target user — skip creating other users' nodes to avoid permission errors
            console.log("[init] skipping auto-create friendRequests for other user:", targetUid);
          }
        } catch (err) {
          // Permission denied is common if rules disallow creating other users' nodes.
          // Don't block the flow — just log details for debugging.
          logDetailedError("ensureTargetFriendRequestsIncoming", err, { targetUid });
        }
      }

      function clearRegisterMessages() {
        registerError.textContent = "";
      }

      // Ensure another user's /friends/{uid} path exists
      async function ensureTargetFriendsList(targetUid) {
        try {
          // Only create another user's friends parent node if we're acting as that user.
          // Creating friends/otherUid is disallowed by rules, so skip to avoid permission errors.
          if (auth.currentUser && auth.currentUser.uid === targetUid) {
            const ref = db.ref("friends/" + targetUid);
            const snap = await ref.once("value");
            if (!snap.exists()) {
              await ref.set({});
              console.log("[init] auto-created friends list for target", targetUid);
            }
          } else {
            console.log("[init] skipping auto-create friends list for other user:", targetUid);
          }
        } catch (err) {
          logDetailedError("ensureTargetFriendsList", err, { targetUid });
        }
      }

      function updateChatUserLabel(username) {
        currentUsername = username || null;
        const ownerUid = "u5yKqiZvioWuBGcGK3SWUBpUVrc2";
        const isOwner = auth.currentUser?.uid === ownerUid;
        if (currentUsername && isOwner) {
          const crownIcon = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="text-amber-300" style="transform: translateY(2px);"><path d="M4 7l3.5 3 4.5-6 4.5 6L20 7v10H4z"></path><path d="M4 17h16v2H4z"></path></svg>';
          const ownerBadge = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-100 border border-amber-400/40">Owner</span>';
          chatUserLabel.innerHTML = '<span class="inline-flex items-center gap-1.5">' + crownIcon + '<span class="font-semibold text-slate-100">' + currentUsername + '</span>' + ownerBadge + '</span>';
        } else {
          chatUserLabel.textContent = currentUsername || "";
        }
        console.log("[ui] chat user label set to:", currentUsername || "");
      }

      // On-screen warning (2 seconds) — now combined with typing in one line
      function showRateLimitWarning() {
        currentWarningText = "Slow down!";
        if (sendWarningTimeoutId) {
          clearTimeout(sendWarningTimeoutId);
        }
        updateStatusBar();
        sendWarningTimeoutId = setTimeout(() => {
          currentWarningText = "";
          updateStatusBar();
        }, 2000);
      }

      // --- USERNAME FROM DB (ONE SOURCE OF TRUTH) ---
      async function fetchUsername(uid, emailFallback) {
        try {
          const snap = await db.ref("users/" + uid + "/username").once("value");
          let username = snap.val();
          
          if (!username && emailFallback) {
            username = emailFallback.split("@")[0];
            console.log("[username] no username in DB, using email:", username);
            // Auto-save to DB for next time
            try {
              await db.ref("users/" + uid + "/username").set(username);
            } catch (e) {
              console.warn("[username] could not auto-save username:", e);
            }
          }
          
          return username || "User";
        } catch (err) {
          console.error("[username] error fetching from DB:", err);
          if (emailFallback) {
            const fallback = emailFallback.split("@")[0];
            console.log("[username] using email fallback:", fallback);
            return fallback;
          }
          return "User";
        }
      }

      // On load: no local remember-me persistence; checkbox starts unchecked
      (function initRememberMe() {
        rememberMeCheckbox.checked = false;
      })();

      // Switch to Register form
      registerLink.onclick = () => {
        clearLoginMessages();
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");
        console.log("[ui] switched to register form");
      };

      // Switch to Login form
      loginLink.onclick = () => {
        clearRegisterMessages();
        registerForm.classList.add("hidden");
        loginForm.classList.remove("hidden");
        console.log("[ui] switched to login form");
      };

      // Get modal elements
      const termsModal = document.getElementById("termsModal");
      const privacyModal = document.getElementById("privacyModal");
      const termsLink = document.getElementById("termsLink");
      const privacyLink = document.getElementById("privacyLink");
      const termsCloseBtn = document.getElementById("termsCloseBtn");
      const termsCloseBtn2 = document.getElementById("termsCloseBtn2");
      const privacyCloseBtn = document.getElementById("privacyCloseBtn");
      const privacyCloseBtn2 = document.getElementById("privacyCloseBtn2");

      // Terms of Service modal handlers (guarded for safety)
      if (termsLink && termsModal && termsCloseBtn && termsCloseBtn2) {
        termsLink.onclick = (e) => {
          e.preventDefault();
          termsModal.classList.remove("modal-closed");
          termsModal.classList.add("modal-open");
          console.log("[ui] opened terms modal");
        };

        termsCloseBtn.onclick = () => {
          termsModal.classList.add("modal-closed");
          termsModal.classList.remove("modal-open");
          console.log("[ui] closed terms modal");
        };

        termsCloseBtn2.onclick = () => {
          termsModal.classList.add("modal-closed");
          termsModal.classList.remove("modal-open");
          console.log("[ui] closed terms modal");
        };

        termsModal.onclick = (e) => {
          if (e.target === termsModal) {
            termsModal.classList.add("modal-closed");
            termsModal.classList.remove("modal-open");
          }
        };
      } else {
        console.warn("[ui] terms modal elements missing");
      }

      // Privacy Policy modal handlers (guarded for safety)
      if (privacyLink && privacyModal && privacyCloseBtn && privacyCloseBtn2) {
        privacyLink.onclick = (e) => {
          e.preventDefault();
          privacyModal.classList.remove("modal-closed");
          privacyModal.classList.add("modal-open");
          console.log("[ui] opened privacy modal");
        };

        privacyCloseBtn.onclick = () => {
          privacyModal.classList.add("modal-closed");
          privacyModal.classList.remove("modal-open");
          console.log("[ui] closed privacy modal");
        };

        privacyCloseBtn2.onclick = () => {
          privacyModal.classList.add("modal-closed");
          privacyModal.classList.remove("modal-open");
          console.log("[ui] closed privacy modal");
        };

        privacyModal.onclick = (e) => {
          if (e.target === privacyModal) {
            privacyModal.classList.add("modal-closed");
            privacyModal.classList.remove("modal-open");
          }
        };
      } else {
        console.warn("[ui] privacy modal elements missing");
      }

      // Helper: encode key for Firebase (replace invalid chars: . # $ [ ])
      function encodeFirebaseKey(key) {
        return key
          .replace(/\./g, "_DOT_")
          .replace(/#/g, "_HASH_")
          .replace(/\$/g, "_DOLLAR_")
          .replace(/\[/g, "_LBRACKET_")
          .replace(/\]/g, "_RBRACKET_");
      }

      // Helper: make fake email from username (removes spaces since emails can't have them)
      function makeEmailFromUsername(username) {
        return username.toLowerCase().replace(/\s+/g, '') + "@gmail.com";
      }

      // Helper: fetch UID by username
      async function getUidByUsername(username) {
        const snap = await db
          .ref("users")
          .orderByChild("username")
          .equalTo(username)
          .limitToFirst(1)
          .once("value");
        if (!snap.exists()) return null;
        const val = snap.val();
        const uid = Object.keys(val)[0];
        return uid || null;
      }

      // Helper: sorted thread id for two UIDs
      function makeThreadId(uidA, uidB) {
        return [uidA, uidB].sort().join("__");
      }

      function clearDmMessages() {
        dmMessages.innerHTML = "";
      }

      function detachDmMessagesListener() {
        if (dmMessagesRef && dmMessagesListener) {
          dmMessagesRef.off("child_added", dmMessagesListener);
        }
        dmMessagesRef = null;
        dmMessagesListener = null;
      }

      function detachDmInboxListener() {
        if (dmInboxRef && dmInboxListener) {
          dmInboxRef.off("value", dmInboxListener);
        }
        dmInboxRef = null;
        dmInboxListener = null;
      }


      function populateDmBubble(bubble, msg) {
        bubble.innerHTML = "";

        if (msg && msg.media) {
          const mediaUrl = msg.media;
          const lower = (mediaUrl || "").toLowerCase();
          const isVideo = lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm') || lower.includes('video');

          if (isVideo) {
            const videoContainer = document.createElement("div");
            videoContainer.className = "relative rounded-lg overflow-hidden mb-2";

            const video = document.createElement("video");
            video.src = mediaUrl;
            video.controls = true;
            video.preload = "metadata";
            video.className = "w-full rounded-lg";
            video.setAttribute("playsinline", ""); // Required for iOS Safari inline playback
            video.setAttribute("webkit-playsinline", ""); // Legacy iOS Safari support

            videoContainer.appendChild(video);
            bubble.appendChild(videoContainer);
          } else {
            const imgContainer = document.createElement("div");
            imgContainer.className = "relative rounded-lg overflow-hidden mb-2";

            const img = document.createElement("img");
            img.src = mediaUrl;
            img.alt = "DM media";
            img.className = "w-full rounded-lg cursor-pointer active:opacity-70 transition-opacity";
            img.crossOrigin = "anonymous"; // Safari CORS fix
            img.onclick = () => openImageViewer(mediaUrl);

            imgContainer.appendChild(img);
            bubble.appendChild(imgContainer);
          }
        }

        if (msg && msg.text) {
          const textSpan = document.createElement("span");
          textSpan.className = msg.media ? "message-text-reveal block mt-2 font-medium" : "message-text-reveal inline-block font-medium";
          textSpan.textContent = msg.text;
          bubble.appendChild(textSpan);
        }

        // Note: timestamp will be rendered by the caller (so DM bubbles match global chat layout)
      }
      function renderDmMessage(msg) {
        const mine = msg.fromUid === currentUserId;
        const row = document.createElement("div");
        row.className = mine ? "flex justify-end" : "flex justify-start";

        const bubble = document.createElement("div");
        bubble.className = `message-bubble-anim max-w-[80%] px-4 py-2 rounded-2xl text-sm font-medium border ${
          mine
            ? "mine bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-600 shadow-lg shadow-sky-900/40"
            : "bg-slate-800/90 text-slate-100 border-slate-700"
        }`;
        populateDmBubble(bubble, msg);
        row.appendChild(bubble);

        dmMessages.appendChild(row);
        dmMessages.scrollTop = dmMessages.scrollHeight;
        return row; // Return the row element for tracking
      }

      async function isBlockedByTarget(targetUid) {
        if (!currentUserId || !targetUid) return false;
        try {
          const snap = await db
            .ref("blockedUsers/" + targetUid + "/" + currentUserId)
            .once("value");
          return snap.exists();
        } catch (e) {
          // If permission denied (expected due to rules), treat as not knowable and let server-side rules enforce
          if (e?.code === "PERMISSION_DENIED") {
            return false;
          }
          console.warn("[dm] blockedBy check failed", e);
          return false;
        }
      }

      function startDmMessagesListener(threadId) {
        detachDmMessagesListener();
        clearDmMessages();
        dmMessagesRef = db.ref("dms/" + threadId + "/messages");
        // Store rendered message elements by key for efficient updates
        const dmMessageElements = {};

        // Initial load: fetch recent messages first so we don't notify for historical messages
        dmMessagesRef
          .orderByChild("time")
          .limitToLast(200)
          .once("value")
          .then(snapshot => {
            const msgs = [];
            snapshot.forEach(child => msgs.push({ key: child.key, ...child.val() }));
            msgs.forEach(m => {
              const row = renderDmMessage(m);
              if (row && m.key) dmMessageElements[m.key] = row;
            });
            // Scroll to bottom after initial render
            if (dmMessages) dmMessages.scrollTop = dmMessages.scrollHeight;

            // Determine lastTime to start listening for newer messages
            const lastTime = msgs.length ? (msgs[msgs.length - 1].time || Date.now()) : Date.now();

            // Now listen only for messages after lastTime to avoid historical notifications
            dmPageMessagesListener = null; // not used here, but keep naming separate
            dmMessagesListener = dmMessagesRef.orderByChild("time").startAt(lastTime + 1).on("child_added", (snap) => {
              const msg = snap.val();
              if (!msg) return;
              const key = snap.key;
              const row = renderDmMessage(msg);
              if (row && key) dmMessageElements[key] = row;

              // Update inbox and fire notification if new message from other user
              if (activeDMTarget && msg.fromUid !== currentUserId && dmInboxInitialLoaded) {
                const now = Date.now();
                const lastMsgPreview = (msg.text && String(msg.text)) || (msg.media ? '(media)' : '');
                db.ref("dmInbox/" + currentUserId + "/" + threadId).update({
                  withUid: activeDMTarget.uid,
                  withUsername: activeDMTarget.username || activeDMTarget.uid,
                  lastMsg: lastMsgPreview,
                  lastTime: now
                }).catch(() => {});
                // Fire notification
                const who = activeDMTarget.username || "Someone";
                const preview = previewText(msg.text || "(no text)", 80);
                addNotification("New DM", `${who}: ${preview}` , {
                  threadId: threadId,
                  withUid: activeDMTarget.uid,
                  withUsername: activeDMTarget.username,
                });
              }
            });
          }).catch(err => {
            console.error('[DM] error loading messages initial snapshot:', err);
          });

        // Listen for message edits (e.g., moderation replaces text)
        dmMessagesRef.on("child_changed", (snap) => {
          const msg = snap.val();
          const key = snap.key;
          if (!msg || !key) return;
          // Update the message bubble in the UI if it exists
          const row = dmMessageElements[key];
          if (row) {
            // Find the bubble div inside the row
            const bubble = row.querySelector(".message-bubble-anim");
            if (bubble) {
              populateDmBubble(bubble, msg);
              bubble.classList.add("message-text-reveal");
              setTimeout(() => bubble.classList.remove("message-text-reveal"), 400);
            }
          }
        });
      }

      function verifyNotificationsLoaded() {
        if (!currentUserId) return;
        updateNotifBadge();
      }

      function updateDmTabBadge() {
        const badge = document.getElementById('navDMBadge');
        const badge2 = document.getElementById('navDMBadge2');
        const total = Object.values(dmUnreadCounts).reduce((s, v) => s + (parseInt(v) || 0), 0);
        if (badge) {
          if (total > 0) { badge.textContent = total; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
        }
        if (badge2) {
          if (total > 0) { badge2.textContent = total; badge2.classList.remove('hidden'); } else { badge2.classList.add('hidden'); }
        }
      }

      async function loadDmInbox() {
        if (!currentUserId) return;
        detachDmInboxListener();
        
        dmInboxRef = db.ref("dmInbox/" + currentUserId);
        
        // First, load all existing threads into notifications history on initial load
        if (!dmInboxInitialLoaded) {
          try {
            const snapshot = await dmInboxRef.once("value");
            const data = snapshot.val() || {};
            const entries = Object.entries(data)
              .map(([threadId, info]) => ({ threadId, ...info }))
              .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
            
            // Add all threads as notifications for notification history
            entries.forEach((item) => {
              // Skip if this thread was already cleared
              if (clearedNotificationThreads.has(item.threadId)) return;
              // Skip if no last message recorded (prevents false notifs on empty threads)
              if (!item.lastMsg) return;

              const who = item.withUsername || item.withUid || "Someone";
              const preview = previewText(item.lastMsg, 80);
              
              // Check if we already have this notification
              const exists = notificationHistory.some(n => n.threadId === item.threadId);
              if (!exists) {
                addNotification(who, preview, {
                  threadId: item.threadId,
                  withUid: item.withUid,
                  withUsername: item.withUsername,
                  isDM: true,
                  loaded: true
                });
              }

              // Track last update time so we only notify on newer messages later
              dmLastUpdateTimeByThread[item.threadId] = item.lastTime || 0;
            });
          } catch (err) {
            console.error("[dmInbox] Error loading initial notifications:", err);
          }
        }
        
        dmInboxListener = dmInboxRef.on("value", (snap) => {
          const data = snap.val() || {};
          const entries = Object.entries(data)
            .map(([threadId, info]) => ({ threadId, ...info }))
            .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));

          let unreadThreadsCount = 0;

          entries.forEach((item) => {
            const lastTime = item.lastTime || 0;
            const lastSeen = dmLastSeenByThread[item.threadId] || 0;
            // Consider thread active if it's the active thread and either the DM modal is open or the DM page is visible
            const dmPageEl = document.getElementById('dmPage');
            const dmPageVisible = dmPageEl && !dmPageEl.classList.contains('hidden');
            const isActiveThread = activeDMThread === item.threadId && (dmModal.classList.contains("modal-open") || dmPageVisible);

            // Mark active thread as seen
            if (isActiveThread && lastTime > lastSeen) {
              dmLastSeenByThread[item.threadId] = lastTime;
            }

            // Fire notification if either lastTime advanced or explicit `unread` increased.
            const lastNotifiedTime = dmLastUpdateTimeByThread[item.threadId] || 0;
            const prevUnreadLocal = dmUnreadCounts[item.threadId] || 0;
            const newUnread = (typeof item.unread === 'number') ? item.unread : 0;
            const shouldNotifyByTime = (!isActiveThread && dmInboxInitialLoaded && lastTime > lastNotifiedTime && item.lastMsg);
            const shouldNotifyByUnread = (!isActiveThread && dmInboxInitialLoaded && newUnread > prevUnreadLocal && newUnread > 0);
            if (shouldNotifyByTime || shouldNotifyByUnread) {
              const who = item.withUsername || item.withUid || "Someone";
              const preview = previewText(item.lastMsg || '', 80) || (newUnread > prevUnreadLocal ? `${newUnread - prevUnreadLocal} new message(s)` : 'New message');
              addNotification(who, preview, {
                threadId: item.threadId,
                withUid: item.withUid,
                withUsername: item.withUsername,
                isDM: true
              });
            }

            if (isActiveThread) {
              dmLastSeenByThread[item.threadId] = lastTime;
            }

            // Update last notified/seen time to current lastTime (only if we have a message)
            dmLastUpdateTimeByThread[item.threadId] = Math.max(item.lastMsg ? lastTime : 0, dmLastUpdateTimeByThread[item.threadId] || 0);

            // Only treat a thread as unread if the inbox entry explicitly has an `unread` number.
            // Do NOT infer unread from timestamps here — that caused every thread to appear unread.
            const unreadCount = (typeof item.unread === 'number') ? item.unread : 0;
            if (unreadCount > 0) {
              dmUnreadCounts[item.threadId] = unreadCount;
              unreadThreadsCount += 1;
            } else {
              delete dmUnreadCounts[item.threadId];
            }
          });

          // Update DM tab badge after processing
          updateDmTabBadge();

          dmInboxInitialLoaded = true;
        });
      }

      async function selectDmThread(threadId, targetUid, targetUsername) {
        if (!currentUserId) return;
        let resolvedUsername = targetUsername;
        if (!resolvedUsername && targetUid) {
          try {
            const nameSnap = await db.ref("users/" + targetUid + "/username").once("value");
            resolvedUsername = nameSnap.val() || targetUid;
          } catch (e) {
            resolvedUsername = targetUid;
          }
        }
        activeDMThread = threadId;
        activeDMTarget = { uid: targetUid, username: resolvedUsername };
        dmActiveUser.textContent = resolvedUsername;
        dmError.textContent = "";
        
        const now = Date.now();
        dmLastSeenByThread[threadId] = now;
        
        // Clear DM notifications for this thread
        notificationHistory = notificationHistory.filter(n => n.threadId !== threadId);
        updateNotifBadge();
        renderNotificationHistory();
        
        // Ensure self is participant and create own inbox entry (do not update lastTime here)
        await Promise.all([
          db.ref("dms/" + threadId + "/participants/" + currentUserId).set(true).catch(() => {}),
          db.ref("dmInbox/" + currentUserId + "/" + threadId).update({
            withUid: targetUid,
            withUsername: resolvedUsername || targetUid
          }).catch(() => {})
        ]);
        // Clear unread count for this thread in Firebase and locally
        try {
          await db.ref("dmInbox/" + currentUserId + "/" + threadId).update({ unread: 0 }).catch(() => {});
        } catch (e) {}
        dmUnreadCounts[threadId] = 0;
        delete dmUnreadCounts[threadId];
        updateDmTabBadge();
        // Prevent local inbox listener from treating this self-update as a new notification
        dmLastUpdateTimeByThread[threadId] = now;
        
        startDmMessagesListener(threadId);
      }

      async function ensureDmThread(targetUid, targetUsername) {
        const threadId = makeThreadId(currentUserId, targetUid);
        // Create/ensure DM thread and add self as participant
        const participantsRef = db.ref("dms/" + threadId + "/participants");
        await participantsRef.child(currentUserId).set(true);
        return threadId;
      }

      async function startDmWithUsername(username) {
        if (!currentUserId) {
          dmError.textContent = "Please log in.";
          return;
        }
        const target = (username || "").trim();
        if (!target) {
          dmError.textContent = "Enter a username.";
          return;
        }
        if (target === currentUsername) {
          dmError.textContent = "You cannot DM yourself.";
          return;
        }
        dmError.textContent = "";
        try {
          const targetUid = await getUidByUsername(target);
          if (!targetUid) {
            dmError.textContent = "User not found.";
            return;
          }
          if (blockedUsersCache.has(targetUid)) {
            dmError.textContent = "You blocked this user.";
            return;
          }

          if (await isBlockedByTarget(targetUid)) {
            dmError.textContent = "You are blocked by this user.";
            return;
          }

          const privacyCheck = await checkDmPrivacy(targetUid);
          if (!privacyCheck.allowed) {
            dmError.textContent = privacyCheck.reason;
            return;
          }
          const threadId = await ensureDmThread(targetUid, target);
          await selectDmThread(threadId, targetUid, target);
          dmModal.classList.add("modal-open");
          dmModal.classList.remove("modal-closed");
        } catch (err) {
          console.error("[dm] start error", err);
          dmError.textContent = err.message || "Could not start DM.";
        }
      }

      // ðŸ” Check if username is already taken in DB
      async function isUsernameTaken(username) {
        console.log("[users] checking if username taken:", username);
        try {
          // Local blocked list first (fast)
          if (isLocallyBlockedUsername(username)) {
            console.log("[users] username blocked locally:", username);
            return true;
          }

          // Check if username is in use
          const snapshot = await db
            .ref("users")
            .orderByChild("username")
            .equalTo(username)
            .once("value");
          const exists = snapshot.exists();

          // Check if username is banned (supports key-based or value-based name field)
          let isBanned = false;
          const bannedSnap = await db.ref("bannedUsernames").once("value");
          if (bannedSnap.exists()) {
            bannedSnap.forEach((child) => {
              if (isBanned) return; // short-circuit
              const val = child.val();
              const keyName = child.key;
              const valueName = typeof val === "object" && val !== null ? val.name : null;
              if (
                (keyName && keyName.toLowerCase() === username.toLowerCase()) ||
                (valueName && valueName.toLowerCase() === username.toLowerCase())
              ) {
                isBanned = true;
              }
            });
          }
          
          console.log("[users] username taken =", exists, "banned =", isBanned);
          
          // Check for threats, hate speech, or bad words in username
          let hasForbiddenContent = badWordPattern.test(username);

          // Check flexible/leet slur variants
          if (!hasForbiddenContent) {
            for (let pattern of FLEXIBLE_BAD_WORD_PATTERNS) {
              if (pattern.test(username)) {
                hasForbiddenContent = true;
                break;
              }
              pattern.lastIndex = 0;
            }
          }
          if (!hasForbiddenContent) {
            for (let pattern of THREAT_PATTERNS) {
              if (pattern.test(username)) {
                hasForbiddenContent = true;
                break;
              }
              pattern.lastIndex = 0;
            }
          }
          if (!hasForbiddenContent) {
            for (let pattern of HATE_PATTERNS) {
              if (pattern.test(username)) {
                hasForbiddenContent = true;
                break;
              }
              pattern.lastIndex = 0;
            }
          }
          
          return exists || isBanned || hasForbiddenContent;
        } catch (err) {
          console.error("[users] error while checking username", err);
          registerError.textContent = "Error checking username. Try again.";
          return true;
        }
      }

      // Register User (username + password + confirm)
      registerBtn.onclick = async () => {
        clearRegisterMessages();

        const username = regUsernameInput.value.trim();
        const password = regPasswordInput.value.trim();
        const passwordConfirm = regPasswordConfirmInput.value.trim();

        console.log("[register] submit", { username });

        if (!username || !password || !passwordConfirm) {
          registerError.textContent = "Please fill all fields.";
          return;
        }

        if (username.includes("@")) {
          registerError.textContent = "Username can't have '@'.";
          return;
        }
        // TEMP: spaces allowed
        // if (username.includes(" ")) {
        //   registerError.textContent = "Username can't have spaces.";
        //   return;
        // }

        if (username.length < 2 || username.length > 12) {
          registerError.textContent = "Username must be 2-12 characters.";
          return;
        }

        // TEMP: allow spaces in username regex
        if (!/^[a-zA-Z0-9_ -]+$/.test(username) || /^[_-]|[_-]$/.test(username)) {
          registerError.textContent = "Use letters/numbers/underscore/dash/space (no leading/trailing _ or -).";
          return;
        }

        // Check device fingerprint ban FIRST (before even trying to register)
        try {
          const fpCheck = await checkFingerprintBan();
          if (fpCheck.banned) {
            console.log("[register] device fingerprint is banned");
            registerError.textContent = "This device has been banned. Contact support.";
            return;
          }
        } catch (e) {
          console.warn("[register] fingerprint check failed:", e);
          // Continue - don't block on fingerprint check failure
        }

        let usernameHasBad = badWordPattern.test(username);

        if (!usernameHasBad) {
          // Catch leetspeak/obfuscated slurs in usernames
          for (let pattern of FLEXIBLE_BAD_WORD_PATTERNS) {
            if (pattern.test(username)) {
              usernameHasBad = true;
              break;
            }
            pattern.lastIndex = 0;
          }
        }

        if (!usernameHasBad) {
          for (let pattern of THREAT_PATTERNS) {
            if (pattern.test(username)) {
              usernameHasBad = true;
              break;
            }
            pattern.lastIndex = 0;
          }
        }

        if (!usernameHasBad) {
          for (let pattern of HATE_PATTERNS) {
            if (pattern.test(username)) {
              usernameHasBad = true;
              break;
            }
            pattern.lastIndex = 0;
          }
        }

        if (usernameHasBad) {
          registerError.textContent = "Username not allowed.";
          return;
        }

        if (isLocallyBlockedUsername(username)) {
          registerError.textContent = "Username not allowed.";
          return;
        }

        if (password !== passwordConfirm) {
          registerError.textContent = "Passwords do not match.";
          return;
        }

        // Check username in database
        if (await isUsernameTaken(username)) {
          if (!registerError.textContent) {
            registerError.textContent = "That username is already taken.";
          }
          return;
        }

        const fakeEmail = makeEmailFromUsername(username);
        console.log("[register] creating auth user", fakeEmail);

        try {
          const userCredential = await auth.createUserWithEmailAndPassword(
            fakeEmail,
            password
          );
          const user = userCredential.user;
          console.log("[register] auth user created", user.uid);

          // Save the username in Firebase Database
          const userRef = db.ref("users/" + user.uid);
          await userRef.set({ username });
          console.log("[register] username saved to /users", user.uid);
          
          // Auto-create profile path (include optional recovery email)
          try {
            const recoveryEmailVal = (regRecoveryEmailInput && regRecoveryEmailInput.value && regRecoveryEmailInput.value.trim()) ? regRecoveryEmailInput.value.trim() : null;
            await db.ref("userProfiles/" + user.uid).set({
              username: username,
              bio: "",
              profilePic: null,
              recoveryEmail: recoveryEmailVal,
              recoveryEmailVerified: false,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
            });
            console.log("[register] auto-created userProfiles", user.uid);
            
            // Also create friend requests and friends paths
            await db.ref("friendRequests/" + user.uid + "/incoming").set({});
            await db.ref("friends/" + user.uid).set({});
            console.log("[register] auto-created friend paths", user.uid);
          } catch (e) {
            console.warn("[register] could not create paths:", e);
          }

          // Keep them logged in after registration
          console.log("[register] registration complete, staying logged in");
          
          // Store fingerprint for hardware ban enforcement (respects device consent)
          await storeFingerprint(user.uid);
          
          // Hide the register form
          registerForm.classList.add("hidden");
        } catch (error) {
          console.error("[register] Error registering:", error);
          if (error.code === "auth/email-already-in-use") {
            registerError.textContent = "That username is already taken.";
          } else if (error.code === "auth/weak-password") {
            registerError.textContent = "Password is too weak.";
          } else {
            registerError.textContent = "Could not register. Try again.";
          }
        }
      };

      /// Sign In User (username + password only) with persistence
      loginBtn.onclick = async () => {
        clearLoginMessages();

        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value.trim();
        const remember = rememberMeCheckbox.checked;
        console.log("[login] submit", { username, remember });

        if (!username || !password) {
          loginError.textContent = "Please fill username and password.";
          return;
        }

        if (username.includes("@")) {
          loginError.textContent = "Username can't have '@'.";
          return;
        }
        // TEMP: spaces allowed
        // if (username.includes(" ")) { ... }

        // Check device fingerprint ban FIRST (before even trying to login)
        try {
          const fpCheck = await checkFingerprintBan();
          if (fpCheck.banned) {
            console.log("[login] device fingerprint is banned");
            loginError.textContent = "This device has been banned. Contact support.";
            return;
          }
        } catch (e) {
          console.warn("[login] fingerprint check failed:", e);
          // Continue - don't block on fingerprint check failure
        }

        const fakeEmail = makeEmailFromUsername(username);

        try {
          // Check if email/username is banned (use encoded keys)
          // Wrapped in try-catch since this check happens before auth
          try {
            const encodedEmail = encodeFirebaseKey(fakeEmail);
            const encodedUsername = encodeFirebaseKey(username);
            
            const bannedEmailSnap = await db.ref("bannedEmails/" + encodedEmail).once("value");
            const bannedUsernameSnap = await db.ref("bannedUsernames/" + encodedUsername).once("value");
            
            if (bannedEmailSnap.exists() || bannedUsernameSnap.exists()) {
              const bannedReason = bannedEmailSnap.val()?.reason || bannedUsernameSnap.val()?.reason || "Account has been permanently banned";
              loginError.textContent = "This account is banned: " + bannedReason;
              return;
            }
          } catch (banCheckErr) {
            console.warn("[login] could not check banned status, continuing:", banCheckErr.message);
          }

          const persistence = remember
            ? firebase.auth.Auth.Persistence.LOCAL
            : firebase.auth.Auth.Persistence.SESSION;

          console.log(
            "[login] setting persistence",
            remember ? "LOCAL" : "SESSION"
          );
          
          try {
            await auth.setPersistence(persistence);
          } catch (e) {
            console.warn("[login] persistence not available (incognito?):", e);
            // Continue anyway, will just be session-based
          }

          console.log("[login] signing in with email", fakeEmail);

          const userCredential = await auth.signInWithEmailAndPassword(
            fakeEmail,
            password
          );
          const user = userCredential.user;

          console.log("[login] signed in as", user.uid);
          
          // Auto-ensure paths exist
          try {
            await ensureUsernamePath(user.uid, username);
            await ensureUserProfilePath(user.uid);
            await ensureFriendRequestsPaths(user.uid);
            await ensureFriendsList(user.uid);
          } catch (e) {
            console.warn("[login] could not ensure paths:", e);
            // Continue anyway - these aren't critical
          }

          // DO NOT show chat here. onAuthStateChanged will do it.
        } catch (error) {
          console.error("[login] Error signing in:", error);
          // Distinguish between deleted/missing accounts and wrong password
          if (error && error.code === "auth/user-not-found") {
            loginError.textContent = "Account not found (it may have been deleted).";
          } else if (error && error.code === "auth/wrong-password") {
            loginError.textContent = "Wrong password.";
          } else if (error && error.code === "auth/too-many-requests") {
            loginError.textContent = "Too many attempts. Please wait and try again.";
          } else {
            loginError.textContent = "Could not log in. Try again.";
          }
        }
      };

      // Request recovery verification (login page)
      if (requestRecoveryBtn) {
        requestRecoveryBtn.addEventListener('click', async () => {
          const username = loginUsernameInput.value.trim();
          if (!username) {
            loginError.textContent = 'Enter your username first.';
            return;
          }
          if (username.includes('@')) {
            loginError.textContent = "Username can't have '@'.";
            return;
          }
          // TEMP: spaces allowed
          try {
            // Find uid for username
            const usersSnap = await db.ref('users').orderByChild('username').equalTo(username).once('value');
            let uid = null;
            usersSnap.forEach(child => { if (!uid) uid = child.key; });
            if (!uid) {
              loginError.textContent = 'No account found for that username.';
              return;
            }
            const profileSnap = await db.ref('userProfiles/' + uid + '/recoveryEmail').once('value');
            const recoveryEmail = profileSnap.exists() ? profileSnap.val() : null;
            console.log('[recovery] fetched recoveryEmail =', recoveryEmail);
            if (!recoveryEmail) {
              loginError.textContent = 'No recovery email set — contact support at chatrahelpcenter@gmail.com';
              return;
            }
            // Call worker to create token and return verify link
            const workerUrl = window.RECOVERY_WORKER_URL || 'https://recovery-modmojheh.workers.dev';
            const res = await fetch(workerUrl + '/send-verification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid, email: recoveryEmail })
            });
            if (!res.ok) throw new Error('Failed to request verification');
            const data = await res.json();
            const tokenId = data.tokenId || data.token || null;
            if (!tokenId) throw new Error('No token returned');
            // Build verify link pointing to app reset page
            const verifyLink = (window.RESET_PAGE_URL || (window.location.origin + '/reset.html')) + '?token=' + encodeURIComponent(tokenId);

            // Send email from browser via EmailJS
            try {
              // Validate email format before sending
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(recoveryEmail || '')) {
                console.warn('[recovery] invalid recoveryEmail, aborting send', recoveryEmail);
                loginError.textContent = 'Recovery email on file is invalid — update your profile before requesting a reset.';
                return;
              }
              const EMAILJS_SERVICE = 'service_sf4vssc';
              const EMAILJS_TEMPLATE = 'template_1j06lwg';
              // Sanitize/normalize the recipient address to avoid hidden_unicode or stray chars
              const userEmail = (recoveryEmail || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '').normalize('NFKC');
              const resetLink = verifyLink;
              // Use emailjs.send with template_1j06lwg as requested
              console.log('[emailjs] sending (send) to', userEmail, resetLink);
              await emailjs.send(
                EMAILJS_SERVICE,
                EMAILJS_TEMPLATE,
                {
                  link: resetLink,
                  email: userEmail
                }
              );
              loginInfo.textContent = 'Verification email sent to ' + recoveryEmail + '. Check your inbox.';
            } catch (ee) {
              try { console.error('[emailjs] send failed status/text', ee.status, ee.text); } catch(e) {}
              console.error('[emailjs] send failed (full)', ee);
              loginError.textContent = 'Failed to send email via EmailJS. Check console for details.';
            }
          } catch (e) {
            console.error('[recovery] error', e);
            loginError.textContent = 'Failed to send verification email. Contact support at chatrahelpcenter@gmail.com';
          }
        });
      }

      // Profile cache to avoid excessive DB lookups
      const profileCache = {};

// Developer helper: trigger a test send via EmailJS sendForm from the console.
// Usage: emailjsRecoveryTest('youremail@gmail.com', 'https://example.com/reset.html?token=abc')
window.emailjsRecoveryTest = async function(testEmail, testLink) {
  try {
    const form = document.getElementById('recoveryForm');
    if (!form) return console.error('[emailjsTest] recoveryForm not found in DOM');
    const email = (testEmail || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '').normalize('NFKC');
    const link = testLink || (window.RESET_PAGE_URL || (window.location.origin + '/reset.html')) + '?token=TEST';
    form.querySelector("[name='to_email']").value = email;
    form.querySelector("[name='verify_link']").value = link;
    const fromField = form.querySelector("[name='from_name']");
    if (fromField) fromField.value = 'Chatra Support';

    console.log('[emailjsTest] email char codes', [...email].map(c => c.charCodeAt(0)));
    const fd = new FormData(form);
    for (const pair of fd.entries()) console.log('[emailjsTest] form', pair[0], pair[1]);

    console.log('[emailjsTest] sending send() with template_1j06lwg...');
    const result = await emailjs.send('service_sf4vssc', 'template_1j06lwg', { link, email });
    console.log('[emailjsTest] send result', result);
    return result;
  } catch (err) {
    console.error('[emailjsTest] send failed', err);
    throw err;
  }
};

      // Delete message function
      async function deleteMessage(messageId, deleteToken) {
        if (!messageId) {
          console.error("[delete] no messageId provided");
          return;
        }

        try {
          console.log("[delete] deleting message", messageId);

          // Delete from Cloudinary if has deleteToken
          if (deleteToken) {
            try {
              await deleteFromCloudinary(deleteToken);
              console.log("[delete] deleted media from Cloudinary");
            } catch (err) {
              console.warn("[delete] failed to delete from Cloudinary, continuing", err);
            }
          }

          // Delete from Firebase
          await db.ref("messages/" + messageId).remove();
          console.log("[delete] deleted message from Firebase");

          // Remove from DOM - directly find element by data-message-id
          const row = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
          if (row) {
            row.remove();
            console.log("[delete] removed message from DOM");
          }

        } catch (err) {
          console.error("[delete] error deleting message", err);
          showToast("Failed to delete message", "error");
        }
      }

      // Delete group message function
      async function deleteGroupMessage(groupId, messageId, deleteToken) {
        if (!groupId || !messageId) {
          console.error("[delete group] no groupId or messageId provided");
          return;
        }

        try {
          console.log("[delete group] deleting message", messageId, "from group", groupId);

          // Delete from Cloudinary if has deleteToken
          if (deleteToken) {
            try {
              await deleteFromCloudinary(deleteToken);
              console.log("[delete group] deleted media from Cloudinary");
            } catch (err) {
              console.warn("[delete group] failed to delete from Cloudinary, continuing", err);
            }
          }

          // Delete from Firebase
          await db.ref("groups/" + groupId + "/messages/" + messageId).remove();
          console.log("[delete group] deleted message from Firebase");

          // Remove from DOM - directly find element by data-message-id
          // Try groupsPageMessages first (main groups page), then fallback to any container
          const groupMsgContainer = document.getElementById('groupsPageMessages');
          if (groupMsgContainer) {
            const row = groupMsgContainer.querySelector(`[data-message-id="${messageId}"]`);
            if (row) {
              row.remove();
              console.log("[delete group] removed message from DOM");
            }
          } else {
            // Fallback: search entire document for the message row
            const row = document.querySelector(`[data-message-id="${messageId}"]`);
            if (row) {
              row.remove();
              console.log("[delete group] removed message from DOM (fallback)");
            }
          }

        } catch (err) {
          console.error("[delete group] error deleting message", err);
          throw err;
        }
      }

      // DM inline edit state
      let activeDmInlineEdit = null; // { messageId, container, textEl }

      function cancelDmInlineEdit() {
        if (!activeDmInlineEdit) return;
        const { container, textEl } = activeDmInlineEdit;
        if (container && container.parentElement) {
          container.parentElement.removeChild(container);
        }
        if (textEl) {
          textEl.classList.remove("hidden");
        }
        activeDmInlineEdit = null;
      }

      async function deleteDmMessage(threadId, messageId, deleteToken) {
        if (!threadId || !messageId) {
          console.error("[dm delete] missing threadId or messageId");
          return;
        }
        try {
          // Best-effort media cleanup
          if (deleteToken) {
            try {
              await deleteFromCloudinary(deleteToken);
            } catch (e) {
              console.warn("[dm delete] media cleanup failed", e);
            }
          }
          await db.ref("dms/" + threadId + "/messages/" + messageId).remove();
          const row = document.querySelector(`[data-msg-key="${messageId}"]`);
          if (row) row.remove();
        } catch (err) {
          console.error("[dm delete] error", err);
          showToast("Failed to delete DM", "error");
        }
      }

      async function editDmMessage(threadId, messageId, currentText, messagesEl) {
        if (!threadId || !messageId || !messagesEl) return;

        cancelDmInlineEdit();

        const row = messagesEl.querySelector(`[data-msg-key="${messageId}"]`);
        if (!row) return;
        const textEl = row.querySelector(".message-bubble-anim .message-text-reveal");
        if (!textEl) return;

        textEl.classList.add("hidden");

        const editor = document.createElement("div");
        editor.className = "inline-edit-actions mt-2 flex flex-col gap-2";

        const textarea = document.createElement("textarea");
        textarea.className = "w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
        textarea.value = currentText || "";
        textarea.rows = Math.min(6, Math.max(2, (textarea.value.split("\n").length || 1)));

        const actions = document.createElement("div");
        actions.className = "flex items-center gap-2";

        const saveBtn = document.createElement("button");
        saveBtn.className = "px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs";
        saveBtn.textContent = "Save";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs";
        cancelBtn.textContent = "Cancel";

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);

        editor.appendChild(textarea);
        editor.appendChild(actions);

        textEl.parentElement.insertBefore(editor, textEl.nextSibling);

        activeDmInlineEdit = { messageId, container: editor, textEl };

        textarea.focus();

        const doSave = async () => {
          const trimmed = textarea.value.trim();
          if (!trimmed) {
            showToast("Message cannot be empty", "error");
            return;
          }
          try {
            await db.ref("dms/" + threadId + "/messages/" + messageId).update({
              text: trimmed,
              editedAt: firebase.database.ServerValue.TIMESTAMP,
            });

            textEl.textContent = trimmed;
            cancelDmInlineEdit();
          } catch (err) {
            console.error("[dm edit] error editing message", err);
            showToast("Failed to edit message", "error");
          }
        };

        saveBtn.addEventListener("click", doSave);
        cancelBtn.addEventListener("click", cancelDmInlineEdit);
        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            doSave();
          } else if (e.key === "Escape") {
            cancelDmInlineEdit();
          }
        });
      }

      // Report DM message function
      async function reportDmMessage(messageId, messageData, reportedUsername) {
        if (!messageId || !currentUserId || !currentUsername) {
          console.error("[dm report] missing required data");
          return;
        }

        const reason = prompt(`Report DM from ${reportedUsername}?\n\nPlease describe the issue:\n(e.g., "Harassment", "Threats", "Spam", "Inappropriate content")`);

        if (!reason || reason.trim() === "") {
          return; // User cancelled
        }

        try {
          const reportData = {
            messageId: messageId,
            threadId: activeDMThread || null,
            isDm: true,
            reportedBy: currentUsername,
            reportedByUid: currentUserId,
            reportedUser: reportedUsername,
            reportedUserUid: messageData.fromUid || null,
            messageText: messageData.text || "(media only)",
            messageMedia: messageData.media || null,
            reason: reason.trim(),
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            status: "pending",
          };

          await db.ref("reports").push(reportData);

          // Update UI - remove report button, show success
          const row = document.querySelector(`[data-msg-key="${messageId}"]`);
          if (row) {
            const reportBtn = row.querySelector('button[title="Report message"]');
            if (reportBtn) reportBtn.remove();

            const bubbleWrapper = row.querySelector('.relative.group');
            if (bubbleWrapper) {
              const success = document.createElement('div');
              success.className = 'mt-2 text-xs inline-block rounded px-2 py-1 bg-emerald-200 text-emerald-900 font-medium';
              success.textContent = 'Report submitted — thank you.';
              bubbleWrapper.appendChild(success);
              setTimeout(() => {
                success.style.opacity = '0';
                success.style.transition = 'opacity 0.5s';
                setTimeout(() => success.remove(), 500);
              }, 3000);
            }
          }

          console.log("[dm report] report submitted");
        } catch (err) {
          console.error("[dm report] error", err);
          showToast("Failed to submit report", "error");
        }
      }

      let activeInlineEdit = null; // { messageId, container, textEl }

      // Reply state
      let pendingReply = null; // { messageId, username, text }
      // Track which message's reply button we've hidden (so we can restore it)
      let replyButtonHiddenFor = null;

      function cancelInlineEdit() {
        if (!activeInlineEdit) return;
        const { container, textEl } = activeInlineEdit;
        if (container && container.parentElement) {
          container.parentElement.removeChild(container);
        }
        if (textEl) {
          textEl.classList.remove("hidden");
        }
        activeInlineEdit = null;
      }

      // Reply functions
      function setReply(messageId, username, text) {
        // Keep full text in pendingReply; preview will show a friendly ellipsized snippet
        // If we previously hid a reply button for another message, restore it
        try {
          if (replyButtonHiddenFor && replyButtonHiddenFor !== messageId) {
            const prevRow = messagesDiv.querySelector(`[data-message-id="${replyButtonHiddenFor}"]`);
            if (prevRow) {
              const prevReplyBtn = prevRow.querySelector('button[title="Reply"]');
              if (prevReplyBtn) {
                prevReplyBtn.style.display = '';
                prevReplyBtn.removeAttribute('data-reply-hidden');
              }
            }
            replyButtonHiddenFor = null;
          }
        } catch (e) {}

        pendingReply = { messageId, username, text: (text || "") };
        // Hide the reply button on the message being replied to so it doesn't remain active
        try {
          const row = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
          if (row) {
            const replyBtn = row.querySelector('button[title="Reply"]');
            if (replyBtn) {
              replyBtn.style.display = 'none';
              replyBtn.setAttribute('data-reply-hidden', 'true');
              replyButtonHiddenFor = messageId;
            }
          }
        } catch (e) {}
        showReplyPreview();
        msgInput.focus();
      }

      function clearReply() {
        // Restore any hidden reply button
        try {
          if (replyButtonHiddenFor) {
            const row = messagesDiv.querySelector(`[data-message-id="${replyButtonHiddenFor}"]`);
            if (row) {
              const replyBtn = row.querySelector('button[title="Reply"]');
              if (replyBtn && replyBtn.getAttribute('data-reply-hidden') === 'true') {
                replyBtn.style.display = '';
                replyBtn.removeAttribute('data-reply-hidden');
              }
            }
            replyButtonHiddenFor = null;
          }
        } catch (e) {}

        pendingReply = null;
        hideReplyPreview();
      }

      function showReplyPreview() {
        let replyPreviewEl = document.getElementById("replyPreview");
        if (!replyPreviewEl) {
          replyPreviewEl = document.createElement("div");
          replyPreviewEl.id = "replyPreview";
          replyPreviewEl.className = "px-3 py-2 bg-slate-800 border-t border-slate-700 flex items-center gap-2";
          const messageForm = document.getElementById("messageForm");
          messageForm.parentElement.insertBefore(replyPreviewEl, messageForm);
        }
        if (pendingReply) {
          replyPreviewEl.innerHTML = `
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 text-xs text-sky-400 font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3"><path fill-rule="evenodd" d="M6.232 2.186a.75.75 0 0 1-.02.848L3.347 6.75h9.028a3.375 3.375 0 0 1 0 6.75H10.5a.75.75 0 0 1 0-1.5h1.875a1.875 1.875 0 0 0 0-3.75H3.347l2.865 3.716a.75.75 0 1 1-1.19.914l-4-5.19a.75.75 0 0 1 0-.915l4-5.19a.75.75 0 0 1 .848-.203.75.75 0 0 1 .362.604Z" clip-rule="evenodd"/></svg>
                Replying to <span class="text-slate-100">${escapeHtml(pendingReply.username)}</span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5 font-medium">"${escapeHtml(previewText(pendingReply.text, 64))}"</p>
            </div>
            <button type="button" id="cancelReplyBtn" class="p-1 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white" title="Cancel reply">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          replyPreviewEl.classList.remove("hidden");
          document.getElementById("cancelReplyBtn").addEventListener("click", clearReply);
        }
      }

      function hideReplyPreview() {
        const replyPreviewEl = document.getElementById("replyPreview");
        if (replyPreviewEl) {
          replyPreviewEl.classList.add("hidden");
        }
      }

      function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }

      function scrollToMessage(messageId) {
        const row = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          row.classList.add("ring-2", "ring-sky-500", "ring-opacity-75");
          setTimeout(() => {
            row.classList.remove("ring-2", "ring-sky-500", "ring-opacity-75");
          }, 2000);
        }
      }

      async function editMessage(messageId, currentText) {
        if (!messageId) return;

        // Only one inline edit at a time
        cancelInlineEdit();

        const row = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
        if (!row) return;
        const textEl = row.querySelector(".message-bubble-anim .message-text-reveal");
        if (!textEl) return;

        textEl.classList.add("hidden");

        const editor = document.createElement("div");
        editor.className = "inline-edit-actions mt-2 flex flex-col gap-2";

        const textarea = document.createElement("textarea");
        textarea.className = "w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
        textarea.value = currentText || "";
        textarea.rows = Math.min(6, Math.max(2, (textarea.value.split("\n").length || 1)));

        const actions = document.createElement("div");
        actions.className = "flex items-center gap-2";

        const saveBtn = document.createElement("button");
        saveBtn.className = "px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs";
        saveBtn.textContent = "Save";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs";
        cancelBtn.textContent = "Cancel";

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);

        editor.appendChild(textarea);
        editor.appendChild(actions);

        textEl.parentElement.insertBefore(editor, textEl.nextSibling);

        activeInlineEdit = { messageId, container: editor, textEl };

        textarea.focus();

        const doSave = async () => {
          const trimmed = textarea.value.trim();
          if (!trimmed) {
            showToast("Message cannot be empty", "error");
            return;
          }
          try {
            await db.ref("messages/" + messageId).update({
              text: trimmed,
              editedAt: firebase.database.ServerValue.TIMESTAMP,
            });

            textEl.textContent = trimmed;
            cancelInlineEdit();
          } catch (err) {
            console.error("[edit] error editing message", err);
            showToast("Failed to edit message", "error");
          }
        };

        saveBtn.addEventListener("click", doSave);
        cancelBtn.addEventListener("click", cancelInlineEdit);
        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            doSave();
          } else if (e.key === "Escape") {
            cancelInlineEdit();
          }
        });
      }

      // Fetch user profile data with timeout
      // Pending profile requests for deduplication
      const pendingProfileRequests = new Map();

      async function fetchUserProfile(username) {
        // Return cached result if available and recent (5 minutes)
        if (profileCache[username]) {
          const cached = profileCache[username];
          const now = Date.now();
          if (cached._timestamp && (now - cached._timestamp) < 300000) {
            return cached;
          }
        }
        
        // Deduplicate concurrent requests for same username
        if (pendingProfileRequests.has(username)) {
          return pendingProfileRequests.get(username);
        }
        
        const fetchPromise = (async () => {
          try {
            // Set a timeout for the fetch (8s for slow school iPad connections)
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("timeout")), 8000)
            );

            const dataPromise = (async () => {
              const snap = await db.ref("users").orderByChild("username").equalTo(username).once("value");
              if (snap.exists()) {
                const uid = Object.keys(snap.val())[0];

                const [profileSnap, userSnap] = await Promise.all([
                  db.ref("userProfiles/" + uid).once("value"),
                  db.ref("users/" + uid).once("value"),
                ]);

                const profileData = profileSnap.val() || {};
                const userData = userSnap.val() || {};

                // Merge so banner/pic are available even if one path is missing
                const merged = { ...userData, ...profileData };

                profileCache[username] = { uid, ...merged, _timestamp: Date.now() };
                return profileCache[username];
              }
              return null;
            })();

            return await Promise.race([dataPromise, timeoutPromise]);
          } catch (err) {
            return null;
          } finally {
            pendingProfileRequests.delete(username);
          }
        })();
        
        pendingProfileRequests.set(username, fetchPromise);
        return fetchPromise;
      }

      // --- MESSAGE RENDERING (bigger iMessage-style bubbles) ---
      function createMessageRow(msg, messageId = null, containerEl = null) {
        const myName = currentUsername || null;
        const isMine = myName && msg.user === myName;
        const username = msg.user || "Unknown";
        const ownerUid = "u5yKqiZvioWuBGcGK3SWUBpUVrc2";
        const isOwnerMessage = msg.userId === ownerUid;
        const staffUid = "6n8hjmrUxhMHskX4BG8Ik9boMqa2";
        const isStaffMessage = msg.userId === staffUid;

        const row = document.createElement("div");
        row.className = isMine 
          ? "w-full flex mb-2 sm:mb-2 justify-end pr-0 sm:pr-1 gap-1 items-center"
          : "w-full flex mb-2 sm:mb-2 justify-start pl-0 sm:pl-1 gap-1 items-center";
        
        // Store messageId in dataset for deletion
        if (messageId) {
          row.dataset.messageId = messageId;
          row.id = 'msg-' + messageId;
        }

        const column = document.createElement("div");
        column.className = isMine
          ? "flex flex-col max-w-[80%] sm:max-w-[60%] gap-1 items-end"
          : "flex flex-col max-w-[80%] sm:max-w-[60%] gap-1 items-start";

        // Add profile picture for all messages
        const avatarDiv = document.createElement("div");
        avatarDiv.className = "h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity overflow-hidden";
        avatarDiv.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        avatarDiv.style.minWidth = "1.75rem";
        avatarDiv.style.minHeight = "1.75rem";

        // Local messages container (used for scroll behavior when loading media)
        const localMessagesDiv = containerEl || messagesDiv;

        // Load profile picture async (non-blocking) - Safari/iPad compatible
        setTimeout(() => {
          fetchUserProfile(username).then(profile => {
                if (profile?.profilePic && avatarDiv.innerHTML.includes("svg")) {
              try {
                const img = document.createElement("img");
                img.className = "h-full w-full object-cover";
                // Add crossorigin for Safari compatibility
                img.crossOrigin = "anonymous";
                img.onerror = () => {
                  // On error, keep default avatar
                  console.debug("[avatar] failed to load", profile.profilePic);
                };
                img.onload = () => {
                  // Only replace avatar once image has loaded successfully
                  if (avatarDiv.innerHTML.includes("svg") || avatarDiv.querySelector("img")?.src !== img.src) {
                    avatarDiv.innerHTML = "";
                    avatarDiv.appendChild(img);
                  }
                };
                // Load directly without IntersectionObserver for Safari compatibility
                img.src = profile.profilePic;
              } catch (e) {
                // Silently ignore, keep default
                console.debug("[avatar] error creating img", e);
              }
            }
          }).catch((err) => {
            // Log fetch errors for debugging on iPad
            console.debug("[avatar] fetch error", err);
          });
        }, 50);

        // Click to view profile
        avatarDiv.addEventListener("click", () => {
          viewUserProfile(username);
        });

        row.appendChild(avatarDiv);

        // Add name label for received messages only; hide avatar for own messages
        if (!isMine) {

          const nameLabel = document.createElement("div");
          nameLabel.className =
            "text-[10px] sm:text-xs text-slate-400 px-3 font-medium cursor-pointer hover:text-slate-300 transition-colors";
          if (isOwnerMessage) {
            const ownerBadge = '<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-100 border border-amber-400/40">Owner</span>';
            nameLabel.innerHTML = '<span class="inline-flex items-center gap-1">' + '<span class="mention-insert" data-username="' + escapeHtml(username) + '">' + escapeHtml(username) + '</span>' + ownerBadge + '</span>';
          } else if (isStaffMessage) {
            const staffBadge = '<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-100 border border-sky-400/40">Co Owner</span>';
            nameLabel.innerHTML = '<span class="inline-flex items-center gap-1">' + '<span class="mention-insert" data-username="' + escapeHtml(username) + '">' + escapeHtml(username) + '</span>' + staffBadge + '</span>';
          } else {
            nameLabel.innerHTML = '<span class="mention-insert" data-username="' + escapeHtml(username) + '">' + escapeHtml(username) + '</span>';
          }
          // Click to view profile (single click)
          nameLabel.addEventListener("click", (e) => {
            // If shift is held, insert @mention instead
            if (e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              insertMentionAtCursor(username);
            } else {
              viewUserProfile(username);
            }
          });
          // Add title hint
          nameLabel.title = "Click to view profile â€¢ Shift+Click to @mention";
          column.appendChild(nameLabel);
        } else {
          // Hide avatar for own messages
          avatarDiv.style.display = "none";
        }

        // Add container for bubble + buttons (not timestamp)
        const bubbleContainer = document.createElement("div");
        bubbleContainer.className = isMine ? "flex justify-end" : "flex justify-start";

        const bubble = document.createElement("div");
        const textLength = (msg.text || "").length;
        const isSmallMessage = textLength <= 2;
        const padding = isSmallMessage ? "px-3 py-1.5" : "px-3 py-2";
        const isAiMessage = msg.userId === AI_BOT_UID;
        const aiClass = isAiMessage ? ' ai-message' : '';
        
        // Add relative for button positioning, overflow-visible for buttons outside bubble, group for hover
        bubble.className = isMine
          ? `group relative overflow-visible message-bubble-anim mine${aiClass} ${padding} sm:px-3 sm:py-2 rounded-2xl text-left text-[12px] sm:text-[13px] leading-relaxed break-words shadow-sm bg-gradient-to-br from-sky-500 to-sky-600 text-white rounded-br-md font-light shadow-md shadow-sky-500/20`
          : `group relative overflow-visible message-bubble-anim${aiClass} ${padding} sm:px-3 sm:py-2 rounded-2xl text-left text-[12px] sm:text-[13px] leading-relaxed break-words shadow-sm bg-slate-700/90 text-slate-50 rounded-bl-md border border-slate-600/50 backdrop-blur-sm font-light`;

        // Ensure bubble width hugs content for short messages
        bubble.style.display = "inline-block";
        bubble.style.maxWidth = "100%";

        // Add reply preview if this message is a reply
        if (msg.replyTo && msg.replyTo.messageId) {
          const replyPreview = document.createElement("div");
          // If this reply quotes the current user, add a special class to highlight it
          let replyPreviewClass = "reply-preview mb-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ";
          replyPreviewClass += (isMine
            ? "bg-sky-400/20 border-l-2 border-sky-300 hover:bg-sky-400/30"
            : "bg-slate-600/50 border-l-2 border-slate-400 hover:bg-slate-600/70");
          try {
            if (msg.replyTo && msg.replyTo.username && currentUsername && msg.replyTo.username.toLowerCase() === currentUsername.toLowerCase()) {
              replyPreviewClass += ' reply-to-me';
            }
          } catch (e) {}
          replyPreview.className = replyPreviewClass;
          // Use previewText to create a friendly ellipsized snippet for the reply preview
          const replyTextRaw = msg.replyTo.text || "(message)";
          const replySnippet = previewText(replyTextRaw, 64);
          replyPreview.innerHTML = `
            <div class="flex items-center gap-1 text-[10px] ${isMine ? 'text-sky-200' : 'text-slate-300'} font-medium">
              <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\" fill=\"currentColor\" class=\"w-3 h-3\"><path fill-rule=\"evenodd\" d=\"M6.232 2.186a.75.75 0 0 1-.02.848L3.347 6.75h9.028a3.375 3.375 0 0 1 0 6.75H10.5a.75.75 0 0 1 0-1.5h1.875a1.875 1.875 0 0 0 0-3.75H3.347l2.865 3.716a.75.75 0 1 1-1.19.914l-4-5.19a.75.75 0 0 1 0-.915l4-5.19a.75.75 0 0 1 .848-.203.75.75 0 0 1 .362.604Z\" clip-rule=\"evenodd\"/></svg>
              ${escapeHtml(msg.replyTo.username || "Unknown")}
            </div>
            <p class="text-[11px] ${isMine ? 'text-sky-100/80' : 'text-slate-400'} mt-0.5 font-medium">"${escapeHtml(replySnippet)}"</p>
          `;
          replyPreview.addEventListener("click", (e) => {
            e.stopPropagation();
            scrollToMessage(msg.replyTo.messageId);
          });
          bubble.appendChild(replyPreview);
        }

        // Add media if present (image or video)
        if (msg.media) {
          const mediaUrl = msg.media;
          const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('video') || mediaUrl.includes('.mov') || mediaUrl.includes('.webm');
          const isGif = mediaUrl.toLowerCase().includes('.gif');
          
          if (isVideo) {
            const videoContainer = document.createElement("div");
            videoContainer.className = "relative rounded-lg overflow-hidden mb-2";
            videoContainer.style.maxWidth = "400px";
            
            const video = document.createElement("video");
            video.controls = true;
            video.preload = "metadata";
            video.className = "w-full rounded-lg";
            video.style.maxHeight = "300px";
            video.style.display = "block";
            video.setAttribute("playsinline", ""); // Required for iOS Safari inline playback
            video.setAttribute("webkit-playsinline", ""); // Legacy iOS Safari support
            
            // Load directly without IntersectionObserver for Safari/iPad compatibility
            video.src = mediaUrl;
            
            // Scroll after video metadata loads
            video.addEventListener("loadedmetadata", () => {
              // Only scroll if we're at the bottom already
              if (localMessagesDiv && localMessagesDiv.scrollTop >= localMessagesDiv.scrollHeight - localMessagesDiv.clientHeight - 100) {
                localMessagesDiv.scrollTop = localMessagesDiv.scrollHeight;
              }
            });
            
            videoContainer.appendChild(video);
            bubble.appendChild(videoContainer);
          } else if (isGif) {
            const gifContainer = document.createElement("div");
            gifContainer.className = "relative rounded-lg overflow-hidden mb-2";
            gifContainer.style.maxWidth = "400px";
            
            const img = document.createElement("img");
            img.className = "w-full rounded-lg cursor-pointer active:opacity-70 transition-opacity";
            img.style.maxHeight = "300px";
            img.style.display = "block";
            img.style.objectFit = "contain";
            img.crossOrigin = "anonymous"; // Safari CORS fix
            
            // Load directly without IntersectionObserver for Safari/iPad compatibility
            img.src = mediaUrl;
            
            // GIF controls: loop continuously
            img.onload = () => {
              // Scroll only if at bottom
              if (localMessagesDiv && localMessagesDiv.scrollTop >= localMessagesDiv.scrollHeight - localMessagesDiv.clientHeight - 100) {
                localMessagesDiv.scrollTop = localMessagesDiv.scrollHeight;
              }
              
              // Force loop by reloading src when ended (for animated GIFs)
              setInterval(() => {
                const tempSrc = img.src;
                img.src = '';
                img.src = tempSrc;
              }, 10000); // Reload every 10 seconds to ensure loop
            };
            
            img.onclick = () => openImageViewer(mediaUrl);
            gifContainer.appendChild(img);
            bubble.appendChild(gifContainer);
          } else {
            const imgContainer = document.createElement("div");
            imgContainer.className = "relative rounded-lg overflow-hidden mb-2";
            imgContainer.style.maxWidth = "400px";
            
            const img = document.createElement("img");
            img.className = "w-full rounded-lg cursor-pointer active:opacity-70 transition-opacity";
            img.style.maxHeight = "300px";
            img.style.display = "block";
            img.style.objectFit = "contain";
            img.crossOrigin = "anonymous"; // Safari CORS fix
            
            // Load directly without IntersectionObserver for Safari/iPad compatibility
            img.src = mediaUrl;
            
            // Scroll after image loads (only if at bottom)
            img.onload = () => {
              if (localMessagesDiv && localMessagesDiv.scrollTop >= localMessagesDiv.scrollHeight - localMessagesDiv.clientHeight - 100) {
                localMessagesDiv.scrollTop = localMessagesDiv.scrollHeight;
              }
            };
            
            img.onclick = () => openImageViewer(mediaUrl);
            
            imgContainer.appendChild(img);
            bubble.appendChild(imgContainer);
          }
        }

        // Add text if present (with @mention highlighting)
        if (msg.text) {
          const textSpan = document.createElement("span");
          textSpan.className = "message-text-reveal inline-block font-medium";
          // Render text with mentions highlighted
          textSpan.innerHTML = renderTextWithMentions(msg.text, isMine);
          
          // Add click handlers for mentions
          textSpan.querySelectorAll('.mention-highlight').forEach(mentionEl => {
            mentionEl.addEventListener('click', (e) => {
              e.stopPropagation();
              const mentionedUser = mentionEl.dataset.mention;
              if (mentionedUser) {
                viewUserProfile(mentionedUser);
              }
            });
          });
          
          bubble.appendChild(textSpan);
          // If this message mentions the current user OR @everyone, mark the whole bubble and notify
          try {
            if (currentUsername && !isMine) {
              const lowered = (msg.text || '').toLowerCase();
              const mentionsMe = lowered.includes('@' + currentUsername.toLowerCase());
              const mentionsEveryone = lowered.includes('@everyone');
              if (mentionsMe || mentionsEveryone) {
                bubble.classList.add('mentioned');
                // Only notify once per message id (avoid repeat on refresh)
                if (messageId) {
                  if (!mentionNotified.has(messageId)) {
                    notifyMention(msg);
                    markMentionNotified(messageId);
                  }
                } else {
                  // If no messageId available, show once (best-effort)
                  notifyMention(msg);
                }
              }

              // Persist mention records to the database when this client is the author
              try {
                if (messageId && msg.userId && currentUserId && msg.userId === currentUserId && msg.text) {
                  // find all mentions in the message text
                  const mentionRegex = /@([a-zA-Z0-9_-]{2,64})\b/g;
                  let m;
                  const written = [];
                  while ((m = mentionRegex.exec(msg.text)) !== null) {
                    const uname = m[1];
                    const userEntry = mentionUsers.get(uname.toLowerCase());
                    if (userEntry && userEntry.uid && userEntry.uid !== currentUserId) {
                      const targetUid = userEntry.uid;
                      const refPath = `mentions/${targetUid}/${messageId}`;
                      // write a mention record (author must be the one writing)
                      const payload = {
                        sourceUid: msg.userId,
                        sourceUsername: msg.user,
                        messageId: messageId,
                        time: Date.now(),
                        messageText: msg.text || ''
                      };
                      try {
                        db.ref(refPath).set(payload).catch((err) => {
                          console.warn('[mentions] failed to write mention for', targetUid, err);
                        });
                        written.push(targetUid);
                      } catch (e) {
                        console.warn('[mentions] write error', e);
                      }
                    }
                  }
                  if (written.length) console.debug('[mentions] persisted mentions for', written);
                }
              } catch (e) {}
            }
          } catch (e) {}
        }
        
        bubbleContainer.appendChild(bubble);

        // Add small timestamp/date under the bubble container in the column (not inside bubbleContainer)
        let timestampMeta = null;
        try {
          const ts = msg && (msg.time || msg.timestamp) ? Number(msg.time || msg.timestamp) : null;
          if (ts) {
            const now = Date.now();
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const d = new Date(ts);
            let metaText = '';
            if (now - ts < ONE_DAY) {
              metaText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
              const opts = { month: 'short', day: 'numeric' };
              if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
              metaText = d.toLocaleDateString([], opts);
            }
            timestampMeta = document.createElement('div');
            timestampMeta.className = 'text-[10px] text-slate-400 mt-0.5 font-thin select-none whitespace-nowrap ' + (isMine ? 'text-right' : 'text-left');
            timestampMeta.textContent = metaText;
          }
        } catch (e) {
          // ignore formatting errors
        }

        // Add delete button for own messages
        if (isMine && messageId) {
          const deleteBtn = document.createElement("button");
          // Hidden by default, show on hover, pushed outside bubble
          deleteBtn.className = "absolute -top-4 right-4 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500 active:bg-red-500 text-sm cursor-pointer";
          deleteBtn.textContent = "🗑️";
          deleteBtn.title = "Delete message";
          
          deleteBtn.addEventListener("click", () => {
            openDeleteMessageModal(messageId, msg.deleteToken);
          });
          // Touch handler for iPad (prevent click delay)
          deleteBtn.addEventListener("touchend", (e) => {
            e.preventDefault();
            openDeleteMessageModal(messageId, msg.deleteToken);
          });
          
          bubble.appendChild(deleteBtn);

          const editBtn = document.createElement("button");
          // Hidden by default, show on hover, next to delete button
          editBtn.className = "absolute -top-4 right-4 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500 active:bg-sky-500 cursor-pointer";
          editBtn.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\" fill=\"currentColor\" class=\"w-3.5 h-3.5\"><path d=\"M15.502 1.94a1.5 1.5 0 0 1 2.122 2.12l-1.06 1.062-2.122-2.122 1.06-1.06Zm-2.829 2.828-9.192 9.193a2 2 0 0 0-.518.94l-.88 3.521a.5.5 0 0 0 .607.607l3.52-.88a2 2 0 0 0 .942-.518l9.193-9.193-2.672-2.67Z\"/></svg>";
          editBtn.title = "Edit message";

          editBtn.addEventListener("click", () => {
            editMessage(messageId, msg.text || "");
          });

          bubble.appendChild(editBtn);
        }
        
        // Add report button for other users' messages
        if (!isMine && messageId && msg.userId !== currentUserId) {
          // If already reported locally, don't add a report button
          if (!reportedMessages.has(messageId)) {
            const reportBtn = document.createElement("button");
            // Hidden by default, show on hover, pushed outside bubble
            reportBtn.className = "absolute -top-4 -left-4 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-amber-500 active:bg-amber-500 text-sm cursor-pointer";
            reportBtn.textContent = "⚠️";
            reportBtn.title = "Report message";

            reportBtn.addEventListener("click", () => {
              if (typeof openInlineReport === 'function') {
                openInlineReport(messageId, msg, username, bubbleContainer);
              } else {
                reportMessage(messageId, msg, username);
              }
            });
            // Touch handler for iPad (prevent click delay)
            reportBtn.addEventListener("touchend", (e) => {
              e.preventDefault();
              if (typeof openInlineReport === 'function') {
                openInlineReport(messageId, msg, username, bubbleContainer);
              } else {
                reportMessage(messageId, msg, username);
              }
            });

            bubble.appendChild(reportBtn);
          }
        }

        // Add copy button on all messages with text
        if (messageId && msg.text) {
          const copyBtn = document.createElement("button");
          // Hidden by default, show on hover - left side for own messages, left for others too
          const copyPosition = isMine ? "bottom-0 -left-4" : "-bottom-4 -left-4";
          copyBtn.className = `absolute ${copyPosition} z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-emerald-500 active:bg-emerald-500 cursor-pointer`;
          copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061V11.5A1.5 1.5 0 0 1 15.5 13H8.5A1.5 1.5 0 0 1 7 11.5v-8Z"/><path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h2a.5.5 0 0 0 0-1h-2Z"/></svg>';
          copyBtn.title = "Copy message";

          copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(msg.text).then(() => {
              showToast('Message copied!', 'success');
            }).catch(() => {
              showToast('Failed to copy', 'error');
            });
          });
          // Touch handler for iPad
          copyBtn.addEventListener("touchend", (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(msg.text).then(() => {
              showToast('Message copied!', 'success');
            }).catch(() => {
              showToast('Failed to copy', 'error');
            });
          });

          bubble.appendChild(copyBtn);
        }

        // Add reply button on all messages
        if (messageId) {
          const replyBtn = document.createElement("button");
          // Hidden by default, show on hover, pushed outside bubble
          replyBtn.className = "absolute -bottom-4 -left-4 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500 active:bg-sky-500 cursor-pointer";
          replyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clip-rule="evenodd"/></svg>';
          replyBtn.title = "Reply";

          // Detect if this is a group chat message
          const isGroupChat = containerEl && containerEl.id === 'groupsPageMessages';

          // Touch-friendly handlers (iPad/Safari): dedupe touch->click and make visible on touch
          (function() {
            let touchFired = false;
            replyBtn.addEventListener('touchstart', (e) => {
              touchFired = true;
              const grp = replyBtn.closest('.group');
              if (grp) {
                grp.classList.add('touch-active');
                // visibility cleared when touching elsewhere
              }
            }, { passive: true });
            replyBtn.addEventListener('touchend', (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isGroupChat) {
                setGroupReply(messageId, username, msg.text || "(media)");
              } else {
                setReply(messageId, username, msg.text || "(media)");
              }
              setTimeout(() => { touchFired = false; }, 500);
            });
            replyBtn.addEventListener('click', (e) => {
              if (touchFired) return; // avoid duplicate action after touch
              if (isGroupChat) {
                setGroupReply(messageId, username, msg.text || "(media)");
              } else {
                setReply(messageId, username, msg.text || "(media)");
              }
            });
          })();

          bubble.appendChild(replyBtn);
        }

        // Admin delete button for other users' messages
        if (!isMine && messageId && isAdmin) {
          const adminDeleteBtn = document.createElement("button");
          // Hidden by default, show on hover, pushed outside bubble
          adminDeleteBtn.className = "absolute -top-4 -right-4 z-20 w-7 h-7 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-700 active:bg-red-700 text-sm cursor-pointer";
          adminDeleteBtn.textContent = "🗑️";
          adminDeleteBtn.title = "Admin delete";
          adminDeleteBtn.setAttribute("data-admin-delete", "true");

          adminDeleteBtn.addEventListener("click", () => {
            openDeleteMessageModal(messageId, msg.deleteToken);
          });
          // Touch handler for iPad (prevent click delay)
          adminDeleteBtn.addEventListener("touchend", (e) => {
            e.preventDefault();
            openDeleteMessageModal(messageId, msg.deleteToken);
          });

          bubble.appendChild(adminDeleteBtn);
        }
        
        column.appendChild(bubbleContainer);
        
        // Add timestamp after the bubble container (not inside it)
        if (timestampMeta) {
          column.appendChild(timestampMeta);
        }

        // After bubble is constructed, decide vertical alignment based on content.
        // If message is single-line (short and no newline), center avatar vertically; otherwise align to top.
        try {
          const textContent = (msg.text || '');
          const looksSingleLine = !textContent.includes('\n') && textContent.length <= 60 && !msg.media && !msg.replyTo;
          if (looksSingleLine) {
            row.classList.remove('items-start');
            row.classList.add('items-center');
          } else {
            row.classList.remove('items-center');
            row.classList.add('items-start');
          }
        } catch (e) {}

        row.appendChild(column);
        return row;
      }

      function renderMessage(msg, options = {}) {
        const { prepend = false, maintainScroll = false, messageId = null } = options;

        const row = createMessageRow(msg, messageId);

        if (prepend) {
          if (messagesDiv.firstChild) {
            messagesDiv.insertBefore(row, messagesDiv.firstChild);
          } else {
            messagesDiv.appendChild(row);
          }
        } else {
          messagesDiv.appendChild(row);
        }

        if (!maintainScroll) {
          // Check if already at bottom before scrolling
          const isAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 50;
          if (isAtBottom) {
            // Delay scroll to let images load
            setTimeout(() => {
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }, 200);
          }
        }

        // Ensure admin controls are present on newly rendered messages
        if (isAdmin) {
          try { refreshAdminControls(); } catch (e) {}
        }
      }

      function renderMessageOnce(key, msg, options = {}) {
        if (!key) {
          console.warn("[messages] missing key for message", msg);
          renderMessage(msg, options);
          return;
        }
        if (seenMessageKeys.has(key)) return;
        
        // Filter out messages from blocked users
        if (isMessageFromBlockedUser(msg)) {
          seenMessageKeys.add(key); // Mark as seen but don't render
          return;
        }
        
        // Track user for @mention suggestions
        if (msg.user && msg.userId) {
          fetchUserProfile(msg.user).then(profile => {
            trackUserForMentions(msg.user, msg.userId, profile?.profilePic);
          }).catch(() => {
            trackUserForMentions(msg.user, msg.userId, null);
          });
        }
        
        seenMessageKeys.add(key);
        renderMessage(msg, { ...options, messageId: key });
      }

      function removeMessageById(messageId) {
        if (!messageId) return;
        const rows = messagesDiv.querySelectorAll("[data-message-id]");
        rows.forEach((row) => {
          if (row.dataset.messageId === messageId) {
            row.remove();
          }
        });
        seenMessageKeys.delete(messageId);
      }

      // Ensure admin controls exist on all current messages
      function refreshAdminControls() {
        if (!isAdmin || !messagesDiv) return;
        const rows = messagesDiv.querySelectorAll("[data-message-id]");
        rows.forEach((row) => {
          const bubbleContainer = row.querySelector(".relative.group");
          const bubble = row.querySelector(".message-bubble-anim");
          if (!bubbleContainer || !bubble) return;
          const isMineBubble = bubble.classList.contains("mine");
          if (isMineBubble) return; // owners already have their own delete button

          // If an admin delete button already exists, skip
          const existingAdminBtn = bubbleContainer.querySelector('[data-admin-delete="true"]');
          if (existingAdminBtn) return;

          const messageId = row.dataset.messageId;
          if (!messageId) return;

          const adminDeleteBtn = document.createElement("button");
          // Hidden by default, show on hover, tight to bubble corner
          adminDeleteBtn.className = "absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500 active:bg-red-500 text-sm";
          adminDeleteBtn.textContent = "🗑️";
          adminDeleteBtn.title = "Admin delete";
          adminDeleteBtn.setAttribute("data-admin-delete", "true");
          adminDeleteBtn.addEventListener("click", () => {
            // We may not have deleteToken; modal handles null safely
            openDeleteMessageModal(messageId, null);
          });
          // Touch handler for iPad (prevent click delay)
          adminDeleteBtn.addEventListener("touchend", (e) => {
            e.preventDefault();
            openDeleteMessageModal(messageId, null);
          });
          bubbleContainer.appendChild(adminDeleteBtn);
        });
      }

      function previewText(text, max = 80) {
        if (!text) return "";
        const t = String(text);
        if (t.length <= max) return t;
        // Hard slice
        let slice = t.slice(0, max);
        // Prefer truncating at a word boundary to avoid cutting words mid-way
        const lastSpace = slice.lastIndexOf(' ');
        if (lastSpace > Math.floor(max * 0.35)) {
          slice = slice.slice(0, lastSpace);
        }
        // Trim trailing non-word characters (punctuation/space) without using Unicode property escapes
        slice = slice.replace(/[\W_]+$/g, '');
        return slice + '…';
      }

      // Batch render messages for better performance
      function batchRenderMessages(messages, options = {}) {
        const fragment = document.createDocumentFragment();
        let newMessagesCount = 0;

        messages.forEach(({ key, msg }) => {
          if (key && seenMessageKeys.has(key)) return;
          
          // Filter out messages from blocked users
          if (isMessageFromBlockedUser(msg)) {
            if (key) seenMessageKeys.add(key); // Mark as seen but don't render
            return;
          }
          
          if (key) seenMessageKeys.add(key);

          const row = createMessageRow(msg, key);
          if (options.prepend) {
            fragment.insertBefore(row, fragment.firstChild);
          } else {
            fragment.appendChild(row);
          }
          newMessagesCount++;
        });

        if (newMessagesCount > 0) {
          // Use requestAnimationFrame for smoother rendering
          requestAnimationFrame(() => {
            if (options.prepend && messagesDiv.firstChild) {
              messagesDiv.insertBefore(fragment, messagesDiv.firstChild);
            } else {
              messagesDiv.appendChild(fragment);
            }

            if (!options.maintainScroll) {
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            // Update scroll-to-bottom visibility after rendering
            try { updateScrollToBottomBtn(); } catch (_) {}

            // After batch render, add admin controls if applicable
            if (isAdmin) {
              try { refreshAdminControls(); } catch (e) {}
            }
          });
        }
      }

      // --- INFINITE SCROLL HELPERS ---
      function onMessagesScroll() {
        if (allHistoryLoaded || isLoadingOlder) return;
        // When user is near top (~5 messages above), load older
        const threshold = 120; // px from top, tweak if you want
        if (messagesDiv.scrollTop <= threshold) {
          loadOlderMessages();
        }
      }

      function attachScrollListener() {
        if (scrollListenerAttached) return;
        messagesDiv.addEventListener("scroll", onMessagesScroll);
        scrollListenerAttached = true;
      }

      function detachScrollListener() {
        if (!scrollListenerAttached) return;
        messagesDiv.removeEventListener("scroll", onMessagesScroll);
        scrollListenerAttached = false;
      }

      function loadOlderMessages() {
        if (isLoadingOlder) return;
        if (oldestTime === null) return;
        isLoadingOlder = true;
        console.log("[messages] loading older messages before time =", oldestTime);

        const prevScrollHeight = messagesDiv.scrollHeight;
        const prevScrollTop = messagesDiv.scrollTop;

        const baseRef = db.ref("messages").orderByChild("time");

        baseRef
          .endAt(oldestTime - 1)
          .limitToLast(PAGE_SIZE)
          .once(
            "value",
            (snap) => {
              const msgs = [];
              snap.forEach((child) => {
                msgs.push({ key: child.key, msg: child.val() || {} });
              });

              if (msgs.length === 0) {
                console.log("[messages] no older messages, all history loaded");
                allHistoryLoaded = true;
                isLoadingOlder = false;
                return;
              }

              // Update time range
              msgs.forEach(({ key, msg }) => {
                const t = msg.time || 0;
                if (oldestTime === null || t < oldestTime) {
                  oldestTime = t;
                }
              });

              // Batch render for performance
              batchRenderMessages(msgs, {
                prepend: true,
                maintainScroll: true,
              });

              const newScrollHeight = messagesDiv.scrollHeight;
              const addedHeight = newScrollHeight - prevScrollHeight;
              messagesDiv.scrollTop = prevScrollTop + addedHeight;

              console.log(
                "[messages] loaded older page, count =",
                msgs.length,
                "oldestTime now =",
                oldestTime
              );

              if (msgs.length < PAGE_SIZE) {
                allHistoryLoaded = true;
              }

              isLoadingOlder = false;
            },
            (error) => {
              console.error("[messages] error loading older:", error);
              isLoadingOlder = false;
            }
          );
      }

      async function startMessagesListener() {
        console.log("[messages] startMessagesListener called");
        stopMessagesListener();
        seenMessageKeys.clear();
        messagesDiv.innerHTML = "";

        oldestTime = null;
        newestTime = null;
        allHistoryLoaded = false;
        isLoadingOlder = false;

        // Load blocked users cache first
        await loadBlockedUsersCache();

        try {
          const baseRef = db.ref("messages").orderByChild("time");
          const initialQuery = baseRef.limitToLast(PAGE_SIZE);

          initialQuery.once(
            "value",
            (snap) => {
              const msgs = [];
              snap.forEach((child) => {
                msgs.push({ key: child.key, msg: child.val() || {} });
              });

              const count = msgs.length;
              console.log("[messages] initial load snapshot, count =", count);

              // Calculate time range
              msgs.forEach(({ key, msg }) => {
                const t = msg.time || 0;
                if (oldestTime === null || t < oldestTime) {
                  oldestTime = t;
                }
                if (newestTime === null || t > newestTime) {
                  newestTime = t;
                }
              });

              // Render messages after yielding to the browser so the loading spinner can animate smoothly
              setTimeout(() => {
                // Batch render all messages at once
                batchRenderMessages(msgs, { maintainScroll: true });

                // After initial render, jump to bottom (wait for images to load)
                const scrollToBottom = () => {
                  messagesDiv.scrollTop = messagesDiv.scrollHeight;
                  console.log("[scroll] scrolled to bottom, scrollHeight:", messagesDiv.scrollHeight);
                };

                // Try multiple times to ensure we catch all image loads. Use much shorter delays in fast mode.
                const scrollDelays = (typeof FAST_MODE_ENABLED !== 'undefined' && FAST_MODE_ENABLED) ? [50, 150, 400] : [300, 800, 1500];
                scrollDelays.forEach(d => setTimeout(scrollToBottom, d));

                // Hide loading screen after messages are loaded — keep it visible slightly longer for a smooth transition.
                const extraDelay = (typeof FAST_MODE_ENABLED !== 'undefined' && FAST_MODE_ENABLED) ? 50 : 1500;
                setTimeout(() => { if (loadingScreen) loadingScreen.classList.add("hidden"); }, extraDelay);

                if (count < PAGE_SIZE) {
                  allHistoryLoaded = true;
                }

                // Attach scroll listener only after we have some messages
                attachScrollListener();

                // Ensure scroll-to-bottom control is available
                ensureScrollButtonListeners();
              }, 20);

              // --- REALTIME LISTENER FOR NEW MESSAGES ---
              if (messagesRef && messagesListener) {
                messagesRef.off("child_added", messagesListener);
              }

              if (newestTime !== null) {
                messagesRef = baseRef.startAt(newestTime + 1);
              } else {
                messagesRef = baseRef;
              }

              messagesListener = (snap) => {
                const msg = snap.val() || {};
                const key = snap.key;
                const t = msg.time || 0;

                if (newestTime === null || t > newestTime) {
                  newestTime = t;
                }

                // Notify if a friend posts in global chat
                const chatHidden = chatInterface.classList.contains("hidden");
                const dmOpen = dmModal.classList.contains("modal-open");
                const pageHidden = document.hidden;
                const shouldNotifyFriendGlobal = chatHidden || dmOpen || pageHidden;
                if (
                  msg.userId &&
                  friendsCache.has(msg.userId) &&
                  msg.userId !== currentUserId &&
                  shouldNotifyFriendGlobal
                ) {
                  addNotification(
                    "Friend in Global Chat",
                    `${msg.user || "Friend"}: ${previewText(msg.text || "(no text)", 80)}`,
                    { threadId: null }
                  );
                }
                renderMessageOnce(key, msg);
              };

              messagesRef.on(
                "child_added",
                messagesListener,
                (error) => {
                  console.error("[messages] listener error:", error);
                }
              );

              // Listen for deletions to remove messages live
              if (messagesRemoveRef && messagesRemoveListener) {
                messagesRemoveRef.off("child_removed", messagesRemoveListener);
              }
              messagesRemoveRef = db.ref("messages");
              messagesRemoveListener = (snap) => {
                const removedId = snap.key;
                removeMessageById(removedId);
              };
              messagesRemoveRef.on(
                "child_removed",
                messagesRemoveListener,
                (error) => console.error("[messages] remove listener error:", error)
              );

              // Listen for message edits (e.g., moderation replaces text with ****)
              if (messagesRemoveRef && messagesRemoveRef._childChangedListener) {
                messagesRemoveRef.off("child_changed", messagesRemoveRef._childChangedListener);
              }
              messagesRemoveRef._childChangedListener = (snap) => {
                const changedId = snap.key;
                const changedMsg = snap.val() || {};
                // Find the message row in the DOM and update its text
                const row = messagesDiv.querySelector(`[data-message-id="${changedId}"]`);
                if (row) {
                  // Find the message bubble and update the text
                  const bubble = row.querySelector(".message-bubble-anim .message-text-reveal");
                  if (bubble && changedMsg.text !== undefined) {
                    bubble.textContent = changedMsg.text;
                  }
                }
              };
              messagesRemoveRef.on(
                "child_changed",
                messagesRemoveRef._childChangedListener,
                (error) => console.error("[messages] child_changed listener error:", error)
              );
            },
            (error) => {
              console.error("[messages] error during initial load:", error);
              loadingScreen.classList.add("hidden");
            }
          );
        } catch (err) {
          console.error("[messages] startMessagesListener crashed:", err);
          loadingScreen.classList.add("hidden");
        }
      }

      function stopMessagesListener() {
        console.log("[messages] stopMessagesListener called");
        try {
          if (messagesRef && messagesListener) {
            messagesRef.off("child_added", messagesListener);
          }
          if (messagesRemoveRef && messagesRemoveListener) {
            messagesRemoveRef.off("child_removed", messagesRemoveListener);
          }
        } catch (err) {
          console.error("[messages] error while stopping listener:", err);
        }
        messagesRef = null;
        messagesListener = null;
        messagesRemoveRef = null;
        messagesRemoveListener = null;
        seenMessageKeys.clear();

        detachScrollListener();

        oldestTime = null;
        newestTime = null;
        allHistoryLoaded = false;
        isLoadingOlder = false;
      }

      // --- TYPING STATUS HELPERS ---
      function setTyping(isTyping) {
        if (!currentUserId) {
          console.debug("[typing] setTyping called but no userId");
          return;
        }
        const ref = db.ref("typingStatus/" + currentUserId);
        const name = currentUsername || "User";
        console.log("[typing] setting typing status:", isTyping, "for", currentUserId);
        return ref.set({
          username: name,
          typing: isTyping,
          ts: firebase.database.ServerValue.TIMESTAMP,
        }).catch((err) => {
          // Detailed logging for typing status errors
          if (err.message?.includes("permission_denied")) {
            console.warn("[typing] permission denied on /typingStatus/" + currentUserId + " - this is OK, typing indicators may not work");
          } else {
            logDetailedError("setTyping", err, { userId: currentUserId, isTyping });
          }
        });
      }

      function handleTypingSnapshot(snap) {
        const data = snap.val() || {};
        const typingUsers = [];

        for (const uid in data) {
          if (!Object.prototype.hasOwnProperty.call(data, uid)) continue;
          if (uid === currentUserId) continue; // don't show yourself

          const entry = data[uid];
          if (entry && entry.typing) {
            const name = entry.username || "Someone";
            typingUsers.push(name);
          }
        }

        let text = "";
        if (typingUsers.length === 1) {
          text = typingUsers[0] + " is typing…";
        } else if (typingUsers.length === 2) {
          text = typingUsers[0] + " and " + typingUsers[1] + " are typing…";
        } else if (typingUsers.length === 3) {
          text = typingUsers[0] + ", " + typingUsers[1] + ", and " + typingUsers[2] + " are typing…";
        } else if (typingUsers.length > 3) {
          text = "Several people are typing…";
        }

        lastTypingText = text;
        updateStatusBar();
      }

      function startTypingListener() {
        if (typingListenerAttached) return;
        console.log("[typing] attaching typingStatus listener");
        
        db.ref("typingStatus").on(
          "value",
          handleTypingSnapshot,
          (err) => {
            console.error("[typing] listener error:", err);
          }
        );
        typingListenerAttached = true;

        // Clean up stale typing status every 5 seconds
        if (!typingCleanupInterval) {
          typingCleanupInterval = setInterval(() => {
            const now = Date.now();
            db.ref("typingStatus").once("value", (snap) => {
              const data = snap.val() || {};
              const updates = {};
              
              for (const uid in data) {
                if (!Object.prototype.hasOwnProperty.call(data, uid)) continue;
                const entry = data[uid];
                // Remove if older than 10 seconds
                if (entry && entry.ts && (now - entry.ts) > 10000) {
                  updates[uid] = null;
                }
              }
              
              if (Object.keys(updates).length > 0) {
                db.ref("typingStatus").update(updates).catch(err => {
                  // Silently ignore permission errors during cleanup
                  if (!err.message?.includes("PERMISSION_DENIED")) {
                    console.warn("[typing] cleanup error:", err);
                  }
                });
              }
            });
          }, TYPING_CLEANUP_INTERVAL);
        }
      }

      function stopTypingListener() {
        if (!typingListenerAttached) return;
        console.log("[typing] detaching typingStatus listener");
        db.ref("typingStatus").off("value", handleTypingSnapshot);
        typingListenerAttached = false;
        lastTypingText = "";
        updateStatusBar();

        // Clear cleanup interval
        if (typingCleanupInterval) {
          clearInterval(typingCleanupInterval);
          typingCleanupInterval = null;
        }
      }

      // Typing on input with throttling
      let lastTypingUpdate = 0;
      const TYPING_THROTTLE = 1000; // Only update once per second
      
      msgInput.addEventListener("input", () => {
        if (!currentUserId) return;

        const now = Date.now();
        // Throttle typing updates to reduce database writes
        if (now - lastTypingUpdate > TYPING_THROTTLE) {
          setTyping(true);
          lastTypingUpdate = now;
        }

        // Auto stop after 1.5s of no input
        if (typingTimeoutId) {
          clearTimeout(typingTimeoutId);
        }
        typingTimeoutId = setTimeout(() => {
          setTyping(false);
        }, 1500);
        
        // Handle @mention autocomplete
        handleMentionInput();
      });

      // Keyboard navigation for mentions and other shortcuts
      msgInput.addEventListener("keydown", (e) => {
        // Handle mention autocomplete navigation
        if (mentionAutocomplete && mentionAutocomplete.style.display !== "none") {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            updateMentionSelection(1);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            updateMentionSelection(-1);
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            if (confirmMentionSelection()) {
              e.preventDefault();
              return;
            }
          }
          if (e.key === "Escape") {
            e.preventDefault();
            hideMentionAutocomplete();
            return;
          }
        }
        
        // Escape to cancel reply
        if (e.key === "Escape" && pendingReply) {
          e.preventDefault();
          clearReply();
        }
      });

      // Hide mention autocomplete when clicking outside
      document.addEventListener("click", (e) => {
        if (mentionAutocomplete && !mentionAutocomplete.contains(e.target) && e.target !== msgInput) {
          hideMentionAutocomplete();
        }
      });

      // Auto-handle already logged-in users on page load
      auth.onAuthStateChanged(async (user) => {
        console.log(
          "[auth] onAuthStateChanged user =",
          user ? user.uid : null
        );

        if (user) {
          try {
            // Check FINGERPRINT ban FIRST (before even checking user ban)
            const fpCheck = await checkFingerprintBan();
            if (fpCheck.banned) {
              console.log("[auth] device fingerprint is banned:", fpCheck.reason);
              const banPopup = document.getElementById("banPopup");
              const banReason = document.getElementById("banReason");
              if (banPopup && banReason) {
                banReason.textContent = "Device banned: " + (fpCheck.reason || "Ban evasion detected");
                banPopup.classList.remove("hidden");
              }
              setTimeout(() => auth.signOut(), 3000);
              return;
            }
            
            // Check if user is banned IMMEDIATELY
            const banSnap = await db.ref("bannedUsers/" + user.uid).once("value");
            if (banSnap.exists()) {
              const banData = banSnap.val();
              const now = Date.now();
              
              console.log("[auth] user has ban entry:", banData);
              
              // Check if it's a temporary ban that has expired
              if (banData.until && banData.until <= now) {
                // Temporary ban has expired, remove ban entry and allow login
                clearExpiredBan(user.uid, banData);
                console.log("[auth] temporary ban has expired, allowing login");
              } else {
                // Either permanent ban or active temporary ban
                console.log("[auth] user is banned, showing popup and signing out");

                // Reuse existing ban popup UI instead of alert
                const banPopup = document.getElementById("banPopup");
                const banReason = document.getElementById("banReason");
                if (banPopup && banReason) {
                  banReason.textContent = "Reason: " + (banData.reason || "Permanent ban");
                  banPopup.classList.remove("hidden");
                }

                setTimeout(() => {
                  auth.signOut();
                }, 3000);
                return;
              }
            }

            currentUserId = user.uid;
            
            // Setup presence tracking
            setupPresence(user.uid);
            
            // Store fingerprint in user record (respects device consent)
            if (FINGERPRINT_ENABLED) {
              storeFingerprint(user.uid);
            }
            
            // Load cleared notifications from localStorage
            loadClearedNotifications();
            
            // Check and show Community Guidelines if not accepted yet
            checkAndShowGuidelines(user.uid);

            // Get username from DB (ONE PLACE)
            currentUsername = await fetchUsername(
              user.uid,
              user.email || null
            );
            
            if (!currentUsername) {
              throw new Error("Could not get username");
            }
            
            updateChatUserLabel(currentUsername);

            // Auto-ensure paths exist
            try {
              await ensureUsernamePath(user.uid, currentUsername);
              await ensureUserProfilePath(user.uid);
              await ensureFriendRequestsPaths(user.uid);
              await ensureFriendsList(user.uid);
            } catch (e) {
              console.warn("[auth] could not ensure paths:", e);
              // Continue anyway
            }

            if (loginForm) loginForm.classList.add("hidden");
            if (registerForm) registerForm.classList.add("hidden");
            if (chatInterface) chatInterface.classList.remove("hidden");
            
            // Ensure messages container is always visible
            if (messagesDiv) {
              messagesDiv.style.display = '';
            }
            
            // Only show loading screen if messages container is empty
            if (loadingScreen && (!messagesDiv || messagesDiv.children.length === 0)) {
              loadingScreen.classList.remove("hidden");
            }
            
            // Show notification bell when logged in
            if (notifBellBtn) notifBellBtn.classList.remove("hidden");
            
            // Request notification permission
            if ("Notification" in window && Notification.permission === "default") {
              Notification.requestPermission();
            }

            console.log("[auth] starting messages listener from auth state change");
            startMessagesListener();
            startTypingListener();
            await loadFriendsCache();
            
            // Load users for @mention autocomplete
            loadUsersForMentions();
            // Load which mentions we've already notified for (so refresh doesn't re-show)
            loadMentionedNotifsFromStorage();

            // Moderation hooks
            checkAdmin();
            watchBanStatus(user.uid);
            watchMuteStatus(user.uid);
            watchWarnings(user.uid);
            setupWarnModal();
            setupMuteModal();
            setupBanModal();
            setupModPanel();
            
            // Start DM inbox listener for notifications
            await loadDmInbox();
            
            // Setup page navigation listeners (Global Chat <-> DMs)
            setupPageNavListeners();
            
            // Wait a moment for initial notifications to load, then verify
            setTimeout(() => {
              verifyNotificationsLoaded();
            }, 500);

            // Load user settings (theme, message size) from Firebase
            const settings = await loadUserSettings();
            setActiveThemeButton(settings.theme);
            applyTheme(settings.theme, false);
            setActiveSizeButton(settings.messageSize);
            applyMessageSize(settings.messageSize, false);
            if (fastModeToggle) fastModeToggle.checked = settings.fastMode === true;
            applyFastMode(settings.fastMode === true, false);
            initRatingSettings(settings);
            
            // ========== SEQUENCED ONBOARDING FLOW ==========
            // Order: Guidelines -> Walkthrough -> Mod App Popup -> Canvas Consent
            // Each waits for the previous to complete before showing
            
            (async () => {
              // 1. Wait for guidelines acceptance (if needed)
              await checkAndShowGuidelines(user.uid);
              
              // 2. Small delay after guidelines, then start walkthrough
              await new Promise(r => setTimeout(r, 800));
              
              // 3. Start walkthrough and wait for it to complete
              await new Promise(resolve => {
                startWalkthrough();
                // Wait for walkthrough to complete or be skipped
                // Check every 500ms if walkthrough is done
                const checkDone = setInterval(() => {
                  const overlay = document.getElementById('walkthroughOverlay');
                  if (!overlay || overlay.classList.contains('hidden') || !walkthroughActive) {
                    clearInterval(checkDone);
                    resolve();
                  }
                }, 500);
                // Safety timeout after 60 seconds
                setTimeout(() => { clearInterval(checkDone); resolve(); }, 60000);
              });
              
              // 4. Small delay, then mod app popup (if eligible)
              await new Promise(r => setTimeout(r, 500));
              checkAndShowModAppPopup();
              
              // 5. Small delay, then canvas consent (if needed)
              await new Promise(r => setTimeout(r, 1000));
              if (FINGERPRINT_ENABLED) {
                const consentStatus = await checkCanvasConsentFromFirebase(user.uid);
                console.log('[fingerprint] canvas consent check:', consentStatus);
                
                if (consentStatus === true) {
                  // User granted consent - regenerate with canvas and store
                  canvasConsentCache = true;
                  cachedFingerprint = null;
                  await storeFingerprint(user.uid);
                } else if (consentStatus === 'declined') {
                  // User previously declined - don't prompt again
                  console.log('[fingerprint] user previously declined, not showing modal');
                  canvasConsentCache = false;
                } else {
                  // No consent recorded yet - show modal
                  console.log('[fingerprint] showing canvas consent modal');
                  canvasConsentCache = false;
                  showCanvasConsentModal();
                }
              }
            })();

            // Ensure AI edit button visibility updates now that auth.user is available
            try { updateAiEditButtonVisibility(); } catch (e) { /* ignore */ }
          } catch (err) {
            console.error("[auth] error in onAuthStateChanged:", err);
            // Show error and sign out
            try {
              await auth.signOut();
            } catch (e) {
              console.warn("[auth] error signing out:", e);
            }
            showToast("Error loading profile. Please log in again.", "error");
          }
        } else {
          console.log(
            "[auth] user is null, stopping listeners and showing login"
          );

          stopMessagesListener();
          stopTypingListener();
          stopRatingPromptLoop();

          ratingOptOut = false;
          ratingLastPrompt = 0;
          ratingPendingStars = null;
          closeRatingModal(false);

          currentUserId = null;
          currentUsername = null;
          messagesDiv.innerHTML = "";
          friendsCache.clear();
          clearedNotificationThreads.clear();
          dmLastSeenByThread = {};
          dmInboxInitialLoaded = false;
          detachModerationListeners();
          clearNotifications();
          activeDMThread = null;
          activeDMTarget = null;
          clearDmMessages();
          dmConversationList.innerHTML = "";
          detachDmMessagesListener();
          detachDmInboxListener();
          dmModal.classList.add("modal-closed");
          dmModal.classList.remove("modal-open");
          try { updateAiEditButtonVisibility(); } catch (e) { /* ignore */ }
          
          // Hide DM page on logout
          const dmPage = document.getElementById('dmPage');
          if (dmPage) dmPage.classList.add('hidden');
          currentPage = 'global';

          if (chatInterface) chatInterface.classList.add("hidden");
          if (loginForm) loginForm.classList.remove("hidden");
          // Hide loading screen if not logged in
          if (loadingScreen) loadingScreen.classList.add("hidden");
          
          // Hide notification bell when not logged in
          if (notifBellBtn) notifBellBtn.classList.add("hidden");
          
          updateChatUserLabel("");
        }
      });

      // Logout
      logoutBtn.onclick = async () => {
        console.log("[logout] clicked");
        logoutBtn.disabled = true;
        logoutBtn.textContent = "Logging out...";

        try {
          // Set presence to offline immediately
          try {
            if (currentUserId && presenceRef) {
              await presenceRef.set({
                state: 'offline',
                lastChanged: firebase.database.ServerValue.TIMESTAMP
              });
              console.log("[logout] set presence to offline");
            }
          } catch (e) {
            console.warn("[logout] could not set presence offline:", e);
          }
          
          // Try to clear typing status before leaving
          try {
            if (currentUserId) {
              await db.ref("typingStatus/" + currentUserId).remove();
              console.log("[logout] cleared typing status");
            }
          } catch (e) {
            console.warn("[logout] could not clear typing status:", e);
          }

          // Stop listeners
          stopMessagesListener();
          stopTypingListener();

          // Sign out
          await auth.signOut();
          console.log("[logout] signOut complete");

          // Clear UI
          msgInput.value = "";
          loginPasswordInput.value = "";
          clearLoginMessages();
          loginUsernameInput.value = "";
        } catch (err) {
          console.error("[logout] error during logout:", err);
          showToast("Error logging out. Try refreshing.", "error");
        } finally {
          logoutBtn.disabled = false;
          logoutBtn.textContent = "Logout";
        }
      };

      // Send a message (shared logic) + local rate-limit + server rules
      async function sendMessage() {
        let text = msgInput.value.trim();
        if (text === "" && !pendingMediaUrl) return;

        const userObj = auth.currentUser;
        if (!userObj) {
          console.warn("[send] tried to send while not logged in");
          currentWarningText = "Not logged in. Please refresh and log in again.";
          updateStatusBar();
          msgInput.value = "";
          setTimeout(() => {
            currentWarningText = "";
            updateStatusBar();
          }, 3000);
          return;
        }
        
        if (!currentUsername) {
          console.warn("[send] no username set");
          currentWarningText = "Username not loaded. Please refresh.";
          updateStatusBar();
          setTimeout(() => {
            currentWarningText = "";
            updateStatusBar();
          }, 3000);
          return;
        }

        if (isMuted) {
          showToast("You are muted", "error");
          return;
        }

        // âœ… Local send cooldowns (match server rules: 0.5s text, 1s media)
        const now = Date.now();
        const isMedia = !!pendingMediaUrl;
        const cooldown = isMedia ? MEDIA_COOLDOWN_MS : TEXT_COOLDOWN_MS;
        if (now - lastSentTime < cooldown) {
          showRateLimitWarning();
          return;
        }
        lastSentTime = now;

        // Bad-word filter (client-side): replace detected words with stars
        if (text) {
          // Check for threats and violence first (these are serious)
          for (let pattern of THREAT_PATTERNS) {
            if (pattern.test(text)) {
              currentWarningText = " Message blocked: Threats or violence are not allowed.";
              updateStatusBar();
              setTimeout(() => {
                currentWarningText = "";
                updateStatusBar();
              }, 4000);
              msgInput.value = "";
              return;
            }
          }
          
          // Check for hate speech and harassment
          for (let pattern of HATE_PATTERNS) {
            if (pattern.test(text)) {
              currentWarningText = " Message blocked: Hateful or harassing language is not allowed.";
              updateStatusBar();
              setTimeout(() => {
                currentWarningText = "";
                updateStatusBar();
              }, 4000);
              msgInput.value = "";
              return;
            }
          }
          
          // Filter profanity and detect severe slurs
          text = filterBadWords(text);
          if (typeof text === 'string' && text.startsWith('[FILTERED')) {
            // Block send and show a warning
            currentWarningText = ' Message blocked: Hateful or harassing language is not allowed.';
            updateStatusBar();
            setTimeout(() => {
              currentWarningText = '';
              updateStatusBar();
            }, 4000);
            msgInput.value = '';
            return;
          }
        }

        const username = currentUsername;

        console.log("[send] sending message", {
          username,
          text,
          hasMedia: !!pendingMediaUrl,
          userId: userObj.uid,
        });

        const uid = userObj.uid;

        // Add visual feedback to send button
        const originalBtnText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<span class="animate-pulse">✓</span>';
        sendBtn.disabled = true;

        // Build message object
        const messageData = {
          user: username,
          userId: uid,
          text: text,
          time: firebase.database.ServerValue.TIMESTAMP,
        };

        // Add reply data if replying
        if (pendingReply) {
          messageData.replyTo = {
            messageId: pendingReply.messageId,
            username: pendingReply.username,
            text: pendingReply.text,
          };
        }

        // Add media if present
        if (pendingMediaUrl) {
          messageData.media = pendingMediaUrl;
          messageData.deleteToken = pendingMediaToken;
        }

        // Push the message + update rate-limit timestamps atomically
        const newMsgKey = db.ref("messages").push().key;
        const updates = {};
        updates["messages/" + newMsgKey] = messageData;
        updates["userLastMessageTime/" + uid] = firebase.database.ServerValue.TIMESTAMP;
        if (messageData.media) {
          updates["userLastMediaTime/" + uid] = firebase.database.ServerValue.TIMESTAMP;
        }

        // Detect AI query but do NOT wait for AI reply before sending the user's message.
        // Supports both /ai command, @AI mention, and replying to AI's message
        const aiPrefix = '/ai ';
        let aiQuery = null;
        if (text && text.toLowerCase().startsWith(aiPrefix) && text.length > aiPrefix.length) {
          aiQuery = text.slice(aiPrefix.length).trim();
        } else if (text && /@ai\b/i.test(text)) {
          // Extract query after @AI mention
          aiQuery = text.replace(/@ai\b/i, '').trim();
        } else if (pendingReply && pendingReply.username === 'Chatra AI' && text) {
          // Replying to AI's message triggers AI response
          aiQuery = text.trim();
        }

        db.ref()
          .update(updates)
          .then(async () => {
            // Only clear input when message + timestamp both succeed
            msgInput.value = "";

            // Clear media preview
            if (pendingMediaUrl) {
              pendingMediaUrl = null;
              pendingMediaToken = null;
              mediaPreview.classList.add("hidden");
              mediaPreviewContent.innerHTML = "";
            }

            // Clear reply
            clearReply();

            // Stop typing once message is sent
            setTyping(false);

            // Reset button after 300ms
            setTimeout(() => {
              sendBtn.innerHTML = originalBtnText;
              sendBtn.disabled = false;
            }, 300);
          })
          .catch((error) => {
            console.error("[send] error sending message:", error);

            let errorMsg = "Failed to send message";
            if (error.code === "PERMISSION_DENIED") {
              errorMsg = "Message blocked (rate limit or permissions)";
              showRateLimitWarning();
            } else if (error.message?.includes("permission")) {
              errorMsg = "Permission denied. Check Firebase rules.";
            } else if (error.message?.includes("network")) {
              errorMsg = "Network error. Check your connection.";
            }

            currentWarningText = errorMsg;
            updateStatusBar();

            // Reset button on error
            setTimeout(() => {
              sendBtn.innerHTML = originalBtnText;
              sendBtn.disabled = false;
              currentWarningText = "";
              updateStatusBar();
            }, 3000);
          });

        // If this was an AI query, fetch the AI reply asynchronously and push it as a separate message
        if (aiQuery) {
          (async () => {
            let botReply = null;
            // Add user message to memory
            addToAiMemory(uid, 'user', aiQuery, currentUsername);
            const conversationHistory = getAiMemory(uid);
            const talkingToUsername = getAiUsername(uid) || currentUsername || 'User';
            
            try {
              const aiWorkerUrl = 'https://recovery-modmojheh.modmojheh.workers.dev';
              if (aiWorkerUrl && !aiWorkerUrl.includes('your-worker-subdomain')) {
                const r = await fetch(aiWorkerUrl + '/ai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: aiQuery, history: conversationHistory, username: talkingToUsername })
                });
                if (r.ok) {
                  const jr = await r.json();
                  if (jr && jr.reply) botReply = String(jr.reply).trim();
                } else {
                  console.warn('[AI] worker /ai returned', r.status);
                }
              }
            } catch (e) {
              console.warn('[AI] worker call failed, falling back to local AI mock', e);
            }
            if (!botReply) botReply = generateAiReply(aiQuery);
            
            // Collapse excessive newlines (max 2 consecutive)
            botReply = botReply.replace(/\n{3,}/g, '\n\n').trim();
            
            // Remove @everyone from AI responses (security)
            botReply = botReply.replace(/@everyone/gi, '@​everyone'); // Zero-width space breaks the mention
            
            // Add AI reply to memory
            addToAiMemory(uid, 'assistant', botReply, currentUsername);

            try {
              const botMessage = {
                user: 'Chatra AI',
                userId: AI_BOT_UID,
                text: botReply,
                time: firebase.database.ServerValue.TIMESTAMP
              };
              if (aiProfile.avatar) botMessage.avatar = aiProfile.avatar;
              await db.ref('messages').push(botMessage);
            } catch (e) {
              console.error('[AI] failed to post bot message', e);
            }
          })();
        }
      }

      // Form submit = send message (works with Enter / Return everywhere)
      messageForm.addEventListener("submit", (e) => {
        e.preventDefault();
        sendMessage();
      });

      // Media upload handlers
      const mediaUploadBtn = document.getElementById("mediaUploadBtn");
      const mediaInput = document.getElementById("imageInput");
      const imageInput = mediaInput;

      // Convert file to base64 for moderation check
      async function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // Delete file from ImageKit
      async function deleteFromImageKit(fileId) {
        try {
          if (!fileId) {
            console.warn("[imagekit] no fileId provided for deletion");
            return false;
          }

          console.log("[imagekit] deleting file:", fileId);

          const uploadWorkerUrl = "https://chatra.modmojheh.workers.dev";
          const response = await fetch(uploadWorkerUrl + "/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: fileId })
          });

          if (!response.ok) {
            const error = await response.json();
            console.error("[imagekit] delete failed:", error);
            return false;
          }

          console.log("[imagekit] deleted successfully:", fileId);
          return true;
        } catch (err) {
          console.error("[imagekit] delete error:", err.message);
          return false;
        }
      }

      // ImageKit upload with OpenAI Vision moderation
      async function uploadToImageKit(file) {
        // Cloudflare Worker URLs
        const imageWorkerUrl = "https://chatra.modmojheh.workers.dev";
        const uploadWorkerUrl = "https://chatra.modmojheh.workers.dev";

        if (!uploadWorkerUrl || uploadWorkerUrl.includes("your-worker-subdomain")) {
          const err = "Cloudflare Worker URL not configured. Update the uploadWorkerUrl in the code.";
          console.error("[upload] configuration error:", err);
          throw new Error(err);
        }

        console.log("[upload] starting upload for file:", {
          name: file.name,
          size: file.size,
          type: file.type,
        });

        // No moderation: directly proceed to upload (skip moderation step)
        const isVideo = file.type.startsWith("video/");
        if (isVideo) {
          console.log("[upload] video file detected — skipping moderation and uploading directly");
        } else {
          console.log("[upload] image file detected — moderation disabled, uploading directly");
        }

        // 2ï¸âƒ£ If safe, upload to ImageKit
        const formData = new FormData();
        formData.append("file", file);

        try {
          const startTime = Date.now();

          console.log("[upload] sending to ImageKit endpoint:", uploadWorkerUrl);
          const res = await fetch(uploadWorkerUrl + "/upload", {
            method: "POST",
            body: formData,
          });

          const duration = Date.now() - startTime;
          console.log("[upload] response received after", duration, "ms, status:", res.status);

          let data;
          try {
            data = await res.json();
          } catch (jsonErr) {
            console.error("[upload] failed to parse response as JSON:", jsonErr);
            const text = await res.text();
            console.error("[upload] response text:", text);
            throw new Error(`Invalid response from worker: ${res.status} ${text.substring(0, 100)}`);
          }

          if (!res.ok) {
            const errorMsg = data?.error || `HTTP ${res.status}`;
            console.error("[upload] worker returned error:", {
              status: res.status,
              error: errorMsg,
              data: data,
            });
            throw new Error(`Upload failed: ${errorMsg}`);
          }

          if (!data?.url) {
            console.error("[upload] success response missing URL:", data);
            throw new Error(data?.error || "Upload failed: no URL returned from worker");
          }

          console.log("[upload] upload success:", {
            url: data.url,
            fileId: data.fileId,
            duration: duration,
          });

          return { url: data.url, fileId: data.fileId };
        } catch (err) {
          const errorDetails = {
            message: err.message,
            name: err.name,
            stack: err.stack,
            file: file.name,
            fileSize: file.size,
            uploadWorkerUrl: uploadWorkerUrl,
          };

          console.error("[upload] failed with detailed error:", errorDetails);

          // Provide user-friendly error messages
          let userMessage = "Upload failed";
          if (err.message.includes("Failed to fetch")) {
            userMessage = "Cannot reach upload server. Check your internet connection or worker URL.";
          } else if (err.message.includes("not configured")) {
            userMessage = "Upload not configured. Contact support.";
          } else if (err.message.includes("Image rejected")) {
            userMessage = err.message;
          } else if (err.message.includes("HTTP 401")) {
            userMessage = "Upload authentication failed. Check ImageKit credentials.";
          } else if (err.message.includes("HTTP 403")) {
            userMessage = "Upload permission denied. Check ImageKit settings.";
          } else if (err.message.includes("HTTP 500")) {
            userMessage = "Server error. Please try again later.";
          } else if (err.message.includes("HTTP 413")) {
            userMessage = "File too large. Maximum size is 25MB.";
          } else {
            userMessage = err.message;
          }

          console.error("[upload] user-friendly message:", userMessage);
          throw new Error(userMessage);
        }
      }

      // Persist per-user upload cooldown timestamps
      function storeUploadTime() {
        const uid = firebase.auth().currentUser?.uid;
        if (!uid) return;
        firebase.database().ref("uploadTimes/" + uid).set(Date.now()).catch(() => {});
      }

      async function canUpload() {
        const uid = firebase.auth().currentUser?.uid;
        if (!uid) return false;
        const snap = await firebase.database().ref("uploadTimes/" + uid).get();
        if (!snap.exists()) return true;
        return Date.now() - snap.val() > 5000; // 5s cooldown
      }

      // Basic image compression helper
      async function compressImage(file, quality = 0.7) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          const reader = new FileReader();

          reader.onload = () => {
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    reject(new Error("Compression failed"));
                    return;
                  }
                  const compressed = new File([blob], file.name || "upload.jpg", {
                    type: blob.type || "image/jpeg",
                    lastModified: Date.now(),
                  });
                  resolve(compressed);
                },
                "image/jpeg",
                quality
              );
            };
            img.onerror = () => reject(new Error("Could not load image for compression"));
            img.src = reader.result;
          };

          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      }

      async function prepareFileForUpload(file) {
        const type = (file?.type || "").toLowerCase();

        if (type.includes("gif")) {
          console.log("[upload] GIF detected — skipping compression.");
          return file;
        }

        if (type.includes("video")) {
          console.log("[upload] video detected — skipping compression.");
          return file;
        }

        console.log("[upload] compressing image...");
        return await compressImage(file, 0.7);
      }

      // Return video duration in seconds for a File object (Safari-safe)
      function getVideoDuration(file) {
        return new Promise((resolve) => {
          if (!file || !file.type?.startsWith('video')) {
            return resolve(0);
          }

          const url = URL.createObjectURL(file);
          const video = document.createElement('video');
          let done = false;

          const cleanup = () => {
            if (done) return;
            done = true;
            try { URL.revokeObjectURL(url); } catch (e) {}
            video.remove();
          };

          video.preload = 'metadata';
          video.src = url;
          video.muted = true; // helps Safari load metadata
          document.body.appendChild(video); // necessary for some browsers

          video.onloadedmetadata = () => {
            const duration = isFinite(video.duration) ? video.duration : 0;
            cleanup();
            resolve(duration);
          };

          video.onerror = () => {
            cleanup();
            resolve(0);
          };

          // Fallback in case events never fire
          setTimeout(() => {
            cleanup();
            resolve(0);
          }, 5000);
        });
      }

      async function sendImageMessage(file) {
        const userObj = auth.currentUser;
        if (!userObj || !currentUsername) return;
        if (!(await canUpload())) {
          showToast("Slow down! Wait a few seconds", "error");
          return;
        }

        const processed = await prepareFileForUpload(file);
        const uploadResult = await uploadToImageKit(processed);
        const { url, fileId } = uploadResult || {};
        if (!url) {
          console.error('[sendImageMessage] upload failed, no URL returned');
          return;
        }
        storeUploadTime();

        const messageData = {
          user: currentUsername,
          userId: userObj.uid,
          media: url,
          time: firebase.database.ServerValue.TIMESTAMP,
        };
        if (fileId) messageData.mediaFileId = fileId;

        return db.ref("messages").push(messageData);
      }

      mediaUploadBtn.addEventListener("click", () => {
        mediaInput.click();
      });

      // Global variables for pending media
      let pendingMediaUrl = null;
      let pendingMediaFileId = null;
      let pendingMediaToken = null;
      const mediaPreview = document.getElementById("mediaPreview");
      const mediaPreviewContent = document.getElementById("mediaPreviewContent");
      const cancelMediaBtn = document.getElementById("cancelMediaBtn");

      mediaInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const userObj = auth.currentUser;
        if (!userObj) {
          showToast("Please log in to send media", "error");
          return;
        }

        if (!(await canUpload())) {
          showToast("Slow down! Wait a few seconds", "error");
          mediaInput.value = "";
          return;
        }

        try {
          // Enforce universal video length limit (30 seconds)
          if (file.type && file.type.startsWith('video/')) {
            const dur = await getVideoDuration(file);
            if (dur > 30) {
              showToast('Video too long. Max 30 seconds', 'error');
              mediaInput.value = '';
              return;
            }
          }
          // Show uploading state
          mediaUploadBtn.disabled = true;
          mediaUploadBtn.innerHTML = '<svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/></svg>';

          const processedFile = await prepareFileForUpload(file);
          
          // Update status for moderation check (images only)
          const isVideoFile = file.type.startsWith("video/");
          if (!isVideoFile) {
            mediaUploadBtn.innerHTML = '<div class="flex items-center gap-2"><svg class="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1" stroke-linecap="round"/></svg><span class="text-sm font-medium">Checking for harmful content...</span></div>';
          }
          
          const uploadResult = await uploadToImageKit(processedFile);
          storeUploadTime();

          pendingMediaUrl = uploadResult.url;
          pendingMediaFileId = uploadResult.fileId;
          pendingMediaToken = null;

          // Show preview
          mediaPreviewContent.innerHTML = "";
          const isVideo = file.type.includes('video');
          
          if (isVideo) {
            const video = document.createElement("video");
            video.src = pendingMediaUrl;
            video.controls = true;
            video.className = "max-h-20 rounded-lg";
            mediaPreviewContent.appendChild(video);
          } else {
            const img = document.createElement("img");
            img.src = pendingMediaUrl;
            img.className = "max-h-20 rounded-lg";
            mediaPreviewContent.appendChild(img);
          }

          mediaPreview.classList.remove("hidden");
          msgInput.focus();

          console.log("[media] uploaded, ready to send:", pendingMediaUrl);

          // Reset button
          mediaUploadBtn.disabled = false;
          mediaUploadBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
          
          // Clear input
          mediaInput.value = "";
        } catch (err) {
          console.error("[media] error uploading:", err);
          showToast("Error uploading media", "error");
          
          // Reset button
          mediaUploadBtn.disabled = false;
          mediaUploadBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
          mediaInput.value = "";
        }
      });

      // Cancel media button
      cancelMediaBtn.addEventListener("click", async () => {
        // Delete the uploaded file from ImageKit
        if (pendingMediaFileId) {
          try {
            console.log("[media] deleting uploaded file from ImageKit");
            await deleteFromImageKit(pendingMediaFileId);
          } catch (err) {
            console.error("[media] error deleting from ImageKit:", err);
          }
        }
        
        // Delete from Cloudinary if it exists (legacy uploads only)
        if (pendingMediaToken) {
          try {
            console.log("[media] deleting uploaded file from Cloudinary");
            await deleteFromCloudinary(pendingMediaToken);
          } catch (err) {
            console.error("[media] error deleting from Cloudinary:", err);
          }
        }
        
        pendingMediaUrl = null;
        pendingMediaFileId = null;
        pendingMediaToken = null;
        mediaPreview.classList.add("hidden");
        mediaPreviewContent.innerHTML = "";
      });

      // ===== SETTINGS MENU & MODALS =====
      const menuToggle = document.getElementById("menuToggle");
      const settingsModal = document.getElementById("settingsModal");
      const profileModal = document.getElementById("profileModal");
      const viewProfileModal = document.getElementById("viewProfileModal");
      const settingsCloseBtn = document.getElementById("settingsCloseBtn");
      const profileCloseBtn = document.getElementById("profileCloseBtn");
      const saveProfileBtn = document.getElementById("saveProfileBtn");
      const uploadPicBtn = document.getElementById("uploadPicBtn");
      const viewProfileCloseBtn = document.getElementById("viewProfileCloseBtn");
      const viewProfileCloseBtn2 = document.getElementById("viewProfileCloseBtn2");
      const viewProfilePic = document.getElementById("viewProfilePic");
      const viewProfileName = document.getElementById("viewProfileName");
      const viewProfileBio = document.getElementById("viewProfileBio");
      const profilePicInput = document.getElementById("profilePicInput");
      const profileBio = document.getElementById("profileBio");
      const profileUsername = document.getElementById("profileUsername");
      const profilePicPreview = document.getElementById("profilePicPreview");

      // Track live listeners for viewed profiles
      let activeProfileListeners = [];
      function clearProfileListeners() {
        activeProfileListeners.forEach(({ ref, cb }) => {
          try { ref.off("value", cb); } catch (_) {}
        });
        activeProfileListeners = [];
      }

      let currentUserData = {};

      // Side Panel Elements
      const sidePanel = document.getElementById("sidePanel");
      const sidePanelOverlay = document.getElementById("sidePanelOverlay");
      const sidePanelClose = document.getElementById("sidePanelClose");
      const sidePanelUsername = document.getElementById("sidePanelUsername");
      const sidePanelProfile = document.getElementById("sidePanelProfile");
      const sidePanelSettings = document.getElementById("sidePanelSettings");
      const sidePanelPrivacy = document.getElementById("sidePanelPrivacy");
      const sidePanelFriendRequests = document.getElementById("sidePanelFriendRequests");
      const sidePanelFriends = document.getElementById("sidePanelFriends");
      const sidePanelDMs = document.getElementById("sidePanelDMs");
      const sidePanelDMBadge = document.getElementById("sidePanelDMBadge");
      const sidePanelBlocked = document.getElementById("sidePanelBlocked");
      const sidePanelFriendBadge = document.getElementById("sidePanelFriendBadge");

      // DM Elements
      const dmModal = document.getElementById("dmModal");
      const dmCloseBtn = document.getElementById("dmCloseBtn");
      const dmUserSearch = document.getElementById("dmUserSearch");
      const dmStartBtn = document.getElementById("dmStartBtn");
      const dmConversationList = document.getElementById("dmConversationList");
      const dmMessages = document.getElementById("dmMessages");
      const dmForm = document.getElementById("dmForm");
      const dmInput = document.getElementById("dmInput");
      const dmSendBtn = document.getElementById("dmSendBtn");
      const dmMediaUploadBtn = document.getElementById("dmMediaUploadBtn");
      const dmMediaInput = document.getElementById("dmMediaInput");
      const dmActiveUser = document.getElementById("dmActiveUser");
      const dmError = document.getElementById("dmError");
      const dmBlockBtn = document.getElementById("dmBlockBtn");

      // Notifications
      const notifBellBtn = document.getElementById("notifBellBtn");
      const notifBellBadge = document.getElementById("notifBellBadge");
      const notifModal = document.getElementById("notifModal");
      const notifCloseBtn = document.getElementById("notifCloseBtn");
      const notifClearBtn = document.getElementById("notifClearBtn");
      const notifList = document.getElementById("notifList");
      
      // Share UI
      const shareBtn = document.getElementById('shareBtn');
      const shareModal = document.getElementById('shareModal');
      const shareCloseBtn = document.getElementById('shareCloseBtn');
      const shareLinkInput = document.getElementById('shareLinkInput');
      const shareCopyBtn = document.getElementById('shareCopyBtn');
      const shareDownloadBtn = document.getElementById('shareDownloadBtn');
      const shareQRCode = document.getElementById('shareQRCode');

      // Blocked Users Elements
      const blockedUsersModal = document.getElementById("blockedUsersModal");
      const blockedUsersCloseBtn = document.getElementById("blockedUsersCloseBtn");
      const blockedUsersList = document.getElementById("blockedUsersList");
      const noBlockedUsersMsg = document.getElementById("noBlockedUsersMsg");
      const blockUserBtn = document.getElementById("blockUserBtn");

      // User Search Elements
      const searchUsersInput = document.getElementById("searchUsersInput");
      const searchResults = document.getElementById("searchResults");

      // Privacy Settings Elements
      const privacySettingsModal = document.getElementById("privacySettingsModal");
      const privacySettingsCloseBtn = document.getElementById("privacySettingsCloseBtn");
      const allowFriendRequestsToggle = document.getElementById("allowFriendRequestsToggle");
      const dmPrivacySelect = document.getElementById("dmPrivacySelect");
      const savePrivacyBtn = document.getElementById("savePrivacyBtn");

      // Settings modal new controls
      const settingsRecoveryEmail = document.getElementById('settingsRecoveryEmail');
      const saveRecoveryBtn = document.getElementById('saveRecoveryBtn');
      const clearRecoveryBtn = document.getElementById('clearRecoveryBtn');
      const settingsRecoveryMsg = document.getElementById('settingsRecoveryMsg');
      const deleteMessagesToggle = document.getElementById('deleteMessagesToggle');
      const deleteAccountBtn = document.getElementById('deleteAccountBtn');
      const deleteAccountCancel = document.getElementById('deleteAccountCancel');
      const deleteAccountMsg = document.getElementById('deleteAccountMsg');

      // Open/Close Side Panel
      function openSidePanel() {
        sidePanel.style.transform = "translateX(0)";
        sidePanelOverlay.classList.remove("hidden");
        if (currentUsername) {
          sidePanelUsername.textContent = currentUsername;
        }
      }

      function closeSidePanel() {
        sidePanel.style.transform = "translateX(-100%)";
        sidePanelOverlay.classList.add("hidden");
      }

      menuToggle.addEventListener("click", openSidePanel);
      sidePanelClose.addEventListener("click", closeSidePanel);
      sidePanelOverlay.addEventListener("click", closeSidePanel);

      // Patch Notes elements
      const sidePanelPatchNotes = document.getElementById("sidePanelPatchNotes");
      const patchNotesModal = document.getElementById("patchNotesModal");
      const patchNotesCloseBtn = document.getElementById("patchNotesCloseBtn");
      const patchNotesContent = document.getElementById("patchNotesContent");

      function openPatchNotes() {
        try {
          document.getElementById('patchNotesTitle').textContent = 'Patch Notes - v7.0';
          patchNotesContent.innerHTML = `
            <h4 class="font-semibold text-slate-200">Version 7.0 - January 2026</h4>
            <p class="text-xs text-slate-400">Released: January 2026</p>
            
            <h5 class="font-medium text-sky-400 mt-4 mb-2">New Features</h5>
            <ul class="list-disc pl-5 space-y-1">
                <li><strong>Group Chat</strong> - Create and join group chats with friends.</li>
                <li><strong>Group Search</strong> - Search groups in real-time as you type.</li>
                <li><strong>Online Counter</strong> - See how many users are currently online.</li>
                <li><strong>Online Status</strong> - Friends list shows who is online with green/gray dots.</li>
                <li><strong>@AI Mentions</strong> - Mention the AI with @AI anywhere in your message.</li>
                <li><strong>Unban All Button</strong> - Owner-only button to clear all bans at once.</li>
                <li><strong>Hardware Ban System</strong> - Admins can hardware ban users to prevent evasion.</li>
                <li><strong>Mod Panel Improvements</strong> - View usernames, extend bans, manage hardware bans.</li>
            </ul>
            
            <h5 class="font-medium text-emerald-400 mt-4 mb-2">Improvements</h5>
            <ul class="list-disc pl-5 space-y-1">
                <li><strong>Toast Notifications</strong> - All browser alerts replaced with styled in-app toasts.</li>
                <li><strong>DM Buttons</strong> - Delete, edit, and report buttons now match Global Chat style.</li>
                <li><strong>Group Settings Modal</strong> - Photo upload, name editing, member management.</li>
                <li><strong>Inline Confirmations</strong> - Leave/delete actions use inline buttons.</li>
                <li><strong>Safari Support</strong> - Fixed viewport issues with Safari.</li>
                <li><strong>Expired Bans Auto-Remove</strong> - Expired bans automatically removed.</li>
            </ul>
            
            <h5 class="font-medium text-rose-400 mt-4 mb-2">Bug Fixes</h5>
            <ul class="list-disc pl-5 space-y-1">
                <li>Fixed corrupted emoji characters throughout the app.</li>
                <li>Fixed bannedEmails permission denied error on login.</li>
                <li>Fixed mod panel not showing usernames for banned users.</li>
                <li>Fixed page switching bug where Global Chat and Groups showed together.</li>
            </ul>
            
            <h4 class="font-semibold text-slate-200 mt-6">Previous Updates</h4>
            <details class="text-xs text-slate-400 mt-2">
              <summary class="cursor-pointer hover:text-slate-300">v6.0 - Share and Mentions</summary>
              <ul class="list-disc pl-5 space-y-1 mt-2">
                <li>Added Share Button - Share Chatra with friends via link or QR code.</li>
                <li>Added @everyone (Admin) - Admins can mention everyone in global chat.</li>
                <li>Added Timestamps - Messages show time or date below each bubble.</li>
                <li>Slimmer message bubbles for a cleaner look.</li>
              </ul>
            </details>
            <details class="text-xs text-slate-400 mt-2">
              <summary class="cursor-pointer hover:text-slate-300">v5.5 - Walkthrough and Reports</summary>
              <ul class="list-disc pl-5 space-y-1 mt-2">
                <li>Added mentioning others when replying.</li>
                <li>Added an onboarding walkthrough for new users.</li>
                <li>Improved reporting system with inline report flow.</li>
                <li>Fixed touchscreen compatibility (iPad/Safari).</li>
              </ul>
            </details>`;
        } catch (e) {}
        try {
          // Primary: use modal classes
          patchNotesModal.classList.remove('modal-closed');
          patchNotesModal.classList.add('modal-open');
          // Fallback: ensure overlay is above other UI on problematic browsers
          patchNotesModal.style.zIndex = '99999';
          patchNotesModal.style.display = 'flex';
          console.debug('[patchNotes] opened');
        } catch (e) { console.warn('[patchNotes] open failed', e); }
        closeSidePanel();
      }

      function closePatchNotes() {
        try { patchNotesModal.classList.remove('modal-open'); patchNotesModal.classList.add('modal-closed'); } catch (e) {}
      }

      if (sidePanelPatchNotes) {
        sidePanelPatchNotes.addEventListener('click', () => openPatchNotes());
        sidePanelPatchNotes.addEventListener('touchend', (e) => { e.preventDefault(); openPatchNotes(); });
      }
      if (patchNotesCloseBtn) {
        patchNotesCloseBtn.addEventListener('click', closePatchNotes);
      }
      if (patchNotesModal) {
        patchNotesModal.addEventListener('click', (e) => { if (e.target === patchNotesModal) closePatchNotes(); });
      }

      // ===== SUGGESTIONS & HELP MODAL =====
      const sidePanelHelp = document.getElementById("sidePanelHelp");
      const helpModal = document.getElementById("helpModal");
      const helpCloseBtn = document.getElementById("helpCloseBtn");
      const helpForm = document.getElementById("helpForm");
      const helpType = document.getElementById("helpType");
      const helpTitle = document.getElementById("helpTitle");
      const helpDesc = document.getElementById("helpDesc");
      const helpUsername = document.getElementById("helpUsername");
      const helpEmail = document.getElementById("helpEmail");
      const helpEmailWrapper = document.getElementById("helpEmailWrapper");
      const helpTitleLabel = document.getElementById("helpTitleLabel");
      const helpDescLabel = document.getElementById("helpDescLabel");
      const helpSubmitBtn = document.getElementById("helpSubmitBtn");
      const helpStatus = document.getElementById("helpStatus");
      const appealFields = document.getElementById("appealFields");
      const appealReason = document.getElementById("appealReason");
      const helpTabs = document.querySelectorAll(".help-tab");

      const helpLabels = {
        suggestion: {
          titleLabel: "Suggestion Title",
          titlePlaceholder: "Brief title for your suggestion",
          descLabel: "Description",
          descPlaceholder: "Describe your suggestion in detail...",
          submitBtn: "Submit Suggestion"
        },
        bug: {
          titleLabel: "Bug Summary",
          titlePlaceholder: "What's the issue?",
          descLabel: "Steps to Reproduce",
          descPlaceholder: "1. Go to...\n2. Click on...\n3. See error...",
          submitBtn: "Report Bug"
        },
        idea: {
          titleLabel: "Idea Title",
          titlePlaceholder: "Name your idea",
          descLabel: "Describe Your Idea",
          descPlaceholder: "Share your creative idea for Chatra...",
          submitBtn: "Submit Idea"
        },
        appeal: {
          titleLabel: "Appeal Subject",
          titlePlaceholder: "Reason for appeal",
          descLabel: "What Happened",
          descPlaceholder: "Describe the situation that led to your ban...",
          submitBtn: "Submit Appeal"
        }
      };

      function openHelpModal() {
        if (helpModal) {
          helpModal.classList.remove('modal-closed');
          helpModal.classList.add('modal-open');
          helpModal.style.zIndex = '99999';
          helpModal.style.display = 'flex';
        }
        // Clear any previous status message
        if (helpStatus) {
          helpStatus.classList.add('hidden');
          helpStatus.textContent = '';
        }
        closeSidePanel();
      }

      // Open help modal and optionally switch to a specific tab (e.g., 'appeal')
      function openHelpModalFor(type) {
        if (type) switchHelpTab(type);
        openHelpModal();
        // If user is not signed in, inform them they must register/login to submit
        if (!currentUserId) {
          helpStatus.textContent = "You are not signed in — this will be submitted anonymously.";
          helpStatus.className = "text-center text-sm text-yellow-400";
          helpStatus.classList.remove('hidden');
          helpSubmitBtn.disabled = false;
        } else {
          helpStatus.classList.add('hidden');
          helpSubmitBtn.disabled = false;
        }
      }

      function closeHelpModal() {
        if (helpModal) {
          helpModal.classList.remove('modal-open');
          helpModal.classList.add('modal-closed');
        }
      }

      function switchHelpTab(type) {
        helpType.value = type;
        const labels = helpLabels[type];
        
        // Update labels and placeholders
        helpTitleLabel.textContent = labels.titleLabel;
        helpTitle.placeholder = labels.titlePlaceholder;
        helpDescLabel.textContent = labels.descLabel;
        helpDesc.placeholder = labels.descPlaceholder;
        helpSubmitBtn.textContent = labels.submitBtn;
        
        // Show/hide appeal-specific fields and email field
        if (type === 'appeal') {
          appealFields.classList.remove('hidden');
          if (helpEmailWrapper) helpEmailWrapper.classList.remove('hidden');
        } else {
          appealFields.classList.add('hidden');
          if (helpEmailWrapper) helpEmailWrapper.classList.add('hidden');
        }
        
        // Update tab styling
        helpTabs.forEach(tab => {
          if (tab.dataset.tab === type) {
            tab.classList.remove('bg-slate-700', 'text-slate-300', 'hover:bg-slate-600');
            tab.classList.add('bg-indigo-600', 'text-white', 'active');
          } else {
            tab.classList.remove('bg-indigo-600', 'text-white', 'active');
            tab.classList.add('bg-slate-700', 'text-slate-300', 'hover:bg-slate-600');
          }
        });
      }

      // Tab click handlers
      helpTabs.forEach(tab => {
        tab.addEventListener('click', () => switchHelpTab(tab.dataset.tab));
        tab.addEventListener('touchend', (e) => { e.preventDefault(); switchHelpTab(tab.dataset.tab); });
      });

      // Form submission
      if (helpForm) {
        helpForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const type = helpType.value;
          const title = helpTitle.value.trim();
          const desc = helpDesc.value.trim();
          const username = helpUsername ? helpUsername.value.trim() : '';
          const email = helpEmail ? helpEmail.value.trim() : '';
          
          // Validate required fields: title, desc, and username
          if (!title || !desc || !username) {
            helpStatus.textContent = "Please fill in all required fields (title, description, and username).";
            helpStatus.className = "text-center text-sm text-red-400";
            helpStatus.classList.remove('hidden');
            return;
          }
          
          helpSubmitBtn.disabled = true;
          helpSubmitBtn.textContent = "Submitting...";
          
          try {
            const submission = {
              type: type,
              title: title,
              description: desc,
              username: username,
              email: (type === 'appeal' && email) ? email : null,
              submittedBy: currentUserId || 'anonymous',
              submittedByUsername: currentUsername || 'anonymous',
              timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            
            // Add appeal-specific fields
            if (type === 'appeal') {
              submission.appealReason = appealReason ? appealReason.value.trim() : null;
            }
            
            // Support anonymous submissions via a client-generated id (stored in localStorage)
            // and atomically write submission + update appropriate last-submission timestamp (user or anon)
            const newKey = db.ref().child('helpSubmissions').push().key;
            const updates = {};

            // If user is not signed in, ensure a clientId exists in localStorage
            let clientId = null;
            if (!currentUserId) {
              try {
                clientId = localStorage.getItem('helpClientId');
                if (!clientId) {
                  clientId = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                  localStorage.setItem('helpClientId', clientId);
                }
                submission.clientId = clientId;
                submission.submittedBy = 'anonymous';
              } catch (err) {
                console.warn('[help] could not access localStorage for clientId', err);
              }
            }

            updates['/helpSubmissions/' + newKey] = submission;

            // First: write the submission itself using a discrete set() so we get clearer per-path permission
            try {
              await db.ref('/helpSubmissions/' + newKey).set(submission);
              console.debug('[help] submission write succeeded, key=', newKey);
            } catch (err) {
              console.error('[help] submission write failed:', err);
              throw err;
            }

            // Then: update per-user or per-anon timestamp separately (non-fatal)
            // Appeals use separate timestamp node (1 hour rate limit), others use general node (5 sec rate limit)
            try {
              if (currentUserId) {
                const tsPath = type === 'appeal' ? '/userHelpLastAppeal/' : '/userHelpLastSubmission/';
                await db.ref(tsPath + currentUserId).set(firebase.database.ServerValue.TIMESTAMP);
                console.debug('[help] user timestamp set for', currentUserId, 'path=', tsPath);
              } else if (clientId) {
                const tsPath = type === 'appeal' ? '/anonHelpLastAppeal/' : '/anonHelpLastSubmission/';
                await db.ref(tsPath + clientId).set(firebase.database.ServerValue.TIMESTAMP);
                console.debug('[help] anon timestamp set for', clientId, 'path=', tsPath);
              }
            } catch (err) {
              console.warn('[help] timestamp update failed (non-fatal):', err);
            }

            console.debug('[help] submission succeeded, key=', newKey, 'type=', type, 'clientId=', submission.clientId || null, 'uid=', currentUserId || null);

            // Friendly names for success message
            const typeNames = { suggestion: 'suggestion', bug: 'bug report', idea: 'idea', appeal: 'ban appeal' };
            const friendlyType = typeNames[type] || type;
            helpStatus.textContent = "✓ Thank you! Your " + friendlyType + " has been submitted.";
            helpStatus.className = "text-center text-sm text-green-400";
            helpStatus.classList.remove('hidden');

            // Reset form fields
            helpTitle.value = "";
            helpDesc.value = "";
            if (helpUsername) helpUsername.value = "";
            if (helpEmail) helpEmail.value = "";
            if (appealReason) appealReason.value = "";

            // Keep the modal open briefly so user sees confirmation, then close and clear status
            setTimeout(() => {
              try { helpStatus.classList.add('hidden'); helpStatus.textContent = ''; } catch(e){}
              try { closeHelpModal(); } catch (e) {}
              try { if (helpModal) { helpModal.style.display = 'none'; } } catch(e){}
            }, 3500);
            
          } catch (err) {
            console.error("[help] submission failed:", err);
            const msg = (err && err.message) ? err.message : String(err || 'Unknown error');
            helpStatus.textContent = "Failed to submit: " + msg;
            helpStatus.className = "text-center text-sm text-red-400";
            helpStatus.classList.remove('hidden');
          } finally {
            helpSubmitBtn.disabled = false;
            helpSubmitBtn.textContent = helpLabels[type].submitBtn;
          }
        });
      }

      // Open/close handlers
      if (sidePanelHelp) {
        sidePanelHelp.addEventListener('click', () => openHelpModal());
        sidePanelHelp.addEventListener('touchend', (e) => { e.preventDefault(); openHelpModal(); });
      }
      if (helpCloseBtn) {
        helpCloseBtn.addEventListener('click', closeHelpModal);
        helpCloseBtn.addEventListener('touchend', (e) => { e.preventDefault(); closeHelpModal(); });
      }
      if (helpModal) {
        helpModal.addEventListener('click', (e) => { if (e.target === helpModal) closeHelpModal(); });
      }

      // Ensure the submit button responds to touch on iPad/Safari
      if (helpSubmitBtn) {
        helpSubmitBtn.addEventListener('touchend', (e) => { e.preventDefault(); try { helpSubmitBtn.click(); } catch (err) { /* fallback: submit the form */ try { helpForm.dispatchEvent(new Event('submit', {cancelable: true})); } catch(e){} } });
      }

      // Registration page appeal button
      const registerAppealBtn = document.getElementById('registerAppealBtn');
      if (registerAppealBtn) {
        registerAppealBtn.addEventListener('click', () => openHelpModalFor('appeal'));
        registerAppealBtn.addEventListener('touchend', (e) => { e.preventDefault(); openHelpModalFor('appeal'); });
      }

      // ======================== MOD APP POPUP ========================
      const modAppPopup = document.getElementById('modAppPopup');
      const modAppApplyBtn = document.getElementById('modAppApplyBtn');
      const modAppDismissBtn = document.getElementById('modAppDismissBtn');

      function openModAppPopup() {
        if (modAppPopup) {
          modAppPopup.classList.remove('modal-closed');
          modAppPopup.classList.add('modal-open');
          modAppPopup.style.zIndex = '99999';
          modAppPopup.style.display = 'flex';
        }
      }

      function closeModAppPopup() {
        if (modAppPopup) {
          modAppPopup.classList.remove('modal-open');
          modAppPopup.classList.add('modal-closed');
        }
      }

      async function dismissModAppPopup() {
        closeModAppPopup();
        // Save to Firebase that user has dismissed the popup
        if (currentUserId) {
          try {
            await db.ref("userSettings/" + currentUserId + "/modAppPopupDismissed").set(true);
          } catch (err) {
            console.warn("[modApp] failed to save dismissal:", err);
          }
        }
      }

      async function checkAndShowModAppPopup() {
        if (!currentUserId) return;
        try {
          const snap = await db.ref("userSettings/" + currentUserId + "/modAppPopupDismissed").once("value");
          const dismissed = snap.val() === true;
          if (!dismissed) {
            // Small delay to let login settle
            setTimeout(() => {
              openModAppPopup();
            }, 800);
          }
        } catch (err) {
          console.warn("[modApp] failed to check popup status:", err);
        }
      }

      // Event listeners for mod app popup
      if (modAppDismissBtn) {
        modAppDismissBtn.addEventListener('click', dismissModAppPopup);
        modAppDismissBtn.addEventListener('touchend', (e) => { e.preventDefault(); dismissModAppPopup(); });
      }
      // Note: Do NOT dismiss when clicking the backdrop or Apply — only the Dismiss button closes the popup.
      // Apply button is a normal link (`<a>`) and will open the form in a new tab; we intentionally do not attach a dismiss handler.
      // ======================== END MOD APP POPUP ========================

      // Wire sidebar and header Staff Applications links to open the popup
      const sidePanelModApp = document.getElementById('sidePanelModApp');
      const headerStaffApp = document.getElementById('headerStaffApp');

      // Leave sidebar Staff Applications link as a normal external link (no JS interception)

      // Header staff link is a normal external link — no JS interception

      // Global touch-to-click enhancer for iOS/touch devices
      (function(){
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
          // Expanded selectors for all interactive elements (exclude message bubbles to avoid interfering with action buttons)
          const selectors = 'button, [role="button"], a[href], .nav-tab, .help-tab, .reply-button, .side-panel-item, .clickable, [data-tab], label[for], select, [onclick]';
          
          function enhanceElement(el) {
            if (!el.dataset.touchEnhanced) {
              el.addEventListener('touchend', function(e){
                // Don't interfere with scrolling
                if (e.cancelable) {
                  e.preventDefault();
                }
                try { el.click(); } catch (err) {
                  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
                  el.dispatchEvent(ev);
                }
              }, { passive: false });
              el.dataset.touchEnhanced = '1';
            }
          }
          
          // Enhance existing elements
          document.querySelectorAll(selectors).forEach(enhanceElement);
          
          // Use MutationObserver to enhance dynamically added elements
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                  if (node.matches && node.matches(selectors)) {
                    enhanceElement(node);
                  }
                  // Also check descendants
                  if (node.querySelectorAll) {
                    node.querySelectorAll(selectors).forEach(enhanceElement);
                  }
                }
              });
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });

          // Prevent quick double-tap causing zoom on iOS
          let __lastTouch = 0;
          document.addEventListener('touchend', function(e){
            const now = Date.now();
            if (now - __lastTouch <= 300 && e.cancelable) {
              e.preventDefault();
            }
            __lastTouch = now;
          }, { passive: false });
          
          // Add touch feedback to modals - close on background tap
          document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('touchend', function(e) {
              if (e.target === modal && e.cancelable) {
                e.preventDefault();
                modal.classList.remove('modal-open');
                modal.classList.add('modal-closed');
              }
            }, { passive: false });
          });

          // Show message action buttons on touch for iPad - tap on message bubble shows buttons
          document.addEventListener('touchstart', function(e) {
            const group = e.target.closest('.group');
            if (group) {
              // remove touch-active from other groups
              document.querySelectorAll('.group.touch-active').forEach(g => {
                if (g !== group) g.classList.remove('touch-active');
              });
              // add touch-active to this group (CSS will reveal action buttons)
              group.classList.add('touch-active');
            } else {
              // touched outside any message group -> hide all action buttons immediately
              document.querySelectorAll('.group.touch-active').forEach(g => g.classList.remove('touch-active'));
            }
          }, { passive: true });
        }
      })();

      // Close settings modal
      settingsCloseBtn.addEventListener("click", () => {
        settingsModal.classList.remove("modal-open");
        settingsModal.classList.add("modal-closed");
      });

      async function loadSettingsModal() {
        // populate current recovery email
        const uid = auth.currentUser?.uid;
        try {
          if (!uid) return;
          const snap = await db.ref('userProfiles/' + uid + '/recoveryEmail').once('value');
          const email = snap.exists() ? snap.val() : '';
          if (settingsRecoveryEmail) settingsRecoveryEmail.value = email || '';
        } catch (err) {
          console.warn('[settings] failed to load recovery email', err);
        }
      }

      // Open settings modal: ensure fields are populated
      if (sidePanelSettings) {
        sidePanelSettings.addEventListener('click', () => {
          loadSettingsModal();
          try { settingsModal.classList.remove('modal-closed'); settingsModal.classList.add('modal-open'); } catch(e){}
          closeSidePanel();
        });
      }

      // Save recovery email
      if (saveRecoveryBtn) {
        saveRecoveryBtn.addEventListener('click', async () => {
          const uid = auth.currentUser?.uid;
          if (!uid) { showToast('Not signed in', 'error'); return; }
          const val = (settingsRecoveryEmail && settingsRecoveryEmail.value) ? settingsRecoveryEmail.value.trim() : '';
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (val && !emailRegex.test(val)) {
            settingsRecoveryMsg.textContent = 'Invalid email format';
            settingsRecoveryMsg.className = 'text-xs text-red-400';
            return;
          }
          try {
            await db.ref('userProfiles/' + uid + '/recoveryEmail').set(val || null);
            // mark unverified when changed
            await db.ref('userProfiles/' + uid + '/recoveryEmailVerified').set(false);
            settingsRecoveryMsg.textContent = 'Saved';
            settingsRecoveryMsg.className = 'text-xs text-emerald-400';
          } catch (err) {
            console.error('[settings] failed to save recovery email', err);
            settingsRecoveryMsg.textContent = 'Save failed';
            settingsRecoveryMsg.className = 'text-xs text-red-400';
          }
        });
      }

      if (clearRecoveryBtn) {
        clearRecoveryBtn.addEventListener('click', async () => {
          const uid = auth.currentUser?.uid;
          if (!uid) { showToast('Not signed in', 'error'); return; }
          try {
            await db.ref('userProfiles/' + uid + '/recoveryEmail').set(null);
            await db.ref('userProfiles/' + uid + '/recoveryEmailVerified').set(false);
            if (settingsRecoveryEmail) settingsRecoveryEmail.value = '';
            settingsRecoveryMsg.textContent = 'Cleared';
            settingsRecoveryMsg.className = 'text-xs text-emerald-400';
          } catch (err) {
            console.error('[settings] failed to clear recovery email', err);
            settingsRecoveryMsg.textContent = 'Clear failed';
            settingsRecoveryMsg.className = 'text-xs text-red-400';
          }
        });
      }

      // Delete account for current user (with optional message deletion)
      async function performAccountDeletion(deleteMessages) {
        const uid = auth.currentUser?.uid;
        if (!uid) { showToast('Not signed in', 'error'); return; }
        try {
          deleteAccountMsg.textContent = 'Deleting...';
          deleteAccountMsg.className = 'text-xs text-yellow-400';

          // Optionally delete messages
          if (deleteMessages) {
            const msgsSnap = await db.ref('messages').orderByChild('userId').equalTo(uid).once('value');
            const updates = {};
            msgsSnap.forEach(ch => { updates['/messages/' + ch.key] = null; });
            if (Object.keys(updates).length) await db.ref().update(updates);
          }

          // Remove user profile and user pointers
          await db.ref('userProfiles/' + uid).remove();
          await db.ref('users/' + uid).remove();
          await db.ref('friends/' + uid).remove();
          await db.ref('friendRequests/' + uid).remove();

          // Try to delete auth user (may require recent login)
          try {
            if (firebase.auth().currentUser) {
              await firebase.auth().currentUser.delete();
            }
          } catch (authDelErr) {
            console.warn('[account] auth delete failed (reauth may be required):', authDelErr);
            // Inform user they must reauthenticate to complete deletion
            deleteAccountMsg.textContent = 'Account data removed. To fully delete your authentication account, please sign in and reauthenticate, then delete account from Settings.';
            deleteAccountMsg.className = 'text-xs text-amber-400';
            return;
          }

          // Success: redirect to homepage or show message
          deleteAccountMsg.textContent = 'Account deleted. Redirecting...';
          deleteAccountMsg.className = 'text-xs text-emerald-400';
          setTimeout(() => { window.location.href = 'index.html'; }, 1200);
        } catch (err) {
          console.error('[account] deletion failed', err);
          deleteAccountMsg.textContent = 'Deletion failed';
          deleteAccountMsg.className = 'text-xs text-red-400';
        }
      }

      if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
          if (!confirm('Are you sure? This will permanently delete your account.')) return;
          const deleteMsgs = deleteMessagesToggle && deleteMessagesToggle.checked;
          await performAccountDeletion(deleteMsgs);
        });
      }

      if (deleteAccountCancel) {
        deleteAccountCancel.addEventListener('click', () => {
          deleteMessagesToggle.checked = false;
          deleteAccountMsg.textContent = '';
        });
      }

      settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) {
          settingsModal.classList.remove("modal-open");
          settingsModal.classList.add("modal-closed");
        }
      });

      // Blocked Users Modal
      blockedUsersCloseBtn.addEventListener("click", () => {
        blockedUsersModal.classList.remove("modal-open");
        blockedUsersModal.classList.add("modal-closed");
      });

      blockedUsersModal.addEventListener("click", (e) => {
        if (e.target === blockedUsersModal) {
          blockedUsersModal.classList.remove("modal-open");
          blockedUsersModal.classList.add("modal-closed");
        }
      });

      // Canvas Consent Modal (GDPR/CCPA compliant - for canvas fingerprint only)
      const canvasConsentEnableBtn = document.getElementById("canvasConsentEnableBtn");
      const canvasConsentSkipBtn = document.getElementById("canvasConsentSkipBtn");
      const canvasConsentSettingsLink = document.getElementById("canvasConsentSettingsLink");
      const canvasConsentPrivacyLink = document.getElementById("canvasConsentPrivacyLink");

      if (canvasConsentEnableBtn) {
        canvasConsentEnableBtn.addEventListener("click", async () => {
          await grantCanvasConsent(currentUserId);
          hideCanvasConsentModal();
          // Regenerate and store fingerprint with canvas (uses storeFingerprint which respects consent)
          if (currentUserId && FINGERPRINT_ENABLED) {
            await storeFingerprint(currentUserId);
          }
        });
      }

      // Skip/decline button - closes modal, no features are gated
      if (canvasConsentSkipBtn) {
        canvasConsentSkipBtn.addEventListener("click", () => {
          hideCanvasConsentModal();
          // Mark as declined so we don't keep showing it
          if (currentUserId) {
            db.ref('users/' + currentUserId + '/canvasConsentRecord').set({
              granted: false,
              declinedAt: firebase.database.ServerValue.TIMESTAMP,
              version: CANVAS_CONSENT_VERSION,
              uid: currentUserId
            }).catch(() => {});
          }
        });
      }
      
      // Link to Settings -> Privacy from consent modal
      if (canvasConsentSettingsLink) {
        canvasConsentSettingsLink.addEventListener("click", (e) => {
          e.preventDefault();
          hideCanvasConsentModal();
          // Open privacy settings modal
          const privacyModal = document.getElementById("privacySettingsModal");
          if (privacyModal) {
            privacyModal.classList.remove("modal-closed");
            privacyModal.classList.add("modal-open");
          }
        });
      }
      
      // Link to Privacy Policy from consent modal
      if (canvasConsentPrivacyLink) {
        canvasConsentPrivacyLink.addEventListener("click", (e) => {
          e.preventDefault();
          hideCanvasConsentModal();
          const privacyModal = document.getElementById("privacyModal");
          if (privacyModal) {
            privacyModal.classList.remove("modal-closed");
            privacyModal.classList.add("modal-open");
          }
        });
      }

      // Privacy Settings Modal
      privacySettingsCloseBtn.addEventListener("click", () => {
        privacySettingsModal.classList.remove("modal-open");
        privacySettingsModal.classList.add("modal-closed");
      });

      privacySettingsModal.addEventListener("click", (e) => {
        if (e.target === privacySettingsModal) {
          privacySettingsModal.classList.remove("modal-open");
          privacySettingsModal.classList.add("modal-closed");
        }
      });

      notifBellBtn.addEventListener("click", async () => {
        await clearNotifications();
        renderNotificationHistory();
        notifModal.classList.remove("modal-closed");
        notifModal.classList.add("modal-open");
      });

      notifCloseBtn.addEventListener("click", () => {
        notifModal.classList.remove("modal-open");
        notifModal.classList.add("modal-closed");
      });

      notifModal.addEventListener("click", (e) => {
        if (e.target === notifModal) {
          notifModal.classList.remove("modal-open");
          notifModal.classList.add("modal-closed");
        }
      });

      notifClearBtn.addEventListener("click", () => {
        notificationHistory = [];
        clearNotifications();
        renderNotificationHistory();
      });

      // Share button behavior
      if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
          // Use the provided TinyURL instead of current page URL
          const link = 'https://tinyurl.com/chatraa';
          try { if (shareLinkInput) shareLinkInput.value = link; } catch (e) {}
          try {
            // Generate QR client-side (avoids CORS). Use the QRCode library to create a data URL.
            if (window.QRCode && QRCode.toDataURL) {
              try {
                const dataUrl = await QRCode.toDataURL(link, { margin: 1, width: 300 });
                if (shareQRCode) shareQRCode.src = dataUrl;
                if (shareDownloadBtn) shareDownloadBtn.dataset.qr = dataUrl;
              } catch (err) {
                console.warn('[share] QR generation failed, falling back to provided image', err);
                const providedQr = 'https://image2url.com/images/1765859919064-72a6905d-3b5b-4ed0-82e3-fd76963651d4.png';
                if (shareQRCode) shareQRCode.src = providedQr;
                if (shareDownloadBtn) shareDownloadBtn.dataset.qr = providedQr;
              }
            } else {
              // No QR library available; fall back to provided QR image
              const providedQr = 'https://image2url.com/images/1765859919064-72a6905d-3b5b-4ed0-82e3-fd76963651d4.png';
              if (shareQRCode) shareQRCode.src = providedQr;
              if (shareDownloadBtn) shareDownloadBtn.dataset.qr = providedQr;
            }
          } catch (e) {}
          try {
            if (shareModal) {
              shareModal.classList.remove('modal-closed');
              shareModal.classList.add('modal-open');
              shareModal.style.display = 'flex';
            }
          } catch (e) {}
          try { sendAnalyticsEvent('share_open', { source: 'header' }); } catch (e) {}
        });
        shareBtn.addEventListener('touchend', (e) => { e.preventDefault(); shareBtn.click(); });
      }

      if (shareCloseBtn) {
        shareCloseBtn.addEventListener('click', () => {
          try { if (shareModal) { shareModal.classList.remove('modal-open'); shareModal.classList.add('modal-closed'); shareModal.style.display = 'none'; } } catch (e) {}
        });
        shareCloseBtn.addEventListener('touchend', (e) => { e.preventDefault(); shareCloseBtn.click(); });
      }

      if (shareModal) {
        shareModal.addEventListener('click', (e) => {
          if (e.target === shareModal) {
            try { shareModal.classList.remove('modal-open'); shareModal.classList.add('modal-closed'); shareModal.style.display = 'none'; } catch (e) {}
          }
        });
      }

      if (shareCopyBtn) {
        shareCopyBtn.addEventListener('click', async () => {
          const text = (shareLinkInput && shareLinkInput.value) ? shareLinkInput.value : 'https://tinyurl.com/chatraa';
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(text);
            } else {
              const ta = document.createElement('textarea');
              ta.value = text;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              ta.remove();
            }
            const old = shareCopyBtn.textContent;
            shareCopyBtn.textContent = 'Copied!';
            setTimeout(() => { try { shareCopyBtn.textContent = old; } catch (e) {} }, 1500);
            try { sendAnalyticsEvent('share_copy', { method: 'copy' }); } catch (e) {}
          } catch (err) {
            console.error('[share] copy failed', err);
          }
        });
        shareCopyBtn.addEventListener('touchend', (e) => { e.preventDefault(); shareCopyBtn.click(); });
      }

      // Download QR button behavior — fetch the image as a blob then download.
      if (shareDownloadBtn) {
        shareDownloadBtn.addEventListener('click', async (e) => {
          const qr = shareDownloadBtn.dataset.qr || (shareQRCode ? shareQRCode.src : null) || 'https://image2url.com/images/1765859919064-72a6905d-3b5b-4ed0-82e3-fd76963651d4.png';

          // If the QR is a data URL (generated client-side), convert it to a blob without fetching remote
          if (qr && qr.startsWith('data:')) {
            try {
              const blob = dataURLToBlob(qr);
              const blobUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = 'chatra-qr.png';
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
              try { sendAnalyticsEvent('share_download', { method: 'download', qr_url: 'data:' }); } catch (e) {}
              return;
            } catch (err) {
              console.warn('[share] data URL -> blob download failed, continuing to other fallbacks', err);
            }
          }

          try {
            // Try fetching the image as a blob (best for cross-browser downloads)
            const resp = await fetch(qr, { mode: 'cors' });
            if (!resp.ok) throw new Error('Network response was not ok: ' + resp.status);
            const blob = await resp.blob();

            // Create object URL and trigger anchor download
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = 'chatra-qr.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Revoke the object URL after a short delay to allow the download to start
            setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
            try { sendAnalyticsEvent('share_download', { method: 'download', qr_url: qr }); } catch (e) {}
            return;
          } catch (err) {
            console.warn('[share] fetch->blob download failed, falling back to opening image in new tab', err);
          }

          // Fallback: try drawing the image to a canvas (may fail if CORS prevents it)
          try {
            await new Promise((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => resolve(img);
              img.onerror = (ev) => reject(new Error('Image load error'));
              img.src = qr;
            }).then((img) => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((blob) => {
                if (!blob) {
                  throw new Error('Canvas toBlob returned null');
                }
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = 'chatra-qr.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
                try { sendAnalyticsEvent('share_download', { method: 'canvas', qr_url: qr }); } catch (e) {}
              }, 'image/png');
            });
            return;
          } catch (err) {
            console.warn('[share] canvas fallback failed, will open image in new tab', err);
          }

          // Last resort: open the image in a new tab so user can manually save it
          try {
            window.open(qr, '_blank', 'noopener');
            try { sendAnalyticsEvent('share_download', { method: 'open_tab', qr_url: qr }); } catch (e) {}
          } catch (err) {
            console.error('[share] final fallback open failed', err);
          }
        });
        shareDownloadBtn.addEventListener('touchend', (e) => { e.preventDefault(); shareDownloadBtn.click(); });
      }

      // Load Privacy Settings
      async function loadPrivacySettings() {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          console.log("[privacy] no uid");
          return;
        }

        try {
          console.log("[privacy] loading settings for uid:", uid);
          const snap = await db.ref("userPrivacy/" + uid).once("value");
          const privacy = snap.val() || {};
          
          console.log("[privacy] loaded:", privacy);
          allowFriendRequestsToggle.checked = privacy.allowFriendRequests !== false;
          // DM privacy: anyone (default), friends, none
          if (dmPrivacySelect) {
            dmPrivacySelect.value = privacy.dmPrivacy || 'anyone';
          }
          // Group privacy settings
          const groupVisibilitySelect = document.getElementById("groupVisibilitySelect");
          const allowGroupInvitesToggle = document.getElementById("allowGroupInvitesToggle");
          if (groupVisibilitySelect) {
            groupVisibilitySelect.value = privacy.groupVisibility || 'anyone';
          }
          if (allowGroupInvitesToggle) {
            allowGroupInvitesToggle.checked = privacy.allowGroupInvites !== false;
          }
          // Canvas consent toggle - sync with current state
          const canvasConsentToggle = document.getElementById("canvasConsentToggle");
          if (canvasConsentToggle) {
            canvasConsentToggle.checked = canvasConsentCache === true;
          }
        } catch (err) {
          console.error("[privacy] error loading settings:", err);
        }
      }

      // Save Privacy Settings
      savePrivacyBtn.addEventListener("click", async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          showToast("Not logged in", "error");
          return;
        }

        savePrivacyBtn.disabled = true;
        savePrivacyBtn.textContent = "Saving...";

        try {
          console.log("[privacy] saving settings for uid:", uid);
          const groupVisibilitySelect = document.getElementById("groupVisibilitySelect");
          const allowGroupInvitesToggle = document.getElementById("allowGroupInvitesToggle");
          
          await db.ref("userPrivacy/" + uid).set({
            allowFriendRequests: allowFriendRequestsToggle.checked,
            dmPrivacy: dmPrivacySelect ? dmPrivacySelect.value : 'anyone',
            groupVisibility: groupVisibilitySelect ? groupVisibilitySelect.value : 'anyone',
            allowGroupInvites: allowGroupInvitesToggle ? allowGroupInvitesToggle.checked : true,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
          });

          console.log("[privacy] saved successfully");
          savePrivacyBtn.textContent = "Saved!";
          savePrivacyBtn.style.background = "rgb(34, 197, 94)";

          setTimeout(() => {
            savePrivacyBtn.textContent = "Save Settings";
            savePrivacyBtn.style.background = "";
            savePrivacyBtn.disabled = false;
            privacySettingsModal.classList.remove("modal-open");
            privacySettingsModal.classList.add("modal-closed");
          }, 1500);
        } catch (err) {
          console.error("[privacy] error saving:", err);
          showToast("Failed to save privacy settings", "error");
          savePrivacyBtn.textContent = "Save Settings";
          savePrivacyBtn.disabled = false;
        }
      });

      // Canvas consent toggle handler in Privacy Settings
      const canvasConsentToggle = document.getElementById("canvasConsentToggle");
      if (canvasConsentToggle) {
        canvasConsentToggle.addEventListener("change", async () => {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          
          if (canvasConsentToggle.checked) {
            await grantCanvasConsent(uid);
            showToast('Device identification enabled', 'success');
          } else {
            await revokeCanvasConsent(uid);
          }
        });
      }
      
      // Learn more link in Privacy Settings
      const canvasConsentLearnMore = document.getElementById("canvasConsentLearnMore");
      if (canvasConsentLearnMore) {
        canvasConsentLearnMore.addEventListener("click", (e) => {
          e.preventDefault();
          privacySettingsModal.classList.remove("modal-open");
          privacySettingsModal.classList.add("modal-closed");
          showCanvasConsentModal();
        });
      }

      // ===== DIRECT MESSAGES =====
      function openDmModal() {
        if (!currentUserId) {
          dmError.textContent = "Please log in.";
          return;
        }
        dmError.textContent = "";
        dmModal.classList.remove("modal-closed");
        dmModal.classList.add("modal-open");
        dmActiveUser.textContent = activeDMTarget?.username || "Select a conversation";
        // Analytics: DM opened (modal)
        try { sendAnalyticsEvent('dm_open', { thread_id: activeDMThread || null, other_uid: activeDMTarget?.uid || null, mode: 'modal' }); } catch (e) {}
        
        // Show friends by default
        dmConversationList.innerHTML = '';
        showDmFriendsDefault();
      }

      function closeDmModal() {
        dmModal.classList.remove("modal-open");
        dmModal.classList.add("modal-closed");
        dmActiveUser.textContent = "Select a conversation";
        dmUserSearch.value = "";
        dmError.textContent = "";
        activeDMThread = null;
        activeDMTarget = null;
        dmConversationList.innerHTML = "";
        clearDmMessages();
        detachDmMessagesListener();
        detachDmInboxListener();
      }

      dmCloseBtn.addEventListener("click", closeDmModal);
      dmModal.addEventListener("click", (e) => {
        if (e.target === dmModal) {
          closeDmModal();
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && dmModal.classList.contains("modal-open")) {
          closeDmModal();
        }
      });

      // ===== FAST MODE (Performance) =====
      const fastModeToggle = document.getElementById("fastModeToggle");
      const fastModeLabel = document.getElementById("fastModeLabel");

      function applyFastMode(enabled, persist = true) {
        FAST_MODE_ENABLED = !!enabled;
        // Smaller page size in fast mode to reduce initial render work
        PAGE_SIZE = enabled ? 40 : 75;
        document.body.classList.toggle("perf-lite", enabled);
        if (persist) saveUserSetting("fastMode", enabled);
        if (fastModeLabel) {
          fastModeLabel.textContent = enabled ? "Fast Mode (ON)" : "Fast Mode";
        }
        // When enabling aggressive fast mode, disable non-essential timers to reduce CPU and network work
        try {
          if (enabled) {
            if (typingCleanupInterval) { clearInterval(typingCleanupInterval); typingCleanupInterval = null; }
            // stop rating prompt loop while in fast mode
            stopRatingPromptLoop();
          } else {
            // leaving fast mode: allow rating prompts to resume
            if (!ratingIntervalId) {
              ratingIntervalId = setInterval(() => maybeShowRatingPrompt("interval"), RATING_INTERVAL_MS);
            }
          }
        } catch (e) {
          console.debug('[fastmode] error applying aggressive options', e);
        }
      }

      if (fastModeToggle) {
        fastModeToggle.addEventListener("change", () => {
          applyFastMode(fastModeToggle.checked, true);
        });
      }

      // ===== RATING PROMPT =====
      function updateRatingStars() {
        ratingStars.forEach((btn) => {
          const starValue = parseInt(btn.dataset.star, 10);
          const isActive = ratingPendingStars && starValue <= ratingPendingStars;
          btn.classList.toggle("bg-amber-500", isActive);
          btn.classList.toggle("text-slate-900", isActive);
          btn.classList.toggle("bg-slate-800", !isActive);
          btn.classList.toggle("text-amber-300", !isActive);
        });
      }

      function resetRatingModal() {
        ratingPendingStars = null;
        ratingErrorEl.textContent = "";
        ratingFeedbackWrap.classList.add("hidden");
        ratingFeedbackInput.value = "";
        ratingDontShowCheckbox.checked = false;
        updateRatingStars();
      }

      function openRatingModal(manual = false) {
        if (!ratingModal) return;
        resetRatingModal();
        if (manual) {
          ratingLastPrompt = Date.now();
          saveUserSetting("ratingLastPrompt", ratingLastPrompt);
        }
        ratingModal.classList.remove("modal-closed");
        ratingModal.classList.add("modal-open");
      }

      function closeRatingModal(saveOptOut = false) {
        if (!ratingModal) return;
        ratingModal.classList.remove("modal-open");
        ratingModal.classList.add("modal-closed");
        if (saveOptOut && ratingDontShowCheckbox.checked) {
          ratingOptOut = true;
          saveUserSetting("ratingOptOut", true);
          stopRatingPromptLoop();
        }
      }

      function stopRatingPromptLoop() {
        if (ratingIntervalId) {
          clearInterval(ratingIntervalId);
          ratingIntervalId = null;
        }
      }

      function maybeShowRatingPrompt(reason = "interval") {
        if (!currentUserId || ratingOptOut) return;
        // Do not show rating while onboarding walkthrough is active
        if (typeof walkthroughActive !== 'undefined' && walkthroughActive) {
          console.log('[rating] walkthrough active, deferring prompt');
          // Try again later after the normal interval
          setTimeout(() => maybeShowRatingPrompt('deferred-after-walkthrough'), RATING_INTERVAL_MS);
          return;
        }
        const now = Date.now();
        if (now - ratingLastPrompt < RATING_INTERVAL_MS) return;
        ratingLastPrompt = now;
        saveUserSetting("ratingLastPrompt", ratingLastPrompt);
        console.log(`[rating] showing prompt (${reason})`);
        openRatingModal();
      }

      function startRatingPromptLoop() {
        stopRatingPromptLoop();
        if (!currentUserId || ratingOptOut) return;
        ratingIntervalId = setInterval(() => maybeShowRatingPrompt("interval"), RATING_INTERVAL_MS);
        // Initial prompt should wait the interval to avoid interfering with onboarding
        setTimeout(() => maybeShowRatingPrompt("initial"), RATING_INTERVAL_MS);
      }

      async function submitRating() {
        if (!currentUserId) return;
        if (!ratingPendingStars) {
          ratingErrorEl.textContent = "Pick a star rating first.";
          return;
        }
        ratingErrorEl.textContent = "";

        const feedback = (ratingFeedbackInput.value || "").trim();
        const dontShowAgain = ratingDontShowCheckbox.checked;
        const ratingRef = db.ref("userRatings/" + currentUserId).push();
        const globalRatingRef = db.ref("ratingsAll").push();

        const payload = {
          stars: ratingPendingStars,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
        };

        if (feedback) {
          payload.feedback = feedback.slice(0, 800);
        }

        try {
          const globalPayload = {
            uid: currentUserId,
            username: currentUsername || "",
            stars: ratingPendingStars,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
          };
          if (feedback) {
            globalPayload.feedback = feedback.slice(0, 800);
          }

          await Promise.all([
            ratingRef.set(payload),
            globalRatingRef.set(globalPayload),
          ]);
          ratingLastPrompt = Date.now();
          saveUserSetting("ratingLastPrompt", ratingLastPrompt);
          if (dontShowAgain) {
            ratingOptOut = true;
            saveUserSetting("ratingOptOut", true);
            stopRatingPromptLoop();
          }
          closeRatingModal();
          console.log("[rating] thanks for the feedback", payload);
        } catch (err) {
          ratingErrorEl.textContent = "Could not save rating. Try again.";
          console.error("[rating] failed to save rating", err);
        }
      }

      ratingStars.forEach((btn) => {
        btn.addEventListener("click", () => {
          const starValue = parseInt(btn.dataset.star, 10);
          ratingPendingStars = starValue;
          ratingFeedbackWrap.classList.remove("hidden");
          updateRatingStars();
        });
      });

      ratingSubmitBtn.addEventListener("click", submitRating);
      ratingLaterBtn.addEventListener("click", () => {
        ratingLastPrompt = Date.now();
        saveUserSetting("ratingLastPrompt", ratingLastPrompt);
        closeRatingModal(true);
      });
      ratingCloseBtn.addEventListener("click", () => {
        closeRatingModal(true);
      });
      if (ratingModal) {
        ratingModal.addEventListener("click", (e) => {
          if (e.target === ratingModal) {
            closeRatingModal(true);
          }
        });
      }

      function initRatingSettings(settings) {
        ratingOptOut = settings.ratingOptOut === true;
        ratingLastPrompt = settings.ratingLastPrompt || 0;
        if (ratingOptOut) {
          stopRatingPromptLoop();
          return;
        }
        startRatingPromptLoop();
      }

      window.triggerRatingPrompt = (force = false) => {
        if (!currentUserId) {
          console.warn("[rating] no user logged in; cannot show prompt");
          return;
        }
        if (force) {
          ratingOptOut = false;
        }
        ratingLastPrompt = 0;
        startRatingPromptLoop();
        openRatingModal(true);
      };

      dmStartBtn.addEventListener("click", () => {
        startDmWithUsername(dmUserSearch.value);
      });

      dmUserSearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          startDmWithUsername(dmUserSearch.value);
        }
      });

      let dmSearchTimeout = null;
      dmUserSearch.addEventListener("input", () => {
        clearTimeout(dmSearchTimeout);
        const query = (dmUserSearch.value || "").trim();

        if (!query) {
          // Show all friends by default
          dmConversationList.innerHTML = '';
          showDmFriendsDefault();
          return;
        }

        dmConversationList.innerHTML = '<p class="text-xs text-slate-400 p-2">Searching...</p>';
        dmSearchTimeout = setTimeout(async () => {
          await searchDmUsers(query);
        }, 300);
      });

      async function showDmFriendsDefault() {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        try {
          const snap = await db.ref("friends/" + uid).once("value");
          const friends = snap.val() || {};
          const friendsList = Object.keys(friends);

          if (friendsList.length === 0) {
            dmConversationList.innerHTML = '<p class="text-xs text-slate-400 p-2">No friends yet</p>';
            return;
          }

          dmConversationList.innerHTML = '';

          for (const friendUid of friendsList) {
            const userSnap = await db.ref("users/" + friendUid + "/username").once("value");
            const username = userSnap.val() || friendUid;
            
            const profileSnap = await db.ref("userProfiles/" + friendUid).once("value");
            const profile = profileSnap.val() || {};
            const profilePic = profile.profilePic || '';

            const btn = document.createElement("button");
            btn.className = "w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-3";
            btn.innerHTML = `
              <div class="w-10 h-10 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden">
                ${profilePic ? `<img src="${profilePic}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-slate-400 text-sm">${username.charAt(0).toUpperCase()}</div>`}
              </div>
              <div class="text-sm text-slate-100">${username}</div>
            `;
            btn.onclick = () => {
              dmUserSearch.value = username;
              startDmWithUsername(username);
            };
            dmConversationList.appendChild(btn);
          }
        } catch (err) {
          console.error("[dm] error showing friends:", err);
          dmConversationList.innerHTML = '<p class="text-xs text-red-400 p-2">Error loading friends</p>';
        }
      }

      async function searchDmUsers(query) {
        if (!currentUserId) return;
        try {
          // Fetch usernames
          const usersSnap = await db.ref("users").once("value");
          const allUsers = usersSnap.val() || {};
          // Fetch profiles for avatars/bios
          const profilesSnap = await db.ref("userProfiles").once("value");
          const allProfiles = profilesSnap.val() || {};

          const q = query.toLowerCase();
          const matches = [];
          Object.entries(allUsers).forEach(([uid, val]) => {
            const uname = val?.username || "";
            if (!uname) return;
            if (uid === currentUserId) return;
            if (uname.toLowerCase().includes(q)) {
              const prof = allProfiles[uid] || {};
              matches.push({ uid, username: uname, bio: prof.bio, profilePic: prof.profilePic });
            }
          });

          if (!matches.length) {
            dmConversationList.innerHTML = '<p class="text-xs text-slate-400 p-2">No users found.</p>';
            return;
          }

          dmConversationList.innerHTML = "";
          matches.slice(0, 30).forEach((item) => {
            const btn = document.createElement("button");
            btn.className = "w-full text-left px-3 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-3";
            const avatar = document.createElement("div");
            avatar.className = "h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-semibold text-slate-200 overflow-hidden";
            if (item.profilePic) {
              const img = document.createElement("img");
              img.src = item.profilePic;
              img.className = "h-full w-full object-cover";
              img.onerror = () => {
                avatar.textContent = (item.username || "?").charAt(0).toUpperCase();
              };
              avatar.appendChild(img);
            } else {
              avatar.textContent = (item.username || "?").charAt(0).toUpperCase();
            }

            const info = document.createElement("div");
            info.className = "flex-1 min-w-0";
            const name = document.createElement("div");
            name.className = "text-sm text-slate-100 font-semibold truncate";
            name.textContent = item.username;
            const bio = document.createElement("div");
            bio.className = "text-xs text-slate-400 truncate";
            bio.textContent = item.bio || "Tap to view profile";
            info.appendChild(name);
            info.appendChild(bio);

            const cta = document.createElement("span");
            cta.className = "text-[11px] text-slate-300";
            cta.textContent = "View & DM";

            btn.appendChild(avatar);
            btn.appendChild(info);
            btn.appendChild(cta);

            btn.onclick = () => {
              viewUserProfile(item.username, { silent: true });
              startDmWithUsername(item.username);
            };
            dmConversationList.appendChild(btn);
          });
        } catch (err) {
          console.error("[dm] search error", err);
          dmConversationList.innerHTML = '<p class="text-xs text-red-400 p-2">Search failed.</p>';
        }
      }


      // DM media upload (images/videos)
      if (dmMediaUploadBtn && dmMediaInput) {
        dmMediaUploadBtn.addEventListener("click", () => {
          dmMediaInput.click();
        });

        dmMediaInput.addEventListener("change", async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;

          if (!currentUserId) {
            dmError.textContent = "Please log in.";
            dmMediaInput.value = "";
            return;
          }
          if (!activeDMTarget) {
            dmError.textContent = "Select a conversation first.";
            dmMediaInput.value = "";
            return;
          }
          if (blockedUsersCache.has(activeDMTarget.uid)) {
            dmError.textContent = "You blocked this user.";
            dmMediaInput.value = "";
            return;
          }
          if (await isBlockedByTarget(activeDMTarget.uid)) {
            dmError.textContent = "You are blocked by this user.";
            dmMediaInput.value = "";
            return;
          }

          try {
            dmError.textContent = "";
            dmMediaUploadBtn.disabled = true;
            dmSendBtn.disabled = true;

            const privacyCheck = await checkDmPrivacy(activeDMTarget.uid);
            // Enforce 30s video limit for this DM upload
            if (file.type && file.type.startsWith('video/')) {
              const dur = await getVideoDuration(file);
              if (dur > 30) {
                dmError.textContent = 'Video too long. Max 30 seconds.';
                dmMediaInput.value = '';
                dmMediaUploadBtn.disabled = false;
                dmSendBtn.disabled = false;
                return;
              }
            }
            if (!privacyCheck.allowed) {
              dmError.textContent = privacyCheck.reason;
              dmMediaUploadBtn.disabled = false;
              dmSendBtn.disabled = false;
              return;
            }

            if (!(await canUpload())) {
              dmError.textContent = "Slow down! Wait a few seconds.";
              return;
            }

            const threadId =
              activeDMThread || (await ensureDmThread(activeDMTarget.uid, activeDMTarget.username));

            // Optional caption
            let caption = (dmInput.value || "").trim();
            if (caption) {
              for (let pattern of THREAT_PATTERNS) {
                if (pattern.test(caption)) {
                  dmError.textContent = " Message blocked: Threats or violence are not allowed.";
                  dmInput.value = "";
                  return;
                }
              }
              for (let pattern of HATE_PATTERNS) {
                if (pattern.test(caption)) {
                  dmError.textContent = " Message blocked: Hateful or harassing language is not allowed.";
                  dmInput.value = "";
                  return;
                }
              }
              caption = filterBadWords(caption);
            }

            const processed = await prepareFileForUpload(file);
            const uploadResult = await uploadToImageKit(processed);
            storeUploadTime();

            // Analytics: image uploaded for modal DM
            try { sendAnalyticsEvent('image_uploaded', { thread_id: threadId || null, media_file_id: uploadResult.fileId || null }); } catch (e) {}

            const now = Date.now();
            const msg = {
              fromUid: currentUserId,
              toUid: activeDMTarget.uid,
              text: caption || "",
              media: uploadResult.url,
              mediaFileId: uploadResult.fileId || null,
              time: now,
              fromUsername: currentUsername || "",
              toUsername: activeDMTarget.username || "",
            };


            await db.ref("dms/" + threadId + "/messages").push(msg);

            // Analytics: message sent with media (modal)
            try { sendAnalyticsEvent('message_sent', { thread_id: threadId, has_media: true, media_file_id: uploadResult.fileId || null }); } catch (e) {}

            const lastMsgPreview = caption ? caption : "(media)";

            const myInboxUpdate = {
              withUid: activeDMTarget.uid,
              withUsername: activeDMTarget.username || activeDMTarget.uid,
              lastMsg: lastMsgPreview,
              lastTime: now,
            };

            const theirInboxUpdate = {
              withUid: currentUserId,
              withUsername: currentUsername || currentUserId,
              lastMsg: lastMsgPreview,
              lastTime: now,
            };

            // Ensure participants exist before updating inbox/transactions to satisfy security rules
            await db.ref("dms/" + threadId + "/participants/" + currentUserId).set(true).catch(() => {});
            await db.ref("dms/" + threadId + "/participants/" + activeDMTarget.uid).set(true).catch(() => {});

            await Promise.all([
              db.ref("dmInbox/" + currentUserId + "/" + threadId).set(myInboxUpdate),
              db.ref("dmInbox/" + activeDMTarget.uid + "/" + threadId).set({
                withUid: currentUserId,
                withUsername: currentUsername || currentUserId,
                lastMsg: lastMsgPreview,
                lastTime: now,
                unread: 1
              })
            ]);
            // Prevent our inbox listener from considering this local update as a new incoming message
            dmLastUpdateTimeByThread[threadId] = now;

            dmInput.value = "";
            dmMediaInput.value = "";
          } catch (err) {
            console.error("[dm] media send error", err);
            dmError.textContent = err.message || "Failed to send media DM.";
            dmMediaInput.value = "";
          } finally {
            dmMediaUploadBtn.disabled = false;
            dmSendBtn.disabled = false;
          }
        });
      }
      dmForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUserId) {
          dmError.textContent = "Please log in.";
          return;
        }
        if (!activeDMTarget) {
          dmError.textContent = "Select a conversation first.";
          return;
        }
        if (blockedUsersCache.has(activeDMTarget.uid)) {
          dmError.textContent = "You blocked this user.";
          return;
        }

        if (await isBlockedByTarget(activeDMTarget.uid)) {
          dmError.textContent = "You are blocked by this user.";
          return;
        }

        let text = (dmInput.value || "").trim();
        if (!text) return;

        // Check for threats, violence, and harassment in DM (don't send if detected)
        for (let pattern of THREAT_PATTERNS) {
          if (pattern.test(text)) {
            dmError.textContent = " Message blocked: Threats or violence are not allowed.";
            dmInput.value = "";
            return;
          }
        }
        
        for (let pattern of HATE_PATTERNS) {
          if (pattern.test(text)) {
            dmError.textContent = " Message blocked: Hateful or harassing language is not allowed.";
            dmInput.value = "";
            return;
          }
        }

        // Filter profanity and detect severe slurs
        text = filterBadWords(text);
        if (typeof text === 'string' && text.startsWith('[FILTERED')) {
          currentWarningText = ' Message blocked: Hateful or harassing language is not allowed.';
          updateStatusBar();
          setTimeout(() => {
            currentWarningText = '';
            updateStatusBar();
          }, 4000);
          msgInput.value = '';
          return;
        }

        dmError.textContent = "";
        dmSendBtn.disabled = true;

        try {
          const privacyCheck = await checkDmPrivacy(activeDMTarget.uid);
          if (!privacyCheck.allowed) {
            dmError.textContent = privacyCheck.reason;
            dmSendBtn.disabled = false;
            return;
          }

          const threadId =
            activeDMThread || (await ensureDmThread(activeDMTarget.uid, activeDMTarget.username));
          const now = Date.now();
          const msg = {
            fromUid: currentUserId,
            toUid: activeDMTarget.uid,
            text,
            time: now,
            fromUsername: currentUsername || "",
            toUsername: activeDMTarget.username || "",
          };

          await db.ref("dms/" + threadId + "/messages").push(msg);

          // Analytics: message sent (modal)
          try { sendAnalyticsEvent('message_sent', { thread_id: threadId, has_media: false }); } catch (e) {}

          // Update BOTH inboxes so recipient gets notified
          const myInboxUpdate = {
            withUid: activeDMTarget.uid,
            withUsername: activeDMTarget.username || activeDMTarget.uid,
            lastMsg: text,
            lastTime: now,
          };
          
          const theirInboxUpdate = {
            withUid: currentUserId,
            withUsername: currentUsername || currentUserId,
            lastMsg: text,
            lastTime: now,
          };
          
          // Ensure participants exist before updating inbox/transactions to satisfy security rules
          await db.ref("dms/" + threadId + "/participants/" + currentUserId).set(true).catch(() => {});
          await db.ref("dms/" + threadId + "/participants/" + activeDMTarget.uid).set(true).catch(() => {});

          await Promise.all([
            db.ref("dmInbox/" + currentUserId + "/" + threadId).set(myInboxUpdate),
            db.ref("dmInbox/" + activeDMTarget.uid + "/" + threadId).set({
              withUid: currentUserId,
              withUsername: currentUsername || currentUserId,
              lastMsg: text,
              lastTime: now,
              unread: 1
            })
          ]);
          // Prevent our inbox listener from considering this local update as a new incoming message
          dmLastUpdateTimeByThread[threadId] = now;
          dmInput.value = "";
          dmSendBtn.disabled = false;
        } catch (err) {
          console.error("[dm] send error", err);
          dmError.textContent = err.message || "Failed to send DM.";
          dmSendBtn.disabled = false;
        }
      });

      async function blockActiveDmUser() {
        if (!currentUserId || !activeDMTarget?.uid) {
          dmError.textContent = "No conversation selected.";
          return;
        }
        const targetUid = activeDMTarget.uid;
        const targetUsername = activeDMTarget.username || "this user";
        if (!confirm(`Block ${targetUsername}?`)) return;

        try {
          await db.ref("blockedUsers/" + currentUserId + "/" + targetUid).set({
            blockedAt: firebase.database.ServerValue.TIMESTAMP,
            blockedUsername: targetUsername,
          });

          await loadBlockedUsersCache();
          dmError.textContent = `${targetUsername} blocked. You will not receive their DMs.`;
          closeDmModal();
        } catch (err) {
          console.error("[dm] block error", err);
          dmError.textContent = err.message || "Failed to block user.";
        }
      }

      dmBlockBtn.addEventListener("click", blockActiveDmUser);

      function applyMessageSize(size, persist = true) {
        const messagesContainer = document.getElementById("messages");
        messagesContainer.classList.remove("msg-small", "msg-large");
        if (size === "small") messagesContainer.classList.add("msg-small");
        if (size === "large") messagesContainer.classList.add("msg-large");
        if (persist) saveUserSetting("messageSize", size);
        console.log("[settings] message size set to", size);
      }

      function setActiveSizeButton(size) {
        document.querySelectorAll(".size-btn").forEach((b) => {
          const isActive = b.getAttribute("data-size") === size;
          b.classList.remove("active", "bg-sky-600", "hover:bg-sky-700", "text-white");
          b.classList.add("bg-slate-700", "hover:bg-slate-600", "text-slate-200");
          if (isActive) {
            b.classList.remove("bg-slate-700", "hover:bg-slate-600", "text-slate-200");
            b.classList.add("active", "bg-sky-600", "hover:bg-sky-700", "text-white");
          }
        });
      }

      // Message size buttons
      document.querySelectorAll(".size-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const size = btn.getAttribute("data-size");
          setActiveSizeButton(size);
          applyMessageSize(size, true);
        });
      });

      // Theme buttons with light mode implementation
      function applyTheme(theme, persist = true) {
        if (theme === "light") {
          document.body.classList.add("light-mode");
        } else {
          document.body.classList.remove("light-mode");
        }
        if (persist) saveUserSetting("theme", theme);
        console.log("[settings] theme applied:", theme);
      }

      function setActiveThemeButton(theme) {
        document.querySelectorAll(".theme-btn").forEach((b) => {
          const isActive = b.getAttribute("data-theme") === theme;
          b.classList.remove("active", "bg-sky-600", "hover:bg-sky-700", "text-white");
          b.classList.add("bg-slate-700", "hover:bg-slate-600", "text-slate-200");
          if (isActive) {
            b.classList.remove("bg-slate-700", "hover:bg-slate-600", "text-slate-200");
            b.classList.add("active", "bg-sky-600", "hover:bg-sky-700", "text-white");
          }
        });
      }

      document.querySelectorAll(".theme-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const theme = btn.getAttribute("data-theme");
          setActiveThemeButton(theme);
          applyTheme(theme);
        });
      });

      // Upload profile picture
      uploadPicBtn.addEventListener("click", () => {
        profilePicInput.click();
      });

      // Cloudinary upload function
      async function uploadToCloudinary(file) {
        const data = new FormData();
        data.append("file", file);
        data.append("upload_preset", "chat_upload");

        const res = await fetch("https://api.cloudinary.com/v1_1/dyi0oy0ce/upload", {
          method: "POST",
          body: data
        });

        const json = await res.json();
        
        // Check for Cloudinary error
        if (json.error) {
          console.error("[cloudinary] upload error:", json.error);
          throw new Error(json.error.message || "Cloudinary upload failed");
        }
        
        return json;
      }

      async function deleteFromCloudinary(token) {
        await fetch("https://api.cloudinary.com/v1_1/dyi0oy0ce/delete_by_token", {
          method: "POST",
          body: new URLSearchParams({ token })
        });
      }

      profilePicInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          uploadPicBtn.disabled = true;
          uploadPicBtn.textContent = "Uploading...";

          // Delete old profile picture from ImageKit if it exists
          if (currentUserData.profilePicFileId) {
            try {
              console.log("[profile] deleting old profile picture");
              await deleteFromImageKit(currentUserData.profilePicFileId);
            } catch (err) {
              console.warn("[profile] couldn't delete old pic:", err.message);
            }
          }

          // Process file same as chat images (compress if needed)
          const processedFile = await prepareFileForUpload(file);
          const uploadResult = await uploadToImageKit(processedFile);

          // Show preview
          profilePicPreview.innerHTML = "";
          const img = document.createElement("img");
          img.src = uploadResult.url;
          img.className = "h-full w-full object-cover";
          img.onerror = () => {
            console.warn("[profile] failed to load image");
            setDefaultProfileIcon(profilePicPreview, 40);
          };
          profilePicPreview.appendChild(img);
          
          currentUserData.profilePic = uploadResult.url;
          currentUserData.profilePicFileId = uploadResult.fileId;
          currentUserData.profilePicDeleteToken = null;

          // Auto-save profile picture to database (partial update)
          const uid = auth.currentUser?.uid;
          if (uid) {
            try {
              await db.ref().update({
                ["userProfiles/" + uid + "/profilePic"]: uploadResult.url,
                ["userProfiles/" + uid + "/profilePicFileId"]: uploadResult.fileId,
                ["userProfiles/" + uid + "/updatedAt"]: firebase.database.ServerValue.TIMESTAMP,
                ["users/" + uid + "/profilePic"]: uploadResult.url,
                ["users/" + uid + "/profilePicFileId"]: uploadResult.fileId,
              });
              console.log("[profile] picture saved to database");

              // Refresh cache for current user
              const uname = currentUsername;
              if (uname) {
                const cached = profileCache[uname] || { _timestamp: Date.now() };
                profileCache[uname] = {
                  ...cached,
                  profilePic: uploadResult.url,
                  profilePicFileId: uploadResult.fileId,
                  _timestamp: Date.now(),
                };
              }
            } catch (saveErr) {
              console.error("[profile] error saving picture to database:", saveErr);
              showToast("Profile picture saved locally but could not sync to server", "error");
            }
          }

          uploadPicBtn.disabled = false;
          uploadPicBtn.textContent = "Upload Picture";
          
          console.log("[profile] uploaded successfully:", uploadResult.url);
        } catch (err) {
          console.error("[profile] error uploading:", err);
          showToast("Error uploading image", "error");
          uploadPicBtn.disabled = false;
          uploadPicBtn.textContent = "Upload Picture";
          profilePicInput.value = "";
        }
      });

      // Upload profile banner
      const profileBannerInput = document.getElementById("profileBannerInput");
      const profileBannerPreview = document.getElementById("profileBannerPreview");

      profileBannerPreview.addEventListener("click", () => {
        profileBannerInput.click();
      });

      profileBannerInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          // Delete old banner if exists
          if (currentUserData.profileBannerFileId) {
            try {
              console.log("[profile] deleting old banner");
              await deleteFromImageKit(currentUserData.profileBannerFileId);
            } catch (err) {
              console.warn("[profile] couldn't delete old banner:", err.message);
            }
          }

          // Process and upload banner same as profile pic
          const processedFile = await prepareFileForUpload(file);
          const uploadResult = await uploadToImageKit(processedFile);

          // Show preview
          profileBannerPreview.style.backgroundImage = `url('${uploadResult.url}')`;
          profileBannerPreview.style.backgroundSize = "cover";
          profileBannerPreview.style.backgroundPosition = "center";
          profileBannerPreview.innerHTML = "";

          currentUserData.profileBanner = uploadResult.url;
          currentUserData.profileBannerFileId = uploadResult.fileId;

          // Auto-save banner to database (partial update)
          const uid = auth.currentUser?.uid;
          if (uid) {
            try {
              await db.ref().update({
                ["userProfiles/" + uid + "/profileBanner"]: uploadResult.url,
                ["userProfiles/" + uid + "/profileBannerFileId"]: uploadResult.fileId,
                ["userProfiles/" + uid + "/updatedAt"]: firebase.database.ServerValue.TIMESTAMP,
                ["users/" + uid + "/profileBanner"]: uploadResult.url,
                ["users/" + uid + "/profileBannerFileId"]: uploadResult.fileId,
              });
              console.log("[profile] banner saved to database");

              // Refresh cache for current user so other views show new banner immediately
              const uname = currentUsername;
              if (uname) {
                const cached = profileCache[uname] || { _timestamp: Date.now() };
                profileCache[uname] = {
                  ...cached,
                  profileBanner: uploadResult.url,
                  profileBannerFileId: uploadResult.fileId,
                  _timestamp: Date.now(),
                };
              }
            } catch (saveErr) {
              console.error("[profile] error saving banner to database:", saveErr);
              showToast("Banner saved locally but could not sync to server", "error");
            }
          }

          console.log("[profile] banner uploaded successfully:", uploadResult.url);
        } catch (err) {
          console.error("[profile] error uploading banner:", err);
          showToast("Error uploading banner", "error");
          profileBannerInput.value = "";
        }
      });

      // Load user profile data (merge userProfiles + users so banner/pic stay in sync)
      async function loadUserProfile() {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          console.error("[profile] no user ID");
          return;
        }

        profileUsername.value = currentUsername || "";

        try {
          const [profileSnap, userSnap] = await Promise.all([
            db.ref("userProfiles/" + uid).once("value"),
            db.ref("users/" + uid).once("value"),
          ]);

          const profileData = profileSnap.val() || {};
          const userData = userSnap.val() || {};
          const data = { ...userData, ...profileData };

          profileBio.value = data.bio || "";

          // Banner
          if (data.profileBanner) {
            profileBannerPreview.style.backgroundImage = `url('${data.profileBanner}')`;
            profileBannerPreview.style.backgroundSize = "cover";
            profileBannerPreview.style.backgroundPosition = "center";
            profileBannerPreview.innerHTML = "";
          } else {
            profileBannerPreview.style.backgroundImage = "";
            profileBannerPreview.innerHTML = `
              <span class="group-hover:hidden">Click to add banner</span>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hidden group-hover:block absolute group-hover:opacity-60">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <path d="M21 15l-5-5L5 21"></path>
              </svg>
            `;
          }

          // Picture
          if (data.profilePic) {
            try {
              profilePicPreview.innerHTML = "";
              const img = document.createElement("img");
              img.src = data.profilePic;
              img.className = "h-full w-full object-cover";
              img.onerror = () => {
                console.warn("[profile] failed to load image");
                setDefaultProfileIcon(profilePicPreview, 40);
              };
              profilePicPreview.appendChild(img);
            } catch (e) {
              console.warn("[profile] error loading image:", e);
              setDefaultProfileIcon(profilePicPreview, 40);
            }
          } else {
            setDefaultProfileIcon(profilePicPreview, 40);
          }

          currentUserData = { ...data };
          originalProfilePic = data.profilePic || null;
          originalProfilePicDeleteToken = data.profilePicDeleteToken || null;
          console.log("[profile] loaded successfully");
        } catch (err) {
          console.error("[profile] error loading profile:", err);
          showToast("Could not load profile", "error");
          profileBio.value = "";
          currentUserData = {};
        }
      }

      // View another user's profile
      async function viewUserProfile(username, options = {}) {
        console.log("[profile] viewing profile for", username);

        const isSelf = username === currentUsername;

        // Reset inline status message
        setFriendRequestStatus("");
        
        // Reset button states immediately
        sendFriendRequestBtn.disabled = false;
        sendFriendRequestBtn.style.background = "";
        sendFriendRequestBtn.textContent = "Add Friend";
        blockUserBtn.disabled = false;
        blockUserBtn.style.background = "";
        blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
        delete blockUserBtn.dataset.action;
        delete blockUserBtn.dataset.targetUid;

        // Hide friend/block actions when viewing own profile
        if (isSelf) {
          sendFriendRequestBtn.disabled = true;
          sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
          sendFriendRequestBtn.textContent = "This is you";
          blockUserBtn.disabled = true;
          blockUserBtn.style.background = "rgb(100, 116, 139)";
          blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
        }

        // For other users, show custom read-only view
        viewProfileName.textContent = username || "-";
        viewProfileBio.textContent = "Loading...";
        viewProfilePic.innerHTML = generateDefaultAvatar(username);
        
        // Update online status indicator
        const onlineStatusEl = document.getElementById('viewProfileOnlineStatus');
        if (onlineStatusEl) {
          // Will be updated once we have the UID
          onlineStatusEl.className = 'h-3 w-3 rounded-full bg-slate-500';
          onlineStatusEl.title = 'Offline';
        }

        // Reset banner to default gradient (remove inline override and any GIF img)
        const viewProfileBanner = document.getElementById("viewProfileBanner");
        viewProfileBanner.style.backgroundImage = "";
        // Remove any existing banner GIF img element
        const existingBannerImg = viewProfileBanner.querySelector('img.banner-gif');
        if (existingBannerImg) existingBannerImg.remove();

        // Track current URLs to avoid unnecessary re-renders (fixes GIF flickering)
        let currentBannerUrl = null;
        let currentPicUrl = null;

        // Fetch user profile (non-blocking)
        setTimeout(() => {
          clearProfileListeners();

          const renderProfile = (profile) => {
            // Banner - use <img> for GIFs, CSS background for static
            const bannerUrl = profile?.profileBanner || null;
            if (bannerUrl !== currentBannerUrl) {
              currentBannerUrl = bannerUrl;
              if (bannerUrl) {
                if (isGifUrl(bannerUrl)) {
                  // Use an img element for GIF banners
                  viewProfileBanner.style.backgroundImage = "";
                  let bannerImg = viewProfileBanner.querySelector('img.banner-gif');
                  if (!bannerImg) {
                    bannerImg = document.createElement('img');
                    bannerImg.className = 'banner-gif absolute inset-0 w-full h-full object-cover';
                    bannerImg.style.zIndex = '0';
                    bannerImg.crossOrigin = 'anonymous';
                    viewProfileBanner.style.position = 'relative';
                    viewProfileBanner.appendChild(bannerImg);
                  }
                  bannerImg.src = bannerUrl;
                } else {
                  // Static image - use CSS background
                  const existingGif = viewProfileBanner.querySelector('img.banner-gif');
                  if (existingGif) existingGif.remove();
                  viewProfileBanner.style.backgroundImage = `url('${bannerUrl}')`;
                  viewProfileBanner.style.backgroundSize = "cover";
                  viewProfileBanner.style.backgroundPosition = "center";
                }
              } else {
                viewProfileBanner.style.backgroundImage = "";
                const existingGif = viewProfileBanner.querySelector('img.banner-gif');
                if (existingGif) existingGif.remove();
              }
            }

            // Picture - only update if URL changed (fixes GIF flickering)
            const picUrl = profile?.profilePic || null;
            if (picUrl !== currentPicUrl) {
              currentPicUrl = picUrl;
              if (picUrl) {
                try {
                  const img = document.createElement("img");
                  img.className = "h-full w-full object-cover rounded-full";
                  img.crossOrigin = "anonymous";
                  img.onerror = () => {
                    console.debug("[viewProfile] img load error, showing default");
                    setDefaultProfileIcon(viewProfilePic, 64);
                  };
                  img.onload = () => {
                    viewProfilePic.innerHTML = "";
                    viewProfilePic.appendChild(img);
                  };
                  img.src = picUrl;
                } catch (e) {
                  console.debug("[viewProfile] error creating img", e);
                  setDefaultProfileIcon(viewProfilePic, 64);
                }
              } else {
                viewProfilePic.innerHTML = generateDefaultAvatar(username);
              }
            }

            viewProfileBio.textContent = profile?.bio || "No bio yet";
          };

          fetchUserProfile(username)
            .then((profile) => {
              renderProfile(profile);

              const uid = profile?.uid;
              if (uid) {
                // Update online status now that we have UID
                const onlineStatusEl = document.getElementById('viewProfileOnlineStatus');
                if (onlineStatusEl) {
                  const isOnline = isUserOnline(uid);
                  onlineStatusEl.className = `h-3 w-3 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`;
                  onlineStatusEl.title = isOnline ? 'Online' : 'Offline';
                }
                
                const refs = [
                  db.ref("userProfiles/" + uid),
                  db.ref("users/" + uid),
                ];

                refs.forEach((ref) => {
                  const cb = (snap) => {
                    const data = snap.val() || {};
                    const merged = {
                      ...(profileCache[username] || {}),
                      ...data,
                      uid,
                      _timestamp: Date.now(),
                    };
                    profileCache[username] = merged;
                    renderProfile(merged);
                  };
                  ref.on("value", cb);
                  activeProfileListeners.push({ ref, cb });
                });
              }
            })
            .catch(() => {
              viewProfileBio.textContent = "No bio yet";
            });
        }, 0);

        if (!isSelf) {
          // Check if you blocked them first (shows unblock button)
          await checkIfBlocked(username);
          
          // Then check friendship status and detect if they blocked you
          await checkFriendshipStatus(username);

          // Show admin actions if you're an admin
          showProfileAdminActions(username);
        } else {
          // Hide admin controls when viewing self to reduce clutter
          const profileAdminActions = document.getElementById("profileAdminActions");
          profileAdminActions.classList.add("hidden");
        }

        if (!options.silent) {
          viewProfileModal.classList.remove("modal-closed");
          viewProfileModal.classList.add("modal-open");
        }
      }

      // Show/hide admin actions in profile based on admin status
      async function showProfileAdminActions(targetUsername) {
        const profileAdminActions = document.getElementById("profileAdminActions");
        const profileBanBtn = document.getElementById("profileBanBtn");
        const profileMuteBtn = document.getElementById("profileMuteBtn");
        const profileWarnBtn = document.getElementById("profileWarnBtn");
        const profileClearHwBanBtn = document.getElementById("profileClearHwBanBtn");
        const now = Date.now();
        const ownerUid = "u5yKqiZvioWuBGcGK3SWUBpUVrc2";
        const staffUid = "6n8hjmrUxhMHskX4BG8Ik9boMqa2";

        console.log("[admin-profile] isAdmin:", isAdmin, "targetUsername:", targetUsername);

        if (!isAdmin) {
          profileAdminActions.classList.add("hidden");
          return;
        }

        // Get target UID
        const snap = await db.ref("users").orderByChild("username").equalTo(targetUsername).once("value");
        if (!snap.exists()) {
          console.log("[admin-profile] target user not found");
          profileAdminActions.classList.add("hidden");
          return;
        }

        const targetUid = Object.keys(snap.val())[0];
        console.log("[admin-profile] targetUid:", targetUid, "currentUserId:", currentUserId);

        // Don't show admin actions for yourself
        if (targetUid === currentUserId) {
          profileAdminActions.classList.add("hidden");
          return;
        }

        // Protect owner from moderation actions
        if (targetUid === ownerUid) {
          profileAdminActions.classList.add("hidden");
          return;
        }

        // Staff cannot moderate other staff (only owner can)
        if (currentUserId === staffUid && targetUid === staffUid) {
          profileAdminActions.classList.add("hidden");
          return;
        }

        // Show admin actions
        console.log("[admin-profile] showing admin actions for", targetUsername);
        profileAdminActions.classList.remove("hidden");

        // Check ban status
        const banSnap = await db.ref("bannedUsers/" + targetUid).once("value");
        const banData = banSnap.val();
        const banExpired = banData && banData.until && banData.until <= now;
        if (banExpired) {
          clearExpiredBan(targetUid, banData);
        }
        const isBannedNow = !!(banData && (!banData.until || banData.until === 9999999999999 || banData.until > now));

        // Check mute status
        const muteSnap = await db.ref("mutedUsers/" + targetUid).once("value");
        const muteData = muteSnap.val();
        const isMutedNow = muteData && muteData.until && muteData.until > Date.now();
        console.log("[admin-profile] isMutedNow:", isMutedNow, "muteData:", muteData);

        // Set up button handlers
        profileBanBtn.textContent = isBannedNow ? " Unban" : " Ban";
        profileBanBtn.onclick = async () => {
          const latestBanSnap = await db.ref("bannedUsers/" + targetUid).once("value");
          const latestBan = latestBanSnap.val();
          const latestNow = Date.now();
          const latestActive = !!(latestBan && (!latestBan.until || latestBan.until === 9999999999999 || latestBan.until > latestNow));
          if (latestActive) {
            await unbanUser(targetUid);
            profileBanBtn.textContent = " Ban";
          } else {
            showBanReasonModal(targetUid);
          }
        };

        profileMuteBtn.onclick = () => {
          console.log("[admin-profile] mute button clicked, isMutedNow:", isMutedNow);
          if (isMutedNow) {
            // Unmute the user
            console.log("[admin-profile] unMuting user:", targetUid);
            db.ref("mutedUsers/" + targetUid).remove().then(() => {
              console.log("[admin-profile] user unmuted successfully");
              profileMuteBtn.textContent = " Mute";
            }).catch((err) => {
              console.error("[mute] failed to unmute user", err);
            });
          } else {
            // Show mute modal
            showMuteReasonModal(targetUid);
          }
        };

        // Update button text based on mute status
        profileMuteBtn.textContent = isMutedNow ? " Unmute" : " Mute";

        profileWarnBtn.onclick = () => {
          showWarnReasonModal(targetUid);
        };
      }

      // Check if you're already friends and update the button
      async function checkFriendshipStatus(targetUsername) {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        try {
          // Lookup target UID
          const snap = await db.ref("users").orderByChild("username").equalTo(targetUsername).once("value");
          if (!snap.exists()) {
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          const targetUid = Object.keys(snap.val())[0];
          // Store for later use in button handlers
          sendFriendRequestBtn.dataset.targetUid = targetUid;
          sendFriendRequestBtn.dataset.targetUsername = targetUsername;

          // Check if you blocked them
          const youBlockedThem = await db.ref("blockedUsers/" + uid + "/" + targetUid).once("value");
          if (youBlockedThem.exists()) {
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
            sendFriendRequestBtn.textContent = "Blocked";
            setFriendRequestStatus("You have blocked this user.", "warn");
            return;
          }
          
          // Check target's privacy settings
          const privacySnap = await db.ref("userPrivacy/" + targetUid).once("value");
          const privacy = privacySnap.val() || {};
          
          if (privacy.allowFriendRequests === false) {
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
            sendFriendRequestBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="inline mr-1"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Requests Disabled';
            setFriendRequestStatus("This user has disabled friend requests.", "warn");
            return;
          }

          // Check if already friends
          const friendsSnap = await db.ref("friends/" + uid + "/" + targetUid).once("value");
          if (friendsSnap.exists()) {
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.style.background = "rgb(220, 38, 38)";
            sendFriendRequestBtn.textContent = "Unfriend";
            sendFriendRequestBtn.dataset.action = "unfriend";
            return;
          }

          // Check if request already sent
          const sentReqSnap = await db.ref("friendRequests/" + targetUid + "/incoming/" + uid).once("value");
          if (sentReqSnap.exists()) {
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
            sendFriendRequestBtn.textContent = "â³ Pending";
            setFriendRequestStatus("Friend request already sent.", "info");
            return;
          }

          // Check if they sent you a request
          const reverseReqSnap = await db.ref("friendRequests/" + uid + "/incoming/" + targetUid).once("value");
          if (reverseReqSnap.exists()) {
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
            sendFriendRequestBtn.textContent = "â†© Incoming";
            setFriendRequestStatus("They sent you a friend request. Check your requests.", "info");
            return;
          }

          // Not blocked, not friends - enable add button
          sendFriendRequestBtn.disabled = false;
          sendFriendRequestBtn.style.background = "";
          sendFriendRequestBtn.textContent = "Add Friend";
          setFriendRequestStatus("");
        } catch (err) {
          console.error("[profile] error checking friendship status:", err);
          sendFriendRequestBtn.disabled = false;
          sendFriendRequestBtn.textContent = "Add Friend";
        }
      }

      // Generate default avatar with initials
      function generateDefaultAvatar(username) {
        const initial = (username || "?").charAt(0).toUpperCase();
        const colors = [
          "from-red-500 to-red-600",
          "from-blue-500 to-blue-600",
          "from-purple-500 to-purple-600",
          "from-green-500 to-green-600",
          "from-pink-500 to-pink-600",
          "from-indigo-500 to-indigo-600",
          "from-cyan-500 to-cyan-600",
          "from-amber-500 to-amber-600"
        ];
        const colorIdx = (username.charCodeAt(0) || 0) % colors.length;
        const color = colors[colorIdx];
        return `<div class="h-full w-full rounded-full overflow-hidden bg-gradient-to-br ${color} flex items-center justify-center text-4xl font-bold text-white">${initial}</div>`;
      }

      // Helper to set default profile picture SVG
      function setDefaultProfileIcon(element, size = 40) {
        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        element.innerHTML = svg;
      }

      // Reset profile modal to edit mode when closing
      profileCloseBtn.addEventListener("click", () => {
        profileModal.classList.remove("modal-open");
        profileModal.classList.add("modal-closed");
        // Reset to edit mode
        setTimeout(() => {
          profileBio.disabled = false;
          profileBio.style.opacity = "1";
          saveProfileBtn.style.display = "block";
          uploadPicBtn.style.display = "block";
        }, 100);
      });

      profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) {
          profileModal.classList.remove("modal-open");
          profileModal.classList.add("modal-closed");
          // Reset to edit mode
          setTimeout(() => {
            profileBio.disabled = false;
            profileBio.style.opacity = "1";
            saveProfileBtn.style.display = "block";
            uploadPicBtn.style.display = "block";
          }, 100);
        }
      });

      // Close view profile modal
      viewProfileCloseBtn.addEventListener("click", () => {
        viewProfileModal.classList.remove("modal-open");
        viewProfileModal.classList.add("modal-closed");
        clearProfileListeners();
      });

      viewProfileCloseBtn2.addEventListener("click", () => {
        viewProfileModal.classList.remove("modal-open");
        viewProfileModal.classList.add("modal-closed");
        clearProfileListeners();
      });

      viewProfileModal.addEventListener("click", (e) => {
        if (e.target === viewProfileModal) {
          viewProfileModal.classList.remove("modal-open");
          viewProfileModal.classList.add("modal-closed");
          clearProfileListeners();
        }
      });

      // Save profile
      saveProfileBtn.addEventListener("click", async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          console.error("[profile] not logged in");
          showToast("Not logged in. Please refresh and log in again.", "error");
          return;
        }

        const newUsername = profileUsername.value.trim();
        const originalText = saveProfileBtn.textContent;
        const isAiBotUser = uid === 'aEY7gNeuGcfBErxOHNEQYFzvhpp2';
        
        // ===== COMPREHENSIVE USERNAME VALIDATION =====
        try {
          // Validate username is not empty
          if (!newUsername) {
            throw new Error("Username cannot be empty");
          }

          // Skip validation for AI bot user
          if (!isAiBotUser) {
            // Validate username length (2-12 characters)
            if (newUsername.length < 2) {
              throw new Error("Username too short (minimum 2 characters)");
            }

            if (newUsername.length > 12) {
              throw new Error("Username too long (maximum 12 characters)");
            }

            // Validate character set: only letters, numbers, underscore, dash
            if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
              throw new Error("Username can only contain letters, numbers, underscore (_) and dash (-)");
            }

            // Validate no leading or trailing special characters
              if (/^[_-]|[_-]$/.test(newUsername)) {
              throw new Error("Username cannot start or end with _ or -");
            }

            // Basic bad-word filter for usernames
            if (badWordPattern.test(newUsername)) {
              throw new Error("Username not allowed");
            }

            // Local blocked usernames list (client-side editable)
            if (isLocallyBlockedUsername(newUsername)) {
              throw new Error("Username not allowed");
            }
          } // end !isAiBotUser

          // Validate bio length
          if (profileBio.value.length > 150) {
            throw new Error("Bio is too long (maximum 150 characters)");
          }

          const usernameChanged = newUsername.toLowerCase() !== currentUsername.toLowerCase();
          const oldUsername = currentUsername;

          if (usernameChanged) {
            // Show loading state
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = "Checking username...";
            
            console.log("[profile] checking if username is taken:", newUsername);

            // Case-insensitive duplicate check
            const snapshot = await db.ref("users")
              .orderByChild("username")
              .equalTo(newUsername)
              .once("value");

            const isTaken = snapshot.exists() && Object.entries(snapshot.val()).some(([existingUid, val]) => {
              const existingUsername = (val?.username || "").toLowerCase();
              return existingUsername === newUsername.toLowerCase() && existingUid !== uid;
            });

            if (isTaken) {
              throw new Error("Username is already taken. Please choose another.");
            }

            // Username is available, proceed with update
            saveProfileBtn.textContent = "Saving...";

            // Update both profile and username paths
            const updates = {};
            updates["userProfiles/" + uid] = {
              username: newUsername,
              bio: profileBio.value.trim(),
              profilePic: currentUserData.profilePic || null,
              profilePicFileId: currentUserData.profilePicFileId || null,
              profileBanner: currentUserData.profileBanner || null,
              profileBannerFileId: currentUserData.profileBannerFileId || null,
              profilePicDeleteToken: currentUserData.profilePicDeleteToken || null,
              createdAt: currentUserData.createdAt || firebase.database.ServerValue.TIMESTAMP,
              updatedAt: firebase.database.ServerValue.TIMESTAMP,
            };
            updates["users/" + uid + "/username"] = newUsername;
            updates["users/" + uid + "/profilePic"] = currentUserData.profilePic || null;
            updates["users/" + uid + "/profilePicFileId"] = currentUserData.profilePicFileId || null;
            updates["users/" + uid + "/profileBanner"] = currentUserData.profileBanner || null;
            updates["users/" + uid + "/profileBannerFileId"] = currentUserData.profileBannerFileId || null;

            await db.ref().update(updates);

            // Update all user's messages with new username
            try {
              const messagesSnapshot = await db.ref("messages")
                .orderByChild("userId")
                .equalTo(uid)
                .once("value");
              
              const messageUpdates = {};
              messagesSnapshot.forEach((child) => {
                messageUpdates["messages/" + child.key + "/user"] = newUsername;
              });
              
              if (Object.keys(messageUpdates).length > 0) {
                await db.ref().update(messageUpdates);
                console.log("[profile] updated", Object.keys(messageUpdates).length, "messages with new username");
              }
            } catch (e) {
              console.warn("[profile] error updating messages:", e);
            }

            // Old ImageKit images will auto-expire, no manual deletion needed
            originalProfilePic = currentUserData.profilePic || originalProfilePic;
            originalProfilePicDeleteToken = null; // Not used with ImageKit

            console.log("[profile] saved successfully with new username:", newUsername);
            currentUsername = newUsername;
            updateChatUserLabel(newUsername);
            
            // Clear profile cache so next load gets fresh data
            profileCache[newUsername] = null;
            if (oldUsername && oldUsername !== newUsername) {
              delete profileCache[oldUsername];
            }
            
            // Success feedback
            saveProfileBtn.textContent = "✓ Username Updated!";
            saveProfileBtn.style.background = "rgb(34, 197, 94)"; // green
            setTimeout(() => {
              saveProfileBtn.textContent = originalText;
              saveProfileBtn.style.background = "";
              saveProfileBtn.disabled = false;
            }, 2500);

          } else {
            // Username didn't change, just save bio and profile pic
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = "Saving...";

            const userData = {
              username: currentUsername,
              bio: profileBio.value.trim(),
              profilePic: currentUserData.profilePic || null,
              profilePicFileId: currentUserData.profilePicFileId || null,
              profileBanner: currentUserData.profileBanner || null,
              profileBannerFileId: currentUserData.profileBannerFileId || null,
              profilePicDeleteToken: currentUserData.profilePicDeleteToken || null,
              createdAt: currentUserData.createdAt || firebase.database.ServerValue.TIMESTAMP,
              updatedAt: firebase.database.ServerValue.TIMESTAMP,
            };

            const updates = {
              ["userProfiles/" + uid]: userData,
              ["users/" + uid + "/profilePic"]: currentUserData.profilePic || null,
              ["users/" + uid + "/profilePicFileId"]: currentUserData.profilePicFileId || null,
              ["users/" + uid + "/profileBanner"]: currentUserData.profileBanner || null,
              ["users/" + uid + "/profileBannerFileId"]: currentUserData.profileBannerFileId || null,
            };

            await db.ref().update(updates);

            // Old ImageKit images will auto-expire, no manual deletion needed
            originalProfilePic = currentUserData.profilePic || originalProfilePic;
            originalProfilePicDeleteToken = null; // Not used with ImageKit

            console.log("[profile] saved successfully (no username change)");
            
            // Success feedback
            saveProfileBtn.textContent = "Profile Saved!";
            saveProfileBtn.style.background = "rgb(34, 197, 94)"; // green
            setTimeout(() => {
              saveProfileBtn.textContent = originalText;
              saveProfileBtn.style.background = "";
              saveProfileBtn.disabled = false;
            }, 2500);
          }

        } catch (err) {
          console.error("[profile] validation/save error:", err);
          
          // Determine button text based on error type
          let buttonText = "Error";
          if (err.message?.includes("taken")) {
            buttonText = "Username Taken";
          } else if (err.message?.includes("too short")) {
            buttonText = "Too Short";
          } else if (err.message?.includes("too long")) {
            buttonText = "Too Long";
          } else if (err.message?.includes("contain")) {
            buttonText = "Invalid Chars";
          } else if (err.message?.includes("start or end")) {
            buttonText = "Invalid Format";
          } else if (err.message?.includes("permission")) {
            buttonText = "Permission Denied";
          } else if (err.message?.includes("network")) {
            buttonText = "Network Error";
          }

          // Show error state
          saveProfileBtn.textContent = buttonText;
          saveProfileBtn.style.background = "rgb(239, 68, 68)"; // red
          showToast(err.message || "Error saving profile", "error");

          setTimeout(() => {
            saveProfileBtn.textContent = originalText;
            saveProfileBtn.style.background = "";
            saveProfileBtn.disabled = false;
          }, 1500);
        }
      });

      // ===== FRIEND REQUESTS =====
      let currentViewingUsername = null;

      const friendRequestsModal = document.getElementById("friendRequestsModal");
      const friendRequestsCloseBtn = document.getElementById("friendRequestsCloseBtn");
      const friendRequestsList = document.getElementById("friendRequestsList");
      const noFriendRequestsMsg = document.getElementById("noFriendRequestsMsg");
      const sendFriendRequestBtn = document.getElementById("sendFriendRequestBtn");
      const friendRequestStatus = document.getElementById("friendRequestStatus");

      function setFriendRequestStatus(text, variant = "info") {
        if (!friendRequestStatus) return;
        if (!text) {
          friendRequestStatus.classList.add("hidden");
          friendRequestStatus.textContent = "";
          return;
        }

        const variants = {
          info: "text-slate-200 bg-slate-800 border-slate-700",
          success: "text-emerald-100 bg-emerald-900/40 border-emerald-700/60",
          warn: "text-amber-100 bg-amber-900/30 border-amber-700/60",
          error: "text-rose-100 bg-rose-900/40 border-rose-700/60",
        };

        // Reset classes then apply
        friendRequestStatus.className = "text-xs rounded-lg px-3 py-2 mb-3 text-left border " + (variants[variant] || variants.info);
        friendRequestStatus.textContent = text;
        friendRequestStatus.classList.remove("hidden");
      }

      friendRequestsCloseBtn.addEventListener("click", () => {
        friendRequestsModal.classList.remove("modal-open");
        friendRequestsModal.classList.add("modal-closed");
      });

      friendRequestsModal.addEventListener("click", (e) => {
        if (e.target === friendRequestsModal) {
          friendRequestsModal.classList.remove("modal-open");
          friendRequestsModal.classList.add("modal-closed");
        }
      });

      // Load and display friend requests
      async function loadFriendRequests() {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          logDetailedError("loadFriendRequests", new Error("Not logged in"));
          return;
        }

        try {
          console.log("[friends] loading requests for uid:", uid);
          const snap = await db.ref("friendRequests/" + uid + "/incoming").once("value");
          const requests = snap.val() || {};
          const requestArray = Object.entries(requests).map(([fromUid, data]) => ({
            fromUid,
            timestamp: data.timestamp
          }));

          console.log("[friends] loaded", requestArray.length, "requests");

          friendRequestsList.innerHTML = "";

          if (requestArray.length === 0) {
            noFriendRequestsMsg.style.display = "block";
            sidePanelFriendBadge.classList.add("hidden");
            sidePanelFriendBadge.textContent = "0";
          } else {
            noFriendRequestsMsg.style.display = "none";
            sidePanelFriendBadge.classList.remove("hidden");
            sidePanelFriendBadge.textContent = requestArray.length;

            // Load usernames for each request
            for (const req of requestArray) {
              const div = document.createElement("div");
              div.className = "flex items-center justify-between p-3 bg-slate-700/50 rounded-lg";
              div.innerHTML = `
                <span class="text-sm font-medium text-slate-100">Loading...</span>
                <div class="flex gap-2">
                  <button class="accept-btn px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-colors" data-from-uid="${req.fromUid}">
                    Accept
                  </button>
                  <button class="reject-btn px-3 py-1 bg-slate-600 hover:bg-slate-500 text-slate-100 text-xs rounded-lg transition-colors" data-from-uid="${req.fromUid}">
                    Reject
                  </button>
                </div>
              `;
              friendRequestsList.appendChild(div);
              
              // Fetch username from UID
              try {
                const userSnap = await db.ref("users/" + req.fromUid + "/username").once("value");
                const fromUsername = userSnap.val() || "Unknown User";
                div.querySelector("span").textContent = fromUsername;
              } catch (err) {
                console.error("[friends] error loading username for:", req.fromUid, err);
                div.querySelector("span").textContent = "Unknown User";
              }
            }

            // Add event listeners
            friendRequestsList.querySelectorAll(".accept-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const fromUid = btn.dataset.fromUid;
                console.log("[friends] accept button clicked for:", fromUid);
                acceptFriendRequest(fromUid);
              });
            });

            friendRequestsList.querySelectorAll(".reject-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const fromUid = btn.dataset.fromUid;
                console.log("[friends] reject button clicked for:", fromUid);
                rejectFriendRequest(fromUid);
              });
            });
          }
        } catch (err) {
          logDetailedError("loadFriendRequests", err, { uid });
          showToast("Error loading requests", "error");
        }
      }

      // Send friend request
      sendFriendRequestBtn.addEventListener("click", async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          logDetailedError("sendFriendRequest", new Error("Not logged in"));
          setFriendRequestStatus("Not logged in", "error");
          return;
        }
        
        // Check if this is an unfriend action
        if (sendFriendRequestBtn.dataset.action === "unfriend") {
          const targetUid = sendFriendRequestBtn.dataset.targetUid;
          const targetUsername = sendFriendRequestBtn.dataset.targetUsername;
          
          if (confirm(`Unfriend ${targetUsername}?`)) {
            try {
              console.log("[friends] unfriending:", targetUsername);
              
              // Remove from both friends lists
              await db.ref("friends/" + uid + "/" + targetUid).remove();
              await db.ref("friends/" + targetUid + "/" + uid).remove();
              
              console.log("[friends] unfriended successfully");
              
              // Reset button
              sendFriendRequestBtn.disabled = false;
              sendFriendRequestBtn.style.background = "";
              sendFriendRequestBtn.textContent = "Add Friend";
              delete sendFriendRequestBtn.dataset.action;
              delete sendFriendRequestBtn.dataset.targetUid;
              delete sendFriendRequestBtn.dataset.targetUsername;
              
              setFriendRequestStatus("Unfriended successfully", "success");
              setTimeout(() => setFriendRequestStatus(""), 2000);
            } catch (err) {
              logDetailedError("unfriend", err, { targetUid, targetUsername });
              setFriendRequestStatus("Error unfriending: " + err.message, "error");
            }
          }
          return;
        }
        
        if (!currentViewingUsername) {
          logDetailedError("sendFriendRequest", new Error("No username selected"));
          setFriendRequestStatus("No profile selected", "error");
          return;
        }

        if (currentViewingUsername === currentUsername) {
          setFriendRequestStatus("You can't send a request to yourself!", "warn");
          return;
        }

        let targetUid = null;
        try {
          console.log("[friends] sending request from:", currentUsername, "to:", currentViewingUsername);
          sendFriendRequestBtn.disabled = true;
          sendFriendRequestBtn.textContent = "Sending...";

          // Get target user's UID from username
          console.log("[friends] looking up target uid for username:", currentViewingUsername);
          const snap = await db.ref("users").orderByChild("username").equalTo(currentViewingUsername).once("value");
          if (!snap.exists()) {
            showToast("User not found", "error");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          targetUid = Object.keys(snap.val())[0];
          console.log("[friends] found target uid:", targetUid);

          // Check target's privacy settings
          console.log("[friends] checking privacy settings for:", targetUid);
          const privacySnap = await db.ref("userPrivacy/" + targetUid).once("value");
          const privacy = privacySnap.val() || {};
          
          if (privacy.allowFriendRequests === false) {
            setFriendRequestStatus("This user has disabled friend requests.", "warn");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }
          console.log("[friends] privacy check passed");

          // Check if you blocked them
          console.log("[friends] checking if you blocked them");
          const youBlockedThem = await db.ref("blockedUsers/" + uid + "/" + targetUid).once("value");
          if (youBlockedThem.exists()) {
            setFriendRequestStatus("You have blocked this user. Unblock them first.", "warn");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          // Check if they blocked you (by trying to read their blocked list - but we can't, so we rely on server rules)
          // The server rules will reject if they blocked you, we just handle the error

          // Check if already friends
          console.log("[friends] checking if already friends");
          const alreadyFriends = await db.ref("friends/" + uid + "/" + targetUid).once("value");
          if (alreadyFriends.exists()) {
            setFriendRequestStatus("You're already friends!", "info");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          // Check if already sent request
          console.log("[friends] checking for existing request at: friendRequests/" + targetUid + "/incoming/" + uid);
          const existingReq = await db.ref("friendRequests/" + targetUid + "/incoming/" + uid).once("value");
          if (existingReq.exists()) {
            setFriendRequestStatus("Friend request already sent!", "info");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          // Check if they already sent you a request (reverse request)
          console.log("[friends] checking for reverse request at: friendRequests/" + uid + "/incoming/" + targetUid);
          const reverseReq = await db.ref("friendRequests/" + uid + "/incoming/" + targetUid).once("value");
          if (reverseReq.exists()) {
            setFriendRequestStatus("They already sent you a friend request. Check your requests.", "info");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          // Send request (do NOT use ensureTargetFriendRequestsIncoming - it causes permission issues)
          console.log("[friends] writing request to: friendRequests/" + targetUid + "/incoming/" + uid);
          await db.ref("friendRequests/" + targetUid + "/incoming/" + uid).set({
            fromUid: uid,
            timestamp: firebase.database.ServerValue.TIMESTAMP
          });

          console.log("[friends] request sent successfully");
          sendFriendRequestBtn.textContent = "✓ Sent!";
          sendFriendRequestBtn.style.background = "rgb(34, 197, 94)";
          
          setFriendRequestStatus("Friend request sent", "success");
          setTimeout(() => {
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            sendFriendRequestBtn.style.background = "";
            setFriendRequestStatus("");
          }, 2000);
        } catch (err) {
          const errorInfo = logDetailedError("sendFriendRequest", err, {
            targetUsername: currentViewingUsername,
            currentUser: currentUsername,
            uid,
            targetUid: targetUid || "unknown"
          });

          let errorMsg = "Error sending request";
          let isBlocked = false;
          
          if (err.message?.includes("permission_denied") || err.code === "PERMISSION_DENIED") {
            // If we got past privacy check and still got permission denied, it's likely a block
            isBlocked = true;
            errorMsg = "You have been blocked by this user.";
            
            // Update button to reflect blocked state
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(185, 28, 28)";
            sendFriendRequestBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="inline mr-1"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>You Have Been Blocked';
          } else if (err.message?.includes("network")) {
            errorMsg = "Network error - check your connection";
          }

          setFriendRequestStatus(errorMsg, isBlocked ? "error" : "error");
          if (!isBlocked) {
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
          }
        }
      });

      // Accept friend request
      async function acceptFriendRequest(fromUid) {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          logDetailedError("acceptFriendRequest", new Error("Not logged in"), { fromUid });
          return;
        }

        try {
          console.log("[friends] accepting request from:", fromUid);

          // Auto-create both users' /friends paths
          console.log("[friends] ensuring /friends paths exist");
          await ensureTargetFriendsList(uid);
          await ensureTargetFriendsList(fromUid);

          console.log("[friends] removing request from:", fromUid);
          // Remove request
          await db.ref("friendRequests/" + uid + "/incoming/" + fromUid).remove();

          console.log("[friends] adding friend:", fromUid);
          // Add to friends list for both users (store UID only)
          await db.ref("friends/" + uid + "/" + fromUid).set({
            addedAt: firebase.database.ServerValue.TIMESTAMP
          });

          await db.ref("friends/" + fromUid + "/" + uid).set({
            addedAt: firebase.database.ServerValue.TIMESTAMP
          });

          console.log("[friends] request accepted successfully");
          loadFriendRequests();
        } catch (err) {
          logDetailedError("acceptFriendRequest", err, { fromUid, currentUid: uid });
          showToast("Error accepting request", "error");
        }
      }

      // Reject friend request
      async function rejectFriendRequest(fromUid) {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          logDetailedError("rejectFriendRequest", new Error("Not logged in"), { fromUid });
          return;
        }

        try {
          console.log("[friends] rejecting request from:", fromUid);
          await db.ref("friendRequests/" + uid + "/incoming/" + fromUid).remove();
          console.log("[friends] request rejected successfully");
          loadFriendRequests();
        } catch (err) {
          logDetailedError("rejectFriendRequest", err, { fromUid, currentUid: uid });
          showToast("Error rejecting request", "error");
        }
      }

      // Update viewUserProfile to track username
      const originalViewUserProfile = window.viewUserProfile;
      window.viewUserProfile = function(username, ...args) {
        currentViewingUsername = username;
        return originalViewUserProfile.call(this, username, ...args);
      };

      // Current friends filter state
      let friendsFilterOnline = false;
      
      // Load and display friends list
      async function loadFriendsList(filterOnlineOnly = false) {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          logDetailedError("loadFriendsList", new Error("Not logged in"));
          return;
        }

        try {
          console.log("[friends] loading friends for uid:", uid);
          const snap = await db.ref("friends/" + uid).once("value");
          
          const friendsList = document.getElementById("friendsList");
          const noFriendsMsg = document.getElementById("noFriendsMsg");
          friendsList.innerHTML = "";

          if (!snap.exists()) {
            console.log("[friends] no friends found");
            noFriendsMsg.style.display = "block";
            return;
          }

          const friends = snap.val();
          const friendCount = Object.keys(friends).length;
          console.log("[friends] loaded", friendCount, "friends");

          if (friendCount === 0) {
            noFriendsMsg.style.display = "block";
            return;
          }

          noFriendsMsg.style.display = "none";
          let visibleCount = 0;

          for (const [friendUid, friendData] of Object.entries(friends)) {
            // Check if you blocked them - skip if blocked
            const youBlockedThem = await db.ref("blockedUsers/" + uid + "/" + friendUid).once("value");
            
            if (youBlockedThem.exists()) {
              console.log("[friends] skipping blocked user:", friendUid);
              continue;
            }
            
            // Check online status
            const isOnline = isUserOnline(friendUid);
            
            // Filter by online if needed
            if (filterOnlineOnly && !isOnline) {
              continue;
            }
            
            visibleCount++;

            const addedAt = new Date(friendData.addedAt).toLocaleDateString();

            const div = document.createElement("div");
            div.className = "p-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors cursor-pointer border border-slate-700/50";
            div.dataset.friendUid = friendUid;
            
            // Avatar container with online indicator
            const avatarContainer = document.createElement("div");
            avatarContainer.className = "relative flex-shrink-0";
            
            const avatarDiv = document.createElement("div");
            avatarDiv.className = "h-10 w-10 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-sm font-bold overflow-hidden";
            avatarDiv.innerHTML = "?";
            
            // Online indicator dot
            const onlineDot = document.createElement("span");
            onlineDot.className = `absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-800 ${isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`;
            
            avatarContainer.appendChild(avatarDiv);
            avatarContainer.appendChild(onlineDot);
            
            const infoDiv = document.createElement("div");
            infoDiv.className = "flex flex-col flex-1 ml-3";
            infoDiv.innerHTML = `
              <span class="text-sm font-medium text-slate-100">Loading...</span>
              <span class="text-xs text-slate-400">${isOnline ? '<span class="text-emerald-400">Online</span> â€¢ ' : ''}Added ${addedAt}</span>
            `;
            
            const container = document.createElement("div");
            container.className = "flex items-center gap-3 flex-1";
            container.appendChild(avatarContainer);
            container.appendChild(infoDiv);
            
            div.appendChild(container);
            
            // Fetch username from UID, then load profile picture
            ((friendUid, isOnline, addedAt) => {
              (async () => {
                try {
                  const userSnap = await db.ref("users/" + friendUid + "/username").once("value");
                  const friendUsername = userSnap.val() || "Unknown";
                  
                  // Update display with username
                  avatarDiv.innerHTML = friendUsername.charAt(0).toUpperCase();
                  infoDiv.innerHTML = `
                    <span class="text-sm font-medium text-slate-100">${friendUsername}</span>
                    <span class="text-xs text-slate-400">${isOnline ? '<span class="text-emerald-400">Online</span> â€¢ ' : ''}Added ${addedAt}</span>
                  `;
                  
                  // Load profile picture
                  const profile = await fetchUserProfile(friendUsername);
                  if (profile?.profilePic) {
                    try {
                      avatarDiv.innerHTML = "";
                      const img = document.createElement("img");
                      img.src = profile.profilePic;
                      img.className = "h-full w-full object-cover";
                      img.onerror = () => {
                        avatarDiv.innerHTML = friendUsername.charAt(0).toUpperCase();
                      };
                      avatarDiv.appendChild(img);
                    } catch (e) {
                      // Keep default
                    }
                  }
                  
                  // Set click handler with current username
                  div.addEventListener("click", () => {
                    friendsListModal.classList.remove("modal-open");
                    friendsListModal.classList.add("modal-closed");
                    viewUserProfile(friendUsername);
                  });
                  
                } catch (err) {
                  console.error("[friends] error loading friend info:", err);
                  infoDiv.innerHTML = `
                    <span class="text-sm font-medium text-slate-100">Unknown User</span>
                    <span class="text-xs text-slate-400">Added ${addedAt}</span>
                  `;
                }
              })();
            })(friendUid, isOnline, addedAt);
            
            friendsList.appendChild(div);
          }
          
          // Show message if all friends are offline when filtering
          if (filterOnlineOnly && visibleCount === 0) {
            noFriendsMsg.style.display = "block";
            noFriendsMsg.textContent = "No friends online";
          } else {
            noFriendsMsg.textContent = "No friends yet";
          }
        } catch (err) {
          logDetailedError("loadFriendsList", err, { uid });
          showToast("Error loading friends", "error");
        }
      }
      
      // Friends filter buttons
      const friendsFilterAllBtn = document.getElementById('friendsFilterAll');
      const friendsFilterOnlineBtn = document.getElementById('friendsFilterOnline');
      
      if (friendsFilterAllBtn) {
        friendsFilterAllBtn.addEventListener('click', () => {
          friendsFilterOnline = false;
          friendsFilterAllBtn.className = 'px-2 py-1 text-xs rounded bg-sky-600 text-white';
          friendsFilterOnlineBtn.className = 'px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600';
          loadFriendsList(false);
        });
      }
      
      if (friendsFilterOnlineBtn) {
        friendsFilterOnlineBtn.addEventListener('click', () => {
          friendsFilterOnline = true;
          friendsFilterOnlineBtn.className = 'px-2 py-1 text-xs rounded bg-emerald-600 text-white';
          friendsFilterAllBtn.className = 'px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600';
          loadFriendsList(true);
        });
      }

      // ===== BLOCKING =====
      
      // Block/Unblock user
      blockUserBtn.addEventListener("click", async () => {
        const uid = auth.currentUser?.uid;
        if (!uid || !currentViewingUsername) {
          showToast("No profile selected", "error");
          return;
        }

        if (currentViewingUsername === currentUsername) {
          showToast("You can't block yourself!", "error");
          return;
        }

        // Check if this is an unblock action
        if (blockUserBtn.dataset.action === "unblock") {
          const targetUid = blockUserBtn.dataset.targetUid;
          
          if (!confirm(`Unblock ${currentViewingUsername}?`)) {
            return;
          }

          try {
            console.log("[block] unblocking user:", currentViewingUsername);
            blockUserBtn.disabled = true;
            blockUserBtn.textContent = "Unblocking...";

            await db.ref("blockedUsers/" + uid + "/" + targetUid).remove();

            console.log("[block] user unblocked successfully");
            blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
            blockUserBtn.style.background = "";
            delete blockUserBtn.dataset.action;
            delete blockUserBtn.dataset.targetUid;
            blockUserBtn.disabled = false;

            // Reload cache and refresh messages
            await loadBlockedUsersCache();
            startMessagesListener();

            // Re-check friendship status
            checkFriendshipStatus(currentViewingUsername);

            showToast("User unblocked successfully", "success");
          } catch (err) {
            console.error("[block] error unblocking user:", err);
            showToast("Error unblocking user", "error");
            blockUserBtn.disabled = false;
          }
          return;
        }

        if (!confirm(`Block ${currentViewingUsername}? They won't be able to send you messages or friend requests.`)) {
          return;
        }

        try {
          console.log("[block] blocking user:", currentViewingUsername);
          blockUserBtn.disabled = true;
          blockUserBtn.textContent = "Blocking...";

          // Get target UID
          const snap = await db.ref("users").orderByChild("username").equalTo(currentViewingUsername).once("value");
          if (!snap.exists()) {
            showToast("User not found", "error");
            blockUserBtn.disabled = false;
            blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
            return;
          }

          const targetUid = Object.keys(snap.val())[0];

          // Remove any pending friend requests FIRST (before blocking, so rules don't reject removal)
          try {
            await db.ref("friendRequests/" + uid + "/incoming/" + targetUid).remove();
          } catch (e) {
            console.log("[block] no incoming request from target");
          }
          try {
            await db.ref("friendRequests/" + targetUid + "/incoming/" + uid).remove();
          } catch (e) {
            console.log("[block] no outgoing request to target");
          }

          // Remove from friends if friends (both sides)
          await db.ref("friends/" + uid + "/" + targetUid).remove();
          await db.ref("friends/" + targetUid + "/" + uid).remove();

          // Add to blocked list LAST (so other removals don't get blocked by rules)
          await db.ref("blockedUsers/" + uid + "/" + targetUid).set({
            blockedAt: firebase.database.ServerValue.TIMESTAMP,
            blockedUsername: currentViewingUsername
          });

          console.log("[block] user blocked successfully");
          blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Unblock User';
          blockUserBtn.style.background = "rgb(100, 116, 139)";
          blockUserBtn.dataset.action = "unblock";
          blockUserBtn.dataset.targetUid = targetUid;
          blockUserBtn.disabled = false;

          sendFriendRequestBtn.disabled = true;
          sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
          sendFriendRequestBtn.textContent = "Blocked";

          // Reload cache and refresh messages to hide blocked user's messages
          await loadBlockedUsersCache();
          startMessagesListener();

          showToast("User blocked successfully", "success");
        } catch (err) {
          console.error("[block] error blocking user:", err);
          showToast("Error blocking user", "error");
          blockUserBtn.disabled = false;
          blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
        }
      });

      // Load blocked users list
      async function loadBlockedUsers() {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          console.error("[block] not logged in");
          return;
        }

        try {
          console.log("[block] loading blocked users for uid:", uid);
          const snap = await db.ref("blockedUsers/" + uid).once("value");
          
          blockedUsersList.innerHTML = "";

          if (!snap.exists()) {
            noBlockedUsersMsg.style.display = "block";
            console.log("[block] no blocked users");
            return;
          }

          const blocked = snap.val();
          const blockedArray = Object.keys(blocked).map(blockedUid => ({
            blockedUid,
            ...blocked[blockedUid]
          }));

          console.log("[block] loaded", blockedArray.length, "blocked users");

          if (blockedArray.length === 0) {
            noBlockedUsersMsg.style.display = "block";
          } else {
            noBlockedUsersMsg.style.display = "none";

            for (const item of blockedArray) {
              const div = document.createElement("div");
              div.className = "flex items-center justify-between p-3 bg-slate-700/50 rounded-lg";
              div.innerHTML = `
                <span class="text-sm font-medium text-slate-100">Loading...</span>
                <button class="unblock-btn px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-colors" data-blocked-uid="${item.blockedUid}">
                  Unblock
                </button>
              `;

              blockedUsersList.appendChild(div);

              // Load username
              (async () => {
                try {
                  const usernameSnap = await db.ref("users/" + item.blockedUid + "/username").once("value");
                  const username = usernameSnap.val() || "Unknown User";
                  const blockedDate = new Date(item.blockedAt).toLocaleDateString();
                  
                  div.innerHTML = `
                    <div>
                      <span class="text-sm font-medium text-slate-100">${username}</span>
                      <span class="text-xs text-slate-400 block">Blocked ${blockedDate}</span>
                    </div>
                    <button class="unblock-btn px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-colors" data-blocked-uid="${item.blockedUid}">
                      Unblock
                    </button>
                  `;

                  // Unblock handler
                  const unblockBtn = div.querySelector(".unblock-btn");
                  unblockBtn.addEventListener("click", async () => {
                    if (!confirm(`Unblock ${username}?`)) return;

                    try {
                      console.log("[block] unblocking:", username);
                      await db.ref("blockedUsers/" + uid + "/" + item.blockedUid).remove();
                      console.log("[block] unblocked successfully");
                      
                      // Reload cache and refresh messages
                      await loadBlockedUsersCache();
                      startMessagesListener();
                      
                      // Reload blocked users list
                      loadBlockedUsers();
                    } catch (err) {
                      console.error("[block] error unblocking:", err);
                      showToast("Error unblocking user", "error");
                    }
                  });
                } catch (err) {
                  console.error("[block] error loading username:", err);
                  div.innerHTML = `
                    <span class="text-sm font-medium text-slate-100">Unknown User</span>
                    <button class="unblock-btn px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-colors" data-blocked-uid="${item.blockedUid}">
                      Unblock
                    </button>
                  `;
                }
              })();
            }
          }
        } catch (err) {
          console.error("[block] error loading blocked users:", err);
          showToast("Error loading blocked users", "error");
        }
      }

      // Check if viewing a blocked user
      async function checkIfBlocked(targetUsername) {
        const uid = auth.currentUser?.uid;
        if (!uid) return false;

        try {
          const snap = await db.ref("users").orderByChild("username").equalTo(targetUsername).once("value");
          if (!snap.exists()) return false;

          const targetUid = Object.keys(snap.val())[0];
          const blockedSnap = await db.ref("blockedUsers/" + uid + "/" + targetUid).once("value");
          
          if (blockedSnap.exists()) {
            blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Unblock User';
            blockUserBtn.style.background = "rgb(100, 116, 139)";
            blockUserBtn.dataset.action = "unblock";
            blockUserBtn.dataset.targetUid = targetUid;
            return true;
          } else {
            blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
            blockUserBtn.style.background = "";
            delete blockUserBtn.dataset.action;
            delete blockUserBtn.dataset.targetUid;
            return false;
          }
        } catch (err) {
          console.error("[block] error checking blocked status:", err);
          return false;
        }
      }

      // Friends list modal
      const friendsListModal = document.getElementById("friendsListModal");
      const friendsListCloseBtn = document.getElementById("friendsListCloseBtn");

      friendsListCloseBtn.addEventListener("click", () => {
        friendsListModal.classList.remove("modal-open");
        friendsListModal.classList.add("modal-closed");
      });

      friendsListModal.addEventListener("click", (e) => {
        if (e.target === friendsListModal) {
          friendsListModal.classList.remove("modal-open");
          friendsListModal.classList.add("modal-closed");
        }
      });

      // ===== USER SEARCH =====
      let searchTimeout = null;

      searchUsersInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        const query = searchUsersInput.value.trim();

        if (query.length === 0) {
          searchResults.innerHTML = "";
          return;
        }

        if (query.length < 2) {
          searchResults.innerHTML = '<p class="text-xs text-slate-400 p-2">Type at least 2 characters...</p>';
          return;
        }

        searchResults.innerHTML = '<p class="text-xs text-slate-400 p-2">Searching...</p>';

        searchTimeout = setTimeout(async () => {
          await searchUsers(query);
        }, 300);
      });

      async function searchUsers(query) {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        try {
          console.log("[search] searching for:", query);
          
          // Search by username (case-insensitive partial match)
          const snap = await db.ref("users").once("value");
          const users = snap.val();
          
          if (!users) {
            searchResults.innerHTML = '<p class="text-xs text-slate-400 p-2">No users found</p>';
            return;
          }

          const results = [];
          const queryLower = query.toLowerCase();

          for (const [userId, userData] of Object.entries(users)) {
            if (userId === uid) continue; // Skip self
            
            const username = userData.username || "";
            if (username.toLowerCase().includes(queryLower)) {
              results.push({ uid: userId, username });
            }
          }

          if (results.length === 0) {
            searchResults.innerHTML = '<p class="text-xs text-slate-400 p-2">No users found</p>';
            return;
          }

          console.log("[search] found", results.length, "users");

          // Sort by username
          results.sort((a, b) => a.username.localeCompare(b.username));

          // Render results
          searchResults.innerHTML = "";

          for (const user of results) {
            const div = document.createElement("div");
            div.className = "flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer";
            
            // Get profile pic
            const profileSnap = await db.ref("userProfiles/" + user.uid).once("value");
            const profile = profileSnap.val() || {};
            
            const avatarHTML = profile.profilePic
              ? `<img src="${profile.profilePic}" class="h-10 w-10 rounded-full object-cover" />`
              : generateDefaultAvatar(user.username);

            div.innerHTML = `
              <div class="flex items-center gap-3 flex-1">
                <div class="h-10 w-10 rounded-full overflow-hidden">
                  ${avatarHTML}
                </div>
                <div>
                  <p class="text-sm font-medium text-slate-100">${user.username}</p>
                  <p class="text-xs text-slate-400">${profile.bio || "No bio"}</p>
                </div>
              </div>
              <button class="add-friend-btn px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-colors" data-username="${user.username}">
                Add Friend
              </button>
            `;

            // Click on div to view profile
            const userInfoDiv = div.querySelector("div.flex-1");
            userInfoDiv.addEventListener("click", () => {
              viewUserProfile(user.username);
            });

            // Add friend button
            const addBtn = div.querySelector(".add-friend-btn");
            
            // Check friendship status
            (async () => {
              try {
                // Check if you blocked them
                const youBlockedThem = await db.ref("blockedUsers/" + uid + "/" + user.uid).once("value");
                if (youBlockedThem.exists()) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(100, 116, 139)";
                  addBtn.textContent = "Blocked";
                  return;
                }

                // Check privacy
                const privacySnap = await db.ref("userPrivacy/" + user.uid).once("value");
                const privacy = privacySnap.val() || {};
                
                if (privacy.allowFriendRequests === false) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(100, 116, 139)";
                  addBtn.textContent = "Disabled";
                  return;
                }

                // Check if already friends
                const friendsSnap = await db.ref("friends/" + uid + "/" + user.uid).once("value");
                if (friendsSnap.exists()) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(34, 197, 94)";
                  addBtn.textContent = "✓ Friends";
                  return;
                }

                // Check if request already sent
                const sentReqSnap = await db.ref("friendRequests/" + user.uid + "/incoming/" + uid).once("value");
                if (sentReqSnap.exists()) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(100, 116, 139)";
                  addBtn.textContent = "Pending";
                  return;
                }

                // Check if they sent you a request
                const reverseReqSnap = await db.ref("friendRequests/" + uid + "/incoming/" + user.uid).once("value");
                if (reverseReqSnap.exists()) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(100, 116, 139)";
                  addBtn.textContent = "Incoming";
                  return;
                }
              } catch (err) {
                console.error("[search] error checking status:", err);
              }
            })();

            addBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              
              try {
                addBtn.disabled = true;
                addBtn.textContent = "Sending...";

                await db.ref("friendRequests/" + user.uid + "/incoming/" + uid).set({
                  fromUid: uid,
                  timestamp: firebase.database.ServerValue.TIMESTAMP
                });

                addBtn.style.background = "rgb(34, 197, 94)";
                addBtn.textContent = "✓ Sent!";
                
                setTimeout(() => {
                  addBtn.style.background = "rgb(100, 116, 139)";
                  addBtn.textContent = "Pending";
                }, 1500);
              } catch (err) {
                console.error("[search] error sending request:", err);
                showToast("Error sending friend request", "error");
                addBtn.disabled = false;
                addBtn.textContent = "Add Friend";
              }
            });

            searchResults.appendChild(div);
          }
        } catch (err) {
          console.error("[search] error:", err);
          searchResults.innerHTML = '<p class="text-xs text-red-400 p-2">Error searching users</p>';
        }
      }

      // Image Viewer
      const imageViewerModal = document.getElementById("imageViewerModal");
      const imageViewerImg = document.getElementById("imageViewerImg");
      const closeImageViewer = document.getElementById("closeImageViewer");

      function openImageViewer(imageUrl) {
        imageViewerImg.src = imageUrl;
        imageViewerModal.style.display = "flex";
        document.body.style.overflow = "hidden";
      }

      function closeImageViewerFunc() {
        imageViewerModal.style.display = "none";
        imageViewerImg.src = "";
        document.body.style.overflow = "";
      }

      closeImageViewer.addEventListener("click", (e) => {
        e.stopPropagation();
        closeImageViewerFunc();
      });

      imageViewerModal.addEventListener("click", closeImageViewerFunc);

      imageViewerImg.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // ESC key to close
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && imageViewerModal.style.display === "flex") {
          closeImageViewerFunc();
        }
      });

      // Delete Message Modal
      const deleteMessageModal = document.getElementById("deleteMessageModal");
      const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
      const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
      let pendingDeleteMessageId = null;
      let pendingDeleteToken = null;
      let pendingDeleteOptions = null; // { isDm, threadId }

      function openDeleteMessageModal(messageId, deleteToken, options = {}) {
        pendingDeleteMessageId = messageId;
        pendingDeleteToken = deleteToken;
        pendingDeleteOptions = options;
        deleteMessageModal.classList.remove("modal-closed");
        deleteMessageModal.classList.add("modal-open");
      }

      function closeDeleteMessageModal() {
        deleteMessageModal.classList.remove("modal-open");
        deleteMessageModal.classList.add("modal-closed");
        pendingDeleteMessageId = null;
        pendingDeleteToken = null;
        pendingDeleteOptions = null;
      }

      cancelDeleteBtn.addEventListener("click", closeDeleteMessageModal);

      confirmDeleteBtn.addEventListener("click", async () => {
        if (!pendingDeleteMessageId) return;

        // Disable button and show loading state
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.innerHTML = '<span class="animate-pulse">Deleting...</span>';

        try {
          if (pendingDeleteOptions && pendingDeleteOptions.isDm) {
            await deleteDmMessage(pendingDeleteOptions.threadId, pendingDeleteMessageId, pendingDeleteToken);
          } else if (pendingDeleteOptions && pendingDeleteOptions.isGroup && pendingDeleteOptions.groupId) {
            await deleteGroupMessage(pendingDeleteOptions.groupId, pendingDeleteMessageId, pendingDeleteToken);
          } else if (activeGroupId) {
            // Fallback: if we're in a group chat but options weren't passed
            await deleteGroupMessage(activeGroupId, pendingDeleteMessageId, pendingDeleteToken);
          } else {
            await deleteMessage(pendingDeleteMessageId, pendingDeleteToken);
          }
          
          // Show success state
          confirmDeleteBtn.innerHTML = '✓ Deleted';
          confirmDeleteBtn.className = "flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium";
          
          setTimeout(() => {
            closeDeleteMessageModal();
            // Reset button state
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = 'Delete';
            confirmDeleteBtn.className = "flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium";
          }, 800);
        } catch (err) {
          // Show error state
          confirmDeleteBtn.innerHTML = 'âœ— Failed';
          confirmDeleteBtn.className = "flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium";
          
          setTimeout(() => {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = 'Delete';
            confirmDeleteBtn.className = "flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium";
          }, 2000);
        }
      });

      // ESC key to close delete modal
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && deleteMessageModal.classList.contains("modal-open")) {
          closeDeleteMessageModal();
        }
      });

      // --- REPORT MESSAGE FUNCTIONALITY ---
      async function reportMessage(messageId, messageData, reportedUsername, reason) {
        if (!messageId || !currentUserId || !currentUsername) {
          console.error("[report] missing required data");
          return;
        }

        // If caller didn't supply a reason, fall back to a prompt (legacy callers)
        let finalReason = reason;
        if (!finalReason || typeof finalReason !== 'string' || finalReason.trim() === "") {
          finalReason = prompt(`Report message from ${reportedUsername}?\n\nPlease describe the issue:\n(e.g., "Harassment", "Threats", "Spam", "Inappropriate content")`);
        }

        if (!finalReason || finalReason.trim() === "") {
          return; // User cancelled
        }

        try {
          const reportData = {
            messageId: messageId,
            reportedBy: currentUsername,
            reportedByUid: currentUserId,
            reportedUser: reportedUsername,
            reportedUserUid: messageData.userId || null,
            messageText: messageData.text || "(media only)",
            messageMedia: messageData.media || null,
            reason: finalReason.trim(),
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            status: "pending", // pending, reviewed, actioned, dismissed
          };

          // Save to reports node in Firebase
          await db.ref("reports").push(reportData);

          // Mark locally to avoid duplicate reporting and update UI
          try {
            reportedMessages.add(messageId);
            const row = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
            if (row) {
              // remove any report button
              const reportBtn = row.querySelector('button[title="Report message"]');
              if (reportBtn && reportBtn.parentElement) {
                reportBtn.parentElement.removeChild(reportBtn);
              }
              const bubbleContainer = row.querySelector('.relative');
              if (bubbleContainer) {
                // Show inline transient success banner
                const existing = bubbleContainer.querySelector('.inline-report-success');
                if (existing) existing.remove();
                const success = document.createElement('div');
                success.className = 'inline-report-success mt-2 text-sm inline-block rounded px-2 py-1 bg-emerald-200 text-emerald-900 font-medium';
                success.textContent = 'Report submitted — thank you.';
                bubbleContainer.appendChild(success);
                setTimeout(() => {
                  success.classList.add('fade-out');
                  setTimeout(() => success.remove(), 600);
                }, 3000);
              }
            }
          } catch (uiErr) {
            console.warn('[report] could not update UI after reporting', uiErr);
          }

          // Close inline report UI if it's open for this message
          if (activeInlineReport && activeInlineReport.messageId === messageId) {
            try { cancelInlineReport(); } catch(_) {}
          }

          console.log("[report] message reported successfully:", messageId);
        } catch (err) {
          console.error("[report] error submitting report:", err);
          // Show inline error banner if possible
          try {
            const row = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
            if (row) {
              const bubbleContainer = row.querySelector('.relative');
              if (bubbleContainer) {
                const existing = bubbleContainer.querySelector('.inline-report-error');
                if (existing) existing.remove();
                const errBanner = document.createElement('div');
                errBanner.className = 'inline-report-error mt-2 text-sm inline-block rounded px-2 py-1 bg-rose-200 text-rose-900 font-medium';
                errBanner.textContent = 'Failed to submit report.';
                bubbleContainer.appendChild(errBanner);
                setTimeout(() => {
                  errBanner.classList.add('fade-out');
                  setTimeout(() => errBanner.remove(), 3500);
                }, 3000);
                return;
              }
            }
          } catch (uiErr) {
            console.warn('[report] could not show inline error banner', uiErr);
          }
          showToast("Failed to submit report. Please try again.", "error");
        }
      }

      // ===== SIDE PANEL MENU ITEMS =====
      // Initialize side panel menu items after all modals are declared
      
      sidePanelProfile.addEventListener("click", () => {
        closeSidePanel();
        loadUserProfile();
        profileModal.classList.remove("modal-closed");
        profileModal.classList.add("modal-open");
      });

      sidePanelSettings.addEventListener("click", () => {
        closeSidePanel();
        settingsModal.classList.remove("modal-closed");
        settingsModal.classList.add("modal-open");
      });

      sidePanelPrivacy.addEventListener("click", () => {
        closeSidePanel();
        loadPrivacySettings();
        privacySettingsModal.classList.remove("modal-closed");
        privacySettingsModal.classList.add("modal-open");
      });

      sidePanelFriendRequests.addEventListener("click", () => {
        closeSidePanel();
        friendRequestsModal.classList.remove("modal-closed");
        friendRequestsModal.classList.add("modal-open");
        loadFriendRequests();
      });

      sidePanelFriends.addEventListener("click", () => {
        closeSidePanel();
        friendsListModal.classList.remove("modal-closed");
        friendsListModal.classList.add("modal-open");
        loadFriendsList();
      });

      sidePanelDMs.addEventListener("click", () => {
        closeSidePanel();
        openDmModal();
      });

      sidePanelBlocked.addEventListener("click", () => {
        closeSidePanel();
        blockedUsersModal.classList.remove("modal-closed");
        blockedUsersModal.classList.add("modal-open");
        loadBlockedUsers();
      });

      // ===== ONBOARDING WALKTHROUGH SYSTEM =====
      const walkthroughOverlay = document.getElementById("walkthroughOverlay");
      const walkthroughBackdrop = document.getElementById("walkthroughBackdrop");
      const walkthroughHighlight = document.getElementById("walkthroughHighlight");
      const walkthroughTooltip = document.getElementById("walkthroughTooltip");
      const walkthroughStepBadge = document.getElementById("walkthroughStepBadge");
      const walkthroughTitle = document.getElementById("walkthroughTitle");
      const walkthroughDesc = document.getElementById("walkthroughDesc");
      const walkthroughProgress = document.getElementById("walkthroughProgress");
      const walkthroughPrevBtn = document.getElementById("walkthroughPrevBtn");
      const walkthroughNextBtn = document.getElementById("walkthroughNextBtn");
      const walkthroughSkipBtn = document.getElementById("walkthroughSkipBtn");

      let walkthroughStep = 0;
      let walkthroughActive = false;

      // Walkthrough steps configuration
      const walkthroughSteps = [
        {
          target: null, // Center screen welcome
          title: "Welcome to Chatra! ðŸ‘‹",
          desc: "Let's take a quick 1-minute tour to help you get the most out of Chatra. You can skip this anytime.",
          position: "center"
        },
        {
          target: "#msgInput",
          title: "Send Messages ðŸ’¬",
          desc: "Type your message here and press Enter or click Send. You can chat with everyone in the Global Chat!",
          position: "top"
        },
        {
          target: "#mediaUploadBtn",
          title: "Share Media ðŸ“·",
          desc: "Click here to upload images or videos to share with others. Supports most common formats.",
          position: "top"
        },
        {
          target: "#menuToggle",
          title: "Open the Menu â˜°",
          desc: "Click the menu button (three dots) to access your profile, settings, friends, DMs, Patch Notes, Suggestions & Help (submit suggestions, bug reports, ideas, or ban appeals), and more!",
          position: "bottom"
        },
        {
          target: "#navDMs",
          title: "Direct Messages ðŸ“¨",
          desc: "Click here to switch to Direct Messages. You can access DMs from the DMs tab next to Global Chat or via the Menu — use them for private conversations with friends.",
          position: "bottom"
        },
        {
          target: "#navGroups",
          title: "Group Chats ðŸ‘¥",
          desc: "Click here to access Group Chats! Create your own groups, join public ones, or use invite codes to join private groups. Great for chatting with multiple friends at once.",
          position: "bottom"
        },
        {
          target: "#messages",
          title: "Chat Area ðŸ“œ",
          desc: "Messages appear here. You can reply to messages, react to them, and report inappropriate content.",
          position: "left"
        },
        {
          target: null, // Center screen final
          title: "You're All Set! ðŸŽ‰",
          desc: "That's the basics! Explore the menu for more features like adding friends, customizing your profile, and adjusting settings. Have fun chatting!",
          position: "center"
        }
      ];

      // Check if user should see the walkthrough
      async function checkWalkthroughStatus() {
        if (!currentUserId) return false;
        
        try {
          // Check if walkthrough already completed
          const walkthroughSnap = await db.ref("userSettings/" + currentUserId + "/walkthroughCompleted").once("value");
          if (walkthroughSnap.val() === true) {
            console.log("[walkthrough] already completed");
            return false;
          }

          // Check if user has ever sent a message (existing user)
          const messagesSnap = await db.ref("messages")
            .orderByChild("userId")
            .equalTo(currentUserId)
            .limitToFirst(1)
            .once("value");
          
          if (messagesSnap.exists()) {
            console.log("[walkthrough] user has sent messages, marking as completed");
            await db.ref("userSettings/" + currentUserId + "/walkthroughCompleted").set(true);
            return false;
          }

          // New user, show walkthrough
          console.log("[walkthrough] new user, showing walkthrough");
          return true;
        } catch (err) {
          console.warn("[walkthrough] error checking status:", err);
          return false;
        }
      }

      // Start the walkthrough
      async function startWalkthrough() {
        const shouldShow = await checkWalkthroughStatus();
        if (!shouldShow) return;

        walkthroughActive = true;
        walkthroughStep = 0;
        walkthroughOverlay.classList.remove("hidden");
        showWalkthroughStep(0);
      }

      // Show a specific walkthrough step
      function showWalkthroughStep(stepIndex) {
        const step = walkthroughSteps[stepIndex];
        if (!step) return;

        // Update step badge
        walkthroughStepBadge.textContent = `Step ${stepIndex + 1} of ${walkthroughSteps.length}`;

        // Update title and description
        walkthroughTitle.textContent = step.title;
        walkthroughDesc.textContent = step.desc;

        // Update progress bar
        const progress = ((stepIndex + 1) / walkthroughSteps.length) * 100;
        walkthroughProgress.style.width = progress + "%";

        // Update navigation buttons
        walkthroughPrevBtn.disabled = stepIndex === 0;
        walkthroughNextBtn.textContent = stepIndex === walkthroughSteps.length - 1 ? "Finish ✓" : "Next →";

        // Position highlight and tooltip
        if (step.target && step.position !== "center") {
          const targetEl = document.querySelector(step.target);
          if (targetEl) {
            positionHighlight(targetEl);
            positionTooltip(targetEl, step.position);
            walkthroughHighlight.classList.remove("hidden");
          } else {
            // Target not found, center it
            centerTooltip();
            walkthroughHighlight.classList.add("hidden");
          }
        } else {
          // Center screen step
          centerTooltip();
          walkthroughHighlight.classList.add("hidden");
        }
      }

      // Position highlight around target element
      function positionHighlight(targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const padding = 8;
        
        walkthroughHighlight.style.top = (rect.top - padding) + "px";
        walkthroughHighlight.style.left = (rect.left - padding) + "px";
        walkthroughHighlight.style.width = (rect.width + padding * 2) + "px";
        walkthroughHighlight.style.height = (rect.height + padding * 2) + "px";
      }

      // Position tooltip near target element
      function positionTooltip(targetEl, position) {
        const rect = targetEl.getBoundingClientRect();
        const tooltipRect = walkthroughTooltip.getBoundingClientRect();
        const margin = 20;

        let top, left;

        switch (position) {
          case "top":
            top = rect.top - tooltipRect.height - margin;
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            break;
          case "bottom":
            top = rect.bottom + margin;
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            break;
          case "left":
            top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
            left = rect.left - tooltipRect.width - margin;
            break;
          case "right":
            top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
            left = rect.right + margin;
            break;
          default:
            top = rect.bottom + margin;
            left = rect.left;
        }

        // Keep tooltip within viewport
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (left < margin) left = margin;
        if (left + tooltipRect.width > vw - margin) left = vw - tooltipRect.width - margin;
        if (top < margin) top = margin;
        if (top + tooltipRect.height > vh - margin) top = vh - tooltipRect.height - margin;

        walkthroughTooltip.style.top = top + "px";
        walkthroughTooltip.style.left = left + "px";
      }

      // Center tooltip on screen
      function centerTooltip() {
        walkthroughTooltip.style.top = "50%";
        walkthroughTooltip.style.left = "50%";
        walkthroughTooltip.style.transform = "translate(-50%, -50%)";
        
        // Reset transform after a frame for smooth animations
        requestAnimationFrame(() => {
          const rect = walkthroughTooltip.getBoundingClientRect();
          walkthroughTooltip.style.top = (window.innerHeight / 2 - rect.height / 2) + "px";
          walkthroughTooltip.style.left = (window.innerWidth / 2 - rect.width / 2) + "px";
          walkthroughTooltip.style.transform = "";
        });
      }

      // Complete the walkthrough
      async function completeWalkthrough() {
        walkthroughActive = false;
        walkthroughOverlay.classList.add("hidden");
        
        if (currentUserId) {
          try {
            await db.ref("userSettings/" + currentUserId + "/walkthroughCompleted").set(true);
            console.log("[walkthrough] marked as completed in Firebase");
          } catch (err) {
            console.warn("[walkthrough] failed to save completion status:", err);
          }
        }
      }

      // Skip the walkthrough
      async function skipWalkthrough() {
        await completeWalkthrough();
      }

      // Navigate to next step
      function nextWalkthroughStep() {
        if (walkthroughStep < walkthroughSteps.length - 1) {
          walkthroughStep++;
          showWalkthroughStep(walkthroughStep);
        } else {
          completeWalkthrough();
        }
      }

      // Navigate to previous step
      function prevWalkthroughStep() {
        if (walkthroughStep > 0) {
          walkthroughStep--;
          showWalkthroughStep(walkthroughStep);
        }
      }

      // Event listeners for walkthrough
      if (walkthroughNextBtn) {
        walkthroughNextBtn.addEventListener("click", nextWalkthroughStep);
      }
      if (walkthroughPrevBtn) {
        walkthroughPrevBtn.addEventListener("click", prevWalkthroughStep);
      }
      if (walkthroughSkipBtn) {
        walkthroughSkipBtn.addEventListener("click", skipWalkthrough);
      }

      // Handle window resize during walkthrough
      window.addEventListener("resize", () => {
        if (walkthroughActive) {
          showWalkthroughStep(walkthroughStep);
        }
      });

      // Expose startWalkthrough for testing
      window.startWalkthrough = startWalkthrough;

