
      
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

      
      (function() {
        
        const isIPad = /iPad/.test(navigator.userAgent) || 
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        if (isIOS || (isIPad && isSafari)) {
          document.documentElement.classList.add('ios-device');
          console.log('[safari] iOS/iPad detected, applying fixes');
          
          
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
          
          
          if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
              const vh = window.visualViewport.height * 0.01;
              document.documentElement.style.setProperty('--vh', `${vh}px`);
              document.documentElement.style.setProperty('--keyboard-height', 
                `${window.innerHeight - window.visualViewport.height}px`);
              
              const keyboardOpen = window.visualViewport.height < window.innerHeight * 0.75;
              document.body.classList.toggle('keyboard-open', keyboardOpen);
            });
          }
          
          
          document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
              
              setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 300);
            }
          });
          
          
          document.body.addEventListener('touchmove', (e) => {
            if (e.target === document.body || e.target === document.documentElement) {
              e.preventDefault();
            }
          }, { passive: false });
          
          
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
      
      // Strip "AI" prefix from AI responses (e.g., "AIHello!" -> "Hello!")
      // This is the exact marker we're using
      const AI_MSG_MARKER_CLEAN = '\u200B\u2063AI\u2063\u200B';
      
      function cleanAiResponse(text) {
        if (!text) return text;
        
        // First remove the exact marker if present
        if (text.startsWith(AI_MSG_MARKER_CLEAN)) {
          text = text.substring(AI_MSG_MARKER_CLEAN.length);
        }
        
        // Remove any AI prefix patterns (including zero-width characters)
        text = text.replace(/^[\u200B\u200C\u200D\u2063\uFEFF]*AI[\u200B\u200C\u200D\u2063\uFEFF]*/gi, '');
        
        // Remove standalone zero-width characters at start
        text = text.replace(/^[\u200B\u200C\u200D\u2063\uFEFF]+/, '');
        
        return text.trim();
      }

      
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

      
      firebase.initializeApp(firebaseConfig);
      
      if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        try {
          if (firebase && firebase.analytics) {
            try { firebase.analytics(); } catch (e) { console.warn('[analytics] firebase.analytics init failed', e); }
          }
        } catch (e) {}
      }
      const auth = firebase.auth();
      const db = firebase.database();

      
      // ============================================================================
      // FINGERPRINTING SECURITY NOTES:
      // - FINGERPRINT_ENABLED defaults to true; consider false for stricter privacy
      // - FINGERPRINT_FAIL_CLOSED controls behavior when fingerprint checks fail
      // - Client-side ban checks (banTargetFingerprint, checkFingerprintBan) should
      //   ideally be verified server-side via Cloud Functions or RTDB rules
      // - Consent state (hasDeviceConsent, checkCanvasConsentFromFirebase) is read
      //   client-side but stored server-side; consider adding server-side validation
      // - TODO: Add server-enforced retention/erasure policies and version fields
      // ============================================================================
      
      const FINGERPRINT_ENABLED = true; 
      
      
      
      const FINGERPRINT_FAIL_CLOSED = false;
      
      let cachedFingerprint = null;
      
      
      
      let canvasConsentCache = null; 
      
      async function checkCanvasConsentFromFirebase(uid) {
        if (!uid) return false;
        try {
          
          const recordSnap = await db.ref('users/' + uid + '/canvasConsentRecord').once('value');
          const record = recordSnap.val();
          
          if (record && typeof record === 'object') {
            
            if (record.granted === false && (record.version || 0) >= CANVAS_CONSENT_VERSION) {
              return 'declined'; 
            }
            
            if (record.granted === true && (record.version || 0) >= CANVAS_CONSENT_VERSION) {
              return true;
            }
            
          }
          
          
          const snap = await db.ref('users/' + uid + '/canvasConsent').once('value');
          return snap.val() === true;
        } catch (e) {
          return false;
        }
      }
      
      function hasCanvasConsent() {
        return canvasConsentCache === true;
      }
      
      
      const CANVAS_CONSENT_VERSION = 1;
      
      async function grantCanvasConsent(uid) {
        canvasConsentCache = true;
        cachedFingerprint = null; 
        if (uid) {
          try {
            
            await db.ref('users/' + uid + '/canvasConsent').set(true);
            await db.ref('users/' + uid + '/canvasConsentRecord').set({
              granted: true,
              timestamp: firebase.database.ServerValue.TIMESTAMP,
              version: CANVAS_CONSENT_VERSION,
              uid: uid
            });
            
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
            
            await db.ref('users/' + uid + '/deviceConsentRecord').set({
              granted: false,
              revokedAt: firebase.database.ServerValue.TIMESTAMP,
              version: CANVAS_CONSENT_VERSION,
              uid: uid
            });
            
            await db.ref('users/' + uid + '/fingerprint').remove();
            showToast('Device identification disabled and fingerprint data deleted', 'success');
          } catch (e) {
            console.warn('[fingerprint] failed to revoke consent:', e);
          }
        }
      }
      
      
      
      async function hasDeviceConsent(uid) {
        if (!uid) return false;
        try {
          const snap = await db.ref('users/' + uid + '/deviceConsentRecord').once('value');
          const record = snap.val();
          
          if (record && record.granted === false) {
            return false;
          }
          
          
          return true;
        } catch (e) {
          console.warn('[fingerprint] consent check failed, defaulting to deny:', e);
          return false; 
        }
      }
      
      
      async function storeFingerprint(uid) {
        if (!uid || !FINGERPRINT_ENABLED) return false;
        try {
          
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
      
      
      // Persistent random salt — generated once per browser, stored in localStorage + IndexedDB
      function getOrCreatePersistentSalt() {
        const LS_KEY = 'chatra_fp_salt';
        try {
          let salt = localStorage.getItem(LS_KEY);
          if (salt && salt.length >= 32) return salt;
          const arr = new Uint8Array(16);
          crypto.getRandomValues(arr);
          salt = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
          localStorage.setItem(LS_KEY, salt);
          // Also persist in IndexedDB as backup
          try {
            const req = indexedDB.open('chatra_fp', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('salt');
            req.onsuccess = () => {
              const tx = req.result.transaction('salt', 'readwrite');
              tx.objectStore('salt').put(salt, 'fp_salt');
            };
          } catch (_) {}
          return salt;
        } catch (_) {
          // If localStorage blocked, try IndexedDB synchronously isn't possible,
          // fall back to session-level random (still unique per tab)
          if (!window._chatraSessionSalt) {
            const arr = new Uint8Array(16);
            crypto.getRandomValues(arr);
            window._chatraSessionSalt = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
          }
          return window._chatraSessionSalt;
        }
      }

      // Try to recover salt from IndexedDB if localStorage was cleared
      async function recoverSaltFromIDB() {
        const LS_KEY = 'chatra_fp_salt';
        try {
          if (localStorage.getItem(LS_KEY)) return; // already have it
        } catch (_) { return; }
        return new Promise(resolve => {
          try {
            const req = indexedDB.open('chatra_fp', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('salt');
            req.onsuccess = () => {
              const tx = req.result.transaction('salt', 'readonly');
              const getReq = tx.objectStore('salt').get('fp_salt');
              getReq.onsuccess = () => {
                if (getReq.result) {
                  try { localStorage.setItem(LS_KEY, getReq.result); } catch (_) {}
                }
                resolve();
              };
              getReq.onerror = () => resolve();
            };
            req.onerror = () => resolve();
          } catch (_) { resolve(); }
        });
      }

      async function computeFingerprintHash() {
        // Recover salt from IndexedDB if localStorage was cleared
        await recoverSaltFromIDB();

        const components = [];

        // Per-user salt — makes fingerprint unique even on identical hardware
        const salt = getOrCreatePersistentSalt();
        components.push('salt:' + salt);

        components.push('scr:' + screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
        components.push('avail:' + screen.availWidth + 'x' + screen.availHeight);
        
        components.push('tz:' + Intl.DateTimeFormat().resolvedOptions().timeZone);
        components.push('tzo:' + new Date().getTimezoneOffset());
        
        components.push('lang:' + navigator.language);
        components.push('langs:' + (navigator.languages || []).join(','));
        
        components.push('plat:' + navigator.platform);
        
        components.push('cores:' + (navigator.hardwareConcurrency || 'unknown'));
        
        components.push('mem:' + (navigator.deviceMemory || 'unknown'));
        
        components.push('touch:' + ('ontouchstart' in window ? 'yes' : 'no'));
        components.push('maxt:' + (navigator.maxTouchPoints || 0));
        
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
        
        const fpString = components.join('|');
        return await hashString(fpString);
      }
      
      
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
      
      
      
      async function checkFingerprintBanViaServer(fp, failClosed = null) {
        const useFailClosed = failClosed !== null ? failClosed : FINGERPRINT_FAIL_CLOSED;
        
        try {
          
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
              
              console.error('[fingerprint] server response parse error:', parseErr);
              if (useFailClosed) {
                return { banned: true, reason: 'Device verification failed' };
              }
              return { banned: false };
            }
          } else {
            
            console.error('[fingerprint] server error status:', res.status);
            if (useFailClosed) {
              return { banned: true, reason: 'Device verification unavailable' };
            }
            return { banned: false };
          }
        } catch (networkErr) {
          
          console.warn('[fingerprint] network error:', networkErr.message || networkErr);
          
          
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

      
      let presenceRef = null;
      let connectedRef = null;

      // Use a per-connection child under presence/<uid>/<connId>
      // so multiple tabs/devices don't race when setting a single value.
      let presenceHeartbeatInterval = null;
      
      function setupPresence(uid) {
        console.log('[presence] setupPresence called for uid:', uid);

        // Tear down previous presence listeners to prevent leaks
        if (connectedRef) {
          connectedRef.off('value');
        }
        if (presenceHeartbeatInterval) {
          clearInterval(presenceHeartbeatInterval);
          presenceHeartbeatInterval = null;
        }

        // create a new connection entry under the user's presence node
        const connRef = db.ref('presence/' + uid).push();
        presenceRef = connRef; // this ref points to presence/<uid>/<connId>
        connectedRef = db.ref('.info/connected');

        connectedRef.on('value', (snap) => {
          console.log('[presence] .info/connected value:', snap.val());
          if (snap.val() === true) {

            console.log('[presence] Setting online status for', uid, 'conn:', connRef.key);
            presenceRef.set({
              state: 'online',
              lastChanged: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
              console.log('[presence] Successfully set online status');
            }).catch((err) => {
              console.error('[presence] Error setting online status:', err);
            });

            // remove this connection entry on disconnect only
            presenceRef.onDisconnect().remove();
            
            // Start heartbeat to keep presence fresh
            if (presenceHeartbeatInterval) clearInterval(presenceHeartbeatInterval);
            presenceHeartbeatInterval = setInterval(() => {
              if (presenceRef) {
                presenceRef.update({
                  lastChanged: firebase.database.ServerValue.TIMESTAMP
                }).catch(() => {});
              }
            }, 30000); // Update every 30 seconds
          }
        });
      }
      
      
      let onlineUsersCache = {};
      
      let onlineCountListenerRef = null;
      
      function startOnlineCountListener() {
        console.log('[presence] startOnlineCountListener called');
        
        // Detach previous listener to prevent leaks on re-login
        if (onlineCountListenerRef) {
          onlineCountListenerRef.off('value');
        }
        
        const STALE_THRESHOLD = 2 * 60 * 1000; // 2 minutes - if no heartbeat, consider offline
        
        onlineCountListenerRef = db.ref('presence');
        onlineCountListenerRef.on('value', (snap) => {
          const data = snap.val() || {};
          const now = Date.now();
          let onlineCount = 0;
          
          
          onlineUsersCache = {};
          
          // AI is always considered online
          onlineUsersCache['aEY7gNeuGcfBErxOHNEQYFzvhpp2'] = true;
          onlineCount++; // Count AI as online
          
          Object.entries(data).forEach(([uid, presence]) => {
            try {
              // AI already counted above — skip to avoid double count
              if (uid === 'aEY7gNeuGcfBErxOHNEQYFzvhpp2') return;
              let isOnline = false;

              // presence may be the old flat object {state: 'online'}
              if (presence && typeof presence === 'object') {
                if (presence.state === 'online') {
                  // Check if it's stale (old format)
                  const lastChanged = presence.lastChanged || 0;
                  if (now - lastChanged < STALE_THRESHOLD) {
                    isOnline = true;
                  }
                } else {
                  // new format: presence/<uid> contains multiple connection children
                  Object.values(presence).forEach((conn) => {
                    if (conn && conn.state === 'online') {
                      const lastChanged = conn.lastChanged || 0;
                      if (now - lastChanged < STALE_THRESHOLD) {
                        isOnline = true;
                      }
                    }
                  });
                }
              }

              if (isOnline) {
                onlineCount++;
                onlineUsersCache[uid] = true;
              }
            } catch (e) {
              console.warn('[presence] failed to evaluate user', uid, e);
            }
          });
          
          
          const countEl = document.getElementById('onlineCount');
          if (countEl) {
            countEl.textContent = onlineCount;
          }
          
          // Update staff app popup state if function exists
          if (typeof updateModAppPopupState === 'function') {
            updateModAppPopupState();
          }
        }, (err) => {
          console.error('[presence] Error listening to presence:', err);
        });
      }
      
      // Clean up stale presence entries (run once on load for admins)
      async function cleanupStalePresence() {
        try {
          const myUid = firebase.auth().currentUser?.uid;
          if (!myUid) return;
          const snap = await db.ref('presence/' + myUid).once('value');
          const data = snap.val();
          if (!data || typeof data !== 'object') return;
          const now = Date.now();
          const STALE_THRESHOLD = 2 * 60 * 1000;
          
          if (data.state === 'online') {
            const lastChanged = data.lastChanged || 0;
            if (now - lastChanged > STALE_THRESHOLD) {
              await db.ref('presence/' + myUid).remove();
            }
          } else {
            for (const [connId, conn] of Object.entries(data)) {
              if (conn && conn.state === 'online') {
                const lastChanged = conn.lastChanged || 0;
                if (now - lastChanged > STALE_THRESHOLD) {
                  await db.ref('presence/' + myUid + '/' + connId).remove();
                }
              }
            }
          }
        } catch (e) {
          console.warn('[presence] cleanup error:', e);
        }
      }
      
      function isUserOnline(uid) {
        // AI is always online
        if (uid === 'aEY7gNeuGcfBErxOHNEQYFzvhpp2') return true;
        return onlineUsersCache[uid] === true;
      }

      
      const 
      AI_BOT_UID = 'aEY7gNeuGcfBErxOHNEQYFzvhpp2';
      
      const AI_ADMIN_UID = 'aEY7gNeuGcfBErxOHNEQYFzvhpp2';
      const aiProfileRef = db.ref('userProfiles/' + AI_BOT_UID);
      
      // Co-Owner UID (OWNER_UID is defined later in the file)
      const CO_OWNER_UID = '6n8hjmrUxhMHskX4BG8Ik9boMqa2';
      
      // Staff role levels (highest to lowest priority)
      const STAFF_ROLES = {
        HEAD_ADMIN: { name: 'Head Admin', color: 'rose', priority: 4, badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500' },
        ADMIN: { name: 'Admin', color: 'orange', priority: 3, badgeClass: 'bg-orange-500/20 text-orange-300 border border-orange-500' },
        MOD: { name: 'Mod', color: 'emerald', priority: 2, badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500' },
        TRIAL_MOD: { name: 'Trial Mod', color: 'violet', priority: 1, badgeClass: 'bg-violet-500/20 text-violet-300 border border-violet-500' }
      };
      
      // Staff permission limits (in minutes)
      const STAFF_PERMISSIONS = {
        TRIAL_MOD: {
          canWarn: true,
          canMute: true,
          maxMuteMinutes: 10, // 10 minutes
          canBan: false,
          maxBanMinutes: 0,
          canAssignRoles: false,
          canHardwareBan: false
        },
        MOD: {
          canWarn: true,
          canMute: true,
          maxMuteMinutes: 1440, // 1 day (24 hours)
          canBan: false,
          maxBanMinutes: 0,
          canAssignRoles: false,
          canHardwareBan: false
        },
        ADMIN: {
          canWarn: true,
          canMute: true,
          maxMuteMinutes: 43200, // 1 month (30 days)
          canBan: true,
          maxBanMinutes: 10080, // 1 week (7 days)
          canAssignRoles: false,
          canHardwareBan: true
        },
        HEAD_ADMIN: {
          canWarn: true,
          canMute: true,
          maxMuteMinutes: Infinity, // Unlimited
          canBan: true,
          maxBanMinutes: 43200, // 1 month (30 days)
          canAssignRoles: true,
          canHardwareBan: true
        }
      };
      
      // Cache for staff roles
      let staffRolesCache = {};
      let staffRolesLoaded = false;
      
      // Global image toggle state (controlled by HEAD_ADMIN+ via mod panel)
      let chatImagesEnabled = true;
      let imagesSettingListenerRef = null;
      
      function startImagesSettingListener() {
        if (imagesSettingListenerRef) {
          imagesSettingListenerRef.off('value');
        }
        imagesSettingListenerRef = db.ref('settings/imagesEnabled');
        imagesSettingListenerRef.on('value', (snap) => {
          // Default to true if not set
          const val = snap.val();
          chatImagesEnabled = val !== false;
          console.log('[settings] imagesEnabled:', chatImagesEnabled);
          applyImageVisibility();
        });
      }
      
      function applyImageVisibility() {
        // Toggle a CSS class on the body to hide/show all chat media
        if (chatImagesEnabled) {
          document.body.classList.remove('chat-images-hidden');
        } else {
          document.body.classList.add('chat-images-hidden');
        }
        // Update upload buttons state
        const mediaBtn = document.getElementById('mediaUploadBtn');
        const dmMediaBtn = document.getElementById('dmPageMediaBtn');
        if (mediaBtn) {
          if (!chatImagesEnabled) {
            mediaBtn.disabled = true;
            mediaBtn.title = 'Images are currently disabled by a moderator';
          } else {
            mediaBtn.disabled = false;
            mediaBtn.title = '';
          }
        }
        if (dmMediaBtn) {
          if (!chatImagesEnabled) {
            dmMediaBtn.disabled = true;
            dmMediaBtn.title = 'Images are currently disabled by a moderator';
          } else {
            dmMediaBtn.disabled = false;
            dmMediaBtn.title = '';
          }
        }
      }
      
      // Load staff roles from database
      async function loadStaffRoles() {
        try {
          const snap = await db.ref('staffRoles').once('value');
          staffRolesCache = snap.val() || {};
          staffRolesLoaded = true;
          console.log('[staff] Loaded staff roles:', Object.keys(staffRolesCache).length, 'users');
        } catch (e) {
          console.warn('[staff] Failed to load staff roles:', e);
        }
      }
      
      // Listen for staff role changes
      let lastKnownUserRole = null;
      let roleNotificationShown = false;
      
      let staffRolesListenerRef = null;
      
      function startStaffRolesListener() {
        // Detach previous listener to prevent leaks on re-login
        if (staffRolesListenerRef) {
          staffRolesListenerRef.off('value');
        }
        staffRolesListenerRef = db.ref('staffRoles');
        staffRolesListenerRef.on('value', (snap) => {
          const prevCache = { ...staffRolesCache };
          staffRolesCache = snap.val() || {};
          staffRolesLoaded = true;
          
          // Update mod panel visibility when staff roles change
          if (typeof updateModPanelVisibility === 'function') {
            updateModPanelVisibility();
          }
          
          // Check if current user's role changed
          if (currentUserId) {
            const prevEntry = prevCache[currentUserId];
            const newEntry = staffRolesCache[currentUserId];
            const prevRole = typeof prevEntry === 'string' ? prevEntry : prevEntry?.role;
            const newRole = typeof newEntry === 'string' ? newEntry : newEntry?.role;
            
            // Show notification if role changed
            if (newRole && newRole !== prevRole && !roleNotificationShown) {
              const role = STAFF_ROLES[newRole];
              if (role) {
                const prevPriority = prevRole ? (STAFF_ROLES[prevRole]?.priority || 0) : 0;
                const newPriority = STAFF_ROLES[newRole]?.priority || 0;
                
                if (prevRole && newPriority < prevPriority) {
                  // This is a demotion - ONLY show demotion notification, not promotion
                  roleNotificationShown = true; // Prevent double notification
                  checkRoleRemovalNotification();
                } else {
                  // This is promotion or new assignment
                  showStaffRoleNotification(newRole, role, prevRole ? 'changed' : 'assigned');
                  // Mark as acknowledged in Firebase
                  db.ref('staffRoleAcknowledged/' + currentUserId).set({
                    role: newRole,
                    acknowledgedAt: firebase.database.ServerValue.TIMESTAMP
                  }).catch(() => {});
                }
              }
            } else if (!newRole && prevRole && lastKnownUserRole) {
              // Role was removed entirely - check for removal reason
              roleNotificationShown = true; // Prevent double notification
              checkRoleRemovalNotification();
            }
            
            lastKnownUserRole = newRole;
          }
        }, (err) => {
          console.warn('[staff] Staff roles listener error:', err);
        });
      }
      
      // Check for pending role removal notification on login (for users who were offline when demoted/terminated)
      async function checkPendingRoleRemovalNotification(uid) {
        if (!uid) return;
        
        try {
          const removalSnap = await db.ref('staffRoleRemoved/' + uid).once('value');
          const removalData = removalSnap.val();
          
          if (removalData && !removalData.acknowledged) {
            console.log('[staff] Found unacknowledged role removal notification:', removalData);
            // Small delay to let the UI initialize
            setTimeout(() => {
              showStaffRoleRemovedNotification(removalData);
            }, 1500);
          }
        } catch (e) {
          console.warn('[staff] Error checking pending role removal:', e);
        }
      }
      
      // Check for role removal notification with reason
      async function checkRoleRemovalNotification() {
        if (!currentUserId) return;
        
        try {
          const removalSnap = await db.ref('staffRoleRemoved/' + currentUserId).once('value');
          const removalData = removalSnap.val();
          
          if (removalData && !removalData.acknowledged) {
            showStaffRoleRemovedNotification(removalData);
          } else {
            // No specific reason provided
            showStaffRoleRemovedNotification({ previousRole: lastKnownUserRole, reason: 'No reason provided' });
          }
        } catch (e) {
          showToast('Your staff role has been removed', 'info');
        }
      }
      
      // Show role removed/demoted notification popup
      function showStaffRoleRemovedNotification(data) {
        let modal = document.getElementById('staffRoleRemovedModal');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'staffRoleRemovedModal';
          modal.className = 'fixed inset-0 bg-black/80 z-[100] flex items-center justify-center hidden';
          document.body.appendChild(modal);
        }
        
        const prevRoleName = STAFF_ROLES[data.previousRole]?.name || data.previousRole || 'Staff';
        const isTermination = !data.newRole; // No new role = terminated from staff
        const newRoleName = data.newRole ? (STAFF_ROLES[data.newRole]?.name || data.newRole) : null;
        
        if (isTermination) {
          // Termination - removed from staff entirely
          modal.innerHTML = `
            <div class="bg-slate-900 border-2 border-red-500/50 p-8 rounded-2xl w-full max-w-md shadow-2xl">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                <h2 class="text-xl font-bold text-red-400">Staff Role Removed</h2>
              </div>
              <p class="text-slate-300 mb-4">Your <span class="font-semibold text-red-300">${escapeHtml(prevRoleName)}</span> position has been revoked.</p>
              <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-6">
                <p class="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">Reason Provided</p>
                <p class="text-slate-200">${escapeHtml(data.reason || 'No reason provided')}</p>
              </div>
              <p class="text-slate-400 text-sm mb-6">Staff features and the moderation panel are no longer accessible.</p>
              <button id="staffRoleRemovedClose" class="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">
                Acknowledge
              </button>
            </div>
          `;
        } else {
          // Demotion - moved to a lower role
          const newRoleColor = {
            HEAD_ADMIN: 'rose',
            ADMIN: 'orange',
            MOD: 'emerald',
            TRIAL_MOD: 'violet'
          }[data.newRole] || 'slate';
          
          modal.innerHTML = `
            <div class="bg-slate-900 border-2 border-amber-500 p-8 rounded-2xl w-full max-w-md text-center shadow-2xl">
              <div class="text-6xl mb-4">📉</div>
              <h2 class="text-2xl font-bold text-amber-400 mb-2">Role Changed</h2>
              <p class="text-slate-300 mb-2">Your role has been changed from</p>
              <div class="flex items-center justify-center gap-3 mb-4">
                <span class="px-3 py-1.5 rounded-full text-sm font-bold bg-slate-700 text-slate-300 line-through">${escapeHtml(prevRoleName)}</span>
                <span class="text-slate-500">→</span>
                <span class="px-3 py-1.5 rounded-full text-sm font-bold bg-${newRoleColor}-500/20 text-${newRoleColor}-300 border border-${newRoleColor}-500">${escapeHtml(newRoleName)}</span>
              </div>
              <div class="bg-amber-950/50 border border-amber-800 rounded-lg p-4 mb-6 text-left">
                <p class="text-xs text-amber-400 uppercase tracking-wider mb-1 font-semibold">Reason</p>
                <p class="text-slate-200">${escapeHtml(data.reason || 'No reason provided')}</p>
              </div>
              <p class="text-slate-400 text-sm mb-6">Your permissions have been updated accordingly.</p>
              <button id="staffRoleRemovedClose" class="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold transition-colors">
                Got It
              </button>
            </div>
          `;
        }
        
        modal.classList.remove('hidden');
        
        const closeBtn = document.getElementById('staffRoleRemovedClose');
        if (closeBtn) {
          closeBtn.onclick = async () => {
            modal.classList.add('hidden');
            // Mark as acknowledged
            try {
              await db.ref('staffRoleRemoved/' + currentUserId).update({ acknowledged: true });
            } catch (e) {}
            // Clear the removal record
            try {
              await db.ref('staffRoleRemoved/' + currentUserId).remove();
            } catch (e) {}
          };
        }
        
        modal.onclick = (e) => {
          if (e.target === modal) {
            closeBtn?.click();
          }
        };
      }
      
      // Modal for entering demotion/termination reason
      function showStaffActionReasonModal(actionType, targetUsername, oldRoleName, newRoleName = null) {
        return new Promise((resolve) => {
          let modal = document.getElementById('staffActionReasonModal');
          if (!modal) {
            modal = document.createElement('div');
            modal.id = 'staffActionReasonModal';
            modal.className = 'fixed inset-0 bg-black/80 z-[100] flex items-center justify-center hidden';
            document.body.appendChild(modal);
          }
          
          const isTermination = actionType === 'terminate';
          const titleText = isTermination ? 'Remove from Staff' : 'Demote Staff Member';
          const descText = isTermination 
            ? `You are removing <strong>${escapeHtml(targetUsername)}</strong> from the <strong>${escapeHtml(oldRoleName)}</strong> position.`
            : `You are demoting <strong>${escapeHtml(targetUsername)}</strong> from <strong>${escapeHtml(oldRoleName)}</strong> to <strong>${escapeHtml(newRoleName)}</strong>.`;
          const color = isTermination ? 'red' : 'amber';
          const emoji = isTermination ? '🚫' : '📉';
          
          modal.innerHTML = `
            <div class="bg-slate-900 border-2 border-${color}-500 p-6 rounded-2xl w-full max-w-md shadow-2xl">
              <div class="text-center mb-4">
                <div class="text-5xl mb-3">${emoji}</div>
                <h2 class="text-xl font-bold text-${color}-400">${titleText}</h2>
              </div>
              <p class="text-slate-300 text-sm text-center mb-4">${descText}</p>
              <div class="mb-4">
                <label class="block text-xs text-slate-400 mb-2 font-medium">Reason (will be shown to them)</label>
                <textarea 
                  id="staffActionReasonInput" 
                  class="w-full p-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm focus:border-${color}-500 focus:ring-2 focus:ring-${color}-500/30 outline-none resize-none"
                  rows="3"
                  placeholder="Enter the reason for this action..."
                  maxlength="500"
                ></textarea>
              </div>
              <div class="flex gap-3">
                <button id="staffActionReasonCancel" class="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors">
                  Cancel
                </button>
                <button id="staffActionReasonConfirm" class="flex-1 py-2.5 bg-${color}-600 hover:bg-${color}-500 text-white rounded-lg font-medium transition-colors">
                  ${isTermination ? 'Remove' : 'Demote'}
                </button>
              </div>
            </div>
          `;
          
          modal.classList.remove('hidden');
          
          const input = document.getElementById('staffActionReasonInput');
          const cancelBtn = document.getElementById('staffActionReasonCancel');
          const confirmBtn = document.getElementById('staffActionReasonConfirm');
          
          setTimeout(() => input?.focus(), 100);
          
          const cleanup = () => {
            modal.classList.add('hidden');
            modal.onclick = null;
          };
          
          cancelBtn.onclick = () => {
            cleanup();
            resolve(null); // Cancelled
          };
          
          confirmBtn.onclick = () => {
            const reason = input.value.trim() || 'No reason provided';
            cleanup();
            resolve(reason);
          };
          
          input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              confirmBtn.click();
            } else if (e.key === 'Escape') {
              cancelBtn.click();
            }
          };
          
          modal.onclick = (e) => {
            if (e.target === modal) {
              cancelBtn.click();
            }
          };
        });
      }
      
      // Show staff role assignment notification popup
      function showStaffRoleNotification(roleKey, role, type = 'assigned') {
        // Create modal if it doesn't exist
        let modal = document.getElementById('staffRoleNotificationModal');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'staffRoleNotificationModal';
          modal.className = 'fixed inset-0 bg-black/80 z-[100] flex items-center justify-center hidden';
          document.body.appendChild(modal);
        }
        
        const roleColors = {
          HEAD_ADMIN: 'rose',
          ADMIN: 'orange',
          MOD: 'emerald',
          TRIAL_MOD: 'violet'
        };
        const color = roleColors[roleKey] || 'slate';
        const isPromotion = type === 'assigned' || type === 'changed';
        
        modal.innerHTML = `
          <div class="bg-slate-900 border-2 border-${color}-500 p-8 rounded-2xl w-full max-w-md text-center shadow-2xl">
            <div class="text-6xl mb-4">${isPromotion ? '🎉' : '📋'}</div>
            <h2 class="text-2xl font-bold text-slate-100 mb-2">${isPromotion ? 'Congratulations!' : 'Role Updated'}</h2>
            <p class="text-slate-300 mb-4">You have been ${type === 'changed' ? 'updated to' : 'promoted to'}</p>
            <div class="inline-block px-6 py-3 rounded-full text-lg font-bold mb-6 bg-${color}-500/20 text-${color}-300 border-2 border-${color}-500">
              ${role.name}
            </div>
            <p class="text-slate-400 text-sm mb-6">You now have access to the moderation panel and staff features.</p>
            <button id="staffRoleNotificationClose" class="w-full py-3 bg-${color}-600 hover:bg-${color}-500 text-white rounded-lg font-semibold transition-colors">
              Got it!
            </button>
          </div>
        `;
        
        // Show modal
        modal.classList.remove('hidden');
        roleNotificationShown = true;
        
        // Wire up close button
        const closeBtn = document.getElementById('staffRoleNotificationClose');
        if (closeBtn) {
          closeBtn.onclick = () => {
            modal.classList.add('hidden');
          };
        }
        
        // Close on backdrop click
        modal.onclick = (e) => {
          if (e.target === modal) {
            modal.classList.add('hidden');
          }
        };
      }
      
      // Check for unacknowledged role assignment on login
      async function checkPendingRoleNotification() {
        if (!currentUserId) return;
        
        const staffEntry = staffRolesCache[currentUserId];
        if (!staffEntry) return;
        
        const roleKey = typeof staffEntry === 'string' ? staffEntry : staffEntry?.role;
        if (!roleKey || !STAFF_ROLES[roleKey]) return;
        
        // Check if already acknowledged
        try {
          const ackSnap = await db.ref('staffRoleAcknowledged/' + currentUserId).once('value');
          const ackData = ackSnap.val();
          
          if (!ackData || ackData.role !== roleKey) {
            // Not acknowledged yet, show notification
            showStaffRoleNotification(roleKey, STAFF_ROLES[roleKey]);
          }
        } catch (e) {
          console.warn('[staff] Error checking role acknowledgment:', e);
        }
      }
      
      // Get user's staff role (returns null if not staff)
      function getUserStaffRole(uid) {
        if (!uid || !staffRolesCache[uid]) return null;
        const staffEntry = staffRolesCache[uid];
        // Handle both old format (just string) and new format (object with role property)
        const roleKey = typeof staffEntry === 'string' ? staffEntry : staffEntry?.role;
        if (roleKey && STAFF_ROLES[roleKey]) {
          return { key: roleKey, ...STAFF_ROLES[roleKey] };
        }
        return null;
      }
      
      // Get badge HTML for a staff role
      function getStaffRoleBadge(roleKey, small = false) {
        const role = STAFF_ROLES[roleKey];
        if (!role) return '';
        
        const colors = {
          rose: 'bg-rose-500/15 text-rose-100 border-rose-400/40',
          orange: 'bg-orange-500/15 text-orange-100 border-orange-400/40',
          emerald: 'bg-emerald-500/15 text-emerald-100 border-emerald-400/40',
          violet: 'bg-violet-500/15 text-violet-100 border-violet-400/40'
        };
        
        const colorClass = colors[role.color] || 'bg-slate-500/15 text-slate-100 border-slate-400/40';
        const sizeClass = small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';
        
        return '<span class="ml-1 ' + sizeClass + ' rounded-full ' + colorClass + ' border">' + role.name + '</span>';
      }
      
      // Get permissions for current user
      function getCurrentUserPermissions() {
        const uid = currentUserId;
        
        // Owner and Co-Owner have full permissions
        if (uid === 'u5yKqiZvioWuBGcGK3SWUBpUVrc2' || uid === '6n8hjmrUxhMHskX4BG8Ik9boMqa2') {
          return {
            canWarn: true,
            canMute: true,
            maxMuteMinutes: Infinity,
            canBan: true,
            maxBanMinutes: Infinity,
            canAssignRoles: true,
            canHardwareBan: true,
            isOwner: uid === 'u5yKqiZvioWuBGcGK3SWUBpUVrc2',
            isCoOwner: uid === '6n8hjmrUxhMHskX4BG8Ik9boMqa2'
          };
        }
        
        // Check staff role
        const staffRole = getUserStaffRole(uid);
        if (staffRole && STAFF_PERMISSIONS[staffRole.key]) {
          return { ...STAFF_PERMISSIONS[staffRole.key], staffRole: staffRole.key };
        }
        
        // Legacy admin check
        if (isAdmin) {
          return STAFF_PERMISSIONS.ADMIN;
        }
        
        // No permissions
        return {
          canWarn: false,
          canMute: false,
          maxMuteMinutes: 0,
          canBan: false,
          maxBanMinutes: 0,
          canAssignRoles: false,
          canHardwareBan: false
        };
      }
      
      // Check if current user is any kind of staff
      function isCurrentUserStaff() {
        const uid = currentUserId;
        if (!uid) return false;
        
        // Owner or Co-Owner
        if (uid === 'u5yKqiZvioWuBGcGK3SWUBpUVrc2' || uid === '6n8hjmrUxhMHskX4BG8Ik9boMqa2') return true;
        
        // Has staff role
        if (staffRolesCache[uid]) return true;
        
        // Legacy admin
        if (isAdmin) return true;
        
        return false;
      }
      
      // Check if user can perform action with given duration
      function canPerformMute(minutes) {
        const perms = getCurrentUserPermissions();
        if (!perms.canMute) return false;
        if (perms.maxMuteMinutes === Infinity) return true;
        return minutes <= perms.maxMuteMinutes;
      }
      
      function canPerformBan(minutes) {
        const perms = getCurrentUserPermissions();
        if (!perms.canBan) return false;
        if (perms.maxBanMinutes === Infinity) return true;
        return minutes <= perms.maxBanMinutes;
      }
      
      // Check if user can manage (assign/remove) another user's role
      function canManageStaffRole(targetUid, targetRoleKey = null) {
        const perms = getCurrentUserPermissions();
        const uid = currentUserId;
        
        // Owner can manage anyone
        if (uid === 'u5yKqiZvioWuBGcGK3SWUBpUVrc2') return true;
        
        // Co-Owner can manage anyone except owner
        if (uid === '6n8hjmrUxhMHskX4BG8Ik9boMqa2') {
          return targetUid !== 'u5yKqiZvioWuBGcGK3SWUBpUVrc2';
        }
        
        // Head Admin can manage lower roles
        const myRole = getUserStaffRole(uid);
        if (myRole?.key === 'HEAD_ADMIN') {
          // Can't assign Head Admin role
          if (targetRoleKey === 'HEAD_ADMIN') return false;
          
          // Check target's current role
          const targetRole = getUserStaffRole(targetUid);
          if (!targetRole) return true; // Can assign to non-staff
          
          // Can only manage lower priority roles
          return targetRole.priority < myRole.priority;
        }
        
        return false;
      }
      
      // Assign staff role to user (only Owner, Co-Owner, Head Admin can do this)
      async function assignStaffRole(targetUid, roleKey, username = null, reason = null) {
        const perms = getCurrentUserPermissions();
        
        // Check basic permission
        if (!perms.canAssignRoles && !canManageStaffRole(targetUid, roleKey)) {
          showToast('You do not have permission to assign roles', 'error');
          return false;
        }
        
        // Additional check for Head Admins
        if (!perms.isOwner && !perms.isCoOwner) {
          if (!canManageStaffRole(targetUid, roleKey)) {
            showToast('You can only manage lower-ranked staff', 'error');
            return false;
          }
        }
        
        if (roleKey && !STAFF_ROLES[roleKey]) {
          showToast('Invalid role', 'error');
          return false;
        }
        
        try {
          if (roleKey) {
            // Get username if not provided
            let targetUsername = username;
            if (!targetUsername) {
              const userSnap = await db.ref('users/' + targetUid + '/username').once('value');
              targetUsername = userSnap.val() || 'Unknown';
            }
            
            await db.ref('staffRoles/' + targetUid).set({
              role: roleKey,
              username: targetUsername,
              assignedBy: currentUserId,
              assignedAt: firebase.database.ServerValue.TIMESTAMP
            });
            showToast('Assigned ' + STAFF_ROLES[roleKey].name + ' role', 'success');
          } else {
            // Get the previous role before removing
            const prevSnap = await db.ref('staffRoles/' + targetUid).once('value');
            const prevData = prevSnap.val();
            const prevRole = typeof prevData === 'string' ? prevData : prevData?.role;
            
            // Store removal reason
            if (reason || prevRole) {
              await db.ref('staffRoleRemoved/' + targetUid).set({
                previousRole: prevRole || 'Unknown',
                reason: reason || 'No reason provided',
                removedBy: currentUserId,
                removedAt: firebase.database.ServerValue.TIMESTAMP,
                acknowledged: false
              });
            }
            
            await db.ref('staffRoles/' + targetUid).remove();
            showToast('Removed staff role', 'success');
          }
          return true;
        } catch (e) {
          console.error('[staff] Failed to assign role:', e);
          showToast('Failed to assign role: ' + (e.message || 'Permission denied'), 'error');
          return false;
        }
      }
      
      // Web search functionality using Cloudflare Worker + Google CSE
      const SEARCH_WORKER_URL = 'https://chatra-search.modmojheh.workers.dev';
      
      async function performWebSearch(query, searchImages = false) {
        try {
          const response = await fetch(SEARCH_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, searchImages })
          });
          
          if (!response.ok) {
            console.warn('[search] worker returned', response.status);
            return null;
          }
          
          const data = await response.json();
          return data;
        } catch (e) {
          console.warn('[search] failed:', e);
          return null;
        }
      }
      
      // Display a single image inline within a message bubble
      function displaySingleImage(imageData, bubbleElement) {
        if (!imageData || !bubbleElement) return;
        
        const imageUrl = imageData.image || imageData.originalImage;
        const linkUrl = imageData.originalImage || imageData.link;
        
        if (!imageUrl) return;
        
        const imageContainer = document.createElement('div');
        imageContainer.className = 'mt-2 rounded-lg overflow-hidden max-w-sm';
        
        const link = document.createElement('a');
        link.href = linkUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'block';
        
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = imageData.title || 'Image';
        img.className = 'w-full h-auto rounded-lg border border-slate-600 hover:opacity-90 transition-opacity cursor-pointer';
        img.loading = 'lazy';
        img.onerror = function() {
          // Try original image if thumbnail fails
          if (imageData.originalImage && this.src !== imageData.originalImage) {
            this.src = imageData.originalImage;
          } else {
            imageContainer.remove();
          }
        };
        
        link.appendChild(img);
        imageContainer.appendChild(link);
        // Scan search result images for NSFW
        if (typeof scanDisplayedImage === 'function') scanDisplayedImage(img);
        
        // Add source label
        if (imageData.source) {
          const sourceLabel = document.createElement('p');
          sourceLabel.className = 'text-[10px] text-slate-400 mt-1 truncate';
          sourceLabel.textContent = imageData.source;
          imageContainer.appendChild(sourceLabel);
        }
        
        bubbleElement.appendChild(imageContainer);
      }
      
      function displaySearchResults(query, results, bubbleElement = null) {
        if (!results || !results.results || results.results.length === 0) {
          showToast('No search results found for: ' + query, 'info');
          return;
        }
        
        const isImageSearch = results.searchType === 'image';
        
        // If we have a bubble element, display inline - otherwise use modal
        if (bubbleElement) {
          const resultsContainer = document.createElement('div');
          resultsContainer.className = 'mt-3 rounded-lg border border-slate-600/50 overflow-hidden bg-slate-800/50';
          
          if (isImageSearch) {
            // Inline image grid
            resultsContainer.innerHTML = `
              <div class="p-2 border-b border-slate-700/50 text-xs text-slate-400">
                🖼️ Image results for: ${escapeHtml(query)}
              </div>
              <div class="p-2 grid grid-cols-2 gap-2">
                ${results.results.slice(0, 6).map((result, i) => `
                  <a href="${escapeHtml(result.originalImage || result.link)}" target="_blank" rel="noopener noreferrer" 
                     class="group relative overflow-hidden rounded border border-slate-700 hover:border-sky-500/50 transition-colors block aspect-square">
                    <img src="${escapeHtml(result.image)}" alt="${escapeHtml(result.title)}" 
                         class="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                         loading="lazy" onerror="this.parentElement.style.display='none'">
                  </a>
                `).join('')}
              </div>
            `;
          } else {
            // Inline web results - compact card style
            resultsContainer.innerHTML = `
              <div class="p-2 border-b border-slate-700/50 text-xs text-slate-400">
                🔍 Search results for: ${escapeHtml(query)}
              </div>
              <div class="p-2 space-y-2">
                ${results.results.slice(0, 3).map((result, i) => `
                  <div class="border border-slate-700/50 rounded p-2 hover:bg-slate-700/30 transition-colors">
                    ${result.image ? `<div class="mb-2 rounded overflow-hidden"><img src="${escapeHtml(result.image)}" alt="" class="w-full h-auto max-h-32 object-cover rounded" onerror="this.style.display='none'"></div>` : ''}
                    <a href="${escapeHtml(result.link)}" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:text-sky-300 font-medium text-sm break-words block">
                      ${escapeHtml(result.title)}
                    </a>
                    <p class="text-[10px] text-slate-500 mt-0.5">${escapeHtml(result.displayLink)}</p>
                    <p class="text-xs text-slate-300 mt-1 line-clamp-2">${escapeHtml(result.snippet)}</p>
                  </div>
                `).join('')}
              </div>
            `;
          }
          
          bubbleElement.appendChild(resultsContainer);
          
          // Scroll to show results
          setTimeout(() => {
            const messagesDiv = document.getElementById('messages');
            if (messagesDiv) {
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
          }, 100);
          return;
        }
        
        // Modal fallback (for cases where bubble isn't available)
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
        
        let resultsHTML = '';
        
        if (isImageSearch) {
          // Image grid layout - fixed aspect ratio to prevent cutoff
          resultsHTML = `
            <div class="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[85vh] overflow-y-auto border border-slate-700">
              <div class="sticky top-0 bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center z-10">
                <h3 class="text-lg font-bold text-white">Image Results for: ${escapeHtml(query)}</h3>
                <button class="text-slate-400 hover:text-white transition-colors text-2xl" id="closeSearchBtn">✕</button>
              </div>
              <div class="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                ${results.results.map((result, i) => `
                  <a href="${escapeHtml(result.originalImage || result.link)}" target="_blank" rel="noopener noreferrer" 
                     class="group relative overflow-hidden rounded-lg border border-slate-700 hover:border-sky-500 transition-all aspect-square bg-slate-900">
                    <img src="${escapeHtml(result.image)}" alt="${escapeHtml(result.title)}" 
                         class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                         loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23374151%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2212%22 fill=%22%239CA3AF%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3EImage unavailable%3C/text%3E%3C/svg%3E'">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div class="absolute bottom-0 left-0 right-0 p-2">
                        <p class="text-xs text-white line-clamp-2 font-medium">${escapeHtml(result.title)}</p>
                        <p class="text-[10px] text-gray-300">${escapeHtml(result.source)}</p>
                      </div>
                    </div>
                  </a>
                `).join('')}
              </div>
            </div>
          `;
        } else {
          // Web results with optional images
          resultsHTML = `
            <div class="bg-slate-800 rounded-lg max-w-3xl w-full max-h-[85vh] overflow-y-auto border border-slate-700">
              <div class="sticky top-0 bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center z-10">
                <h3 class="text-lg font-bold text-white">Search Results for: ${escapeHtml(query)}</h3>
                <button class="text-slate-400 hover:text-white transition-colors text-2xl" id="closeSearchBtn">✕</button>
              </div>
              <div class="p-4 space-y-4">
                ${results.results.map((result, i) => `
                  <div class="border border-slate-700 rounded-lg p-3 hover:bg-slate-700/50 transition-colors">
                    ${result.image ? `<div class="mb-2 rounded-lg overflow-hidden"><img src="${escapeHtml(result.image)}" alt="" class="w-full h-auto object-cover max-h-48 rounded-lg" onerror="this.style.display='none'"></div>` : ''}
                    <a href="${escapeHtml(result.link)}" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:text-sky-300 font-semibold break-words">
                      ${escapeHtml(result.title)}
                    </a>
                    <p class="text-xs text-slate-400 mt-1">${escapeHtml(result.displayLink)}</p>
                    <p class="text-sm text-slate-300 mt-2 line-clamp-3">${escapeHtml(result.snippet)}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
        
        modal.innerHTML = resultsHTML;
        document.body.appendChild(modal);
        
        document.getElementById('closeSearchBtn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.remove();
        });
      }
      
      
      let aiProfile = { name: 'Chatra AI', avatar: null, bio: '', username: 'AI' };
      
      
      const AI_MEMORY_LIMIT = 8000; // Increased from 1000 for better context retention
      const aiConversationMemory = new Map(); 
      
      // Try to restore AI memory from sessionStorage on load
      function restoreAiMemory() {
        try {
          const saved = sessionStorage.getItem('aiConversationMemory');
          if (saved) {
            const parsed = JSON.parse(saved);
            for (const [key, value] of Object.entries(parsed)) {
              aiConversationMemory.set(key, value);
            }
            console.log('[AI] Restored conversation memory from session');
          }
        } catch (e) {
          console.warn('[AI] Failed to restore memory:', e);
        }
      }
      restoreAiMemory();
      
      // Save AI memory to sessionStorage
      function saveAiMemory() {
        try {
          const obj = {};
          for (const [key, value] of aiConversationMemory.entries()) {
            obj[key] = value;
          }
          sessionStorage.setItem('aiConversationMemory', JSON.stringify(obj));
        } catch (e) {
          console.warn('[AI] Failed to save memory:', e);
        }
      }
      
      function addToAiMemory(userId, role, content, username = null, imageContext = null) {
        if (!aiConversationMemory.has(userId)) {
          aiConversationMemory.set(userId, { username: username || 'User', history: [] });
        }
        const memEntry = aiConversationMemory.get(userId);
        if (username) memEntry.username = username;
        
        // Include image context if provided
        let fullContent = content;
        if (imageContext) {
          fullContent = `${content} ${imageContext}`;
        }
        
        memEntry.history.push({ role, content: fullContent });
        
        let totalChars = memEntry.history.reduce((sum, m) => sum + m.content.length, 0);
        while (totalChars > AI_MEMORY_LIMIT && memEntry.history.length > 2) {
          const removed = memEntry.history.shift();
          totalChars -= removed.content.length;
        }
        
        // Persist to sessionStorage
        saveAiMemory();
      }
      
      function getAiMemory(userId) {
        const memEntry = aiConversationMemory.get(userId);
        const history = memEntry ? memEntry.history : [];
        
        // Determine chat context
        let chatContext = "Global Chat";
        if (currentPage === 'groups' && activeGroupId) {
          const groupName = (typeof cachedGroups !== 'undefined' && cachedGroups[activeGroupId]) ? cachedGroups[activeGroupId].name : activeGroupId;
          chatContext = `the ${groupName} group`;
        } else if (currentPage === 'dms' && activeDMTarget) {
          chatContext = `a direct message with ${activeDMTarget.username || 'a user'}`;
        }
        
        // Prepend system context about Chatra with chat awareness and web search capability
        const systemContext = {
          role: 'system',
          content: `You are Chatra AI, the intelligent assistant for Chatra - a vibrant, modern real-time chat platform. You are currently in ${chatContext}.

CRITICAL - MEMORY & CONTEXT:
- You MUST remember the ENTIRE conversation history provided to you
- When users reference "that", "it", "the image", etc., look at previous messages for context
- If a user says something doesn't match (e.g., "that's not a dog"), acknowledge your mistake and the context
- ALWAYS maintain continuity - never say "I don't see any previous message" if history exists
- The conversation history below contains everything said so far - USE IT

⚠️ IMAGE LIMITATIONS:
- You CANNOT actually see or analyze images that users share or that you display
- When you use [IMAGE: query], you're searching the web - results may not be perfect
- If a user says an image is wrong, APOLOGIZE and acknowledge the search wasn't accurate
- You can search for better images with more specific queries
- Be honest: "I searched for X but I can't actually see what image appeared for you"

Chatra is a feature-rich social messaging app where users can:
- Chat in the public Global Chat with everyone online
- Create and join Groups for topic-based discussions  
- Send Direct Messages (DMs) to friends
- Customize their profiles with avatars, bios, and profile frames
- Mention users with @ to notify them instantly
- Share images, GIFs, and media in conversations
- See who's online with real-time presence indicators

🔍 WEB SEARCH - Use [SEARCH: query] ONLY when:
- User EXPLICITLY asks "search for...", "look up...", "find info about..."
- User needs VERY recent news (last few days)
- You genuinely cannot answer without current data
- DO NOT search for general knowledge - just answer directly!

🖼️ IMAGE FEATURES - Use ONLY when user explicitly asks:
- [IMAGE: query] - Single image (user asks "show me a picture of X" or "show me a gif of X")
- [IMAGE_SEARCH: query] - Multiple images (user asks "show me pictures of X")
- GIFs are ALLOWED - when user asks for a GIF, use [IMAGE: animated gif X] or [IMAGE: X gif]
- NEVER add images unless specifically requested
- If image result is wrong, apologize and offer to search with better terms

Be helpful, remember context, and maintain conversation continuity. You're friendly and conversational!`
        };
        
        return [systemContext, ...history];
      }
      
      function getAiUsername(userId) {
        const memEntry = aiConversationMemory.get(userId);
        return memEntry ? memEntry.username : 'User';
      }
      
      function clearAiMemory(userId) {
        aiConversationMemory.delete(userId);
      }
      
      
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

      
      
      function sendAnalyticsEvent(name, params = {}) {
        
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
        try {
          if (window.gtag) {
            try { window.gtag('event', name, params); } catch (e) {  }
          }
        } catch (e) {}
        try {
          if (firebase && firebase.analytics) {
            try { firebase.analytics().logEvent(name, params); } catch (e) {  }
          }
        } catch (e) {}
      }

      console.log("[init] firebase initialized");

      
      const loginForm = document.getElementById("loginForm");
      const registerForm = document.getElementById("registerForm");
      const chatInterface = document.getElementById("chatInterface");
      const loadingScreen = document.getElementById("loadingScreen");

      
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

      
      const guidelinesModal = document.getElementById("guidelinesModal");
      const guidelinesAgreeBtn = document.getElementById("guidelinesAgreeBtn");
      const guidelinesCheckbox = document.getElementById("guidelinesCheckbox");

      
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

      
      
      let guidelinesAcceptedResolver = null;
      async function checkAndShowGuidelines(uid) {
        if (!uid || !guidelinesModal) return Promise.resolve();
        try {
          const snap = await firebase.database().ref(`users/${uid}/guidelinesAccepted`).once('value');
          if (!snap.exists() || snap.val() !== true) {
            
            resetGuidelinesModal();
            
            guidelinesModal.classList.remove('modal-closed');
            guidelinesModal.classList.add('modal-open');
            
            return new Promise(resolve => {
              guidelinesAcceptedResolver = resolve;
            });
          }
        } catch (e) {
          console.error('Error checking guidelines acceptance:', e);
        }
        return Promise.resolve();
      }

      
      if (guidelinesAgreeBtn) {
        guidelinesAgreeBtn.addEventListener('click', async () => {
          if (guidelinesAgreeBtn.disabled) return;
          const user = firebase.auth().currentUser;
          if (!user) return;
          
          try {
            
            await firebase.database().ref(`users/${user.uid}/guidelinesAccepted`).set(true);
            await firebase.database().ref(`users/${user.uid}/guidelinesAcceptedAt`).set(firebase.database.ServerValue.TIMESTAMP);
            
            
            try { localStorage.setItem('chatra_guidelines_ack', '1'); } catch (e) {}
            
            
            guidelinesModal.classList.add('modal-closed');
            guidelinesModal.classList.remove('modal-open');
            
            
            resetGuidelinesModal();
            
            
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

      
      let currentUsername = null; 
      let currentUserId = null;

      
      let activeDMThread = null;
      let activeDMTarget = null; 
      let dmMessagesRef = null;
      let dmMessagesListener = null;
      let dmChildChangedListener = null;
      let dmInboxRef = null;
      let dmInboxListener = null;
      let dmUnreadCounts = {}; 
      let dmLastSeenByThread = {};
      let dmLastUpdateTimeByThread = {}; 
      let dmInboxInitialLoaded = false;

      
      let activeGroupId = null;
      let groupMessagesRef = null;
      let groupMessagesListener = null;
      let groupsPageInitialLoaded = false;
      let cachedGroups = {}; 

      
      function showToast(message, type = 'info', duration = 4000) {
        
        const existing = document.getElementById('globalToast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.id = 'globalToast';
        const bgColor = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-slate-700';
        toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-[9999] text-sm font-medium max-w-xs text-center animate-fade-in`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s';
          setTimeout(() => toast.remove(), 300);
        }, duration);
      }

      
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
        if (!currentUserId) return { theme: "dark", messageSize: "medium", fastMode: true, ratingOptOut: false, ratingLastPrompt: 0, accentColor: null };
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
            accentColor: data.accentColor || null,
          };
        } catch (err) {
          console.warn("[settings] failed to load user settings", err);
          return { theme: "dark", messageSize: "medium", fastMode: true, ratingOptOut: false, ratingLastPrompt: 0, accentColor: null };
        }
      }

      
      let friendsCache = new Set();
      let notificationHistory = [];
      let clearedNotificationThreads = new Set(); 
      
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

      
      let messagesRemoveRef = null;
      let messagesRemoveListener = null;
      let messagesChangedListener = null;

      
      let messagesRef = null;      
      let messagesListener = null; 
      const seenMessageKeys = new Set();
      let blockedUsersCache = new Set(); 
      let reportedMessages = new Set(); 

      
      let mentionAutocomplete = null; 
      let mentionUsers = new Map(); 
      let mentionSelectedIndex = 0;
      let mentionQuery = "";
      let mentionStartPos = -1;
      let activeMentionInput = null; 
      
      let mentionNotified = new Set();

      
      function isGifUrl(url) {
        if (!url) return false;
        const lower = url.toLowerCase();
        return lower.includes('.gif') || lower.includes('gif');
      }

      function replayGif(imgElement) {
        if (!imgElement || !imgElement.src) return;
        
        let src = imgElement.src.split('?')[0];
        
        const cacheBuster = '?t=' + Date.now();
        imgElement.src = '';
        
        setTimeout(() => {
          imgElement.src = src + cacheBuster;
        }, 50);
      }

      async function loadMentionedNotifsFromStorage() {
        // Load from Firebase if user is logged in, fallback to localStorage
        return new Promise((resolve) => {
          if (currentUserId) {
            db.ref('userMentionNotified/' + currentUserId).once('value').then(snap => {
              const data = snap.val();
              if (data && typeof data === 'object') {
                mentionNotified = new Set(Object.keys(data));
              }
              console.log('[mentions] loaded', mentionNotified.size, 'notified mentions from Firebase');
              resolve();
            }).catch(() => {
              // Fallback to localStorage
              try {
                const raw = localStorage.getItem('mentions-notified');
                if (raw) {
                  const arr = JSON.parse(raw);
                  mentionNotified = new Set(Array.isArray(arr) ? arr : []);
                }
              } catch (e) {
                mentionNotified = new Set();
              }
              resolve();
            });
          } else {
            try {
              const raw = localStorage.getItem('mentions-notified');
              if (raw) {
                const arr = JSON.parse(raw);
                mentionNotified = new Set(Array.isArray(arr) ? arr : []);
              }
            } catch (e) {
              mentionNotified = new Set();
            }
            resolve();
          }
        });
      }

      function markMentionNotified(id) {
        try {
          if (!id) return;
          mentionNotified.add(id);
          // Save to Firebase if logged in
          if (currentUserId) {
            db.ref('userMentionNotified/' + currentUserId + '/' + id).set(true).catch(() => {});
          }
          // Also save to localStorage as fallback
          localStorage.setItem('mentions-notified', JSON.stringify(Array.from(mentionNotified)));
        } catch (e) {
          
        }
      }

      
      let currentPage = 'global'; 
      let dmPageMessagesRef = null;
      let dmPageMessagesListener = null;
      let dmPageMessagesQueryRef = null;

      
      function updateNavSlider(activeTab) {
        const slider = document.getElementById('navSlider');
        const container = document.getElementById('navTabsContainer');
        if (!slider || !container || !activeTab) return;
        
        const containerRect = container.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        const leftOffset = tabRect.left - containerRect.left;
        
        
        if (FAST_MODE_ENABLED) {
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
        
        
        const navGlobal = document.getElementById('navGlobalChat');
        const navDMs = document.getElementById('navDMs');
        const navGroups = document.getElementById('navGroups');
        const navGlobal2 = document.getElementById('navGlobalChat2');
        const navDMs2 = document.getElementById('navDMs2');
        const navGroups2 = document.getElementById('navGroups2');
        
        if (page === 'global') {
          
          if (chatInterface) chatInterface.classList.remove('hidden');
          if (dmPage) dmPage.classList.add('hidden');
          const groupsPage = document.getElementById('groupsPage');
          if (groupsPage) groupsPage.classList.add('hidden');
          
          
          navGlobal?.classList.add('active');
          navDMs?.classList.remove('active');
          navGroups?.classList.remove('active');
          navGlobal2?.classList.add('active');
          navDMs2?.classList.remove('active');
          navGroups2?.classList.remove('active');
          
          updateNavSlider(navGlobal);
          
          const headerStaffApp = document.getElementById('headerStaffApp');
          if (headerStaffApp) headerStaffApp.classList.remove('hidden');
        } else if (page === 'dms') {
          
          if (chatInterface) chatInterface.classList.add('hidden');
          if (dmPage) dmPage.classList.remove('hidden');
          const groupsPage = document.getElementById('groupsPage');
          if (groupsPage) groupsPage.classList.add('hidden');
          
          
          navGlobal?.classList.remove('active');
          navDMs?.classList.add('active');
          navGroups?.classList.remove('active');
          navGlobal2?.classList.remove('active');
          navDMs2?.classList.add('active');
          navGroups2?.classList.remove('active');
          
          updateNavSlider(navDMs);
          
          
          initDmPage();
          
          const headerStaffApp = document.getElementById('headerStaffApp');
          if (headerStaffApp) headerStaffApp.classList.add('hidden');
        } else if (page === 'groups') {
          
          if (chatInterface) chatInterface.classList.add('hidden');
          if (dmPage) dmPage.classList.add('hidden');
          const groupsPage = document.getElementById('groupsPage');
          if (groupsPage) groupsPage.classList.remove('hidden');

          
          navGlobal?.classList.remove('active');
          navDMs?.classList.remove('active');
          navGroups?.classList.add('active');
          navGlobal2?.classList.remove('active');
          navDMs2?.classList.remove('active');
          navGroups2?.classList.add('active');
          
          updateNavSlider(navGroups);

          
          initGroupsPage();
          const headerStaffApp = document.getElementById('headerStaffApp');
          if (headerStaffApp) headerStaffApp.classList.add('hidden');
        }
      }

      function initDmPage() {
        
        const dmPageUserLabel = document.getElementById('dmPageUserLabel');
        if (dmPageUserLabel && currentUsername) {
          dmPageUserLabel.textContent = currentUsername;
        }
        
        if (!dmInboxRef) {
          loadDmInbox().catch(() => {});
        }
        
        loadDmPageConversations();
      }

      
      async function initGroupsPage() {
        const label = document.getElementById('groupsPageUserLabel');
        if (label && currentUsername) label.textContent = currentUsername;
        
        
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
        
        
        renderGroupsList(cachedGroups, q);
      }
      
      
      let activeGroupTab = 'yours';
      
      function renderGroupsList(groups, filterQuery = '') {
        const listEl = document.getElementById('groupsPageConversationList');
        if (!listEl) return;
        
        listEl.innerHTML = '';
        
        
        const yourGroups = [];
        const publicGroups = [];
        
        Object.entries(groups).forEach(([groupId, info]) => {
          if (!info) return;
          const isMember = info.members && info.members[currentUserId];
          const isPublic = info.isPublic === true;
          
          
          const memberCount = info.members ? Object.keys(info.members).filter(k => info.members[k]).length : 0;
          
          
          const name = info.name || ('Group ' + groupId);
          if (filterQuery && !name.toLowerCase().includes(filterQuery) && !groupId.toLowerCase().includes(filterQuery)) {
            return;
          }
          
          
          if (isMember) {
            yourGroups.push({ groupId, info, memberCount });
          }
          
          if (isPublic || isAdmin) {
            publicGroups.push({ groupId, info, memberCount });
          }
        });
        
        
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
          
          
          const avatar = document.createElement('div');
          avatar.className = 'w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0';
          if (info.photo) {
            const groupImg = document.createElement('img');
            groupImg.src = info.photo;
            groupImg.className = 'w-full h-full object-cover';
            groupImg.alt = '';
            avatar.innerHTML = '';
            avatar.appendChild(groupImg);
          } else {
            avatar.textContent = name.charAt(0).toUpperCase();
          }
          
          
          const infoDiv = document.createElement('div');
          infoDiv.className = 'flex-1 min-w-0 cursor-pointer';
          
          
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
          
          
          const descP = document.createElement('p');
          descP.className = 'text-xs text-slate-400 truncate';
          
          
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
          
          
          if (isMember || activeGroupTab === 'yours') {
            infoDiv.addEventListener('click', () => openGroupsPageThread(groupId, info));
            avatar.style.cursor = 'pointer';
            avatar.addEventListener('click', () => openGroupsPageThread(groupId, info));
          }
          
          listEl.appendChild(row);
        });
      }
      
      
      
      function canJoinGroup(groupInfo, joiningUserId) {
        if (!groupInfo) return false;
        const maxMembers = groupInfo.maxMembers || 0;
        if (maxMembers <= 0) return true; 
        
        
        if (groupInfo.owner === joiningUserId || isAdmin) return true;
        
        const memberCount = groupInfo.memberCount || (groupInfo.members ? Object.keys(groupInfo.members).filter(k => groupInfo.members[k]).length : 0);
        return memberCount < maxMembers;
      }
      
      
      async function atomicJoinGroup(groupId, uid) {
        const memberRef = db.ref('groups/' + groupId + '/members/' + uid);
        const countRef = db.ref('groups/' + groupId + '/memberCount');
        
        
        await memberRef.set(true);
        
        
        try {
          await countRef.transaction((count) => (count || 0) + 1);
          return true;
        } catch (e) {
          
          console.error('memberCount transaction failed:', e);
          await memberRef.remove();
          return false;
        }
      }
      
      
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
        
        
        if (info.members && info.members[currentUserId]) {
          showToast('You\'re already in this group!', 'info');
          activeGroupTab = 'yours';
          updateGroupTabs();
          openGroupsPageThread(groupId, info);
          return;
        }
        
        
        if (!canJoinGroup(info, currentUserId)) {
          showToast('This group is full', 'error');
          return;
        }
        
        try {
          
          const joined = await atomicJoinGroup(groupId, currentUserId);
          if (!joined) {
            showToast('This group is full', 'error');
            return;
          }
          
          
          await db.ref('groups/' + groupId + '/messages').push({
            fromUid: 'system',
            fromUsername: 'System',
            text: `${currentUsername} joined the group`,
            time: Date.now(),
            isSystem: true
          });
          
          showToast('Joined group!', 'success');
          await loadGroupsPageConversations();
          
          
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
          cachedGroups = groups; 
          
          
          const searchInput = document.getElementById('groupsPageInputSearch');
          const query = searchInput ? searchInput.value : '';
          
          renderGroupsList(groups, query.toLowerCase().trim());
        } catch (e) {
          console.error('loadGroupsPageConversations error', e);
          
          const msg = (e && (e.code || '')).toString().toLowerCase() + ' ' + (e && e.message ? e.message : '');
          if (msg.indexOf('permission_denied') !== -1 || msg.indexOf('permission-denied') !== -1) {
            const attempts = parseInt(listEl.dataset.groupLoadAttempts || '0', 10) || 0;
            listEl.dataset.groupLoadAttempts = attempts + 1;
            listEl.innerHTML = '<p class="text-xs text-yellow-300 text-center py-4">Unable to load groups yet — retrying...</p>';
            if (attempts < 3) {
              
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
        
        
        const activeEl = document.getElementById('groupsPageActiveGroup');
        if (activeEl) activeEl.textContent = title;
        
        
        updateGroupHeaderAvatar();
        
        
        updateGroupHeaderMemberCount();
        
        // Show group video call button
        const groupVidBtn = document.getElementById('groupVideoCallBtn');
        if (groupVidBtn) {
          groupVidBtn.classList.remove('hidden');
          // Remove old listener to avoid duplicates
          const newBtn = groupVidBtn.cloneNode(true);
          groupVidBtn.parentNode.replaceChild(newBtn, groupVidBtn);
          newBtn.addEventListener('click', () => {
            if (window.ChatraGroupCall) {
              if (window.ChatraGroupCall.isInGroupCall()) {
                showToast('Already in a video call', 'error');
                return;
              }
              window.ChatraGroupCall.startGroupCall(activeGroupId, title);
            }
          });
        }

        // Listen for active group calls and show join banner
        if (window.ChatraGroupCall) {
          window.ChatraGroupCall.listenGroupCallStatus(groupId);
        }
        const joinBanner = document.getElementById('groupCallJoinBanner');
        const joinBtn = document.getElementById('groupCallJoinBtn');
        if (joinBanner) joinBanner.classList.add('hidden');
        if (joinBtn) {
          const newJoinBtn = joinBtn.cloneNode(true);
          joinBtn.parentNode.replaceChild(newJoinBtn, joinBtn);
          newJoinBtn.addEventListener('click', () => {
            if (window.ChatraGroupCall) {
              window.ChatraGroupCall.joinGroupCall(activeGroupId, title);
            }
          });
        }

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
            
            
            if (msg.isSystem) {
              const systemRow = document.createElement('div');
              systemRow.className = 'w-full flex justify-center my-2';
              systemRow.innerHTML = `<span class="text-[10px] text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">${escapeHtml(msg.text)}</span>`;
              messagesEl.appendChild(systemRow);
              messagesEl.scrollTop = messagesEl.scrollHeight;
              return;
            }
            
            
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
        
        
        if (replyTo) {
          payload.replyTo = replyTo;
        }

        
        try {
          const memSnap = await db.ref('groups/' + groupId + '/members/' + currentUserId).once('value');
          if (!memSnap.exists()) {
            
            const groupSnap = await db.ref('groups/' + groupId).once('value');
            const groupInfo = groupSnap.val();
            if (!canJoinGroup(groupInfo, currentUserId)) {
              throw new Error('This group is full. You cannot send messages.');
            }
            try {
              
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
          
          console.error('[groups] membership check failed', e);
          throw e;
        }

        
        await db.ref('groups/' + groupId + '/messages').push(payload);
        
        
        const mentionsAI = /@ai\b/i.test(text);
        const usesSlashAI = /^\/ai\s/i.test(text);
        const isReplyToAI = replyTo && replyTo.username === 'Chatra AI';
        
        if (mentionsAI || usesSlashAI || isReplyToAI) {
          
          let aiQuery = text.replace(/@ai\b/i, '').replace(/^\/ai\s*/i, '').trim();
          if (!aiQuery && isReplyToAI) aiQuery = text.trim();
          
          if (aiQuery) {
            
            try {
              const aiMemberSnap = await db.ref('groups/' + groupId + '/members/' + AI_BOT_UID).once('value');
              if (!aiMemberSnap.exists()) {
                await db.ref('groups/' + groupId + '/members/' + AI_BOT_UID).set(true);
                
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
            
            
            (async () => {
              let botReply = null;
              
              // Show AI typing indicator
              setAiTyping(true);
              
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
              
              // Clean AI response prefix and extra newlines
              botReply = cleanAiResponse(botReply);
              botReply = botReply.replace(/\n{3,}/g, '\n\n').trim();
              botReply = botReply.replace(/@everyone/gi, '@​everyone');
              
              // Extract image context if AI showed an image
              let imageCtx = null;
              const imgMatch = botReply.match(/\[IMAGE:\s*(.+?)\]/i);
              const imgSearchMatch = botReply.match(/\[IMAGE_SEARCH:\s*(.+?)\]/i);
              if (imgMatch) {
                imageCtx = `[Showed image of: ${imgMatch[1].trim()}]`;
              } else if (imgSearchMatch) {
                imageCtx = `[Showed image search results for: ${imgSearchMatch[1].trim()}]`;
              }
              
              addToAiMemory(currentUserId, 'assistant', botReply, currentUsername, imageCtx);
              
              
              try {
                await db.ref('groups/' + groupId + '/messages').push({
                  fromUid: AI_BOT_UID,
                  fromUsername: 'Chatra AI',
                  text: botReply,
                  time: Date.now()
                });
              } catch (e) {
                console.error('[AI] failed to post group message', e);
              } finally {
                // Clear AI typing indicator
                setAiTyping(false);
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
          
          await groupRef.set({ name: name, owner: currentUserId, isPublic: true, members: { [currentUserId]: true }, memberCount: 1, createdAt: Date.now() });
        } else {
          
          const groupInfo = snap.val();
          
          
          if (groupInfo.members && groupInfo.members[currentUserId]) {
            
            await loadGroupsPageConversations();
            openGroupsPageThread(key, cachedGroups[key] || { name });
            return;
          }
          
          if (!canJoinGroup(groupInfo, currentUserId)) {
            showToast('This group is full', 'error');
            return;
          }
          
          
          const joined = await atomicJoinGroup(key, currentUserId);
          if (!joined) {
            showToast('This group is full', 'error');
            return;
          }
          
          
          await db.ref('groups/' + key + '/messages').push({
            fromUid: 'system',
            fromUsername: 'System',
            text: `${currentUsername || 'Someone'} has joined the group`,
            time: Date.now(),
            isSystem: true
          });
        }
        
        await loadGroupsPageConversations();
        openGroupsPageThread(key, cachedGroups[key] || { name });
      }

      
      async function addMemberToGroupByUsername(groupId, username) {
        if (!groupId) throw new Error('No group selected');
        if (!username) throw new Error('No username');
        
        const usersSnap = await db.ref('users').orderByChild('username').equalTo(username).once('value');
        const users = usersSnap.val();
        if (!users) throw new Error('User not found');
        const targetUid = Object.keys(users)[0];
        return addMemberToGroupByUid(groupId, targetUid);
      }

      async function addMemberToGroupByUid(groupId, uid, showJoinMessage = true) {
        if (!groupId || !uid) throw new Error('Missing params');
        
        
        let username = 'Someone';
        try {
          const userSnap = await db.ref('users/' + uid + '/username').once('value');
          username = userSnap.val() || 'Someone';
        } catch (e) {}
        
        
        const groupSnap = await db.ref('groups/' + groupId).once('value');
        const groupInfo = groupSnap.val();
        if (!groupInfo) throw new Error('Group not found');
        
        
        if (uid === currentUserId) {
          if (!canJoinGroup(groupInfo, currentUserId)) {
            throw new Error('This group is full');
          }
          const wasAlreadyMember = groupInfo.members && groupInfo.members[currentUserId];
          if (!wasAlreadyMember) {
            
            const joined = await atomicJoinGroup(groupId, currentUserId);
            if (!joined) {
              throw new Error('This group is full');
            }
            
            
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
        
        const ownerUid = groupInfo.owner;
        if (ownerUid === currentUserId || isAdmin) {
          
          const wasAlreadyMember = groupInfo.members && groupInfo.members[uid];
          if (!wasAlreadyMember) {
            await db.ref('groups/' + groupId + '/members/' + uid).set(true);
            
            try {
              await db.ref('groups/' + groupId + '/memberCount').transaction((count) => (count || 0) + 1);
            } catch (e) {
              console.warn('memberCount increment failed:', e);
            }
            
            
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

      
      let currentGroupInfo = null;
      
      function openGroupSettingsModal() {
        if (!activeGroupId || !currentGroupInfo) return;
        const modal = document.getElementById('groupSettingsModal');
        if (!modal) return;
        
        
        hideLeaveConfirm();
        hideDeleteConfirm();
        
        
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
        
        
        if (nameInput) nameInput.value = info.name || '';
        
        
        if (descInput) descInput.value = info.description || '';
        
        
        if (avatar && initial) {
          if (info.photo) {
            const settingsImg = document.createElement('img');
            settingsImg.src = info.photo;
            settingsImg.className = 'w-full h-full object-cover';
            settingsImg.alt = 'Group photo';
            avatar.innerHTML = '';
            avatar.appendChild(settingsImg);
          } else {
            initial.textContent = (info.name || 'G').charAt(0).toUpperCase();
            avatar.innerHTML = '';
            avatar.appendChild(initial);
          }
        }
        
        
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
        
        
        if (createdEl && info.createdAt) {
          createdEl.textContent = new Date(info.createdAt).toLocaleDateString();
        }
        
        
        const visibilityToggle = document.getElementById('groupVisibilityToggle');
        const visibilityLabel = document.getElementById('groupVisibilityLabel');
        if (visibilityToggle && visibilityLabel) {
          visibilityToggle.checked = info.isPublic === true;
          visibilityLabel.textContent = info.isPublic ? 'Public' : 'Private';
          
          
          const visibilityContainer = document.getElementById('groupVisibilityContainer');
          if (visibilityContainer) {
            if (info.owner === currentUserId || isAdmin) {
              visibilityContainer.classList.remove('hidden');
            } else {
              visibilityContainer.classList.add('hidden');
            }
          }
        }
        
        
        if (publicStatus) {
          publicStatus.textContent = info.isPublic ? 'Public Group' : 'Private Group';
        }
        
        
        const groupAdmins = info.groupAdmins || {};
        const canEdit = info.owner === currentUserId || isAdmin || groupAdmins[currentUserId] === true;
        
        
        if (deleteBtn) {
          if (info.owner === currentUserId || isAdmin) {
            deleteBtn.classList.remove('hidden');
          } else {
            deleteBtn.classList.add('hidden');
          }
        }
        
        
        if (transferBtn) {
          if (info.owner === currentUserId || isAdmin) {
            transferBtn.classList.remove('hidden');
          } else {
            transferBtn.classList.add('hidden');
          }
        }
        
        
        if (photoLabel) {
          if (canEdit) {
            photoLabel.classList.remove('pointer-events-none', 'hidden');
          } else {
            photoLabel.classList.add('pointer-events-none');
          }
        }
        
        
        const saveNameBtn = document.getElementById('groupSettingsSaveNameBtn');
        if (saveNameBtn) {
          if (canEdit) {
            saveNameBtn.classList.remove('hidden');
          } else {
            saveNameBtn.classList.add('hidden');
          }
        }
        
        
        if (nameInput) {
          nameInput.readOnly = !canEdit;
        }
        
        
        const memberLimitDisplay = document.getElementById('groupMemberLimitDisplay');
        const members = info.members || {};
        const memberCount = Object.keys(members).filter(k => members[k]).length;
        const maxMembers = info.maxMembers || 0;
        if (memberLimitDisplay) {
          memberLimitDisplay.textContent = maxMembers > 0 
            ? `${memberCount}/${maxMembers}` 
            : `${memberCount} total`;
        }
        
        
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
        
        
        const inviteCodesContainer = document.getElementById('groupInviteCodesContainer');
        if (inviteCodesContainer) {
          if (info.owner === currentUserId || isAdmin) {
            inviteCodesContainer.classList.remove('hidden');
            await loadGroupInviteCodes();
          } else {
            inviteCodesContainer.classList.add('hidden');
          }
        }
        
        
        await loadGroupMembers();
      }
      
      
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
          
          
          listEl.querySelectorAll('.delete-code-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const code = btn.dataset.code;
              
              
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
        
        
        if (currentGroupInfo.owner !== currentUserId && !isAdmin) {
          showToast('Only the group owner can create invite codes', 'error');
          return;
        }
        
        
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
        
        
        const codeSnap = await db.ref('groupInviteCodes/' + code).once('value');
        const codeData = codeSnap.val();
        
        if (!codeData) {
          throw new Error('Invalid invite code');
        }
        
        const groupId = codeData.groupId;
        
        // Atomically check and increment uses count
        const usesResult = await db.ref('groupInviteCodes/' + code).transaction((data) => {
          if (!data) return data; // code doesn't exist
          if (data.maxUses === 0) return; // abort - invalid code
          if (data.maxUses > 0 && data.maxUses < 999999 && (data.uses || 0) >= data.maxUses) {
            return; // abort - expired
          }
          data.uses = (data.uses || 0) + 1;
          return data;
        });
        
        if (!usesResult.committed) {
          throw new Error('This invite code has expired or is invalid');
        }
        
        
        const groupSnap = await db.ref('groups/' + groupId).once('value');
        const groupInfo = groupSnap.val();
        
        if (!groupInfo) {
          throw new Error('Group no longer exists');
        }
        
        
        if (groupInfo.members && groupInfo.members[currentUserId]) {
          showToast('You\'re already in this group!', 'info');
          activeGroupTab = 'yours';
          updateGroupTabs();
          openGroupsPageThread(groupId, groupInfo);
          return;
        }
        
        
        if (!canJoinGroup(groupInfo, currentUserId)) {
          throw new Error('This group is full');
        }
        
        
        const joined = await atomicJoinGroup(groupId, currentUserId);
        if (!joined) {
          // Undo the uses increment since join failed
          await db.ref('groupInviteCodes/' + code + '/uses').transaction((uses) => Math.max((uses || 1) - 1, 0));
          throw new Error('This group is full');
        }
        
        
        await db.ref('groups/' + groupId + '/messages').push({
          fromUid: 'system',
          fromUsername: 'System',
          text: `${currentUsername} joined via invite code`,
          time: Date.now(),
          isSystem: true
        });
        
        showToast('Joined ' + (groupInfo.name || 'group') + '!', 'success');
        await loadGroupsPageConversations();
        
        
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
          
          
          let badgesHtml = '';
          if (isOwner) {
            badgesHtml = '<span class="text-xs px-2 py-0.5 rounded bg-sky-600/30 text-sky-300">Owner</span>';
          } else if (isGroupAdmin) {
            badgesHtml = '<span class="text-xs px-2 py-0.5 rounded bg-purple-600/30 text-purple-300">Admin</span>';
          }
          
          
          let actionsHtml = '';
          if (!isOwner && (isCurrentUserOwner || isAdmin)) {
            actionsHtml += `<button class="toggle-admin-btn text-xs px-2 py-0.5 rounded ${isGroupAdmin ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40' : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/40'}" data-uid="${uid}">${isGroupAdmin ? 'Remove Admin' : 'Make Admin'}</button>`;
            actionsHtml += `<button class="remove-member-btn text-xs px-2 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40" data-uid="${uid}">Remove</button>`;
          }
          
          const escapedPic = profilePic ? escapeHtml(profilePic) : null;
          row.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
              ${escapedPic ? `<img src="${escapedPic}" class="w-full h-full object-cover" />` : `<span class="text-xs text-slate-300">${username.charAt(0).toUpperCase()}</span>`}
            </div>
            <span class="flex-1 text-sm text-slate-200 truncate">${escapeHtml(username)}</span>
            ${badgesHtml}
            ${actionsHtml}
          `;
          
          listEl.appendChild(row);
        }
        
        
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
        
        
        listEl.querySelectorAll('.remove-member-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const uid = e.target.dataset.uid;
            if (!uid || !activeGroupId) return;
            if (!confirm('Remove this member from the group?')) return;
            try {
              
              await atomicLeaveGroup(activeGroupId, uid);
              
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
          
          
          const activeEl = document.getElementById('groupsPageActiveGroup');
          if (activeEl) activeEl.textContent = newName.trim();
          
          const headerInitial = document.getElementById('groupHeaderInitial');
          if (headerInitial && !currentGroupInfo.photo) {
            headerInitial.textContent = newName.trim().charAt(0).toUpperCase();
          }
          
          
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

        // NSFW check on group photo
        try {
          const nsfwResult = await checkImageNSFW(file);
          if (nsfwResult.blocked) {
            showToast('This image appears to contain inappropriate content', 'error');
            return;
          }
        } catch (nsfwErr) {
          if (!nsfwErr.message.includes('nsfwjs')) {
            showToast('Unable to verify image safety. Please try again.', 'error');
            return;
          }
        }
        
        
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target.result;
          
          
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
            if (!ctx) {
              showToast('Could not process image', 'error');
              return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            const resized = canvas.toDataURL('image/jpeg', 0.8);
            
            try {
              await db.ref('groups/' + activeGroupId + '/photo').set(resized);
              currentGroupInfo.photo = resized;
              
              
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
          const headerImg = document.createElement('img');
          headerImg.src = currentGroupInfo.photo;
          headerImg.className = 'w-full h-full object-cover';
          headerImg.alt = 'Group';
          avatar.innerHTML = '';
          avatar.appendChild(headerImg);
        } else {
          const name = currentGroupInfo.name || 'G';
          const headerInitialSpan = document.createElement('span');
          headerInitialSpan.id = 'groupHeaderInitial';
          headerInitialSpan.className = 'text-white font-bold text-sm';
          headerInitialSpan.textContent = name.charAt(0).toUpperCase();
          avatar.innerHTML = '';
          avatar.appendChild(headerInitialSpan);
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
      
      let leavingGroup = false;
      async function confirmLeaveGroup() {
        if (!activeGroupId || !currentUserId || leavingGroup) return;
        leavingGroup = true;
        
        try {
          // Detach group messages listener before leaving
          if (groupMessagesRef && groupMessagesListener) {
            groupMessagesRef.off('child_added', groupMessagesListener);
            groupMessagesRef = null;
            groupMessagesListener = null;
          }
          
          await atomicLeaveGroup(activeGroupId, currentUserId);
          hideLeaveConfirm();
          closeGroupSettingsModal();
          activeGroupId = null;
          currentGroupInfo = null;
          
          
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
        } finally {
          leavingGroup = false;
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
      
      let deletingGroup = false;
      async function confirmDeleteGroup() {
        if (!activeGroupId || deletingGroup) return;
        deletingGroup = true;
        
        try {
          // Detach group messages listener before deleting
          if (groupMessagesRef && groupMessagesListener) {
            groupMessagesRef.off('child_added', groupMessagesListener);
            groupMessagesRef = null;
            groupMessagesListener = null;
          }
          
          await db.ref('groups/' + activeGroupId).remove();
          hideDeleteConfirm();
          closeGroupSettingsModal();
          activeGroupId = null;
          currentGroupInfo = null;
          
          
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
        } finally {
          deletingGroup = false;
        }
      }
      
      
      function showTransferConfirm() {
        const el = document.getElementById('groupTransferConfirm');
        if (el) el.classList.remove('hidden');
        
        
        const select = document.getElementById('groupTransferSelect');
        if (select && currentGroupInfo) {
          select.innerHTML = '<option value="">Select a member...</option>';
          const members = currentGroupInfo.members || {};
          const memberUids = Object.keys(members).filter(uid => members[uid] && uid !== currentUserId);
          Promise.all(memberUids.map(async (uid) => {
            try {
              const snap = await db.ref('users/' + uid + '/username').once('value');
              return { uid, username: snap.val() || uid };
            } catch (e) {
              return { uid, username: uid };
            }
          })).then(results => {
            results.forEach(({ uid, username }) => {
              const option = document.createElement('option');
              option.value = uid;
              option.textContent = username;
              select.appendChild(option);
            });
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
      
      
      function initGroupSettingsListeners() {
        
        const headerBtn = document.getElementById('groupsPageHeaderBtn');
        if (headerBtn) {
          headerBtn.addEventListener('click', () => {
            if (activeGroupId) openGroupSettingsModal();
          });
        }
        
        
        const closeBtn = document.getElementById('groupSettingsCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeGroupSettingsModal);
        
        
        const modal = document.getElementById('groupSettingsModal');
        if (modal) {
          modal.addEventListener('click', (e) => {
            if (e.target === modal) closeGroupSettingsModal();
          });
        }
        
        
        const visibilityToggle = document.getElementById('groupVisibilityToggle');
        if (visibilityToggle) {
          visibilityToggle.addEventListener('change', async () => {
            if (!activeGroupId || !currentGroupInfo) return;
            
            
            if (currentGroupInfo.owner !== currentUserId && !isAdmin) {
              showToast('Only the group owner can change visibility', 'error');
              visibilityToggle.checked = currentGroupInfo.isPublic === true;
              return;
            }
            
            const newValue = visibilityToggle.checked;
            try {
              await db.ref('groups/' + activeGroupId + '/isPublic').set(newValue);
              currentGroupInfo.isPublic = newValue;
              
              
              const label = document.getElementById('groupVisibilityLabel');
              if (label) label.textContent = newValue ? 'Public' : 'Private';
              
              
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
        
        
        const photoInput = document.getElementById('groupPhotoInput');
        if (photoInput) {
          photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) uploadGroupPhoto(file);
          });
        }
        
        
        const addMemberInput = document.getElementById('groupAddMemberInput');
        const addMemberResults = document.getElementById('groupAddMemberResults');
        let addMemberDebounce = null;
        
        if (addMemberInput && addMemberResults) {
          addMemberInput.addEventListener('input', () => {
            const rawQuery = addMemberInput.value.trim();
            const query = rawQuery.toLowerCase();
            clearTimeout(addMemberDebounce);
            
            if (!query) {
              addMemberResults.classList.add('hidden');
              addMemberResults.innerHTML = '';
              return;
            }
            
            addMemberDebounce = setTimeout(async () => {
              try {
                // Firebase queries are case-sensitive, so search multiple capitalizations
                const queries = [query, query.charAt(0).toUpperCase() + query.slice(1), rawQuery];
                const uniqueQueries = [...new Set(queries)];
                const allResults = {};
                
                for (const q of uniqueQueries) {
                  const usersSnap = await db.ref('users').orderByChild('username').startAt(q).endAt(q + '\uf8ff').limitToFirst(10).once('value');
                  const users = usersSnap.val() || {};
                  Object.assign(allResults, users);
                }
                
                
                const currentMembers = currentGroupInfo?.members || {};
                const results = Object.entries(allResults).filter(([uid]) => !currentMembers[uid] && uid !== currentUserId);
                
                if (results.length === 0) {
                  addMemberResults.innerHTML = '<p class="text-xs text-slate-500 p-3">No users found</p>';
                } else {
                  addMemberResults.innerHTML = results.map(([uid, user]) => `
                    <div class="add-member-result flex items-center gap-2 px-3 py-2 hover:bg-slate-700/50 cursor-pointer" data-uid="${uid}">
                      <div class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                        ${user.profilePic ? `<img src="${escapeHtml(user.profilePic)}" class="w-full h-full object-cover" />` : `<span class="text-xs text-slate-300">${(user.username || 'U').charAt(0).toUpperCase()}</span>`}
                      </div>
                      <div class="flex-1 min-w-0">
                        <span class="text-sm text-slate-200 block truncate">${escapeHtml(user.username || uid)}</span>
                        ${user.displayName ? `<span class="text-xs text-slate-500 block truncate">${escapeHtml(user.displayName)}</span>` : ''}
                      </div>
                      <span class="text-xs text-sky-400">+ Add</span>
                    </div>
                  `).join('');
                  
                  
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
          
          
          document.addEventListener('click', (e) => {
            if (!addMemberInput.contains(e.target) && !addMemberResults.contains(e.target)) {
              addMemberResults.classList.add('hidden');
            }
          });
        }
        
        
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
        
        
        const leaveBtn = document.getElementById('groupSettingsLeaveBtn');
        if (leaveBtn) leaveBtn.addEventListener('click', leaveGroup);
        const leaveCancelBtn = document.getElementById('groupLeaveCancelBtn');
        if (leaveCancelBtn) leaveCancelBtn.addEventListener('click', hideLeaveConfirm);
        const leaveConfirmBtn = document.getElementById('groupLeaveConfirmBtn');
        if (leaveConfirmBtn) leaveConfirmBtn.addEventListener('click', confirmLeaveGroup);
        
        
        const deleteBtn = document.getElementById('groupSettingsDeleteBtn');
        if (deleteBtn) deleteBtn.addEventListener('click', deleteGroup);
        const deleteCancelBtn = document.getElementById('groupDeleteCancelBtn');
        if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', hideDeleteConfirm);
        const deleteConfirmBtn = document.getElementById('groupDeleteConfirmBtn');
        if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', confirmDeleteGroup);
        
        
        const transferBtn = document.getElementById('groupTransferOwnershipBtn');
        if (transferBtn) transferBtn.addEventListener('click', showTransferConfirm);
        const transferCancelBtn = document.getElementById('groupTransferCancelBtn');
        if (transferCancelBtn) transferCancelBtn.addEventListener('click', hideTransferConfirm);
        const transferConfirmBtn = document.getElementById('groupTransferConfirmBtn');
        if (transferConfirmBtn) transferConfirmBtn.addEventListener('click', confirmTransferOwnership);
        
        
        const groupReplyCancelBtn = document.getElementById('groupReplyCancelBtn');
        if (groupReplyCancelBtn) {
          groupReplyCancelBtn.addEventListener('click', clearGroupReply);
        }
        
        
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
            
            
            const value = parseInt(rawValue, 10);
            if (isNaN(value) || value < 0) {
              showToast('Please enter a valid number (0 or empty for no limit)', 'error');
              return;
            }
            
            
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
            
            
            let maxUses = 999999; 
            if (rawValue !== '' && rawValue !== '0') {
              const parsed = parseInt(rawValue, 10);
              if (isNaN(parsed) || parsed < 1) {
                showToast('Please enter at least 1 use (leave empty for unlimited)', 'error');
                return;
              }
              maxUses = Math.min(parsed, 10000); 
            }
            
            
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
              
              const result = await groupRef.transaction((currentData) => {
                if (currentData !== null) {
                  // Group already exists, abort transaction
                  return; // returning undefined aborts
                }
                return {
                  name: name,
                  owner: currentUserId,
                  isPublic: isPublic,
                  members: { [currentUserId]: true },
                  createdAt: Date.now()
                };
              });
              
              if (!result.committed) {
                if (createGroupError) createGroupError.textContent = 'A group with this name already exists';
                createGroupSubmitBtn.disabled = false;
                createGroupSubmitBtn.textContent = 'Create Group';
                return;
              }
              
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
        
        
        window.openCreateGroupModal = openCreateGroupModal;
      }

      
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

          
          try {
            const friendsSnap = await db.ref('friends/' + currentUserId).once('value');
            const friends = friendsSnap.val() || {};
            Object.keys(friends).forEach(friendUid => {
              const tid = makeThreadId(currentUserId, friendUid);
              if (!threads.some(t => t.threadId === tid)) {
                
                threads.push({ threadId: tid, withUid: friendUid, withUsername: null, lastTime: 0, lastMsg: '', unread: 0 });
              }
            });
          } catch (e) {
            
          }

          
          
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

          
          threads = Object.keys(canonicalMap).map(k => canonicalMap[k]);

          if (threads.length === 0) {
            listEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">No conversations yet</p>';
            return;
          }

          
          const threadPromises = threads.map(async thread => {
            try {
              // Use shallow REST read to count messages without downloading full data
              const dbUrl = db.app.options.databaseURL || '';
              const token = await firebase.auth().currentUser?.getIdToken();
              const shallowUrl = `${dbUrl}/dms/${encodeURIComponent(thread.threadId)}/messages.json?shallow=true${token ? '&auth=' + encodeURIComponent(token) : ''}`;
              const resp = await fetch(shallowUrl);
              if (resp.ok) {
                const data = await resp.json();
                thread.messageCount = data ? Object.keys(data).length : 0;
              } else {
                thread.messageCount = 0;
              }
            } catch (e) {
              thread.messageCount = 0;
            }
            return thread;
          });
          threads = await Promise.all(threadPromises);

          
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
            avatar.className = 'w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 relative';
            if (profilePic) {
              const img = document.createElement('img');
              img.src = profilePic;
              img.className = 'w-full h-full object-cover rounded-full';
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
                  img.className = 'w-full h-full object-cover rounded-full';
                  avatar.appendChild(img);
                }
                // Apply frame if user has one
                if (!FAST_MODE_ENABLED && prof.frameType && prof.frameType !== 'none') {
                  applyFrameToAvatar(avatar, prof);
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

        
        try { sendAnalyticsEvent('dm_open', { thread_id: threadId, other_uid: otherUid, mode: 'page' }); } catch (e) {}

        const activeUserEl = document.getElementById('dmPageActiveUser');
        const blockBtn = document.getElementById('dmPageBlockBtn');
        const messagesEl = document.getElementById('dmPageMessages');

        if (activeUserEl) activeUserEl.textContent = otherUsername || 'Unknown';
        if (blockBtn) blockBtn.classList.remove('hidden');
        if (messagesEl) messagesEl.innerHTML = '';

        // Show video call button
        const vcBtn = document.getElementById('dmPageVideoCallBtn');
        if (vcBtn) {
          vcBtn.classList.remove('hidden');
          vcBtn.onclick = async function() {
            if (window.ChatraVideoCall && otherUid) {
              const privCheck = await checkCallPrivacy(otherUid);
              if (!privCheck.allowed) {
                showToast(privCheck.reason, 'error');
                return;
              }
              window.ChatraVideoCall.startCall(otherUid, otherUsername || 'Unknown');
            }
          };
        }

        
        try {
          const now = Date.now();
          if (currentUserId && threadId) {
            
            db.ref('dmInbox/' + currentUserId + '/' + threadId).update({
              withUid: otherUid || null,
              withUsername: otherUsername || null,
              unread: 0
            }).catch(() => {});
            
            dmUnreadCounts[threadId] = 0;
            updateDmTabBadge();
            
            dmLastSeenByThread[threadId] = now;
          }
        } catch (e) {
          
        }

        
        loadDmPageConversations();

        
        startDmPageMessagesListener(threadId);
      }

      function startDmPageMessagesListener(threadId) {
        console.log('[DM Page] startDmPageMessagesListener called with threadId:', threadId);
        
        
        if (dmPageMessagesQueryRef && dmPageMessagesListener) {
          dmPageMessagesQueryRef.off('child_added', dmPageMessagesListener);
          dmPageMessagesQueryRef = null;
        } else if (dmPageMessagesRef && dmPageMessagesListener) {
          dmPageMessagesRef.off('child_added', dmPageMessagesListener);
        }
        if (dmPageMessagesRef) {
          dmPageMessagesRef = null;
        }
        dmPageMessagesListener = null;

        const messagesEl = document.getElementById('dmPageMessages');
        if (!messagesEl) {
          console.error('[DM Page] messagesEl not found!');
          return;
        }
        
        if (!threadId) {
          console.error('[DM Page] No threadId provided!');
          return;
        }

        
        messagesEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">Loading messages...</p>';

        
        const msgPath = 'dms/' + threadId + '/messages';
        console.log('[DM Page] Listening to:', msgPath);
        
        dmPageMessagesRef = db.ref(msgPath);
        
        
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
          
          
          dmPageMessagesQueryRef = dmPageMessagesRef.orderByChild('time').limitToLast(1);
          dmPageMessagesListener = dmPageMessagesQueryRef.on('child_added', snap => {
            const msg = snap.val();
            if (!msg) return;
            
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
        row.className = isMine ? 'flex justify-end gap-2 items-center' : 'flex justify-start gap-2 items-center';
        row.dataset.msgKey = msg.key || '';

        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative';
        avatarDiv.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        avatarDiv.style.minWidth = '1.75rem';
        avatarDiv.style.minHeight = '1.75rem';

        
        if (isMine) {
          avatarDiv.style.display = 'none';
        }

        
        try {
          const nameToFetch = msg.fromUsername || msg.fromUid || null;
          if (nameToFetch) {
            setTimeout(() => {
              fetchUserProfile(nameToFetch).then(profile => {
                if (profile?.profilePic) {
                  try {
                    const img = document.createElement('img');
                    img.className = 'h-full w-full object-cover rounded-full';
                    img.crossOrigin = 'anonymous';
                    img.src = profile.profilePic;
                    img.onerror = () => {  };
                    img.onload = () => {
                      if (avatarDiv.innerHTML && avatarDiv.querySelector('img')?.src !== img.src) {
                        avatarDiv.innerHTML = '';
                        avatarDiv.appendChild(img);
                      }
                    };
                  } catch (e) {}
                }
                // Apply frame if user has one
                if (!FAST_MODE_ENABLED && profile?.frameType && profile.frameType !== 'none') {
                  applyFrameToAvatar(avatarDiv, profile);
                }
              }).catch(() => {});
            }, 50);
          }
        } catch (e) {}

        
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

        
        if (msg.media) {
          const mediaUrl = msg.media;
          const lower = (mediaUrl || '').toLowerCase();
          const isVideo = lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm') || lower.includes('video');
          const isGif = isGifUrl(mediaUrl);

          if (isVideo) {
            const video = document.createElement('video');
            video.src = mediaUrl;
            video.controls = true;
            video.className = 'w-full rounded-lg mb-2 chat-media';
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            bubble.appendChild(video);
          } else {
            const img = document.createElement('img');
            img.src = mediaUrl;
            img.className = 'w-full rounded-lg mb-2 cursor-pointer chat-media';
            img.crossOrigin = 'anonymous';
            img.onclick = () => openImageViewer(mediaUrl);
            
            if (isGif) {
              const wrapper = document.createElement('div');
              wrapper.className = 'relative';
              wrapper.appendChild(img);
              const replayBtn = document.createElement('button');
              replayBtn.className = 'absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded';
              replayBtn.textContent = '↻ GIF';
              replayBtn.onclick = (e) => { e.stopPropagation(); replayGif(img); };
              wrapper.appendChild(replayBtn);
              bubble.appendChild(wrapper);
            } else {
              const imgWrap = document.createElement('div');
              imgWrap.className = 'relative';
              imgWrap.appendChild(img);
              bubble.appendChild(imgWrap);
            }
            scanDisplayedImage(img);
          }
          // Add placeholder shown when images are disabled
          const mediaPlaceholder = document.createElement('div');
          mediaPlaceholder.className = 'chat-media-placeholder text-xs text-slate-500 italic py-2 hidden';
          mediaPlaceholder.textContent = '🖼️ Image hidden by moderator';
          bubble.appendChild(mediaPlaceholder);
        }

        
        if (msg.text) {
          const textEl = document.createElement('span');
          textEl.className = 'message-text-reveal font-medium';
          // Only strip AI marker from actual AI bot messages (verified by UID)
          let displayText = msg.text;
          const isFromAiBot = msg.userId === 'aEY7gNeuGcfBErxOHNEQYFzvhpp2';
          if (isFromAiBot) {
            // Remove AI marker
            if (displayText.startsWith('\u200B\u2063AI\u2063\u200B')) {
              displayText = displayText.substring(7);
            }
            // Strip any AI prefix patterns
            displayText = displayText.replace(/^[\u200B\u200C\u200D\u2063\uFEFF]*AI[\u200B\u200C\u200D\u2063\uFEFF]*/gi, '');
            // Remove leading zero-width chars
            displayText = displayText.replace(/^[\u200B\u200C\u200D\u2063\uFEFF]+/, '').trim();
          }
          textEl.textContent = displayText;
          bubble.appendChild(textEl);
        }

        
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
          
        }

        bubbleWrapper.appendChild(bubble);

        
        if (isMine && msg.key) {
          
          const isTouchDevice = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0));

          
          function attachActionHandler(btn, handler) {
            let touchFired = false;
            btn.addEventListener('touchstart', (e) => {
              touchFired = true;
              
              const grp = btn.closest('.group');
              if (grp) {
                grp.classList.add('touch-active');
                
              }
            }, { passive: true });
            btn.addEventListener('touchend', (e) => {
              e.preventDefault();
              e.stopPropagation();
              handler(e);
              
              setTimeout(() => { touchFired = false; }, 500);
            });
            btn.addEventListener('click', (e) => {
              if (touchFired) return; 
              handler(e);
            });
            
          }

          const deleteBtn = document.createElement('button');
          
          deleteBtn.className = 'absolute -top-1 -right-1 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500 active:bg-red-500 text-sm cursor-pointer';
          deleteBtn.textContent = '🗑️';
          deleteBtn.title = 'Delete message';
          attachActionHandler(deleteBtn, () => {
            openDeleteMessageModal(msg.key, msg.deleteToken, { isDm: true, threadId: activeDMThread });
          });
          bubbleWrapper.appendChild(deleteBtn);

          const editBtn = document.createElement('button');
          
          editBtn.className = 'absolute -top-3 right-5 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500 active:bg-sky-500 cursor-pointer';
          editBtn.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\" fill=\"currentColor\" class=\"w-3.5 h-3.5\"><path d=\"M15.502 1.94a1.5 1.5 0 0 1 2.122 2.12l-1.06 1.062-2.122-2.122 1.06-1.06Zm-2.829 2.828-9.192 9.193a2 2 0 0 0-.518.94l-.88 3.521a.5.5 0 0 0 .607.607l3.52-.88a2 2 0 0 0 .942-.518l9.193-9.193-2.672-2.67Z\"/></svg>";
          editBtn.title = 'Edit message';
          attachActionHandler(editBtn, () => {
            editDmMessage(activeDMThread, msg.key, msg.text || '', messagesEl);
          });
          bubbleWrapper.appendChild(editBtn);
        }

        
        if (!isMine && msg.key) {
          
          const reportBtn = document.createElement('button');
          reportBtn.className = 'absolute -top-3 -left-3 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-amber-500 active:bg-amber-500 text-sm cursor-pointer';
          reportBtn.textContent = '⚠️';
          reportBtn.title = 'Report message';
          
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

          
          if (isAdmin) {
            const adminDeleteBtn = document.createElement('button');
            adminDeleteBtn.className = 'absolute -top-1 -right-1 z-20 w-7 h-7 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-700 active:bg-red-700 text-sm cursor-pointer';
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

        
        row.appendChild(avatarDiv);
        row.appendChild(bubbleWrapper);

        
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

      
      let pageNavListenersSetup = false;
      
      function setupPageNavListeners() {
        // Prevent duplicate listener attachment on re-login
        if (pageNavListenersSetup) {
          // Still update the slider position
          const navGlobal = document.getElementById('navGlobalChat');
          if (navGlobal) setTimeout(() => updateNavSlider(navGlobal), 100);
          // Still start listeners that need to be re-attached
          startOnlineCountListener();
          startStaffRolesListener();
          startImagesSettingListener();
          setTimeout(() => checkPendingRoleNotification(), 2000);
          return;
        }
        pageNavListenersSetup = true;
        
        const navGlobal = document.getElementById('navGlobalChat');
        const navDMs = document.getElementById('navDMs');
        const navGroups = document.getElementById('navGroups');
        
        const navGlobal2 = document.getElementById('navGlobalChat2');
        const navDMs2 = document.getElementById('navDMs2');
        const navGroups2 = document.getElementById('navGroups2');

        
        setTimeout(() => {
          updateNavSlider(navGlobal);
        }, 100);

        
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

        
        const navGlobal3 = document.getElementById('navGlobalChat3');
        const navGroups3 = document.getElementById('navGroups3');
        const navDMs3 = document.getElementById('navDMs3');
        // Only add listeners to navGlobal3/navGroups3/navDMs3 (the others already have listeners above)
        if (navGlobal3) {
          navGlobal3.addEventListener('click', () => switchToPage('global'));
        }
        if (navGroups3) {
          navGroups3.addEventListener('click', () => switchToPage('groups'));
        }
        if (navDMs3) {
          navDMs3.addEventListener('click', () => switchToPage('dms'));
        }

        
        const dmPageLogoutBtn = document.getElementById('dmPageLogoutBtn');
        if (dmPageLogoutBtn) {
          dmPageLogoutBtn.addEventListener('click', () => auth.signOut());
          dmPageLogoutBtn.addEventListener('touchend', (e) => { e.preventDefault(); auth.signOut(); });
        }

        
        const groupsPageLogoutBtn = document.getElementById('groupsPageLogoutBtn');
        if (groupsPageLogoutBtn) {
          groupsPageLogoutBtn.addEventListener('click', () => auth.signOut());
          groupsPageLogoutBtn.addEventListener('touchend', (e) => { e.preventDefault(); auth.signOut(); });
        }

        
        const dmPageMenuToggle = document.getElementById('dmPageMenuToggle');
        if (dmPageMenuToggle) {
          dmPageMenuToggle.addEventListener('click', openSidePanel);
          dmPageMenuToggle.addEventListener('touchend', (e) => { e.preventDefault(); openSidePanel(); });
        }

        
        const groupsPageMenuToggle = document.getElementById('groupsPageMenuToggle');
        if (groupsPageMenuToggle) {
          groupsPageMenuToggle.addEventListener('click', openSidePanel);
          groupsPageMenuToggle.addEventListener('touchend', (e) => { e.preventDefault(); openSidePanel(); });
        }

        
        initGroupSettingsListeners();
        
        
        startOnlineCountListener();
        
        // Start listening for staff roles
        startStaffRolesListener();
        
        // Start listening for image toggle setting
        startImagesSettingListener();
        
        // Check for pending role notification (delayed to ensure staffRoles loaded)
        setTimeout(() => {
          checkPendingRoleNotification();
        }, 2000);

        

        
        const sidePanelGroups = document.getElementById('sidePanelGroups');
        if (sidePanelGroups) {
          sidePanelGroups.addEventListener('click', () => { switchToPage('groups'); closeSidePanel(); });
        }

        
        const dmPageForm = document.getElementById('dmPageForm');
        const dmPageInput = document.getElementById('dmPageInput');
        const dmPageError = document.getElementById('dmPageError');

        
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
              
              const name = document.getElementById('groupsPageUserSearch')?.value || prompt('Enter group name:');
              if (!name) return;
              createOrJoinGroup(name.trim()).catch(e => { console.error(e); showToast('Group create/join failed', 'error'); });
            }
          });
        }
        
        
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
            
            
            if (groupsPageError) groupsPageError.textContent = '';
            
            
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
            
            if (!text && !pendingDmMediaUrl) return;

            try {
              
              const privacyCheck = await checkDmPrivacy(activeDMTarget.uid);
              if (!privacyCheck.allowed) {
                if (dmPageError) dmPageError.textContent = privacyCheck.reason;
                return;
              }
              
              
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
              
              try { sendAnalyticsEvent('message_sent', { thread_id: activeDMThread, has_media: Boolean(pendingDmMediaUrl), media_file_id: pendingDmMediaFileId || null }); } catch (e) {}
              
              const now = Date.now();
              const lastMsgPreview = text || (pendingDmMediaUrl ? '(media)' : '');
              if (activeDMTarget && activeDMTarget.uid) {
                db.ref('dmInbox/' + currentUserId + '/' + activeDMThread).update({
                    lastMsg: lastMsgPreview,
                    lastTime: now
                  }).catch(() => {});
                
                
                const recipientInboxRef = db.ref('dmInbox/' + activeDMTarget.uid + '/' + activeDMThread);
                recipientInboxRef.update({
                  withUid: currentUserId,
                  withUsername: currentUsername || currentUserId,
                  lastMsg: lastMsgPreview,
                  lastTime: now,
                  unread: firebase.database.ServerValue.increment(1)
                }).catch(err => console.error('[DM] failed to update recipient inbox:', err));
                
                dmLastUpdateTimeByThread[activeDMThread] = now;
              }
              
              dmPageInput.value = '';
              if (dmMediaPreview) {
                dmMediaPreview.classList.add('hidden');
              }
              if (dmMediaPreviewContent) dmMediaPreviewContent.innerHTML = '';
              
              pendingDmMediaUrl = null;
              pendingDmMediaFileId = null;
              if (dmPageError) dmPageError.textContent = '';
              
              // If DMing the AI, send an AI response
              if (activeDMTarget.uid === AI_BOT_UID && text) {
                (async () => {
                  try {
                    // Show AI typing indicator
                    setAiTyping(true);
                    
                    // Build conversation context
                    addToAiMemory(currentUserId, 'user', text, currentUsername);
                    const conversationHistory = getAiMemory(currentUserId);
                    
                    let botReply = null;
                    
                    try {
                      const aiWorkerUrl = 'https://recovery-modmojheh.modmojheh.workers.dev';
                      if (aiWorkerUrl) {
                        const r = await fetch(aiWorkerUrl + '/ai', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt: text, history: conversationHistory, username: currentUsername })
                        });
                        if (r.ok) {
                          const jr = await r.json();
                          if (jr && jr.reply) botReply = String(jr.reply).trim();
                        }
                      }
                    } catch (e) {
                      console.warn('[AI] DM AI call failed', e);
                    }
                    
                    if (!botReply) botReply = generateAiReply(text);
                    
                    // Clean up the reply - remove AI prefix and extra newlines
                    botReply = cleanAiResponse(botReply);
                    botReply = botReply.replace(/\n{3,}/g, '\n\n').trim();
                    
                    // Extract image context if AI showed an image
                    let imageCtx = null;
                    const imgMatch = botReply.match(/\[IMAGE:\s*(.+?)\]/i);
                    const imgSearchMatch = botReply.match(/\[IMAGE_SEARCH:\s*(.+?)\]/i);
                    if (imgMatch) {
                      imageCtx = `[Showed image of: ${imgMatch[1].trim()}]`;
                    } else if (imgSearchMatch) {
                      imageCtx = `[Showed image search results for: ${imgSearchMatch[1].trim()}]`;
                    }
                    
                    addToAiMemory(currentUserId, 'assistant', botReply, currentUsername, imageCtx);
                    
                    // Send AI response as a DM
                    const aiMsgRef = db.ref('dms/' + activeDMThread + '/messages').push();
                    await aiMsgRef.set({
                      fromUid: AI_BOT_UID,
                      fromUsername: 'Chatra AI',
                      toUid: currentUserId,
                      toUsername: currentUsername,
                      text: botReply,
                      time: firebase.database.ServerValue.TIMESTAMP
                    });
                    
                    // Update inbox
                    db.ref('dmInbox/' + currentUserId + '/' + activeDMThread).update({
                      lastMsg: botReply.slice(0, 50) + (botReply.length > 50 ? '...' : ''),
                      lastTime: Date.now()
                    }).catch(() => {});
                    
                  } catch (e) {
                    console.error('[AI] failed to send DM response', e);
                  } finally {
                    setAiTyping(false);
                  }
                })();
              }
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

            if (!chatImagesEnabled) {
              showToast('Images are currently disabled by a moderator', 'error');
              dmPageMediaInput.value = '';
              return;
            }

            const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
            if (!allowedMediaTypes.includes(file.type)) {
              showToast('Unsupported file type. Images and videos only.', 'error');
              dmPageMediaInput.value = '';
              return;
            }
            if (file.size > 50 * 1024 * 1024) {
              showToast('File too large. Max 50MB.', 'error');
              dmPageMediaInput.value = '';
              return;
            }

            
            if (dmUploadInProgress) {
              return;
            }
            dmUploadInProgress = true;
            dmPageMediaInput.value = ''; 

            try {
              if (!(await canUpload())) {
                showToast('Slow down! Wait a few seconds', 'error');
                return;
              }

              
              if (file.type && file.type.startsWith('video/')) {
                const dur = await getVideoDuration(file);
                if (dur > 30) {
                  showToast('Video is too long. Max 30 seconds', 'error');
                  dmUploadInProgress = false;
                  return;
                }
              }

              
              try {
                dmPageMediaBtn.disabled = true;
                dmPageMediaBtn.innerHTML = '<svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/></svg>';
              } catch (e) {}

              const processed = await prepareFileForUpload(file);
              const uploadResult = await uploadToImageKit(processed);
              storeUploadTime();

              
              try {
                dmPageMediaBtn.disabled = false;
                dmPageMediaBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>';
              } catch (e) {}

              if (uploadResult && uploadResult.url) {
                
                pendingDmMediaUrl = uploadResult.url;
                pendingDmMediaFileId = uploadResult.fileId || null;

                
                try { sendAnalyticsEvent('image_uploaded', { thread_id: activeDMThread || null, media_file_id: pendingDmMediaFileId || null }); } catch (e) {}

                
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

        
        const dmPageStartBtn = document.getElementById('dmPageStartBtn');
        const dmPageUserSearch = document.getElementById('dmPageUserSearch');
        let dmSearchResults = null;
        
        if (dmPageUserSearch) {
          
          dmSearchResults = document.createElement('div');
          dmSearchResults.className = 'absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto hidden';
          dmPageUserSearch.parentElement.style.position = 'relative';
          dmPageUserSearch.parentElement.appendChild(dmSearchResults);
          
          
          dmPageUserSearch.addEventListener('input', async () => {
            const query = dmPageUserSearch.value.trim().toLowerCase();
            if (query.length < 1) {
              dmSearchResults.classList.add('hidden');
              return;
            }
            
            
            let matches = [];
            for (const [key, user] of mentionUsers) {
              if (key.includes(query) || user.username.toLowerCase().includes(query)) {
                matches.push(user);
                if (matches.length >= 8) break;
              }
            }
            
            
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
            
            
            dmSearchResults.querySelectorAll('.dm-search-result').forEach(el => {
              el.addEventListener('click', () => startDmWithUser(el.dataset.uid, el.dataset.username));
              el.addEventListener('touchend', (e) => { e.preventDefault(); startDmWithUser(el.dataset.uid, el.dataset.username); });
            });
          });
          
          
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

      
      let PAGE_SIZE = 75; 
      let FAST_MODE_ENABLED = false;
      let mentionNotificationsReady = false; // Don't show mention notifications until initial load is done
      let oldestTime = null;
      let newestTime = null;
      let isLoadingOlder = false;
      let allHistoryLoaded = false;
      let scrollListenerAttached = false;

      
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
        
        btn.className = "absolute bottom-28 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-500 shadow-lg flex items-center justify-center text-white transition-all z-30";
        
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
        
        const isAtBottom = distance <= 50;
        if (isAtBottom) {
          scrollToBottomBtn.style.opacity = "0";
          scrollToBottomBtn.style.pointerEvents = "none";
        } else {
          scrollToBottomBtn.style.opacity = "1";
          scrollToBottomBtn.style.pointerEvents = "auto";
        }
      }

      
      function ensureScrollButtonListeners() {
        createScrollToBottomBtn();
        if (!scrollBtnListenerAttached) {
          messagesDiv.addEventListener("scroll", updateScrollToBottomBtn);
          scrollBtnListenerAttached = true;
        }
        
        setTimeout(updateScrollToBottomBtn, 100);
      }

      
      
      function trackUserForMentions(username, uid, profilePic = null) {
        if (!username || username === currentUsername) return;
        mentionUsers.set(username.toLowerCase(), { username, uid, profilePic });
      }

      
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

      
      function getMentionSuggestions(query) {
        const q = (query || "").toLowerCase();
        const suggestions = [];
        
        
        if ('ai'.includes(q) || q === '') {
          suggestions.push({ username: 'AI', uid: AI_BOT_UID, profilePic: aiProfile.avatar, isAI: true });
        }
        
        
        if (isAdmin && 'everyone'.includes(q)) {
          suggestions.push({ username: 'everyone', uid: null, profilePic: null, isEveryone: true });
        }
        
        for (const [key, user] of mentionUsers) {
          if (key.includes(q) || user.username.toLowerCase().includes(q)) {
            suggestions.push(user);
          }
        }
        console.debug(`[mentions] getMentionSuggestions q='${q}' -> ${suggestions.length} suggestions`);
        
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
        return suggestions.slice(0, 8); 
      }

      
      function showMentionAutocomplete(suggestions) {
        console.debug('[mentions] showMentionAutocomplete suggestions=', suggestions && suggestions.length);
        if (!mentionAutocomplete) {
          mentionAutocomplete = document.createElement("div");
          mentionAutocomplete.className = "mention-autocomplete";
          mentionAutocomplete.id = "mentionAutocomplete";
          
          document.body.appendChild(mentionAutocomplete);
          mentionAutocomplete.style.position = 'absolute';
          mentionAutocomplete.style.display = 'none';
          mentionAutocomplete.style.zIndex = '99999'; 
        }

        if (suggestions.length === 0) {
          
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
          const initials = user.isEveryone ? '📢' : escapeHtml(user.username.slice(0, 2).toUpperCase());
          const avatarContent = user.isEveryone
            ? '📢'
            : (user.profilePic 
              ? `<img src="${escapeHtml(user.profilePic)}" alt="" onerror="this.parentElement.textContent='${initials}'">` 
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
        
        try {
          const parentName = mentionAutocomplete.parentElement ? mentionAutocomplete.parentElement.tagName : 'null';
          console.debug('[mentions] dropdown parent=', parentName, 'position=', mentionAutocomplete.style.position);
        } catch (e) {}

        
        const targetInput = activeMentionInput || msgInput;
        if (mentionAutocomplete && targetInput) {
          requestAnimationFrame(() => {
            try {
              const rect = targetInput.getBoundingClientRect();
              const viewportW = window.innerWidth || document.documentElement.clientWidth;
              const viewportH = window.innerHeight || document.documentElement.clientHeight;
              const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
              const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

              
              const width = Math.max(rect.width, 220);
              mentionAutocomplete.style.width = width + 'px';

              
              const rawLeft = rect.left + scrollX;
              const maxLeft = viewportW + scrollX - width - 8;
              const clampedLeft = Math.max(scrollX + 8, Math.min(rawLeft, maxLeft));
              mentionAutocomplete.style.left = clampedLeft + 'px';

              
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
              
            }
          });
        }

        
        mentionAutocomplete.querySelectorAll('.mention-item').forEach(item => {
          
          item.addEventListener('click', () => {
            selectMention(item.dataset.username);
          });
          
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
        
        
        const newPos = mentionStartPos + username.length + 2; 
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

      
      function notifyMention(msg, messageId) {
        // Don't show notifications until initial load is complete
        if (!mentionNotificationsReady) {
          console.log('[mentions] skipping notification - initial load not complete');
          return;
        }
        
        try {
          const from = msg.user || 'Someone';
          const snippet = previewText((msg.text || '').replace(/\s+/g, ' ').trim(), 120);

          
          try {
            const formWrapper = messageForm?.parentElement || document.body;
            let existing = document.getElementById('mentionInlineBanner');
            if (existing && existing.parentElement) existing.parentElement.removeChild(existing);

            const banner = document.createElement('div');
            banner.id = 'mentionInlineBanner';
            banner.className = 'inline-report-anim mb-2 rounded-lg border border-amber-500/50 bg-amber-600/10 p-3 flex items-center justify-between gap-3 text-sm cursor-pointer hover:bg-amber-600/20 transition-colors';
            
            const nameHtml = FAST_MODE_ENABLED ?
              `<span style="font-weight:600;color:#f59e0b">${escapeHtml(from)}</span>` :
              `<span class="mention-from">${escapeHtml(from)}</span>`;
            
            const goToLink = messageId ? `<button class="mention-goto-btn px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs text-white font-medium whitespace-nowrap">Go to message</button>` : '';
            
            banner.innerHTML = `<div class="flex-1"><strong style="color:#f59e0b">Mentioned</strong> by ${nameHtml}: <span style="color:#f1f5f9">${escapeHtml(snippet)}</span></div>${goToLink}`;
            
            // Add click handler to go to the message
            if (messageId) {
              const goToBtn = banner.querySelector('.mention-goto-btn');
              if (goToBtn) {
                goToBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
                  if (msgEl) {
                    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    msgEl.classList.add('mention-flash');
                    setTimeout(() => msgEl.classList.remove('mention-flash'), 2000);
                  }
                  if (banner.parentElement) banner.parentElement.removeChild(banner);
                });
              }
              // Also allow clicking anywhere on banner
              banner.addEventListener('click', () => {
                const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
                if (msgEl) {
                  msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  msgEl.classList.add('mention-flash');
                  setTimeout(() => msgEl.classList.remove('mention-flash'), 2000);
                }
                if (banner.parentElement) banner.parentElement.removeChild(banner);
              });
            }
            
            if (formWrapper && messageForm && formWrapper.contains(messageForm)) {
              formWrapper.insertBefore(banner, messageForm);
            } else {
              document.body.appendChild(banner);
            }

            setTimeout(() => {
              banner.classList.add('fade-out');
              setTimeout(() => { if (banner.parentElement) banner.parentElement.removeChild(banner); }, 600);
            }, 6000);
          } catch (e) {}

          
          if ("Notification" in window && Notification.permission === 'granted') {
            const n = new Notification(`${from} mentioned you`, { body: snippet });
            n.onclick = () => window.focus();
          }
        } catch (err) {
          console.warn('[mentions] notifyMention error', err);
        }
      }

      
      function renderTextWithMentions(text, isMine = false) {
        if (!text) return "";
        
        
        const mentionRegex = /@(everyone|[a-zA-Z0-9_-]{2,12})\b/g;
        
        let result = "";
        let lastIndex = 0;
        let match;
        
        while ((match = mentionRegex.exec(text)) !== null) {
          
          result += escapeHtml(text.slice(lastIndex, match.index));
          
          const mentionedUsername = match[1];
          
          const isEveryone = mentionedUsername.toLowerCase() === 'everyone';
          const isMe = mentionedUsername.toLowerCase() === (currentUsername || "").toLowerCase();
          const mentionClass = (isMe || isEveryone) ? "mention-highlight mention-me" : "mention-highlight";
          
          result += `<span class="${mentionClass}" data-mention="${escapeHtml(mentionedUsername)}">@${escapeHtml(mentionedUsername)}</span>`;
          
          lastIndex = match.index + match[0].length;
        }
        
        
        result += escapeHtml(text.slice(lastIndex));
        
        return result;
      }

      
      function handleMentionInput(inputEl) {
        const targetInput = inputEl || msgInput;
        if (!targetInput) return;
        activeMentionInput = targetInput;
        const value = targetInput.value;
        const cursorPos = targetInput.selectionStart;
        
        
        let atPos = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
          const char = value[i];
          if (char === '@') {
            
            if (i === 0 || /\s/.test(value[i - 1])) {
              atPos = i;
            }
            break;
          }
          if (/\s/.test(char)) break; 
        }
        
        if (atPos >= 0) {
          mentionStartPos = atPos;
          mentionQuery = value.slice(atPos + 1, cursorPos);

          
          console.debug('[mentions] handleMentionInput atPos=', atPos, 'cursorPos=', cursorPos, "query='"+mentionQuery+"'", 'mentionUsersSize=', mentionUsers.size);

          
          const suggestions = getMentionSuggestions(mentionQuery);
          console.debug('[mentions] suggestions returned=', suggestions.length);
          showMentionAutocomplete(suggestions);
        } else {
          console.debug('[mentions] no @ before cursor (atPos=-1)');
          hideMentionAutocomplete();
        }
      }

      
      function insertMentionAtCursor(username) {
        if (!username || !msgInput) return;
        
        const value = msgInput.value;
        const cursorPos = msgInput.selectionStart;
        
        
        const needsSpace = cursorPos > 0 && !/\s/.test(value[cursorPos - 1]);
        const mention = (needsSpace ? ' ' : '') + '@' + username + ' ';
        
        const before = value.slice(0, cursorPos);
        const after = value.slice(cursorPos);
        
        msgInput.value = before + mention + after;
        
        const newPos = cursorPos + mention.length;
        msgInput.setSelectionRange(newPos, newPos);
        msgInput.focus();
      }

      
      let activeInlineReport = null; 

      function cancelInlineReport() {
        if (!activeInlineReport) return;
        const { container } = activeInlineReport;
        if (container && container.parentElement) container.parentElement.removeChild(container);
        activeInlineReport = null;
      }

      function openInlineReport(messageId, messageData, reportedUsername, bubbleContainer) {
        if (!messageId || !bubbleContainer) return;
        
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

      
      const RATING_INTERVAL_MS = 10 * 60 * 1000;
      let ratingIntervalId = null;
      let ratingOptOut = false;
      let ratingLastPrompt = 0;
      let ratingPendingStars = null;

      
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

      
      
      async function checkDmPrivacy(targetUid) {
        try {
          const privacySnap = await db.ref("userPrivacy/" + targetUid).once("value");
          const privacy = privacySnap.val() || {};
          
          
          if (privacy.allowDMs === false) {
            return { allowed: false, reason: "This user is not accepting DMs." };
          }
          
          
          const dmPrivacy = privacy.dmPrivacy || 'anyone';
          
          if (dmPrivacy === 'none') {
            return { allowed: false, reason: "This user has DMs disabled." };
          }
          
          if (dmPrivacy === 'friends') {
            
            const friendSnap = await db.ref("friends/" + targetUid + "/" + currentUserId).once("value");
            if (!friendSnap.exists()) {
              return { allowed: false, reason: "This user only accepts DMs from friends." };
            }
          }
          
          return { allowed: true };
        } catch (err) {
          console.error("[dm] privacy check error:", err);
          return { allowed: true }; 
        }
      }

      async function checkCallPrivacy(targetUid) {
        try {
          const privacySnap = await db.ref("userPrivacy/" + targetUid).once("value");
          const privacy = privacySnap.val() || {};
          
          const callPrivacy = privacy.callPrivacy || 'anyone';
          
          if (callPrivacy === 'none') {
            return { allowed: false, reason: "This user has calls disabled." };
          }
          
          if (callPrivacy === 'friends') {
            const friendSnap = await db.ref("friends/" + targetUid + "/" + currentUserId).once("value");
            if (!friendSnap.exists()) {
              return { allowed: false, reason: "This user only accepts calls from friends." };
            }
          }
          
          return { allowed: true };
        } catch (err) {
          console.error("[call] privacy check error:", err);
          return { allowed: true };
        }
      }

      
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
        if (muteTimerInterval) {
          clearInterval(muteTimerInterval);
          muteTimerInterval = null;
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
          
          // Show mod panel button for staff OR legacy admins
          updateModPanelVisibility();
          
          if (isAdmin) {
            
            try {
              refreshAdminControls();
            } catch (e) {
              console.warn("[admin] failed to refresh admin controls", e);
            }
            
            // Clean up stale presence entries
            cleanupStalePresence();
          }
        };
        adminRef.on("value", adminListener);
      }
      
      // Update mod panel button visibility based on staff status
      function updateModPanelVisibility() {
        const modPanelBtn = document.getElementById("adminModPanelBtn");
        if (modPanelBtn) {
          if (isCurrentUserStaff()) {
            modPanelBtn.classList.remove("hidden");
            modPanelBtn.classList.add("flex");
          } else {
            modPanelBtn.classList.add("hidden");
            modPanelBtn.classList.remove("flex");
          }
        }
      }

      function banUser(uid, durationMinutes = null, reason = "Rule break") {
        const perms = getCurrentUserPermissions();
        if (!perms.canBan || !uid) {
          showToast('You do not have permission to ban users', 'error');
          return;
        }

        if (durationMinutes === "permanent") {
          // Only owner/co-owner can permanent ban
          if (!perms.isOwner && !perms.isCoOwner) {
            showToast('Only Owner/Co-Owner can permanently ban', 'error');
            return;
          }
          deleteUserAccount(uid, reason);
          return;
        }
        
        // Check duration limit
        const minutes = durationMinutes || 60;
        if (perms.maxBanMinutes !== Infinity && minutes > perms.maxBanMinutes) {
          showToast('You can only ban for up to ' + perms.maxBanMinutes + ' minutes (' + Math.round(perms.maxBanMinutes / 1440) + ' days)', 'error');
          return;
        }

        
        const until = durationMinutes ? Date.now() + durationMinutes * 60 * 1000 : Date.now() + 3600000;
        firebase.database().ref("bannedUsers/" + uid).set({
          until: until,
          reason: reason,
        }).catch((err) => {
          console.error("[ban] failed to ban user", err);
        });
      }

      // SECURITY NOTE: deleteUserAccount performs destructive writes based on client-side isAdmin/perms check.
      // For production, move authorization to Firebase RTDB/Firestore rules or a Cloud Function that validates
      // auth.uid against /admins or custom claims before allowing writes to protected paths.
      // The isAdmin flag here should be treated as a UI hint only.
      async function deleteUserAccount(uid, reason = "Permanent ban") {
        const perms = getCurrentUserPermissions();
        if ((!perms.canBan && !isAdmin) || !uid) return;
        
        try {
          console.log("[ban] deleting account for uid:", uid);
          
          
          const userSnap = await db.ref("users/" + uid).once("value");
          const userData = userSnap.val();
          console.log("[ban] user data:", userData);
          
          
          const fpSnap = await db.ref("users/" + uid + "/fingerprint").once("value");
          const storedFingerprint = fpSnap.val();
          console.log("[ban] stored fingerprint:", storedFingerprint ? storedFingerprint.slice(0,16) + '...' : 'none');
          
          
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
          
          
          const msgsSnap = await db.ref("messages").orderByChild("userId").equalTo(uid).once("value");
          msgsSnap.forEach((childSnap) => {
            db.ref("messages/" + childSnap.key).remove();
          });
          
          
          await db.ref("users/" + uid).remove();
          
          
          if (userData && userData.username) {
            const encodedUsername = encodeFirebaseKey(userData.username);
            await db.ref("bannedUsernames/" + encodedUsername).set({
              uid: uid,
              reason: reason,
              timestamp: Date.now()
            });
          }
          
          
          if (userData && userData.email) {
            const encodedEmail = encodeFirebaseKey(userData.email);
            await db.ref("bannedEmails/" + encodedEmail).set({
              uid: uid,
              reason: reason,
              timestamp: Date.now()
            });
          }
          
          
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
        if (!banReasonModal || !banReasonCustom || !banDuration) return;
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
        const modPanelTabStaff = document.getElementById("modPanelTabStaff");
        const modPanelTabSettings = document.getElementById("modPanelTabSettings");
        const modPanelContent = document.getElementById("modPanelContent");
        
        if (!modPanelBtn || !modPanelModal) return;
        
        modPanelBtn.onclick = () => {
          modPanelModal.classList.remove("hidden");
          
          const perms = getCurrentUserPermissions();
          
          // Show/hide tabs based on permissions
          if (modPanelUnbanAllBtn) {
            if (currentUserId === OWNER_UID) {
              modPanelUnbanAllBtn.classList.remove("hidden");
            } else {
              modPanelUnbanAllBtn.classList.add("hidden");
            }
          }
          
          // Hide banned tab if user can't ban
          if (modPanelTabBanned) {
            if (perms.canBan) {
              modPanelTabBanned.classList.remove("hidden");
            } else {
              modPanelTabBanned.classList.add("hidden");
            }
          }
          
          // Hide hardware tab if user can't hardware ban
          if (modPanelTabHardware) {
            if (perms.canHardwareBan) {
              modPanelTabHardware.classList.remove("hidden");
            } else {
              modPanelTabHardware.classList.add("hidden");
            }
          }
          
          // Show staff tab only if can assign roles
          if (modPanelTabStaff) {
            if (perms.canAssignRoles) {
              modPanelTabStaff.classList.remove("hidden");
            } else {
              modPanelTabStaff.classList.add("hidden");
            }
          }
          
          // Show settings tab for HEAD_ADMIN+ (priority >= 4), Owner, and Co-Owner
          if (modPanelTabSettings) {
            const staffRole = getUserStaffRole(currentUserId);
            const canSeeSettings = perms.isOwner || perms.isCoOwner || (staffRole && staffRole.priority >= 4);
            if (canSeeSettings) {
              modPanelTabSettings.classList.remove("hidden");
            } else {
              modPanelTabSettings.classList.add("hidden");
            }
          }
          
          // Start with muted tab if can't see banned
          if (perms.canBan) {
            loadModPanelTab('banned');
          } else {
            loadModPanelTab('muted');
          }
        };
        
        modPanelCloseBtn.onclick = () => {
          modPanelModal.classList.add("hidden");
        };
        
        modPanelModal.onclick = (e) => {
          if (e.target === modPanelModal) modPanelModal.classList.add("hidden");
        };
        
        modPanelRefreshBtn.onclick = () => loadModPanelTab(modPanelCurrentTab);
        
        
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
          const allTabs = [modPanelTabBanned, modPanelTabMuted, modPanelTabHardware, modPanelTabStaff, modPanelTabSettings].filter(t => t);
          allTabs.forEach(btn => {
            btn.classList.remove('bg-red-600', 'bg-yellow-600', 'bg-purple-600', 'bg-rose-600', 'bg-sky-600', 'text-white');
            btn.classList.add('bg-slate-700', 'text-slate-300');
          });
          if (tab === 'banned' && modPanelTabBanned) {
            modPanelTabBanned.classList.remove('bg-slate-700', 'text-slate-300');
            modPanelTabBanned.classList.add('bg-red-600', 'text-white');
          } else if (tab === 'muted' && modPanelTabMuted) {
            modPanelTabMuted.classList.remove('bg-slate-700', 'text-slate-300');
            modPanelTabMuted.classList.add('bg-yellow-600', 'text-white');
          } else if (tab === 'hardware' && modPanelTabHardware) {
            modPanelTabHardware.classList.remove('bg-slate-700', 'text-slate-300');
            modPanelTabHardware.classList.add('bg-purple-600', 'text-white');
          } else if (tab === 'staff' && modPanelTabStaff) {
            modPanelTabStaff.classList.remove('bg-slate-700', 'text-slate-300');
            modPanelTabStaff.classList.add('bg-rose-600', 'text-white');
          } else if (tab === 'settings' && modPanelTabSettings) {
            modPanelTabSettings.classList.remove('bg-slate-700', 'text-slate-300');
            modPanelTabSettings.classList.add('bg-sky-600', 'text-white');
          }
          loadModPanelTab(tab);
        };
        
        if (modPanelTabBanned) modPanelTabBanned.onclick = () => setTab('banned');
        if (modPanelTabMuted) modPanelTabMuted.onclick = () => setTab('muted');
        if (modPanelTabHardware) modPanelTabHardware.onclick = () => setTab('hardware');
        if (modPanelTabStaff) modPanelTabStaff.onclick = () => setTab('staff');
        if (modPanelTabSettings) modPanelTabSettings.onclick = () => setTab('settings');
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
          } else if (tab === 'staff') {
            await loadStaffManagement();
          } else if (tab === 'settings') {
            await loadModPanelSettings();
          }
        } catch (e) {
          modPanelContent.innerHTML = '<div class="text-center py-8 text-red-400">Error loading data</div>';
          console.error("[modPanel] load error:", e);
        }
      }
      
      // Load staff management tab
      async function loadStaffManagement() {
        const modPanelContent = document.getElementById("modPanelContent");
        const perms = getCurrentUserPermissions();
        
        if (!perms.canAssignRoles) {
          modPanelContent.innerHTML = '<div class="text-center py-8 text-red-400">You do not have permission to manage staff</div>';
          return;
        }
        
        // Get all users with staff roles
        const staffData = staffRolesCache || {};
        const staffUids = Object.keys(staffData).filter(uid => staffData[uid]?.role);
        
        // Build UI
        let html = '<div class="space-y-4">';
        
        // Add new staff section
        html += '<div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700">';
        html += '<h4 class="text-sm font-semibold text-slate-200 mb-3">Assign Staff Role</h4>';
        html += '<div class="flex gap-2 flex-wrap relative">';
        html += '<div class="relative flex-1 min-w-[150px]">';
        html += '<input type="text" id="staffAssignUsername" placeholder="Start typing username..." autocomplete="off" class="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:border-rose-500 focus:outline-none">';
        html += '<div id="staffUsernameSuggestions" class="absolute top-full left-0 right-0 bg-slate-900 border border-slate-600 rounded-lg mt-1 max-h-48 overflow-y-auto hidden z-50 shadow-xl"></div>';
        html += '</div>';
        html += '<select id="staffAssignRole" class="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-100">';
        html += '<option value="TRIAL_MOD">Trial Mod</option>';
        html += '<option value="MOD">Mod</option>';
        html += '<option value="ADMIN">Admin</option>';
        html += '<option value="HEAD_ADMIN">Head Admin</option>';
        html += '</select>';
        html += '<button id="staffAssignBtn" class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-medium transition-colors">Assign</button>';
        html += '</div>';
        html += '<input type="hidden" id="staffAssignUid">';
        html += '</div>';
        
        // Current staff list
        html += '<h4 class="text-sm font-semibold text-slate-200 mt-4 mb-2">Current Staff (' + staffUids.length + ')</h4>';
        
        if (staffUids.length === 0) {
          html += '<div class="text-center py-4 text-slate-500 text-sm">No staff members assigned yet</div>';
        } else {
          // Fetch usernames for staff
          const userSnap = await db.ref('users').once('value');
          const users = userSnap.val() || {};
          
          // Sort by priority (highest first)
          staffUids.sort((a, b) => {
            const roleA = STAFF_ROLES[staffData[a]?.role]?.priority || 0;
            const roleB = STAFF_ROLES[staffData[b]?.role]?.priority || 0;
            return roleB - roleA;
          });
          
          for (const uid of staffUids) {
            const roleKey = staffData[uid]?.role;
            const role = STAFF_ROLES[roleKey];
            const username = staffData[uid]?.username || users[uid]?.username || 'Unknown';
            
            if (!role) continue;
            
            const roleColors = {
              HEAD_ADMIN: 'border-rose-500/40 bg-rose-500/10',
              ADMIN: 'border-orange-500/40 bg-orange-500/10',
              MOD: 'border-emerald-500/40 bg-emerald-500/10',
              TRIAL_MOD: 'border-violet-500/40 bg-violet-500/10'
            };
            
            html += '<div class="flex items-center justify-between p-3 rounded-lg border ' + (roleColors[roleKey] || 'border-slate-700 bg-slate-800/50') + '">';
            html += '<div class="flex items-center gap-3">';
            html += '<span class="text-slate-100 font-medium">' + escapeHtml(username) + '</span>';
            html += getStaffRoleBadge(roleKey);
            html += '</div>';
            html += '<div class="flex gap-2">';
            html += '<select class="staff-role-select px-2 py-1 bg-slate-900 border border-slate-600 rounded text-xs text-slate-100" data-uid="' + uid + '" data-username="' + escapeHtml(username) + '" data-current-role="' + roleKey + '">';
            html += '<option value="TRIAL_MOD"' + (roleKey === 'TRIAL_MOD' ? ' selected' : '') + '>Trial Mod</option>';
            html += '<option value="MOD"' + (roleKey === 'MOD' ? ' selected' : '') + '>Mod</option>';
            html += '<option value="ADMIN"' + (roleKey === 'ADMIN' ? ' selected' : '') + '>Admin</option>';
            html += '<option value="HEAD_ADMIN"' + (roleKey === 'HEAD_ADMIN' ? ' selected' : '') + '>Head Admin</option>';
            html += '</select>';
            html += '<button class="staff-remove-btn px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs transition-colors" data-uid="' + uid + '" data-username="' + escapeHtml(username) + '" data-current-role="' + roleKey + '">Remove</button>';
            html += '</div>';
            html += '</div>';
          }
        }
        
        html += '</div>';
        modPanelContent.innerHTML = html;
        
        // Wire up event handlers
        const assignBtn = document.getElementById('staffAssignBtn');
        const assignUsername = document.getElementById('staffAssignUsername');
        const assignRole = document.getElementById('staffAssignRole');
        const assignUidInput = document.getElementById('staffAssignUid');
        const suggestionsDiv = document.getElementById('staffUsernameSuggestions');
        
        // Username auto-complete as user types
        let usersCache = null;
        let searchTimeout = null;
        
        if (assignUsername && suggestionsDiv) {
          assignUsername.oninput = async () => {
            const query = assignUsername.value.trim().toLowerCase();
            
            clearTimeout(searchTimeout);
            
            if (query.length < 2) {
              suggestionsDiv.classList.add('hidden');
              suggestionsDiv.innerHTML = '';
              assignUidInput.value = '';
              return;
            }
            
            // Debounce search
            searchTimeout = setTimeout(async () => {
              // Fetch users if not cached
              if (!usersCache) {
                try {
                  const snap = await db.ref('users').once('value');
                  usersCache = snap.val() || {};
                } catch (e) {
                  console.error('[staff] Failed to fetch users for autocomplete:', e);
                  return;
                }
              }
              
              // Search usernames
              const matches = [];
              for (const [uid, data] of Object.entries(usersCache)) {
                const username = data?.username || '';
                if (username.toLowerCase().includes(query)) {
                  matches.push({ uid, username });
                  if (matches.length >= 10) break; // Limit results
                }
              }
              
              if (matches.length === 0) {
                suggestionsDiv.innerHTML = '<div class="px-3 py-2 text-slate-500 text-sm">No users found</div>';
                suggestionsDiv.classList.remove('hidden');
                return;
              }
              
              suggestionsDiv.innerHTML = matches.map(m => 
                '<div class="staff-username-suggestion px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 transition-colors" data-uid="' + m.uid + '" data-username="' + escapeHtml(m.username) + '">' + escapeHtml(m.username) + '</div>'
              ).join('');
              suggestionsDiv.classList.remove('hidden');
              
              // Wire up click handlers for suggestions
              document.querySelectorAll('.staff-username-suggestion').forEach(el => {
                el.onclick = () => {
                  assignUsername.value = el.dataset.username;
                  assignUidInput.value = el.dataset.uid;
                  suggestionsDiv.classList.add('hidden');
                };
              });
            }, 150); // Debounce delay
          };
          
          // Hide suggestions when clicking outside
          document.addEventListener('click', (e) => {
            if (!e.target.closest('#staffAssignUsername') && !e.target.closest('#staffUsernameSuggestions')) {
              suggestionsDiv.classList.add('hidden');
            }
          });
        }
        
        if (assignBtn) {
          assignBtn.onclick = async () => {
            const username = assignUsername.value.trim();
            const roleKey = assignRole.value;
            let targetUid = assignUidInput.value;
            
            if (!username) {
              showToast('Please enter a username', 'error');
              return;
            }
            
            // Look up UID by username if not already set via autocomplete
            if (!targetUid) {
              try {
                const lookupSnap = await db.ref('users').orderByChild('username').equalTo(username).once('value');
                const lookupData = lookupSnap.val();
                if (lookupData) {
                  targetUid = Object.keys(lookupData)[0];
                }
              } catch (e) {
                console.error('[staff] lookup error:', e);
              }
            }
            
            if (!targetUid) {
              showToast('User not found', 'error');
              return;
            }
            
            await assignStaffRole(targetUid, roleKey, username);
            assignUsername.value = '';
            assignUidInput.value = '';
            loadStaffManagement(); // Refresh
          };
        }
        
        // Wire up role change selects
        document.querySelectorAll('.staff-role-select').forEach(select => {
          select.onchange = async (e) => {
            const uid = e.target.dataset.uid;
            const newRole = e.target.value;
            const oldRole = e.target.dataset.currentRole;
            const username = e.target.dataset.username;
            
            // Check if this is a demotion
            const oldPriority = STAFF_ROLES[oldRole]?.priority || 0;
            const newPriority = STAFF_ROLES[newRole]?.priority || 0;
            
            if (newPriority < oldPriority) {
              // This is a demotion - show modal for reason
              const oldRoleName = STAFF_ROLES[oldRole]?.name || oldRole;
              const newRoleName = STAFF_ROLES[newRole]?.name || newRole;
              const reason = await showStaffActionReasonModal('demote', username || 'this user', oldRoleName, newRoleName);
              
              if (reason === null) {
                // Cancelled - reset the select
                e.target.value = oldRole;
                return;
              }
              
              // Store demotion reason
              try {
                await db.ref('staffRoleRemoved/' + uid).set({
                  previousRole: oldRole,
                  newRole: newRole,
                  reason: reason,
                  removedBy: currentUserId,
                  removedAt: firebase.database.ServerValue.TIMESTAMP,
                  acknowledged: false
                });
              } catch (err) {
                console.warn('[staff] Could not store demotion reason:', err);
              }
            }
            
            await assignStaffRole(uid, newRole, username);
            loadStaffManagement(); // Refresh
          };
        });
        
        // Wire up remove buttons
        document.querySelectorAll('.staff-remove-btn').forEach(btn => {
          btn.onclick = async (e) => {
            const uid = e.target.dataset.uid;
            const username = e.target.dataset.username || 'this staff member';
            const currentRole = e.target.dataset.currentRole;
            const roleName = STAFF_ROLES[currentRole]?.name || currentRole || 'Staff';
            
            // Show modal for reason
            const reason = await showStaffActionReasonModal('terminate', username, roleName);
            if (reason === null) return; // Cancelled
            
            await assignStaffRole(uid, null, null, reason);
            loadStaffManagement(); // Refresh
          };
        });
      }
      
      // Settings tab for mod panel (HEAD_ADMIN+ only)
      async function loadModPanelSettings() {
        const modPanelContent = document.getElementById("modPanelContent");
        const perms = getCurrentUserPermissions();
        const staffRole = getUserStaffRole(currentUserId);
        const canSeeSettings = perms.isOwner || perms.isCoOwner || (staffRole && staffRole.priority >= 4);
        
        if (!canSeeSettings) {
          modPanelContent.innerHTML = '<div class="text-center py-8 text-red-400">You do not have permission to manage settings</div>';
          return;
        }
        
        // Read current setting
        const snap = await db.ref('settings/imagesEnabled').once('value');
        const imagesOn = snap.val() !== false;
        
        let html = '<div class="space-y-4">';
        html += '<div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700">';
        html += '<h4 class="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">🖼️ Chat Images</h4>';
        html += '<p class="text-xs text-slate-400 mb-4">When disabled, all images and videos in chat are hidden and users cannot upload new media.</p>';
        html += '<div class="flex items-center justify-between">';
        html += '<span class="text-sm text-slate-300">Images in chat</span>';
        html += '<label class="relative inline-flex items-center cursor-pointer">';
        html += '<input type="checkbox" id="modSettingsImagesToggle" class="sr-only peer" ' + (imagesOn ? 'checked' : '') + '>';
        html += '<div class="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>';
        html += '</label>';
        html += '</div>';
        html += '<div id="modSettingsImagesStatus" class="mt-2 text-xs ' + (imagesOn ? 'text-emerald-400' : 'text-red-400') + '">';
        html += imagesOn ? '✓ Images are enabled' : '✕ Images are disabled — all media hidden from chat';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        
        modPanelContent.innerHTML = html;
        
        const toggle = document.getElementById('modSettingsImagesToggle');
        const status = document.getElementById('modSettingsImagesStatus');
        if (toggle) {
          toggle.addEventListener('change', async () => {
            const enabled = toggle.checked;
            try {
              await db.ref('settings/imagesEnabled').set(enabled);
              if (status) {
                status.className = 'mt-2 text-xs ' + (enabled ? 'text-emerald-400' : 'text-red-400');
                status.textContent = enabled ? '✓ Images are enabled' : '✕ Images are disabled — all media hidden from chat';
              }
              showToast(enabled ? 'Images enabled in chat' : 'Images disabled in chat — all media hidden', enabled ? 'success' : 'info');
              // Log the action
              db.ref('auditLog/settings').push({
                action: enabled ? 'images_enabled' : 'images_disabled',
                adminUid: currentUserId,
                adminUsername: currentUsername,
                timestamp: firebase.database.ServerValue.TIMESTAMP
              });
            } catch (e) {
              console.error('[modPanel] failed to update images setting:', e);
              showToast('Failed to update setting', 'error');
              toggle.checked = !enabled; // Revert
            }
          });
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
        
        
        const now = Date.now();
        const activeEntries = [];
        for (const [uid, data] of Object.entries(banned)) {
          const isPermanent = !data.until || data.until === 9999999999999;
          const isExpired = !isPermanent && data.until < now;
          if (isExpired) {
            
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
                      ${isHardwareBanned ? '<span class="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full font-medium">🖥️ HW</span>' : ''}
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
                      ${bannedAt ? '<span>📝… ' + bannedAt + '</span>' : ''}
                      ${!isPermanent && expiresAt ? '<span>° Expires: ' + expiresAt + '</span>' : ''}
                    </div>
                  </div>
                </div>
              </div>
              <div class="flex gap-2 flex-wrap mt-4 pt-4 border-t border-slate-700">
                <button onclick="modPanelUnban('${uid}')" class="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-green-500/25 hover:scale-105">✓ Unban</button>
                <button onclick="modPanelExtendBan('${uid}')" class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-amber-500/25 hover:scale-105">⏱️ Extend</button>
                ${fp && !isHardwareBanned ? `<button onclick="modPanelHardwareBan('${fp}', '${uid}')" class="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-purple-500/25 hover:scale-105">🖥️ HW Ban</button>` : ''}
                ${fp && isHardwareBanned ? `<button onclick="modPanelUnHardwareBan('${fp}')" class="px-5 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:scale-105">🖥️ Remove HW</button>` : ''}
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
        
        
        const now = Date.now();
        const activeEntries = [];
        for (const [uid, data] of Object.entries(muted)) {
          const isPermanent = !data.until || data.until === 9999999999999;
          const isExpired = !isPermanent && data.until && data.until < now;
          if (isExpired) {
            
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
                  ${!isPermanent && expiresAt ? `<div class="text-xs text-slate-400">° Expires: ${expiresAt}</div>` : ''}
                </div>
              </div>
              <div class="flex gap-2 flex-wrap mt-4 pt-4 border-t border-slate-700">
                <button onclick="modPanelUnmute('${uid}')" class="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-green-500/25 hover:scale-105">✓ Unmute</button>
                <button onclick="modPanelExtendMute('${uid}')" class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-amber-500/25 hover:scale-105">⏱️ Extend</button>
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
                  <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center text-lg">🖥️</div>
                  <div>
                    <span class="font-mono text-sm text-purple-300">${fpHash.slice(0, 20)}...</span>
                    <div class="text-xs text-slate-500">Banned by: ${bannedBy}</div>
                  </div>
                </div>
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-600/30 text-purple-300">🕐 ${bannedAt}</span>
              </div>
              <p class="text-sm text-slate-300 mb-4 pl-12">📝 ${escapeHtml(reason)}</p>
              <div class="flex gap-2 pl-12">
                <button onclick="modPanelUnHardwareBan('${fpHash}')" class="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg font-medium transition-colors shadow-md">✓ Remove HW Ban</button>
              </div>
            </div>
          `;
        }
        html += '</div>';
        modPanelContent.innerHTML = html;
      }
      
      
      window.modPanelUnban = async (uid) => {
        if (!isAdmin) return;
        if (!confirm("Unban this user?")) return;
        const content = document.getElementById('modPanelContent');
        const cards = content ? content.querySelectorAll('.bg-slate-800\\/80') : [];
        let card = null;
        cards.forEach(c => { if (c.querySelector(`[onclick*="'${uid}'"]`)) card = c; });
        if (card) card.style.opacity = '0.5';
        await unbanUser(uid);
        if (card) card.remove();
        showToast("User unbanned", "success");
        
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
          const parsed = parseInt(mins, 10);
          if (isNaN(parsed) || parsed <= 0) {
            showToast("Please enter a valid number of minutes", "error");
            return;
          }
          const addMs = parsed * 60 * 1000;
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
        const content = document.getElementById('modPanelContent');
        const cards = content ? content.querySelectorAll('.bg-slate-800\\/80') : [];
        let card = null;
        cards.forEach(c => { if (c.querySelector(`[onclick*="'${uid}'"]`)) card = c; });
        if (card) card.style.opacity = '0.5';
        await db.ref("mutedUsers/" + uid).remove();
        if (card) card.remove();
        showToast("User unmuted", "success");
        
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
        const parsed = parseInt(mins, 10);
        if (isNaN(parsed) || parsed <= 0) {
          showToast("Please enter a valid number of minutes", "error");
          return;
        }
        const addMs = parsed * 60 * 1000;
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

          clearExpiredBan(uid, data);

          const now = Date.now();
          if (data.until && data.until <= now) {
            
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
            
            isPermanent = true;
            banReason.textContent = "Reason: " + (data.reason || "Rule break") + " (PERMANENT)";
            console.log("[ban] permanent ban detected");
          } else if (data.until && data.until > now) {
            
            secondsLeft = Math.ceil((data.until - now) / 1000);
            banReason.textContent = "Reason: " + (data.reason || "Rule break") + " (Temp ban expires in " + secondsLeft + "s)";
            console.log("[ban] temporary ban for", secondsLeft, "seconds");
          }
          
          banPopup.classList.remove("hidden");
          
          
          if (isPermanent) {
            console.log("[ban] showing ban popup, signing out in 3 seconds (permanent ban)");
            
            
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
            
            console.log("[ban] temporary ban - user can try again after ban expires");
            
            
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
        const perms = getCurrentUserPermissions();
        if (!perms.canMute || !uid) {
          showToast('You do not have permission to mute users', 'error');
          return;
        }
        
        // Check if duration exceeds permission
        if (perms.maxMuteMinutes !== Infinity && minutes > perms.maxMuteMinutes) {
          showToast('You can only mute for up to ' + perms.maxMuteMinutes + ' minutes', 'error');
          return;
        }
        
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
        if (!muteReasonModal || !muteReasonCustom || !muteDuration) return;
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
            
            
            const mutePopup = document.getElementById("mutePopup");
            const muteReason = document.getElementById("muteReason");
            const muteTimer = document.getElementById("muteTimer");
            if (!mutePopup || !muteReason || !muteTimer) return;
            muteReason.textContent = "Reason: " + (data.reason || "Rule break");
            mutePopup.classList.remove("hidden");
            muteTimer.textContent = timeLeft + "s remaining";
            
            
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
        if (!warnReasonModal || !warnReasonCustom) return;
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

      
      function isMessageFromBlockedUser(msg) {
        if (!msg || !msg.userId) return false;
        return blockedUsersCache.has(msg.userId);
      }

      
      let typingTimeoutId = null;
      let typingListenerAttached = false;
      const TYPING_CLEANUP_INTERVAL = 5000; 
      let typingCleanupInterval = null;

      
      let sendWarningTimeoutId = null;
      let lastSentTime = 0; 
      const TEXT_COOLDOWN_MS = 500;   
      const MEDIA_COOLDOWN_MS = 5000; // 5 second cooldown for images
      const MESSAGE_SEND_LIMIT = 10; // Max messages per minute
      let messageSendTimes = []; // Track message timestamps for rate limiting 

      
      const BAD_WORDS = [
        
        "fuck", "fck", "shit", "bitch", "asshole", "bastard", "cunt",
        
        "faggot", "fagot", "fag", "nigger", "niger", "nigga", "niga", "chink", "slut", "whore",
        
        "retard", "retarded", "tranny", "homo", "dyke", "kike",
        
        "kys", "kms"
      ];

      
      
      
      function createFlexiblePattern(word) {
        
        const subs = {
          'a': '[a@4àáâãäåαаᴀɑ🅰️]',
          'b': '[b8ßᵇ🅱️]',
          'c': '[cç(\\[сᴄ¢©]',
          'd': '[dδᴅ]',
          'e': '[e3èéêëе€ᴇɛ]',
          'f': '[fƒ]',
          'g': '[g9qɡᶃ6]',
          'h': '[h#ʜ]',
          'i': '[i1!|ìíîïіᴉ¡l]',
          'j': '[jј]',
          'k': '[kкᴋ]',
          'l': '[l1|!ìíîïіᶅ]',
          'm': '[mмᴍ]',
          'n': '[nñпɴ]',
          'o': '[o0óòôõöøоᴏ]',
          'p': '[pрᴘ]',
          'q': '[q9]',
          'r': '[rгᴿʀ]',
          's': '[s5$śšṡ§]',
          't': '[t7+ᴛ†]',
          'u': '[uùúûüцᴜ]',
          'v': '[vνᴠ]',
          'w': '[wᴡω]',
          'x': '[x%×хᴿ]',
          'y': '[yÿуʏ]',
          'z': '[z2ᴢ]'
        };

        
        const letters = word.toLowerCase().split('');
        
        // Allow up to 6 non-alpha chars between letters (catches spaces, dots, dashes, underscores, asterisks, etc.)
        const gap = '[^a-zA-Z0-9]{0,6}';
        const parts = letters.map(ch => {
          const cls = subs[ch] || ('[' + ch + ']');
          
          return cls + '+(' + gap + ')?';
        });
        let pattern = parts.join('');
        
        // For short words (3-4 chars), add word boundary to reduce false positives
        if (word.length <= 4) {
          pattern = '(?<![a-zA-Z])' + pattern + '(?![a-zA-Z])';
        }
        
        return new RegExp(pattern, 'giu');
      }

      
      const FLEXIBLE_BAD_WORD_PATTERNS = BAD_WORDS.map(word => createFlexiblePattern(word));

      
      const SEVERE_SLURS = ['nigger','niger','nigga','niga','faggot','fagot','fag','kike','chink','tranny'];
      const FLEXIBLE_SEVERE_PATTERNS = SEVERE_SLURS.map(w => createFlexiblePattern(w));

      
      
      const THREAT_PATTERNS = [
        
        /i'?m\s+(?:gonna|going\s+to|will)?\s+(?:kill|hurt|rape|beat|punch|stab|harm|destroy)\s+you\b/gi,
        /you\s+(?:better\s+)?(?:watch\s+your\s+back|watch\s+it)\b/gi,
        /(?:kill|hurt|harm)\s+yourself\b/gi,
        /you\s+deserve\s+to\s+(?:die|suffer|hurt|be\s+hurt)\b/gi,
        /i\s+(?:hope|wish|want)\s+(?:you|someone|people)\s+(?:dies?|dead|suffers?|gets?\s+hurt)\b/gi,
        /(?:death|kill|rape)\s+threat/gi,
        /neck\s+yourself|hang\s+yourself|slit\s+your\s+wrist/gi,
        /go\s+(?:kill|die|kys)/gi,
      ];

      
      
      const HATE_PATTERNS = [
        
        /\b(?:all|every|these)\s+(?:blacks?|africans?|arabs?|mexicans?|jews?|gays?|lgbtq|women|men|gay|trans(?:gender)?|asians?|indians?|religions?)\s+(?:are\s+)?(?:scum|trash|subhuman|disgusting|worthless|deserve\s+to\s+(?:die|suffer|hurt))/gi,
        
        /(?:go\s+)?(?:back\s+to\s+)?(?:your\s+country|where\s+you\s+came\s+from)\b/gi,
        
        /\b(?:kill\s+all|wipe\s+out)\s+(?:blacks?|jews?|gays?|women|trans|mexicans?|asians?)/gi,
      ];

      const badWordPattern = new RegExp("\\b(" + BAD_WORDS.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|") + ")\\b", "gi");

      // Normalize text by stripping zero-width chars, converting lookalike unicode to ASCII, and collapsing diacritics
      function normalizeForFilter(text) {
        if (!text) return text;
        // Remove zero-width characters and invisible formatting
        let result = text.replace(/[\u200B\u200C\u200D\u2060\u2063\uFEFF\u00AD\u034F\u061C\u180E]/g, '');
        // Normalize unicode (NFD then strip combining marks)
        result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Map common Cyrillic/Greek lookalikes to Latin
        const lookalikes = {
          'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
          'і': 'i', 'ї': 'i', 'к': 'k', 'м': 'm', 'н': 'n', 'т': 't',
          'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'У': 'Y', 'Х': 'X',
          'І': 'I', 'К': 'K', 'М': 'M', 'Н': 'N', 'Т': 'T',
          'α': 'a', 'β': 'b', 'ε': 'e', 'η': 'n', 'ι': 'i', 'κ': 'k', 'ν': 'v',
          'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'ω': 'w',
          'ᴀ': 'a', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ɛ': 'e', 'ᴋ': 'k',
          'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ᴛ': 't',
          'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
          'ɑ': 'a', 'ɡ': 'g', 'ɪ': 'i', 'ᶅ': 'l', 'ᶃ': 'g',
          'ƒ': 'f', 'ј': 'j',
          '🅰': 'a', '🅱': 'b',
        };
        result = result.split('').map(ch => lookalikes[ch] || ch).join('');
        // Convert fullwidth characters to ASCII
        result = result.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
        // Strip regional indicator symbols
        result = result.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '');
        return result;
      }
      
      function filterBadWords(text) {
        if (!text) return text;
        
        // Normalize to strip zero-width chars, lookalike unicode, diacritics
        const normalized = normalizeForFilter(text);
        
        // Whitelist common false positives (like "of a gif")
        const WHITELIST_PHRASES = [
          { pattern: /\bof\s+a\s+gif\b/gi, placeholder: '___OF_A_GIF___' },
          { pattern: /\bgif\s+of\s+a\b/gi, placeholder: '___GIF_OF_A___' },
        ];
        
        // Replace whitelisted phrases with placeholders
        let processed = normalized;
        for (const item of WHITELIST_PHRASES) {
          processed = processed.replace(item.pattern, item.placeholder);
        }
        
        for (let pattern of THREAT_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(processed)) {
            console.warn("[filter] Threat/violence detected in message");
            return "[FILTERED - VIOLENT CONTENT NOT ALLOWED]";
          }
        }
        
        
        for (let pattern of HATE_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(processed)) {
            console.warn("[filter] Hate speech/harassment detected in message");
            return "[FILTERED - HATEFUL/HARASSMENT CONTENT NOT ALLOWED]";
          }
        }
        
        
        for (let pattern of FLEXIBLE_SEVERE_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(processed)) {
            console.warn("[filter] Severe slur detected in message");
            return "[FILTERED - HATEFUL/HARASSMENT CONTENT NOT ALLOWED]";
          }
        }
        
        
        
        let hasFiltered = false;
        let filtered = processed;
        
        for (let pattern of FLEXIBLE_BAD_WORD_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(filtered)) {
            hasFiltered = true;
            pattern.lastIndex = 0;
            filtered = filtered.replace(pattern, (match) => {
              return '*'.repeat(match.length);
            });
          }
        }
        
        
        badWordPattern.lastIndex = 0;
        if (badWordPattern.test(filtered)) {
          badWordPattern.lastIndex = 0;
          filtered = filtered.replace(badWordPattern, (match) => {
            return '*'.repeat(match.length);
          });
        }
        
        // Restore whitelisted phrases
        filtered = filtered.replace(/___OF_A_GIF___/g, 'of a gif');
        filtered = filtered.replace(/___GIF_OF_A___/g, 'gif of a');
        
        return filtered;
      }

      
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
      
      
      let messageRenderQueue = [];
      let isRenderingMessages = false;

      
      let lastTypingText = "";
      let currentWarningText = "";
      let aiTypingActive = false;
      
      function setAiTyping(isTyping) {
        aiTypingActive = isTyping;
        if (isTyping) {
          lastTypingText = "Chatra AI is typing…";
        } else if (lastTypingText === "Chatra AI is typing…") {
          lastTypingText = "";
        }
        updateStatusBar();
      }

      function updateStatusBar() {
        const parts = [];
        if (lastTypingText) parts.push(lastTypingText);
        if (currentWarningText) {
          if (parts.length > 0) {
            
          } else {
            parts.push(currentWarningText);
          }
        }
        typingIndicatorEl.textContent = parts.join(" ");
        if (sendWarningEl) sendWarningEl.textContent = "";
      }

      
      function clearLoginMessages() {
        loginInfo.textContent = "";
      }

      
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

      
      
      async function ensureTargetFriendRequestsIncoming(targetUid) {
        try {
          
          
          if (auth.currentUser && auth.currentUser.uid === targetUid) {
            const parentRef = db.ref("friendRequests/" + targetUid);
            const parentSnap = await parentRef.once("value");
            if (!parentSnap.exists()) {
              await parentRef.set({});
              console.log("[init] auto-created friendRequests parent for target", targetUid);
            }

            
            const incomingRef = db.ref("friendRequests/" + targetUid + "/incoming");
            const incomingSnap = await incomingRef.once("value");
            if (!incomingSnap.exists()) {
              await incomingRef.set({});
              console.log("[init] auto-created friendRequests incoming for target", targetUid);
            }
          } else {
            
            console.log("[init] skipping auto-create friendRequests for other user:", targetUid);
          }
        } catch (err) {
          
          
          logDetailedError("ensureTargetFriendRequestsIncoming", err, { targetUid });
        }
      }

      function clearRegisterMessages() {
        registerError.textContent = "";
      }

      
      async function ensureTargetFriendsList(targetUid) {
        try {
          
          
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

      
      async function fetchUsername(uid, emailFallback) {
        try {
          const snap = await db.ref("users/" + uid + "/username").once("value");
          let username = snap.val();
          
          if (!username && emailFallback) {
            username = emailFallback.split("@")[0];
            console.log("[username] no username in DB, using email:", username);
            
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

      
      (function initRememberMe() {
        rememberMeCheckbox.checked = false;
      })();

      
      registerLink.onclick = () => {
        clearLoginMessages();
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");
        console.log("[ui] switched to register form");
      };

      
      loginLink.onclick = () => {
        clearRegisterMessages();
        registerForm.classList.add("hidden");
        loginForm.classList.remove("hidden");
        console.log("[ui] switched to login form");
      };

      
      const termsModal = document.getElementById("termsModal");
      const privacyModal = document.getElementById("privacyModal");
      const termsLink = document.getElementById("termsLink");
      const privacyLink = document.getElementById("privacyLink");
      const termsCloseBtn = document.getElementById("termsCloseBtn");
      const termsCloseBtn2 = document.getElementById("termsCloseBtn2");
      const privacyCloseBtn = document.getElementById("privacyCloseBtn");
      const privacyCloseBtn2 = document.getElementById("privacyCloseBtn2");

      
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

      
      function encodeFirebaseKey(key) {
        return key
          .replace(/\./g, "_DOT_")
          .replace(/#/g, "_HASH_")
          .replace(/\$/g, "_DOLLAR_")
          .replace(/\[/g, "_LBRACKET_")
          .replace(/\]/g, "_RBRACKET_");
      }

      
      function makeEmailFromUsername(username) {
        return username.toLowerCase().replace(/\s+/g, '') + "@gmail.com";
      }

      
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
        if (dmMessagesRef && dmChildChangedListener) {
          dmMessagesRef.off("child_changed", dmChildChangedListener);
        }
        dmMessagesRef = null;
        dmMessagesListener = null;
        dmChildChangedListener = null;
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
            video.className = "w-full rounded-lg chat-media";
            video.setAttribute("playsinline", ""); 
            video.setAttribute("webkit-playsinline", ""); 

            videoContainer.appendChild(video);
            bubble.appendChild(videoContainer);
          } else {
            const imgContainer = document.createElement("div");
            imgContainer.className = "relative rounded-lg overflow-hidden mb-2";

            const img = document.createElement("img");
            img.src = mediaUrl;
            img.alt = "DM media";
            img.className = "w-full rounded-lg cursor-pointer active:opacity-70 transition-opacity chat-media";
            img.crossOrigin = "anonymous"; 
            img.onclick = () => openImageViewer(mediaUrl);

            imgContainer.appendChild(img);
            bubble.appendChild(imgContainer);
            scanDisplayedImage(img);
          }
          // Placeholder shown when images are disabled
          const mediaPlaceholder = document.createElement('div');
          mediaPlaceholder.className = 'chat-media-placeholder text-xs text-slate-500 italic py-2 hidden';
          mediaPlaceholder.textContent = '🖼️ Image hidden by moderator';
          bubble.appendChild(mediaPlaceholder);
        }

        if (msg && msg.text) {
          const textSpan = document.createElement("span");
          textSpan.className = msg.media ? "message-text-reveal block mt-2 font-medium" : "message-text-reveal inline-block font-medium";
          textSpan.textContent = msg.text;
          bubble.appendChild(textSpan);
        }

        
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
        return row; 
      }

      async function isBlockedByTarget(targetUid) {
        if (!currentUserId || !targetUid) return false;
        try {
          const snap = await db
            .ref("blockedUsers/" + targetUid + "/" + currentUserId)
            .once("value");
          return snap.exists();
        } catch (e) {
          
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
        
        const dmMessageElements = {};

        
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
            
            if (dmMessages) dmMessages.scrollTop = dmMessages.scrollHeight;

            
            const lastTime = msgs.length ? (msgs[msgs.length - 1].time || Date.now()) : Date.now();

            
            dmPageMessagesListener = null; 
            dmMessagesListener = dmMessagesRef.orderByChild("time").startAt(lastTime + 1).on("child_added", (snap) => {
              const msg = snap.val();
              if (!msg) return;
              const key = snap.key;
              const row = renderDmMessage(msg);
              if (row && key) dmMessageElements[key] = row;

              
              if (activeDMTarget && msg.fromUid !== currentUserId && dmInboxInitialLoaded) {
                const now = Date.now();
                const lastMsgPreview = (msg.text && String(msg.text)) || (msg.media ? '(media)' : '');
                db.ref("dmInbox/" + currentUserId + "/" + threadId).update({
                  withUid: activeDMTarget.uid,
                  withUsername: activeDMTarget.username || activeDMTarget.uid,
                  lastMsg: lastMsgPreview,
                  lastTime: now
                }).catch(() => {});
                
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

        
        dmChildChangedListener = (snap) => {
          const msg = snap.val();
          const key = snap.key;
          if (!msg || !key) return;
          
          const row = dmMessageElements[key];
          if (row) {
            
            const bubble = row.querySelector(".message-bubble-anim");
            if (bubble) {
              populateDmBubble(bubble, msg);
              bubble.classList.add("message-text-reveal");
              setTimeout(() => bubble.classList.remove("message-text-reveal"), 400);
            }
          }
        };
        dmMessagesRef.on("child_changed", dmChildChangedListener);
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
        
        
        if (!dmInboxInitialLoaded) {
          try {
            const snapshot = await dmInboxRef.once("value");
            const data = snapshot.val() || {};
            const entries = Object.entries(data)
              .map(([threadId, info]) => ({ threadId, ...info }))
              .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
            
            
            entries.forEach((item) => {
              
              if (clearedNotificationThreads.has(item.threadId)) return;
              
              if (!item.lastMsg) return;

              const who = item.withUsername || item.withUid || "Someone";
              const preview = previewText(item.lastMsg, 80);
              
              
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
            
            const dmPageEl = document.getElementById('dmPage');
            const dmPageVisible = dmPageEl && !dmPageEl.classList.contains('hidden');
            const isActiveThread = activeDMThread === item.threadId && (dmModal.classList.contains("modal-open") || dmPageVisible);

            
            if (isActiveThread && lastTime > lastSeen) {
              dmLastSeenByThread[item.threadId] = lastTime;
            }

            
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

            
            dmLastUpdateTimeByThread[item.threadId] = Math.max(item.lastMsg ? lastTime : 0, dmLastUpdateTimeByThread[item.threadId] || 0);

            
            
            const unreadCount = (typeof item.unread === 'number') ? item.unread : 0;
            if (unreadCount > 0) {
              dmUnreadCounts[item.threadId] = unreadCount;
              unreadThreadsCount += 1;
            } else {
              delete dmUnreadCounts[item.threadId];
            }
          });

          
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

        // Show video call button in modal DM view
        const vcBtn2 = document.getElementById('dmVideoCallBtn');
        if (vcBtn2) {
          vcBtn2.classList.remove('hidden');
          vcBtn2.onclick = async function() {
            if (window.ChatraVideoCall && targetUid) {
              const privCheck = await checkCallPrivacy(targetUid);
              if (!privCheck.allowed) {
                showToast(privCheck.reason, 'error');
                return;
              }
              window.ChatraVideoCall.startCall(targetUid, resolvedUsername || 'Unknown');
            }
          };
        }
        
        const now = Date.now();
        dmLastSeenByThread[threadId] = now;
        
        
        notificationHistory = notificationHistory.filter(n => n.threadId !== threadId);
        updateNotifBadge();
        renderNotificationHistory();
        
        
        await Promise.all([
          db.ref("dms/" + threadId + "/participants/" + currentUserId).set(true).catch(() => {}),
          db.ref("dmInbox/" + currentUserId + "/" + threadId).update({
            withUid: targetUid,
            withUsername: resolvedUsername || targetUid
          }).catch(() => {})
        ]);
        
        try {
          await db.ref("dmInbox/" + currentUserId + "/" + threadId).update({ unread: 0 }).catch(() => {});
        } catch (e) {}
        dmUnreadCounts[threadId] = 0;
        delete dmUnreadCounts[threadId];
        updateDmTabBadge();
        
        dmLastUpdateTimeByThread[threadId] = now;
        
        startDmMessagesListener(threadId);
      }

      async function ensureDmThread(targetUid, targetUsername) {
        const threadId = makeThreadId(currentUserId, targetUid);
        
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

      
      async function isUsernameTaken(username) {
        console.log("[users] checking if username taken:", username);
        try {
          
          if (isLocallyBlockedUsername(username)) {
            console.log("[users] username blocked locally:", username);
            return true;
          }

          
          const snapshot = await db
            .ref("users")
            .orderByChild("username")
            .equalTo(username)
            .once("value");
          const exists = snapshot.exists();

          
          let isBanned = false;
          const bannedSnap = await db.ref("bannedUsernames").once("value");
          if (bannedSnap.exists()) {
            bannedSnap.forEach((child) => {
              if (isBanned) return; 
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
          
          
          let hasForbiddenContent = false;
          badWordPattern.lastIndex = 0;
          hasForbiddenContent = badWordPattern.test(username);

          
          if (!hasForbiddenContent) {
            for (let pattern of FLEXIBLE_BAD_WORD_PATTERNS) {
              pattern.lastIndex = 0;
              if (pattern.test(username)) {
                hasForbiddenContent = true;
                break;
              }
            }
          }
          if (!hasForbiddenContent) {
            for (let pattern of THREAT_PATTERNS) {
              pattern.lastIndex = 0;
              if (pattern.test(username)) {
                hasForbiddenContent = true;
                break;
              }
            }
          }
          if (!hasForbiddenContent) {
            for (let pattern of HATE_PATTERNS) {
              pattern.lastIndex = 0;
              if (pattern.test(username)) {
                hasForbiddenContent = true;
                break;
              }
            }
          }
          
          return exists || isBanned || hasForbiddenContent;
        } catch (err) {
          console.error("[users] error while checking username", err);
          registerError.textContent = "Error checking username. Try again.";
          return true;
        }
      }

      
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
        
        // Show loading state
        const originalRegText = registerBtn.textContent;
        registerBtn.textContent = 'Signing up...';
        registerBtn.disabled = true;
        
        
        
        
        

        if (username.length < 2 || username.length > 12) {
          registerError.textContent = "Username must be 2-12 characters.";
          registerBtn.disabled = false;
          registerBtn.textContent = originalRegText;
          return;
        }

        
        if (!/^[a-zA-Z0-9_ -]+$/.test(username) || /^[_-]|[_-]$/.test(username)) {
          registerError.textContent = "Use letters/numbers/underscore/dash/space (no leading/trailing _ or -).";
          registerBtn.disabled = false;
          registerBtn.textContent = originalRegText;
          return;
        }

        
        try {
          const fpCheck = await checkFingerprintBan();
          if (fpCheck.banned) {
            console.log("[register] device fingerprint is banned");
            registerError.textContent = "This device has been banned. Contact support.";
            registerBtn.disabled = false;
            registerBtn.textContent = originalRegText;
            return;
          }
        } catch (e) {
          console.warn("[register] fingerprint check failed:", e);
          
        }

        let usernameHasBad = false;
        badWordPattern.lastIndex = 0;
        usernameHasBad = badWordPattern.test(username);

        if (!usernameHasBad) {
          
          for (let pattern of FLEXIBLE_BAD_WORD_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(username)) {
              usernameHasBad = true;
              break;
            }
          }
        }

        if (!usernameHasBad) {
          for (let pattern of THREAT_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(username)) {
              usernameHasBad = true;
              break;
            }
          }
        }

        if (!usernameHasBad) {
          for (let pattern of HATE_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(username)) {
              usernameHasBad = true;
              break;
            }
          }
        }

        if (usernameHasBad) {
          registerError.textContent = "Username not allowed.";
          registerBtn.disabled = false;
          registerBtn.textContent = originalRegText;
          return;
        }

        if (isLocallyBlockedUsername(username)) {
          registerError.textContent = "Username not allowed.";
          registerBtn.disabled = false;
          registerBtn.textContent = originalRegText;
          return;
        }

        if (password !== passwordConfirm) {
          registerError.textContent = "Passwords do not match.";
          registerBtn.disabled = false;
          registerBtn.textContent = originalRegText;
          return;
        }

        
        if (await isUsernameTaken(username)) {
          if (!registerError.textContent) {
            registerError.textContent = "That username is already taken.";
          }
          registerBtn.disabled = false;
          registerBtn.textContent = originalRegText;
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

          
          const userRef = db.ref("users/" + user.uid);
          await userRef.set({ username });
          console.log("[register] username saved to /users", user.uid);
          
          
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
            
            
            await db.ref("friendRequests/" + user.uid + "/incoming").set({});
            await db.ref("friends/" + user.uid).set({});
            console.log("[register] auto-created friend paths", user.uid);
          } catch (e) {
            console.warn("[register] could not create paths:", e);
          }

          
          console.log("[register] registration complete, staying logged in");
          
          
          await storeFingerprint(user.uid);
          
          
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
          // Reset button on error
          registerBtn.textContent = originalRegText || 'Sign Up';
          registerBtn.disabled = false;
        }
      };

      // Enter key to signup
      [regUsernameInput, regPasswordInput, regPasswordConfirmInput].forEach(input => {
        if (input) {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              registerBtn.click();
            }
          });
        }
      });

      
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
        
        // Show loading state
        const originalText = loginBtn.textContent;
        loginBtn.textContent = 'Logging in...';
        loginBtn.disabled = true;

        
        try {
          const fpCheck = await checkFingerprintBan();
          if (fpCheck.banned) {
            console.log("[login] device fingerprint is banned");
            loginError.textContent = "This device has been banned. Contact support.";
            loginBtn.disabled = false;
            loginBtn.textContent = originalText;
            return;
          }
        } catch (e) {
          console.warn("[login] fingerprint check failed:", e);
          
        }

        const fakeEmail = makeEmailFromUsername(username);

        try {
          
          
          try {
            const encodedEmail = encodeFirebaseKey(fakeEmail);
            const encodedUsername = encodeFirebaseKey(username);
            
            const bannedEmailSnap = await db.ref("bannedEmails/" + encodedEmail).once("value");
            const bannedUsernameSnap = await db.ref("bannedUsernames/" + encodedUsername).once("value");
            
            if (bannedEmailSnap.exists() || bannedUsernameSnap.exists()) {
              const bannedReason = bannedEmailSnap.val()?.reason || bannedUsernameSnap.val()?.reason || "Account has been permanently banned";
              loginError.textContent = "This account is banned: " + bannedReason;
              loginBtn.disabled = false;
              loginBtn.textContent = originalText;
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
            
          }

          console.log("[login] signing in with email", fakeEmail);

          const userCredential = await auth.signInWithEmailAndPassword(
            fakeEmail,
            password
          );
          const user = userCredential.user;

          console.log("[login] signed in as", user.uid);
          
          
          try {
            await ensureUsernamePath(user.uid, username);
            await ensureUserProfilePath(user.uid);
            await ensureFriendRequestsPaths(user.uid);
            await ensureFriendsList(user.uid);
          } catch (e) {
            console.warn("[login] could not ensure paths:", e);
            
          }

          
        } catch (error) {
          console.error("[login] Error signing in:", error);
          
          if (error && error.code === "auth/user-not-found") {
            loginError.textContent = "Account not found (it may have been deleted).";
          } else if (error && error.code === "auth/wrong-password") {
            loginError.textContent = "Wrong password.";
          } else if (error && error.code === "auth/too-many-requests") {
            loginError.textContent = "Too many attempts. Please wait and try again.";
          } else {
            loginError.textContent = "Could not log in. Try again.";
          }
          // Reset button on error
          loginBtn.textContent = originalText || 'Login';
          loginBtn.disabled = false;
        }
      };

      // Enter key to login
      [loginUsernameInput, loginPasswordInput].forEach(input => {
        if (input) {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              loginBtn.click();
            }
          });
        }
      });

      
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
          
          try {
            
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
            
            const verifyLink = (window.RESET_PAGE_URL || (window.location.origin + '/reset.html')) + '?token=' + encodeURIComponent(tokenId);

            
            try {
              
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(recoveryEmail || '')) {
                console.warn('[recovery] invalid recoveryEmail, aborting send', recoveryEmail);
                loginError.textContent = 'Recovery email on file is invalid — update your profile before requesting a reset.';
                return;
              }
              const EMAILJS_SERVICE = 'service_sf4vssc';
              const EMAILJS_TEMPLATE = 'template_1j06lwg';
              
              const userEmail = (recoveryEmail || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '').normalize('NFKC');
              const resetLink = verifyLink;
              
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

      
      const profileCache = {};



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

      
      async function deleteMessage(messageId, deleteToken) {
        if (!messageId) {
          console.error("[delete] no messageId provided");
          return;
        }

        try {
          console.log("[delete] deleting message", messageId);

          
          if (deleteToken) {
            try {
              await deleteFromCloudinary(deleteToken);
              console.log("[delete] deleted media from Cloudinary");
            } catch (err) {
              console.warn("[delete] failed to delete from Cloudinary, continuing", err);
            }
          }

          
          await db.ref("messages/" + messageId).remove();
          console.log("[delete] deleted message from Firebase");

          
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

      
      async function deleteGroupMessage(groupId, messageId, deleteToken) {
        if (!groupId || !messageId) {
          console.error("[delete group] no groupId or messageId provided");
          return;
        }

        try {
          console.log("[delete group] deleting message", messageId, "from group", groupId);

          
          if (deleteToken) {
            try {
              await deleteFromCloudinary(deleteToken);
              console.log("[delete group] deleted media from Cloudinary");
            } catch (err) {
              console.warn("[delete group] failed to delete from Cloudinary, continuing", err);
            }
          }

          
          await db.ref("groups/" + groupId + "/messages/" + messageId).remove();
          console.log("[delete group] deleted message from Firebase");

          
          
          const groupMsgContainer = document.getElementById('groupsPageMessages');
          if (groupMsgContainer) {
            const row = groupMsgContainer.querySelector(`[data-message-id="${messageId}"]`);
            if (row) {
              row.remove();
              console.log("[delete group] removed message from DOM");
            }
          } else {
            
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

      
      let activeDmInlineEdit = null; 

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

            textEl.innerHTML = renderTextWithMentions(trimmed, true);
            textEl.querySelectorAll('.mention-highlight').forEach(mentionEl => {
              mentionEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const mentionedUser = mentionEl.dataset.mention;
                if (mentionedUser) viewUserProfile(mentionedUser);
              });
            });
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

      
      async function reportDmMessage(messageId, messageData, reportedUsername) {
        if (!messageId || !currentUserId || !currentUsername) {
          console.error("[dm report] missing required data");
          return;
        }

        const reason = prompt(`Report DM from ${reportedUsername}?\n\nPlease describe the issue:\n(e.g., "Harassment", "Threats", "Spam", "Inappropriate content")`);

        if (!reason || reason.trim() === "") {
          return; 
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

      let activeInlineEdit = null; 

      
      let pendingReply = null; 
      
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

      
      function setReply(messageId, username, text) {
        
        
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
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

            textEl.innerHTML = renderTextWithMentions(trimmed, true);
            textEl.querySelectorAll('.mention-highlight').forEach(mentionEl => {
              mentionEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const mentionedUser = mentionEl.dataset.mention;
                if (mentionedUser) viewUserProfile(mentionedUser);
              });
            });
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

      
      
      const pendingProfileRequests = new Map();

      async function fetchUserProfile(username) {
        
        if (profileCache[username]) {
          const cached = profileCache[username];
          const now = Date.now();
          if (cached._timestamp && (now - cached._timestamp) < 300000) {
            return cached;
          }
        }
        
        
        if (pendingProfileRequests.has(username)) {
          return pendingProfileRequests.get(username);
        }
        
        const fetchPromise = (async () => {
          try {
            
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

      
      // Hidden marker for AI messages (zero-width space + special sequence)
      const AI_MSG_MARKER = '\u200B\u2063AI\u2063\u200B';
      
      // Regex to strip any AI prefix including zero-width characters
      const AI_PREFIX_REGEX = /^[\u200B\u200C\u200D\u2063\uFEFF]*AI[\u200B\u200C\u200D\u2063\uFEFF]*/gi;
      
      function createMessageRow(msg, messageId = null, containerEl = null) {
        const myName = currentUsername || null;
        
        // Check if this is an AI message first (by UID)
        const isAiMsg = msg.isAiResponse === true || msg.aiUserId === AI_BOT_UID || msg.userId === AI_BOT_UID;
        
        // ONLY strip AI markers from actual AI bot messages (verified by UID)
        // Use a local variable to avoid mutating the original msg object (which Firebase may cache)
        let displayText = msg.text || '';
        if (isAiMsg && displayText) {
          // Remove the exact AI message marker
          if (displayText.startsWith(AI_MSG_MARKER)) {
            displayText = displayText.substring(AI_MSG_MARKER.length);
          }
          // Strip any AI prefix patterns (case insensitive, global)
          displayText = displayText.replace(AI_PREFIX_REGEX, '').trim();
          // Also strip any standalone zero-width characters that might be visible
          displayText = displayText.replace(/^[\u200B\u200C\u200D\u2063\uFEFF]+/, '');
        }
        // Replace msg.text with cleaned display text for rendering
        msg = { ...msg, text: displayText };
        const isMine = !isAiMsg && myName && msg.user === myName;
        const username = isAiMsg ? 'Chatra AI' : (msg.user || "Unknown");
        const ownerUid = "u5yKqiZvioWuBGcGK3SWUBpUVrc2";
        const isOwnerMessage = !isAiMsg && msg.userId === ownerUid;
        const staffUid = "6n8hjmrUxhMHskX4BG8Ik9boMqa2";
        const isStaffMessage = !isAiMsg && msg.userId === staffUid;

        const row = document.createElement("div");
        row.className = isMine 
          ? "w-full flex mb-2 sm:mb-2 justify-end pr-0 sm:pr-1 gap-1 items-center"
          : "w-full flex mb-2 sm:mb-2 justify-start pl-0 sm:pl-1 gap-1 items-center";
        
        
        if (messageId) {
          row.dataset.messageId = messageId;
          row.id = 'msg-' + messageId;
        }

        const column = document.createElement("div");
        column.className = isMine
          ? "flex flex-col max-w-[80%] sm:max-w-[60%] gap-1 items-end w-auto"
          : "flex flex-col max-w-[80%] sm:max-w-[60%] gap-1 items-start w-auto";

        
        const avatarDiv = document.createElement("div");
        // AI messages get a purple gradient avatar, will load actual profile pic
        if (isAiMsg) {
          avatarDiv.className = "h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative";
          avatarDiv.innerHTML = '<span class="text-sm">🤖</span>';
          // Load AI's actual profile picture - either from cache or fetch it
          const loadAiAvatar = (url) => {
            if (!url) return;
            const aiImg = document.createElement("img");
            aiImg.className = "h-full w-full object-cover rounded-full";
            aiImg.src = url;
            aiImg.onerror = () => { avatarDiv.innerHTML = '<span class="text-sm">🤖</span>'; };
            aiImg.onload = () => { avatarDiv.innerHTML = ''; avatarDiv.appendChild(aiImg); };
          };
          
          if (aiProfile.avatar) {
            loadAiAvatar(aiProfile.avatar);
          } else {
            // Fetch AI profile pic if not cached yet
            db.ref('userProfiles/' + AI_BOT_UID).once('value').then(snap => {
              if (snap.exists()) {
                const p = snap.val();
                const avatarUrl = p.avatarUrl || p.profilePic || null;
                if (avatarUrl) {
                  aiProfile.avatar = avatarUrl; // Cache it
                  loadAiAvatar(avatarUrl);
                }
              }
            }).catch(() => {});
          }
        } else {
          avatarDiv.className = "h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative";
          avatarDiv.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        }
        avatarDiv.style.minWidth = "1.75rem";
        avatarDiv.style.minHeight = "1.75rem";

        
        const localMessagesDiv = containerEl || messagesDiv;

        
        // Only fetch profile for non-AI messages
        if (!isAiMsg) {
          setTimeout(() => {
            fetchUserProfile(username).then(profile => {
                  if (profile?.profilePic && avatarDiv.innerHTML.includes("svg")) {
                try {
                  const img = document.createElement("img");
                  img.className = "h-full w-full object-cover rounded-full";
                  
                  img.crossOrigin = "anonymous";
                  img.onerror = () => {
                    
                    console.debug("[avatar] failed to load", profile.profilePic);
                  };
                  img.onload = () => {
                    
                    if (avatarDiv.innerHTML.includes("svg") || avatarDiv.querySelector("img")?.src !== img.src) {
                      avatarDiv.innerHTML = "";
                      avatarDiv.appendChild(img);
                    }
                  };
                  
                img.src = profile.profilePic;
              } catch (e) {
                
                console.debug("[avatar] error creating img", e);
              }
            }
            // Apply frame if user has one (skip in fast mode for performance)
            if (!FAST_MODE_ENABLED && profile && profile.frameType && profile.frameType !== 'none') {
              applyFrameToAvatar(avatarDiv, profile);
            }
          }).catch((err) => {
            
            console.debug("[avatar] fetch error", err);
          });
        }, 50);
        } // End of if (!isAiMsg)

        
        avatarDiv.addEventListener("click", () => {
          viewUserProfile(username);
        });

        row.appendChild(avatarDiv);

        
        if (!isMine) {

          const nameLabel = document.createElement("div");
          nameLabel.className =
            "text-[10px] sm:text-xs text-slate-400 px-3 font-medium cursor-pointer hover:text-slate-300 transition-colors";
          
          // Check for Owner, Co-Owner, or Staff role
          const userStaffRole = msg.userId ? getUserStaffRole(msg.userId) : null;
          
          // isAiMsg is already defined at top of function
          if (isAiMsg) {
            const aiBadge = '<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/40">🤖 AI</span>';
            nameLabel.innerHTML = '<span class="inline-flex items-center gap-1">' + '<span class="mention-insert" data-username="AI">' + escapeHtml('Chatra AI') + '</span>' + aiBadge + '</span>';
          } else if (isOwnerMessage) {
            const ownerBadge = '<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-100 border border-amber-400/40">Owner</span>';
            nameLabel.innerHTML = '<span class="inline-flex items-center gap-1">' + '<span class="mention-insert" data-username="' + escapeHtml(username) + '">' + escapeHtml(username) + '</span>' + ownerBadge + '</span>';
          } else if (isStaffMessage) {
            const staffBadge = '<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-100 border border-sky-400/40">Co Owner</span>';
            nameLabel.innerHTML = '<span class="inline-flex items-center gap-1">' + '<span class="mention-insert" data-username="' + escapeHtml(username) + '">' + escapeHtml(username) + '</span>' + staffBadge + '</span>';
          } else if (userStaffRole) {
            const roleBadge = getStaffRoleBadge(userStaffRole.key, true);
            nameLabel.innerHTML = '<span class="inline-flex items-center gap-1">' + '<span class="mention-insert" data-username="' + escapeHtml(username) + '">' + escapeHtml(username) + '</span>' + roleBadge + '</span>';
          } else {
            nameLabel.innerHTML = '<span class="mention-insert" data-username="' + escapeHtml(username) + '">' + escapeHtml(username) + '</span>';
          }
          
          nameLabel.addEventListener("click", (e) => {
            
            if (e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              insertMentionAtCursor(username);
            } else {
              viewUserProfile(username);
            }
          });
          
          nameLabel.title = "Click to view profile \u2022 Shift+Click to @mention";
          column.appendChild(nameLabel);
        } else {
          
          avatarDiv.style.display = "none";
        }

        
        const bubbleContainer = document.createElement("div");
        bubbleContainer.className = isMine ? "flex justify-end" : "flex justify-start";

        const bubble = document.createElement("div");
        const textLength = (msg.text || "").length;
        const isSmallMessage = textLength <= 2;
        const padding = isSmallMessage ? "px-3 py-1.5" : "px-3 py-2";
        // Use the already-computed isAiMsg from above (includes marker detection)
        const aiClass = isAiMsg ? ' ai-message' : '';
        
        
        bubble.className = isMine
          ? `group relative overflow-visible message-bubble-anim mine${aiClass} ${padding} sm:px-3 sm:py-2 rounded-2xl text-left text-[12px] sm:text-[13px] leading-relaxed break-words shadow-sm bg-gradient-to-br from-sky-500 to-sky-600 text-white rounded-br-md font-light shadow-md shadow-sky-500/20`
          : `group relative overflow-visible message-bubble-anim${aiClass} ${padding} sm:px-3 sm:py-2 rounded-2xl text-left text-[12px] sm:text-[13px] leading-relaxed break-words shadow-sm bg-slate-700/90 text-slate-50 rounded-bl-md border border-slate-600/50 backdrop-blur-sm font-light`;

        
        bubble.style.display = "inline-block";
        bubble.style.width = "auto";
        bubble.style.minWidth = "fit-content";

        
        if (msg.replyTo && msg.replyTo.messageId) {
          const replyPreview = document.createElement("div");
          
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
            video.className = "w-full rounded-lg chat-media";
            video.style.maxHeight = "300px";
            video.style.display = "block";
            video.setAttribute("playsinline", ""); 
            video.setAttribute("webkit-playsinline", ""); 
            
            
            video.src = mediaUrl;
            
            
            video.addEventListener("loadedmetadata", () => {
              
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
            img.className = "w-full rounded-lg cursor-pointer active:opacity-70 transition-opacity chat-media";
            img.style.maxHeight = "300px";
            img.style.display = "block";
            img.style.objectFit = "contain";
            img.crossOrigin = "anonymous"; 
            
            
            img.src = mediaUrl;
            
            
            img.onload = () => {
              
              if (localMessagesDiv && localMessagesDiv.scrollTop >= localMessagesDiv.scrollHeight - localMessagesDiv.clientHeight - 100) {
                localMessagesDiv.scrollTop = localMessagesDiv.scrollHeight;
              }
            };
            
            img.onclick = () => openImageViewer(mediaUrl);
            if (typeof scanDisplayedImage === 'function') scanDisplayedImage(img);
            gifContainer.appendChild(img);
            bubble.appendChild(gifContainer);
          } else {
            const imgContainer = document.createElement("div");
            imgContainer.className = "relative rounded-lg overflow-hidden mb-2";
            imgContainer.style.maxWidth = "400px";
            
            const img = document.createElement("img");
            img.className = "w-full rounded-lg cursor-pointer active:opacity-70 transition-opacity chat-media";
            img.style.maxHeight = "300px";
            img.style.display = "block";
            img.style.objectFit = "contain";
            img.crossOrigin = "anonymous"; 
            
            
            img.src = mediaUrl;
            
            
            img.onload = () => {
              if (localMessagesDiv && localMessagesDiv.scrollTop >= localMessagesDiv.scrollHeight - localMessagesDiv.clientHeight - 100) {
                localMessagesDiv.scrollTop = localMessagesDiv.scrollHeight;
              }
            };
            
            img.onclick = () => openImageViewer(mediaUrl);
            if (typeof scanDisplayedImage === 'function') scanDisplayedImage(img);
            
            imgContainer.appendChild(img);
            bubble.appendChild(imgContainer);
          }
          // Placeholder shown when images are disabled
          const mediaPlaceholder = document.createElement('div');
          mediaPlaceholder.className = 'chat-media-placeholder text-xs text-slate-500 italic py-2 hidden';
          mediaPlaceholder.textContent = '🖼️ Image hidden by moderator';
          bubble.appendChild(mediaPlaceholder);
        }

        
        if (msg.text) {
          const textSpan = document.createElement("span");
          textSpan.className = "message-text-reveal inline-block font-medium";
          
          // Check for triggers: [SEARCH: query], [IMAGE_SEARCH: query], [IMAGE: query]
          let displayText = msg.text;
          let searchQuery = null;
          let isImageSearch = false;
          let isSingleImage = false;
          
          const singleImageMatch = msg.text.match(/\[IMAGE:\s*(.+?)\]/i);
          const imageSearchMatch = msg.text.match(/\[IMAGE_SEARCH:\s*(.+?)\]/i);
          const webSearchMatch = msg.text.match(/\[SEARCH:\s*(.+?)\]/i);
          
          // Always strip these tags from display text for AI messages
          if (isAiMsg) {
            displayText = displayText.replace(/\[IMAGE:\s*[^\]]+\]/gi, '').trim();
            displayText = displayText.replace(/\[IMAGE_SEARCH:\s*[^\]]+\]/gi, '').trim();
            displayText = displayText.replace(/\[SEARCH:\s*[^\]]+\]/gi, '').trim();
          }
          
          if (singleImageMatch && isAiMsg) {
            // Single image - embed inline
            searchQuery = singleImageMatch[1].trim();
            isSingleImage = true;
            
            // Fetch single best image and embed it
            setTimeout(async () => {
              const results = await performWebSearch(searchQuery, true);
              if (results && results.results && results.results.length > 0) {
                const bestImage = results.results[0];
                displaySingleImage(bestImage, bubble);
              }
            }, 300);
          } else if (imageSearchMatch && isAiMsg) {
            searchQuery = imageSearchMatch[1].trim();
            isImageSearch = true;
            
            // Perform image search - show inline in bubble
            const currentBubble = bubble;
            setTimeout(async () => {
              const results = await performWebSearch(searchQuery, true);
              if (results) {
                displaySearchResults(searchQuery, results, currentBubble);
              }
            }, 500);
          } else if (webSearchMatch && isAiMsg) {
            searchQuery = webSearchMatch[1].trim();
            
            // Perform web search - show inline in bubble
            const currentBubble = bubble;
            setTimeout(async () => {
              const results = await performWebSearch(searchQuery, false);
              if (results) {
                displaySearchResults(searchQuery, results, currentBubble);
              }
            }, 500);
          }
          
          textSpan.innerHTML = renderTextWithMentions(displayText, isMine);
          
          
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
          
          try {
            if (currentUsername && !isMine) {
              const lowered = (msg.text || '').toLowerCase();
              const mentionsMe = lowered.includes('@' + currentUsername.toLowerCase());
              const mentionsEveryone = lowered.includes('@everyone');
              if (mentionsMe || mentionsEveryone) {
                bubble.classList.add('mentioned');
                
                if (messageId) {
                  if (!mentionNotified.has(messageId)) {
                    notifyMention(msg, messageId);
                    markMentionNotified(messageId);
                  }
                } else {
                  
                  notifyMention(msg, null);
                }
              }

              
              try {
                if (messageId && msg.userId && currentUserId && msg.userId === currentUserId && msg.text) {
                  
                  const mentionRegex = /@([a-zA-Z0-9_-]{2,64})\b/g;
                  let m;
                  const written = [];
                  while ((m = mentionRegex.exec(msg.text)) !== null) {
                    const uname = m[1];
                    const userEntry = mentionUsers.get(uname.toLowerCase());
                    if (userEntry && userEntry.uid && userEntry.uid !== currentUserId) {
                      const targetUid = userEntry.uid;
                      const refPath = `mentions/${targetUid}/${messageId}`;
                      
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
          
        }

        
        if (isMine && messageId) {
          const deleteBtn = document.createElement("button");
          
          deleteBtn.className = "absolute -top-4 right-4 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500 active:bg-red-500 text-sm cursor-pointer";
          deleteBtn.textContent = "🗑️";
          deleteBtn.title = "Delete message";
          
          deleteBtn.addEventListener("click", () => {
            openDeleteMessageModal(messageId, msg.deleteToken);
          });
          
          deleteBtn.addEventListener("touchend", (e) => {
            e.preventDefault();
            openDeleteMessageModal(messageId, msg.deleteToken);
          });
          
          bubble.appendChild(deleteBtn);

          const editBtn = document.createElement("button");
          
          editBtn.className = "absolute -top-4 right-12 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500 active:bg-sky-500 cursor-pointer";
          editBtn.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\" fill=\"currentColor\" class=\"w-3.5 h-3.5\"><path d=\"M15.502 1.94a1.5 1.5 0 0 1 2.122 2.12l-1.06 1.062-2.122-2.122 1.06-1.06Zm-2.829 2.828-9.192 9.193a2 2 0 0 0-.518.94l-.88 3.521a.5.5 0 0 0 .607.607l3.52-.88a2 2 0 0 0 .942-.518l9.193-9.193-2.672-2.67Z\"/></svg>";
          editBtn.title = "Edit message";

          editBtn.addEventListener("click", () => {
            editMessage(messageId, msg.text || "");
          });

          bubble.appendChild(editBtn);
        }
        
        
        if (!isMine && messageId && msg.userId !== currentUserId) {
          
          if (!reportedMessages.has(messageId)) {
            const reportBtn = document.createElement("button");
            
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

        
        if (messageId && msg.text) {
          const copyBtn = document.createElement("button");
          
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

        
        if (messageId) {
          const replyBtn = document.createElement("button");
          
          replyBtn.className = "absolute -bottom-4 -left-4 z-20 w-7 h-7 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500 active:bg-sky-500 cursor-pointer";
          replyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clip-rule="evenodd"/></svg>';
          replyBtn.title = "Reply";

          
          const isGroupChat = containerEl && containerEl.id === 'groupsPageMessages';

          
          (function() {
            let touchFired = false;
            replyBtn.addEventListener('touchstart', (e) => {
              touchFired = true;
              const grp = replyBtn.closest('.group');
              if (grp) {
                grp.classList.add('touch-active');
                
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
              if (touchFired) return; 
              if (isGroupChat) {
                setGroupReply(messageId, username, msg.text || "(media)");
              } else {
                setReply(messageId, username, msg.text || "(media)");
              }
            });
          })();

          bubble.appendChild(replyBtn);
        }

        
        if (!isMine && messageId && isAdmin) {
          const adminDeleteBtn = document.createElement("button");
          
          adminDeleteBtn.className = "absolute -top-4 -right-4 z-20 w-7 h-7 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-700 active:bg-red-700 text-sm cursor-pointer";
          adminDeleteBtn.textContent = "🗑️";
          adminDeleteBtn.title = "Admin delete";
          adminDeleteBtn.setAttribute("data-admin-delete", "true");

          adminDeleteBtn.addEventListener("click", () => {
            openDeleteMessageModal(messageId, msg.deleteToken);
          });
          
          adminDeleteBtn.addEventListener("touchend", (e) => {
            e.preventDefault();
            openDeleteMessageModal(messageId, msg.deleteToken);
          });

          bubble.appendChild(adminDeleteBtn);
        }
        
        column.appendChild(bubbleContainer);
        
        
        if (timestampMeta) {
          column.appendChild(timestampMeta);
        }

        
        
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
          
          const isAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 50;
          if (isAtBottom) {
            
            setTimeout(() => {
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }, 200);
          }
        }

        
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
        
        
        if (isMessageFromBlockedUser(msg)) {
          seenMessageKeys.add(key); 
          return;
        }
        
        
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

      
      function refreshAdminControls() {
        if (!isAdmin || !messagesDiv) return;
        const rows = messagesDiv.querySelectorAll("[data-message-id]");
        rows.forEach((row) => {
          const bubbleContainer = row.querySelector(".relative.group");
          const bubble = row.querySelector(".message-bubble-anim");
          if (!bubbleContainer || !bubble) return;
          const isMineBubble = bubble.classList.contains("mine");
          if (isMineBubble) return; 

          
          const existingAdminBtn = bubbleContainer.querySelector('[data-admin-delete="true"]');
          if (existingAdminBtn) return;

          const messageId = row.dataset.messageId;
          if (!messageId) return;

          const adminDeleteBtn = document.createElement("button");
          
          adminDeleteBtn.className = "absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500 active:bg-red-500 text-sm";
          adminDeleteBtn.textContent = "🗑️";
          adminDeleteBtn.title = "Admin delete";
          adminDeleteBtn.setAttribute("data-admin-delete", "true");
          adminDeleteBtn.addEventListener("click", () => {
            
            openDeleteMessageModal(messageId, null);
          });
          
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
        
        let slice = t.slice(0, max);
        
        const lastSpace = slice.lastIndexOf(' ');
        if (lastSpace > Math.floor(max * 0.35)) {
          slice = slice.slice(0, lastSpace);
        }
        
        slice = slice.replace(/[\W_]+$/g, '');
        return slice + '…';
      }

      
      function batchRenderMessages(messages, options = {}) {
        const fragment = document.createDocumentFragment();
        let newMessagesCount = 0;

        messages.forEach(({ key, msg }) => {
          if (key && seenMessageKeys.has(key)) return;
          
          
          if (isMessageFromBlockedUser(msg)) {
            if (key) seenMessageKeys.add(key); 
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
          
          requestAnimationFrame(() => {
            // Capture scroll state before DOM mutation for maintainScroll
            const prevScrollHeight = options.maintainScroll ? messagesDiv.scrollHeight : 0;
            const prevScrollTop = options.maintainScroll ? messagesDiv.scrollTop : 0;

            if (options.prepend && messagesDiv.firstChild) {
              messagesDiv.insertBefore(fragment, messagesDiv.firstChild);
            } else {
              messagesDiv.appendChild(fragment);
            }

            if (options.maintainScroll) {
              // Restore scroll position after prepending older messages
              const addedHeight = messagesDiv.scrollHeight - prevScrollHeight;
              messagesDiv.scrollTop = prevScrollTop + addedHeight;
            } else {
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            
            try { updateScrollToBottomBtn(); } catch (_) {}

            
            if (isAdmin) {
              try { refreshAdminControls(); } catch (e) {}
            }
          });
        }
      }

      
      function onMessagesScroll() {
        if (allHistoryLoaded || isLoadingOlder) return;
        
        const threshold = 120; 
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

              
              msgs.forEach(({ key, msg }) => {
                const t = msg.time || 0;
                if (oldestTime === null || t < oldestTime) {
                  oldestTime = t;
                }
              });

              
              batchRenderMessages(msgs, {
                prepend: true,
                maintainScroll: true,
              });

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

              
              msgs.forEach(({ key, msg }) => {
                const t = msg.time || 0;
                if (oldestTime === null || t < oldestTime) {
                  oldestTime = t;
                }
                if (newestTime === null || t > newestTime) {
                  newestTime = t;
                }
              });

              
              setTimeout(() => {
                
                batchRenderMessages(msgs, { maintainScroll: true });

                
                const scrollToBottom = () => {
                  messagesDiv.scrollTop = messagesDiv.scrollHeight;
                  console.log("[scroll] scrolled to bottom, scrollHeight:", messagesDiv.scrollHeight);
                };

                
                const scrollDelays = (typeof FAST_MODE_ENABLED !== 'undefined' && FAST_MODE_ENABLED) ? [20, 50, 100] : [300, 800, 1500];
                scrollDelays.forEach(d => setTimeout(scrollToBottom, d));

                
                // Show loading screen a bit longer for smoother experience
                const extraDelay = (typeof FAST_MODE_ENABLED !== 'undefined' && FAST_MODE_ENABLED) ? 500 : 2500;
                setTimeout(() => { 
                  if (loadingScreen) loadingScreen.classList.add("hidden");
                  // Enable mention notifications after initial load is complete (with longer delay)
                  // This prevents showing old mentions as notifications on reload
                  setTimeout(() => {
                    mentionNotificationsReady = true;
                    console.log('[mentions] notifications now enabled');
                  }, 3000);
                }, extraDelay);

                if (count < PAGE_SIZE) {
                  allHistoryLoaded = true;
                }

                
                attachScrollListener();

                
                ensureScrollButtonListeners();
              }, 20);

              
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

              
              if (messagesRemoveRef && messagesRemoveListener) {
                messagesRemoveRef.off("child_removed", messagesRemoveListener);
              }
              if (messagesRemoveRef && messagesChangedListener) {
                messagesRemoveRef.off("child_changed", messagesChangedListener);
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

              
              messagesChangedListener = (snap) => {
                const changedId = snap.key;
                const changedMsg = snap.val() || {};
                
                const row = messagesDiv.querySelector(`[data-message-id="${changedId}"]`);
                if (row) {
                  
                  const bubble = row.querySelector(".message-bubble-anim .message-text-reveal");
                  if (bubble && changedMsg.text !== undefined) {
                    const isMine = changedMsg.userId === currentUserId;
                    bubble.innerHTML = renderTextWithMentions(changedMsg.text, isMine);
                    // Re-attach mention click handlers
                    bubble.querySelectorAll('.mention-highlight').forEach(mentionEl => {
                      mentionEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const mentionedUser = mentionEl.dataset.mention;
                        if (mentionedUser) viewUserProfile(mentionedUser);
                      });
                    });
                  }
                }
              };
              messagesRemoveRef.on(
                "child_changed",
                messagesChangedListener,
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
          if (messagesRemoveRef && messagesChangedListener) {
            messagesRemoveRef.off("child_changed", messagesChangedListener);
          }
        } catch (err) {
          console.error("[messages] error while stopping listener:", err);
        }
        messagesRef = null;
        messagesListener = null;
        messagesRemoveRef = null;
        messagesRemoveListener = null;
        messagesChangedListener = null;
        seenMessageKeys.clear();

        detachScrollListener();

        oldestTime = null;
        newestTime = null;
        allHistoryLoaded = false;
        isLoadingOlder = false;
      }

      
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
          if (uid === currentUserId) continue; 

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

        
        if (!typingCleanupInterval) {
          typingCleanupInterval = setInterval(() => {
            const now = Date.now();
            db.ref("typingStatus").once("value", (snap) => {
              const data = snap.val() || {};
              
              for (const uid in data) {
                if (!Object.prototype.hasOwnProperty.call(data, uid)) continue;
                const entry = data[uid];
                
                // Only clean up stale entries (>10 seconds old)
                if (entry && entry.ts && (now - entry.ts) > 10000) {
                  // Update each uid individually to respect per-uid write permissions
                  db.ref("typingStatus/" + uid).remove().catch(err => {
                    // Ignore permission denied - only admins can clean up other users' typing status
                    if (!err.message?.includes("PERMISSION_DENIED")) {
                      console.warn("[typing] cleanup error:", err);
                    }
                  });
                }
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

        
        if (typingCleanupInterval) {
          clearInterval(typingCleanupInterval);
          typingCleanupInterval = null;
        }
      }

      
      let lastTypingUpdate = 0;
      const TYPING_THROTTLE = 1000; 
      
      msgInput.addEventListener("input", () => {
        if (!currentUserId) return;

        const now = Date.now();
        
        if (now - lastTypingUpdate > TYPING_THROTTLE) {
          setTyping(true);
          lastTypingUpdate = now;
        }

        
        if (typingTimeoutId) {
          clearTimeout(typingTimeoutId);
        }
        typingTimeoutId = setTimeout(() => {
          setTyping(false);
        }, 1500);
        
        
        handleMentionInput();
      });

      
      msgInput.addEventListener("keydown", (e) => {
        
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
        
        
        if (e.key === "Escape" && pendingReply) {
          e.preventDefault();
          clearReply();
        }
      });

      
      document.addEventListener("click", (e) => {
        if (mentionAutocomplete && !mentionAutocomplete.contains(e.target) && e.target !== msgInput) {
          hideMentionAutocomplete();
        }
      });

      
      auth.onAuthStateChanged(async (user) => {
        console.log(
          "[auth] onAuthStateChanged user =",
          user ? user.uid : null
        );

        if (user) {
          try {
            
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
            
            
            const banSnap = await db.ref("bannedUsers/" + user.uid).once("value");
            if (banSnap.exists()) {
              const banData = banSnap.val();
              const now = Date.now();
              
              console.log("[auth] user has ban entry:", banData);
              
              
              if (banData.until && banData.until <= now) {
                
                clearExpiredBan(user.uid, banData);
                console.log("[auth] temporary ban has expired, allowing login");
              } else {
                
                console.log("[auth] user is banned, showing popup and signing out");

                
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
            
            
            setupPresence(user.uid);
            
            
            if (FINGERPRINT_ENABLED) {
              storeFingerprint(user.uid);
            }
            
            
            loadClearedNotifications();
            
            // Guidelines will be checked in the async IIFE below

            
            currentUsername = await fetchUsername(
              user.uid,
              user.email || null
            );
            
            if (!currentUsername) {
              throw new Error("Could not get username");
            }
            window.currentUsername = currentUsername;
            
            updateChatUserLabel(currentUsername);

            
            try {
              await ensureUsernamePath(user.uid, currentUsername);
              await ensureUserProfilePath(user.uid);
              await ensureFriendRequestsPaths(user.uid);
              await ensureFriendsList(user.uid);
            } catch (e) {
              console.warn("[auth] could not ensure paths:", e);
              
            }

            if (loginForm) loginForm.classList.add("hidden");
            if (registerForm) registerForm.classList.add("hidden");
            if (chatInterface) chatInterface.classList.remove("hidden");
            
            
            if (messagesDiv) {
              messagesDiv.style.display = '';
            }
            
            
            if (loadingScreen && (!messagesDiv || messagesDiv.children.length === 0)) {
              loadingScreen.classList.remove("hidden");
            }
            
            
            if (notifBellBtn) notifBellBtn.classList.remove("hidden");
            
            
            if ("Notification" in window && Notification.permission === "default") {
              Notification.requestPermission();
            }

            console.log("[auth] starting messages listener from auth state change");
            
            // IMPORTANT: Load mentioned notifications BEFORE starting messages listener
            // This prevents showing duplicate mention notifications on every page reload
            await loadMentionedNotifsFromStorage();
            console.log('[mentions] notified set loaded with', mentionNotified.size, 'entries');
            
            startMessagesListener();
            startTypingListener();
            await loadFriendsCache();
            
            
            loadUsersForMentions();

            
            checkAdmin();
            watchBanStatus(user.uid);
            watchMuteStatus(user.uid);
            watchWarnings(user.uid);
            setupWarnModal();
            setupMuteModal();
            setupBanModal();
            setupModPanel();
            
            // Check for unacknowledged demotion/termination notifications on login
            checkPendingRoleRemovalNotification(user.uid);
            
            
            await loadDmInbox();
            
            // Start listening for incoming video calls
            if (window.ChatraVideoCall) {
              window.ChatraVideoCall.listenForIncomingCalls();
            }
            
            // Start listening for global video room count + wire button
            if (window.ChatraGroupCall) {
              window.ChatraGroupCall.listenGlobalRoomCount();
              const globalVidBtn = document.getElementById('globalVideoRoomBtn');
              if (globalVidBtn) {
                globalVidBtn.classList.remove('hidden');
                globalVidBtn.classList.add('flex');
                globalVidBtn.addEventListener('click', () => {
                  if (window.ChatraGroupCall.isInGroupCall()) {
                    showToast('Already in a video call', 'error');
                    return;
                  }
                  window.ChatraGroupCall.joinGlobalRoom();
                });
              }
            }
            
            
            setupPageNavListeners();
            
            
            setTimeout(() => {
              verifyNotificationsLoaded();
            }, 500);

            
            const settings = await loadUserSettings();
            setActiveThemeButton(settings.theme);
            applyTheme(settings.theme, false);
            setActiveSizeButton(settings.messageSize);
            applyMessageSize(settings.messageSize, false);
            if (fastModeToggle) fastModeToggle.checked = settings.fastMode === true;
            applyFastMode(settings.fastMode === true, false);
            initRatingSettings(settings);
            // Apply custom accent color if saved
            if (settings.accentColor) {
              applyAccentColor(settings.accentColor, false);
              const accentInput = document.getElementById('customAccentColor');
              if (accentInput) accentInput.value = settings.accentColor;
              setActiveAccentPreset(settings.accentColor);
            }
            
            
            
            
            
            (async () => {
              
              await checkAndShowGuidelines(user.uid);
              
              
              await new Promise(r => setTimeout(r, 800));
              
              
              await new Promise(resolve => {
                startWalkthrough();
                
                
                const checkDone = setInterval(() => {
                  const overlay = document.getElementById('walkthroughOverlay');
                  if (!overlay || overlay.classList.contains('hidden') || !walkthroughActive) {
                    clearInterval(checkDone);
                    resolve();
                  }
                }, 500);
                
                setTimeout(() => { clearInterval(checkDone); resolve(); }, 60000);
              });
              
              
              await new Promise(r => setTimeout(r, 500));
              checkAndShowModAppPopup();
              
              
              await new Promise(r => setTimeout(r, 1000));
              if (FINGERPRINT_ENABLED) {
                const consentStatus = await checkCanvasConsentFromFirebase(user.uid);
                console.log('[fingerprint] canvas consent check:', consentStatus);
                
                if (consentStatus === true) {
                  
                  canvasConsentCache = true;
                  cachedFingerprint = null;
                  await storeFingerprint(user.uid);
                } else if (consentStatus === 'declined') {
                  
                  console.log('[fingerprint] user previously declined, not showing modal');
                  canvasConsentCache = false;
                } else {
                  
                  console.log('[fingerprint] showing canvas consent modal');
                  canvasConsentCache = false;
                  showCanvasConsentModal();
                }
              }
            })();

            
            try { updateAiEditButtonVisibility(); } catch (e) {  }
          } catch (err) {
            console.error("[auth] error in onAuthStateChanged:", err);
            
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

          // Reset login button state
          if (loginBtn) {
            loginBtn.textContent = 'Login';
            loginBtn.disabled = false;
          }
          // Reset register button state
          if (registerBtn) {
            registerBtn.textContent = 'Register';
            registerBtn.disabled = false;
          }
          
          stopMessagesListener();
          stopTypingListener();
          stopRatingPromptLoop();

          // End any active video call and stop listening
          if (window.ChatraVideoCall) {
            window.ChatraVideoCall.endCall();
            window.ChatraVideoCall.stopListeningForCalls();
          }

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
          try { updateAiEditButtonVisibility(); } catch (e) {  }
          
          
          const dmPage = document.getElementById('dmPage');
          if (dmPage) dmPage.classList.add('hidden');
          currentPage = 'global';

          if (chatInterface) chatInterface.classList.add("hidden");
          if (loginForm) loginForm.classList.remove("hidden");
          
          if (loadingScreen) loadingScreen.classList.add("hidden");
          
          
          if (notifBellBtn) notifBellBtn.classList.add("hidden");
          
          updateChatUserLabel("");
        }
      });

      
      logoutBtn.onclick = async () => {
        console.log("[logout] clicked");
        logoutBtn.disabled = true;
        logoutBtn.textContent = "Logging out...";

        try {
          
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
          
          
          try {
            if (currentUserId) {
              await db.ref("typingStatus/" + currentUserId).remove();
              console.log("[logout] cleared typing status");
            }
          } catch (e) {
            console.warn("[logout] could not clear typing status:", e);
          }

          
          stopMessagesListener();
          stopTypingListener();

          
          await auth.signOut();
          console.log("[logout] signOut complete");

          
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

      
      async function sendMessage() {
        let text = msgInput.value.trim();
        if (text === "" && !pendingMediaUrl) return;

        // Message length limit
        if (text.length > 2000) {
          showToast('Message too long (max 2000 characters)', 'error');
          return;
        }

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
        
        // Don't strip anything from user input - users can type "AI" normally
        // The AI marker is only added by the bot itself, and we verify by UID
        if (text === "" && !pendingMediaUrl) return;
        
        // /remove command - owner only
        const ownerUid = 'u5yKqiZvioWuBGcGK3SWUBpUVrc2';
        if (text.toLowerCase().startsWith('/remove ') && userObj.uid === ownerUid) {
          const countStr = text.slice(8).trim();
          const count = parseInt(countStr, 10);
          if (!isNaN(count) && count > 0 && count <= 100) {
            msgInput.value = "";
            try {
              showToast(`Removing ${count} messages...`, "info");
              const snap = await db.ref("messages").orderByChild("time").limitToLast(count).once("value");
              if (snap.exists()) {
                const deletes = {};
                snap.forEach(child => {
                  deletes["messages/" + child.key] = null;
                });
                await db.ref().update(deletes);
                showToast(`Removed ${Object.keys(deletes).length} messages`, "success");
              } else {
                showToast("No messages to remove", "info");
              }
            } catch (e) {
              console.error("[remove] error:", e);
              showToast("Failed to remove messages", "error");
            }
            return;
          } else {
            showToast("Usage: /remove <1-100>", "error");
            return;
          }
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

        
        const now = Date.now();
        const isMedia = !!pendingMediaUrl;
        const cooldown = isMedia ? MEDIA_COOLDOWN_MS : TEXT_COOLDOWN_MS;
        if (now - lastSentTime < cooldown) {
          showRateLimitWarning();
          return;
        }
        lastSentTime = now;
        
        // Message per minute rate limit
        const oneMinuteAgo = now - 60000;
        messageSendTimes = messageSendTimes.filter(t => t > oneMinuteAgo);
        if (messageSendTimes.length >= MESSAGE_SEND_LIMIT) {
          showToast(`Slow down! Max ${MESSAGE_SEND_LIMIT} messages per minute.`, "error");
          return;
        }
        messageSendTimes.push(now);

        
        if (text) {
          
          for (let pattern of THREAT_PATTERNS) {
            pattern.lastIndex = 0;
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
          
          
          for (let pattern of HATE_PATTERNS) {
            pattern.lastIndex = 0;
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
        }

        const username = currentUsername;

        console.log("[send] sending message", {
          username,
          text,
          hasMedia: !!pendingMediaUrl,
          userId: userObj.uid,
        });

        const uid = userObj.uid;

        
        const originalBtnText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<span class="animate-pulse">✓</span>';
        sendBtn.disabled = true;

        
        const messageData = {
          user: username,
          userId: uid,
          text: text,
          time: firebase.database.ServerValue.TIMESTAMP,
        };

        
        if (pendingReply) {
          messageData.replyTo = {
            messageId: pendingReply.messageId,
            username: pendingReply.username,
            text: pendingReply.text,
          };
        }

        
        if (pendingMediaUrl) {
          messageData.media = pendingMediaUrl;
          messageData.deleteToken = pendingMediaToken;
        }

        
        const newMsgKey = db.ref("messages").push().key;
        const updates = {};
        updates["messages/" + newMsgKey] = messageData;
        updates["userLastMessageTime/" + uid] = firebase.database.ServerValue.TIMESTAMP;
        if (messageData.media) {
          updates["userLastMediaTime/" + uid] = firebase.database.ServerValue.TIMESTAMP;
        }

        
        
        const aiPrefix = '/ai ';
        let aiQuery = null;
        if (text && text.toLowerCase().startsWith(aiPrefix) && text.length > aiPrefix.length) {
          aiQuery = text.slice(aiPrefix.length).trim();
        } else if (text && /@ai\b/i.test(text)) {
          
          aiQuery = text.replace(/@ai\b/i, '').trim();
        } else if (pendingReply && pendingReply.username === 'Chatra AI' && text) {
          
          aiQuery = text.trim();
        }

        db.ref()
          .update(updates)
          .then(async () => {
            
            msgInput.value = "";

            
            if (pendingMediaUrl) {
              pendingMediaUrl = null;
              pendingMediaToken = null;
              mediaPreview.classList.add("hidden");
              mediaPreviewContent.innerHTML = "";
            }

            
            clearReply();
            hideMentionAutocomplete();

            
            setTyping(false);

            
            setTimeout(() => {
              sendBtn.innerHTML = originalBtnText;
              sendBtn.disabled = false;
            }, 300);

            // AI reply — only after message confirmed saved
            if (aiQuery) {
              let botReply = null;
              
              // Show AI typing indicator
              setAiTyping(true);
              
              try {
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
                
                // Clean AI response prefix and extra newlines
                botReply = cleanAiResponse(botReply);
                botReply = botReply.replace(/\n{3,}/g, '\n\n').trim();
                
                
                botReply = botReply.replace(/@everyone/gi, '@​everyone'); 
                
                // Extract image context if AI showed an image
                let imageCtx = null;
                const imgMatch = botReply.match(/\[IMAGE:\s*(.+?)\]/i);
                const imgSearchMatch = botReply.match(/\[IMAGE_SEARCH:\s*(.+?)\]/i);
                if (imgMatch) {
                  imageCtx = `[Showed image of: ${imgMatch[1].trim()}]`;
                } else if (imgSearchMatch) {
                  imageCtx = `[Showed image search results for: ${imgSearchMatch[1].trim()}]`;
                }
                
                addToAiMemory(uid, 'assistant', botReply, currentUsername, imageCtx);

                try {
                  const botMessage = {
                    user: 'Chatra AI',
                    userId: AI_BOT_UID,
                    isAiResponse: true,
                    text: botReply,
                    time: firebase.database.ServerValue.TIMESTAMP,
                    timestamp: Date.now()
                  };
                  
                  await new Promise(resolve => setTimeout(resolve, 600));
                  
                  await db.ref('messages').push(botMessage);
                } catch (e) {
                  console.error('[AI] failed to post bot message', e);
                  setTimeout(async () => {
                    try {
                      await db.ref('messages').push({
                        user: 'Chatra AI',
                        userId: AI_BOT_UID,
                        isAiResponse: true,
                        text: botReply,
                        time: firebase.database.ServerValue.TIMESTAMP
                      });
                    } catch (retryErr) {
                      console.error('[AI] retry failed:', retryErr);
                    }
                  }, 1000);
                }
              } finally {
                setAiTyping(false);
              }
            }
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

            
            setTimeout(() => {
              sendBtn.innerHTML = originalBtnText;
              sendBtn.disabled = false;
              currentWarningText = "";
              updateStatusBar();
            }, 3000);
          });
      }

      
      messageForm.addEventListener("submit", (e) => {
        e.preventDefault();
        sendMessage();
      });

      
      const mediaUploadBtn = document.getElementById("mediaUploadBtn");
      const mediaInput = document.getElementById("imageInput");
      const imageInput = mediaInput;

      
      async function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      
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

      // NSFW image detection using nsfwjs
      let nsfwModel = null;
      let nsfwModelLoading = false;
      let nsfwModelFailed = false;
      
      async function loadNsfwModel() {
        if (nsfwModel) return nsfwModel;
        if (nsfwModelFailed) return null;
        if (nsfwModelLoading) {
          // Wait for model that's already loading
          for (let i = 0; i < 100; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (nsfwModel) return nsfwModel;
            if (nsfwModelFailed) return null;
          }
          return null;
        }
        nsfwModelLoading = true;
        try {
          if (typeof nsfwjs === 'undefined') {
            throw new Error('nsfwjs library not loaded');
          }
          // MobileNetV2 mid — 93% accurate, 4.2MB
          nsfwModel = await nsfwjs.load('MobileNetV2Mid');
          console.log('[nsfw] model loaded successfully');
          return nsfwModel;
        } catch (e) {
          console.error('[nsfw] model load error:', e);
          nsfwModelFailed = true;
          nsfwModelLoading = false;
          return null;
        }
      }

      // Expose for video call modules
      window.chatraNsfwLoadModel = loadNsfwModel;
      
      async function checkImageNSFW(file) {
        // Upload filtering ALWAYS runs regardless of toggle (toggle only controls display blur)
        const model = await loadNsfwModel();
        if (!model) return { blocked: false, scores: {}, predictions: [] };
        
        // Create an image element from the file
        const imgUrl = URL.createObjectURL(file);
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Failed to load image for NSFW check'));
            img.src = imgUrl;
          });
          
          const predictions = await model.classify(img);
          console.log('[nsfw] predictions:', predictions);
          
          // Check for NSFW content - block if Porn or Hentai probability is high
          const pornScore = predictions.find(p => p.className === 'Porn')?.probability || 0;
          const hentaiScore = predictions.find(p => p.className === 'Hentai')?.probability || 0;
          const sexyScore = predictions.find(p => p.className === 'Sexy')?.probability || 0;
          
          // Block if porn/hentai is >15% or combined sexy+porn+hentai >40%
          const combined = pornScore + hentaiScore + sexyScore;
          const blocked = pornScore > 0.15 || hentaiScore > 0.15 || combined > 0.4;
          
          return {
            blocked,
            scores: { porn: pornScore, hentai: hentaiScore, sexy: sexyScore, combined },
            predictions
          };
        } finally {
          URL.revokeObjectURL(imgUrl);
        }
      }

      // Display-time NSFW scan — blur images until verified, hide if flagged
      const scannedImageUrls = new Map(); // url → 'safe' | 'blocked'

      function scanDisplayedImage(imgEl) {
        if (!imgEl || !imgEl.src) return;
        if (localStorage.getItem('chatra_pref_nsfwFilterToggle') === 'false') return;
        var url = imgEl.src;

        // Already scanned
        if (scannedImageUrls.has(url)) {
          if (scannedImageUrls.get(url) === 'blocked') applyNsfwBlock(imgEl);
          return;
        }

        // Apply initial blur while scanning
        imgEl.classList.add('nsfw-blur');

        function doScan() {
          loadNsfwModel().then(function(model) {
            if (!model) {
              // Model unavailable — don't blur (images passed upload check already)
              imgEl.classList.remove('nsfw-blur');
              return null;
            }
            return model.classify(imgEl);
          }).then(function(predictions) {
            if (!predictions) return;
            var pornScore = 0, hentaiScore = 0, sexyScore = 0;
            predictions.forEach(function(p) {
              if (p.className === 'Porn') pornScore = p.probability;
              if (p.className === 'Hentai') hentaiScore = p.probability;
              if (p.className === 'Sexy') sexyScore = p.probability;
            });
            var combined = pornScore + hentaiScore + sexyScore;
            var blocked = pornScore > 0.15 || hentaiScore > 0.15 || combined > 0.4;

            if (blocked) {
              scannedImageUrls.set(url, 'blocked');
              applyNsfwBlock(imgEl);
              console.warn('[nsfw-scan] blocked displayed image:', url, { pornScore: pornScore, hentaiScore: hentaiScore, sexyScore: sexyScore });
            } else {
              scannedImageUrls.set(url, 'safe');
              imgEl.classList.remove('nsfw-blur');
            }
          }).catch(function() {
            // Model/classification failed — unblur (images passed upload check already)
            imgEl.classList.remove('nsfw-blur');
            console.warn('[nsfw-scan] scan error, unblurring:', url);
          });
        }

        if (imgEl.complete && imgEl.naturalWidth > 0) {
          doScan();
        } else {
          imgEl.addEventListener('load', doScan, { once: true });
          imgEl.addEventListener('error', function() { imgEl.classList.remove('nsfw-blur'); }, { once: true });
        }
      }

      function applyNsfwBlock(imgEl) {
        imgEl.classList.add('nsfw-blur');
        var parent = imgEl.parentElement;
        if (!parent) return;
        if (parent.style.position !== 'relative' && parent.style.position !== 'absolute') {
          parent.style.position = 'relative';
        }
        // Don't add overlay twice
        if (parent.querySelector('.nsfw-overlay')) return;
        var overlay = document.createElement('div');
        overlay.className = 'nsfw-overlay';
        overlay.textContent = '⚠️ Content hidden — click to reveal';
        overlay.addEventListener('click', function() {
          imgEl.classList.remove('nsfw-blur');
          overlay.remove();
        });
        parent.appendChild(overlay);
      }

      // Global MutationObserver — scan ALL new images added anywhere in the DOM
      (function initNsfwObserver() {
        var IMG_URL_PATTERN = /\.(jpe?g|png|gif|webp|bmp|svg)/i;
        var ignoredParents = ['vcOverlay', 'vcIncoming']; // skip video call UI
        var observer = new MutationObserver(function(mutations) {
          if (localStorage.getItem('chatra_pref_nsfwFilterToggle') === 'false') return;
          mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
              if (node.nodeType !== 1) return;
              // Check if added node is an img
              if (node.tagName === 'IMG' && node.src && IMG_URL_PATTERN.test(node.src)) {
                // Skip tiny images (icons, avatars under 40px)
                var skip = false;
                for (var i = 0; i < ignoredParents.length; i++) {
                  if (node.closest('#' + ignoredParents[i])) { skip = true; break; }
                }
                if (!skip) scanDisplayedImage(node);
              }
              // Check children of added container nodes
              if (node.querySelectorAll) {
                var imgs = node.querySelectorAll('img');
                imgs.forEach(function(img) {
                  if (img.src && IMG_URL_PATTERN.test(img.src)) {
                    var skip = false;
                    for (var i = 0; i < ignoredParents.length; i++) {
                      if (img.closest('#' + ignoredParents[i])) { skip = true; break; }
                    }
                    if (!skip) scanDisplayedImage(img);
                  }
                });
              }
            });
          });
        });
        observer.observe(document.body, { childList: true, subtree: true });
      })();
      
      async function uploadToImageKit(file) {
        
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

        
        const isVideo = file.type.startsWith("video/");
        if (isVideo) {
          console.log("[upload] video file detected — skipping moderation and uploading directly");
        } else {
          // Run NSFW check on images
          console.log("[upload] image file detected — running NSFW check");
          try {
            const nsfwResult = await checkImageNSFW(file);
            if (nsfwResult.blocked) {
              console.warn("[upload] image blocked by NSFW filter:", nsfwResult);
              throw new Error("Image rejected: This image appears to contain inappropriate content and cannot be uploaded.");
            }
            console.log("[upload] NSFW check passed:", nsfwResult);
          } catch (nsfwErr) {
            if (nsfwErr.message.includes("Image rejected")) {
              throw nsfwErr; // Re-throw block messages
            }
            // If the NSFW check itself errors, block the upload (fail-closed)
            console.error("[upload] NSFW check error (blocking upload):", nsfwErr.message);
            throw new Error("Image upload failed: Unable to verify image safety. Please try again.");
          }
        }

        
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
          const responseText = await res.text();
          try {
            data = JSON.parse(responseText);
          } catch (jsonErr) {
            console.error("[upload] failed to parse response as JSON:", jsonErr);
            console.error("[upload] response text:", responseText);
            throw new Error(`Invalid response from worker: ${res.status} ${responseText.substring(0, 100)}`);
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
        return Date.now() - snap.val() > 5000; 
      }

      
      async function compressImage(file, quality = 0.7) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          const reader = new FileReader();

          reader.onload = () => {
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                reject(new Error("Canvas 2D context unavailable"));
                return;
              }
              // Downscale large images to max 1920px
              let w = img.width, h = img.height;
              const MAX_DIM = 1920;
              if (w > MAX_DIM || h > MAX_DIM) {
                const scale = MAX_DIM / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
              }
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(img, 0, 0, w, h);
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
          video.muted = true;
          video.style.position = 'fixed';
          video.style.left = '-9999px';
          video.style.visibility = 'hidden';
          document.body.appendChild(video); 

          video.onloadedmetadata = () => {
            const duration = isFinite(video.duration) ? video.duration : 0;
            cleanup();
            resolve(duration);
          };

          video.onerror = () => {
            cleanup();
            resolve(0);
          };

          
          setTimeout(() => {
            cleanup();
            resolve(0);
          }, 5000);
        });
      }

      async function sendImageMessage(file) {
        const userObj = auth.currentUser;
        if (!userObj || !currentUsername) return;
        if (!chatImagesEnabled) {
          showToast("Images are currently disabled by a moderator", "error");
          return;
        }
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
        if (!chatImagesEnabled) {
          showToast("Images are currently disabled by a moderator", "error");
          return;
        }
        mediaInput.click();
      });

      
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

        if (!chatImagesEnabled) {
          showToast("Images are currently disabled by a moderator", "error");
          mediaInput.value = "";
          return;
        }

        if (!(await canUpload())) {
          showToast("Slow down! Wait a few seconds", "error");
          mediaInput.value = "";
          return;
        }

        try {
          
          if (file.type && file.type.startsWith('video/')) {
            const dur = await getVideoDuration(file);
            if (dur > 30) {
              showToast('Video too long. Max 30 seconds', 'error');
              mediaInput.value = '';
              return;
            }
          }
          
          mediaUploadBtn.disabled = true;
          mediaUploadBtn.innerHTML = '<svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/></svg>';

          const processedFile = await prepareFileForUpload(file);
          
          
          const isVideoFile = file.type.startsWith("video/");
          if (!isVideoFile) {
            mediaUploadBtn.innerHTML = '<div class="flex items-center gap-2"><svg class="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1" stroke-linecap="round"/></svg><span class="text-sm font-medium">Checking for harmful content...</span></div>';
          }
          
          const uploadResult = await uploadToImageKit(processedFile);
          storeUploadTime();

          pendingMediaUrl = uploadResult.url;
          pendingMediaFileId = uploadResult.fileId;
          pendingMediaToken = null;

          
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

          
          mediaUploadBtn.disabled = false;
          mediaUploadBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
          
          
          mediaInput.value = "";
        } catch (err) {
          console.error("[media] error uploading:", err);
          showToast("Error uploading media", "error");
          
          
          mediaUploadBtn.disabled = false;
          mediaUploadBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
          mediaInput.value = "";
        }
      });

      
      cancelMediaBtn.addEventListener("click", async () => {
        
        if (pendingMediaFileId) {
          try {
            console.log("[media] deleting uploaded file from ImageKit");
            await deleteFromImageKit(pendingMediaFileId);
          } catch (err) {
            console.error("[media] error deleting from ImageKit:", err);
          }
        }
        
        
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

      // ===== ANIMATED PROFILE FRAMES =====
      const frameSelector = document.getElementById("frameSelector");
      const frameCustomizer = document.getElementById("frameCustomizer");
      const framePrimaryColor = document.getElementById("framePrimaryColor");
      const frameSecondaryColor = document.getElementById("frameSecondaryColor");
      const frameSpeed = document.getElementById("frameSpeed");
      const profileFrameRing = document.getElementById("profileFrameRing");
      
      let selectedFrame = 'none';
      let frameSettings = {
        type: 'none',
        primaryColor: '#38bdf8',
        secondaryColor: '#a855f7',
        speed: 1
      };

      // Frame selector click handler
      if (frameSelector) {
        frameSelector.addEventListener('click', (e) => {
          const option = e.target.closest('.frame-option');
          if (!option) return;
          
          // Update selection
          frameSelector.querySelectorAll('.frame-option').forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
          
          selectedFrame = option.dataset.frame;
          frameSettings.type = selectedFrame;
          
          // Show/hide customizer for customizable frames
          if (selectedFrame !== 'none' && selectedFrame !== 'rainbow' && selectedFrame !== 'fire') {
            frameCustomizer?.classList.remove('hidden');
          } else {
            frameCustomizer?.classList.add('hidden');
          }
          
          // Update preview
          updateFramePreview();
        });
      }

      // Color and speed change handlers
      if (framePrimaryColor) {
        framePrimaryColor.addEventListener('input', () => {
          frameSettings.primaryColor = framePrimaryColor.value;
          updateFramePreview();
        });
      }
      if (frameSecondaryColor) {
        frameSecondaryColor.addEventListener('input', () => {
          frameSettings.secondaryColor = frameSecondaryColor.value;
          updateFramePreview();
        });
      }
      if (frameSpeed) {
        frameSpeed.addEventListener('input', () => {
          frameSettings.speed = parseFloat(frameSpeed.value);
          updateFramePreview();
        });
      }

      function updateFramePreview() {
        const target = profileFrameRing || profilePicPreview;
        if (!target) return;
        
        // Remove all frame classes
        target.classList.remove(
          'profile-frame-glow', 'profile-frame-spin', 'profile-frame-pulse',
          'profile-frame-rainbow', 'profile-frame-fire', 'profile-frame-electric', 'profile-frame-gradient'
        );
        
        // Apply CSS variables
        target.style.setProperty('--frame-primary', frameSettings.primaryColor);
        target.style.setProperty('--frame-secondary', frameSettings.secondaryColor);
        target.style.setProperty('--frame-speed', frameSettings.speed);
        
        // Add selected frame class
        if (frameSettings.type !== 'none') {
          target.classList.add(`profile-frame-${frameSettings.type}`);
        }
      }

      function loadFrameSettings(data) {
        if (!data) return;
        
        frameSettings = {
          type: data.frameType || 'none',
          primaryColor: data.framePrimaryColor || '#38bdf8',
          secondaryColor: data.frameSecondaryColor || '#a855f7',
          speed: data.frameSpeed || 1
        };
        selectedFrame = frameSettings.type;
        
        // Update UI
        if (frameSelector) {
          frameSelector.querySelectorAll('.frame-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.frame === selectedFrame);
          });
        }
        if (framePrimaryColor) framePrimaryColor.value = frameSettings.primaryColor;
        if (frameSecondaryColor) frameSecondaryColor.value = frameSettings.secondaryColor;
        if (frameSpeed) frameSpeed.value = frameSettings.speed;
        
        // Show customizer if needed
        if (selectedFrame !== 'none' && selectedFrame !== 'rainbow' && selectedFrame !== 'fire') {
          frameCustomizer?.classList.remove('hidden');
        } else {
          frameCustomizer?.classList.add('hidden');
        }
        
        updateFramePreview();
      }

      // Apply frame to any avatar element
      function applyFrameToAvatar(element, frameData) {
        if (!element || !frameData) return;
        
        element.classList.remove(
          'profile-frame-glow', 'profile-frame-spin', 'profile-frame-pulse',
          'profile-frame-rainbow', 'profile-frame-fire', 'profile-frame-electric', 'profile-frame-gradient'
        );
        
        if (frameData.frameType && frameData.frameType !== 'none') {
          element.style.setProperty('--frame-primary', frameData.framePrimaryColor || '#38bdf8');
          element.style.setProperty('--frame-secondary', frameData.frameSecondaryColor || '#a855f7');
          element.style.setProperty('--frame-speed', frameData.frameSpeed || 1);
          element.classList.add(`profile-frame-${frameData.frameType}`);
        }
      }
      // ===== END ANIMATED PROFILE FRAMES =====

      
      let activeProfileListeners = [];
      function clearProfileListeners() {
        activeProfileListeners.forEach(({ ref, cb }) => {
          try { ref.off("value", cb); } catch (_) {}
        });
        activeProfileListeners = [];
      }

      let currentUserData = {};

      
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

      
      const notifBellBtn = document.getElementById("notifBellBtn");
      const notifBellBadge = document.getElementById("notifBellBadge");
      const notifModal = document.getElementById("notifModal");
      const notifCloseBtn = document.getElementById("notifCloseBtn");
      const notifClearBtn = document.getElementById("notifClearBtn");
      const notifList = document.getElementById("notifList");
      
      
      const shareBtn = document.getElementById('shareBtn');
      const shareModal = document.getElementById('shareModal');
      const shareCloseBtn = document.getElementById('shareCloseBtn');
      const shareLinkInput = document.getElementById('shareLinkInput');
      const shareCopyBtn = document.getElementById('shareCopyBtn');
      const shareDownloadBtn = document.getElementById('shareDownloadBtn');
      const shareQRCode = document.getElementById('shareQRCode');

      
      const blockedUsersModal = document.getElementById("blockedUsersModal");
      const blockedUsersCloseBtn = document.getElementById("blockedUsersCloseBtn");
      const blockedUsersList = document.getElementById("blockedUsersList");
      const noBlockedUsersMsg = document.getElementById("noBlockedUsersMsg");
      const blockUserBtn = document.getElementById("blockUserBtn");

      
      const searchUsersInput = document.getElementById("searchUsersInput");
      const searchResults = document.getElementById("searchResults");

      
      const privacySettingsModal = document.getElementById("privacySettingsModal");
      const privacySettingsCloseBtn = document.getElementById("privacySettingsCloseBtn");
      const allowFriendRequestsToggle = document.getElementById("allowFriendRequestsToggle");
      const dmPrivacySelect = document.getElementById("dmPrivacySelect");
      const savePrivacyBtn = document.getElementById("savePrivacyBtn");

      
      const settingsRecoveryEmail = document.getElementById('settingsRecoveryEmail');
      const saveRecoveryBtn = document.getElementById('saveRecoveryBtn');
      const clearRecoveryBtn = document.getElementById('clearRecoveryBtn');
      const settingsRecoveryMsg = document.getElementById('settingsRecoveryMsg');
      const deleteMessagesToggle = document.getElementById('deleteMessagesToggle');
      const deleteAccountBtn = document.getElementById('deleteAccountBtn');
      const deleteAccountCancel = document.getElementById('deleteAccountCancel');
      const deleteAccountMsg = document.getElementById('deleteAccountMsg');

      
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
          
          patchNotesModal.classList.remove('modal-closed');
          patchNotesModal.classList.add('modal-open');
          
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
        
        if (helpStatus) {
          helpStatus.classList.add('hidden');
          helpStatus.textContent = '';
        }
        closeSidePanel();
      }

      
      function openHelpModalFor(type) {
        if (type) switchHelpTab(type);
        openHelpModal();
        
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
        
        
        helpTitleLabel.textContent = labels.titleLabel;
        helpTitle.placeholder = labels.titlePlaceholder;
        helpDescLabel.textContent = labels.descLabel;
        helpDesc.placeholder = labels.descPlaceholder;
        helpSubmitBtn.textContent = labels.submitBtn;
        
        
        if (type === 'appeal') {
          appealFields.classList.remove('hidden');
          if (helpEmailWrapper) helpEmailWrapper.classList.remove('hidden');
        } else {
          appealFields.classList.add('hidden');
          if (helpEmailWrapper) helpEmailWrapper.classList.add('hidden');
        }
        
        
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

      
      helpTabs.forEach(tab => {
        tab.addEventListener('click', () => switchHelpTab(tab.dataset.tab));
        tab.addEventListener('touchend', (e) => { e.preventDefault(); switchHelpTab(tab.dataset.tab); });
      });

      
      if (helpForm) {
        helpForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const type = helpType.value;
          const title = helpTitle.value.trim();
          const desc = helpDesc.value.trim();
          const username = helpUsername ? helpUsername.value.trim() : '';
          const email = helpEmail ? helpEmail.value.trim() : '';
          
          
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
            
            
            if (type === 'appeal') {
              submission.appealReason = appealReason ? appealReason.value.trim() : null;
            }
            
            
            
            const newKey = db.ref().child('helpSubmissions').push().key;
            const updates = {};

            
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

            
            try {
              await db.ref('/helpSubmissions/' + newKey).set(submission);
              console.debug('[help] submission write succeeded, key=', newKey);
            } catch (err) {
              console.error('[help] submission write failed:', err);
              throw err;
            }

            
            
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

            
            const typeNames = { suggestion: 'suggestion', bug: 'bug report', idea: 'idea', appeal: 'ban appeal' };
            const friendlyType = typeNames[type] || type;
            helpStatus.textContent = "✓ Thank you! Your " + friendlyType + " has been submitted.";
            helpStatus.className = "text-center text-sm text-green-400";
            helpStatus.classList.remove('hidden');

            
            helpTitle.value = "";
            helpDesc.value = "";
            if (helpUsername) helpUsername.value = "";
            if (helpEmail) helpEmail.value = "";
            if (appealReason) appealReason.value = "";

            
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

      
      if (helpSubmitBtn) {
        helpSubmitBtn.addEventListener('touchend', (e) => { e.preventDefault(); try { helpSubmitBtn.click(); } catch (err) {  try { helpForm.dispatchEvent(new Event('submit', {cancelable: true})); } catch(e){} } });
      }

      
      const registerAppealBtn = document.getElementById('registerAppealBtn');
      if (registerAppealBtn) {
        registerAppealBtn.addEventListener('click', () => openHelpModalFor('appeal'));
        registerAppealBtn.addEventListener('touchend', (e) => { e.preventDefault(); openHelpModalFor('appeal'); });
      }

      
      const modAppPopup = document.getElementById('modAppPopup');
      const modAppApplyBtn = document.getElementById('modAppApplyBtn');
      const modAppDismissBtn = document.getElementById('modAppDismissBtn');
      const modAppDismissBtn2 = document.getElementById('modAppDismissBtn2');
      const modAppProgressBar = document.getElementById('modAppProgressBar');
      const modAppOnlineCount = document.getElementById('modAppOnlineCount');
      const modAppLockedContent = document.getElementById('modAppLockedContent');
      const modAppUnlockedContent = document.getElementById('modAppUnlockedContent');
      const modAppPopupTitle = document.getElementById('modAppPopupTitle');
      const modAppPopupDesc = document.getElementById('modAppPopupDesc');
      
      const STAFF_APP_UNLOCK_THRESHOLD = 20;
      
      function getOnlineUserCount() {
        return Object.keys(onlineUsersCache).length;
      }
      
      function isStaffAppsUnlocked() {
        return getOnlineUserCount() >= STAFF_APP_UNLOCK_THRESHOLD;
      }
      
      function updateModAppPopupState() {
        const onlineCount = getOnlineUserCount();
        const unlocked = onlineCount >= STAFF_APP_UNLOCK_THRESHOLD;
        const progress = Math.min((onlineCount / STAFF_APP_UNLOCK_THRESHOLD) * 100, 100);
        
        if (modAppProgressBar) {
          modAppProgressBar.style.width = progress + '%';
        }
        if (modAppOnlineCount) {
          modAppOnlineCount.textContent = onlineCount + ' online';
        }
        
        if (unlocked) {
          if (modAppPopupTitle) {
            modAppPopupTitle.textContent = 'Staff Applications Open!';
          }
          if (modAppPopupDesc) {
            modAppPopupDesc.innerHTML = 'Help keep Chatra welcoming — apply to join the staff team.';
          }
          if (modAppLockedContent) modAppLockedContent.classList.add('hidden');
          if (modAppUnlockedContent) modAppUnlockedContent.classList.remove('hidden');
        } else {
          if (modAppPopupTitle) {
            modAppPopupTitle.textContent = 'Staff Applications Coming Soon!';
          }
          if (modAppPopupDesc) {
            modAppPopupDesc.innerHTML = 'Staff applications will unlock when <span class="font-semibold text-sky-300">20 people</span> are online.';
          }
          if (modAppLockedContent) modAppLockedContent.classList.remove('hidden');
          if (modAppUnlockedContent) modAppUnlockedContent.classList.add('hidden');
        }
      }

      function openModAppPopup() {
        if (modAppPopup) {
          updateModAppPopupState();
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
            
            setTimeout(() => {
              openModAppPopup();
            }, 800);
          }
        } catch (err) {
          console.warn("[modApp] failed to check popup status:", err);
        }
      }

      
      if (modAppDismissBtn) {
        modAppDismissBtn.addEventListener('click', dismissModAppPopup);
        modAppDismissBtn.addEventListener('touchend', (e) => { e.preventDefault(); dismissModAppPopup(); });
      }
      if (modAppDismissBtn2) {
        modAppDismissBtn2.addEventListener('click', dismissModAppPopup);
        modAppDismissBtn2.addEventListener('touchend', (e) => { e.preventDefault(); dismissModAppPopup(); });
      }
      
      
      

      
      const sidePanelModApp = document.getElementById('sidePanelModApp');
      const headerStaffApp = document.getElementById('headerStaffApp');

      // Intercept clicks on staff app links to check if unlocked
      function handleStaffAppClick(e) {
        if (!isStaffAppsUnlocked()) {
          e.preventDefault();
          e.stopPropagation();
          openModAppPopup();
          return false;
        }
        // If unlocked, allow the link to work normally
        return true;
      }
      
      if (sidePanelModApp) {
        sidePanelModApp.addEventListener('click', handleStaffAppClick);
        sidePanelModApp.addEventListener('touchend', function(e) {
          if (!isStaffAppsUnlocked()) {
            e.preventDefault();
            e.stopPropagation();
            openModAppPopup();
          }
        });
      }
      
      if (headerStaffApp) {
        headerStaffApp.addEventListener('click', handleStaffAppClick);
        headerStaffApp.addEventListener('touchend', function(e) {
          if (!isStaffAppsUnlocked()) {
            e.preventDefault();
            e.stopPropagation();
            openModAppPopup();
          }
        });
      }
      
      // Admin function to reset everyone's modAppPopupDismissed state
      // Call from console: resetAllModAppPopupStates()
      window.resetAllModAppPopupStates = async function() {
        if (currentUserId !== OWNER_UID) {
          console.error('[admin] Only owner can reset popup states');
          return;
        }
        
        try {
          const snap = await db.ref('userSettings').once('value');
          const settings = snap.val() || {};
          const updates = {};
          
          for (const uid of Object.keys(settings)) {
            if (settings[uid] && settings[uid].modAppPopupDismissed) {
              updates[uid + '/modAppPopupDismissed'] = null;
            }
          }
          
          if (Object.keys(updates).length > 0) {
            await db.ref('userSettings').update(updates);
            console.log('[admin] Reset modAppPopupDismissed for', Object.keys(updates).length, 'users');
            showToast('Reset staff app popup for all users', 'success');
          } else {
            console.log('[admin] No users had dismissed the popup');
          }
        } catch (e) {
          console.error('[admin] Failed to reset popup states:', e);
        }
      };

      
      (function(){
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
          
          const selectors = 'button, [role="button"], a[href], .nav-tab, .help-tab, .reply-button, .side-panel-item, .clickable, [data-tab], label[for], select, [onclick]';
          
          function enhanceElement(el) {
            if (!el.dataset.touchEnhanced) {
              el.addEventListener('touchend', function(e){
                
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
          
          
          document.querySelectorAll(selectors).forEach(enhanceElement);
          
          
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                  if (node.matches && node.matches(selectors)) {
                    enhanceElement(node);
                  }
                  
                  if (node.querySelectorAll) {
                    node.querySelectorAll(selectors).forEach(enhanceElement);
                  }
                }
              });
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });

          
          let __lastTouch = 0;
          document.addEventListener('touchend', function(e){
            const now = Date.now();
            if (now - __lastTouch <= 300 && e.cancelable) {
              e.preventDefault();
            }
            __lastTouch = now;
          }, { passive: false });
          
          
          document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('touchend', function(e) {
              if (e.target === modal && e.cancelable) {
                e.preventDefault();
                modal.classList.remove('modal-open');
                modal.classList.add('modal-closed');
              }
            }, { passive: false });
          });

          
          document.addEventListener('touchstart', function(e) {
            const group = e.target.closest('.group');
            if (group) {
              
              document.querySelectorAll('.group.touch-active').forEach(g => {
                if (g !== group) g.classList.remove('touch-active');
              });
              
              group.classList.add('touch-active');
            } else {
              
              document.querySelectorAll('.group.touch-active').forEach(g => g.classList.remove('touch-active'));
            }
          }, { passive: true });
        }
      })();

      
      settingsCloseBtn.addEventListener("click", () => {
        settingsModal.classList.remove("modal-open");
        settingsModal.classList.add("modal-closed");
      });
      const settingsCloseBtnMobile = document.getElementById('settingsCloseBtnMobile');
      if (settingsCloseBtnMobile) {
        settingsCloseBtnMobile.addEventListener('click', () => {
          settingsModal.classList.remove("modal-open");
          settingsModal.classList.add("modal-closed");
        });
      }

      /* ── Settings tab switching ── */
      (function initSettingsTabs() {
        const panels = settingsModal.querySelectorAll('.settings-panel');
        const desktopBtns = settingsModal.querySelectorAll('.settings-tab-btn');
        const mobileBtns = settingsModal.querySelectorAll('.settings-tab-btn-mobile');

        function switchTab(tabName) {
          panels.forEach(p => {
            p.classList.toggle('hidden', p.id !== 'settingsPanel-' + tabName);
          });
          desktopBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.settingsTab === tabName);
            if (b.dataset.settingsTab === tabName) {
              b.classList.add('bg-slate-800', 'text-slate-100');
            } else {
              b.classList.remove('bg-slate-800', 'text-slate-100');
            }
          });
          mobileBtns.forEach(b => {
            if (b.dataset.settingsTab === tabName) {
              b.classList.remove('bg-slate-700', 'text-slate-300');
              b.classList.add('bg-sky-600', 'text-white');
            } else {
              b.classList.remove('bg-sky-600', 'text-white');
              b.classList.add('bg-slate-700', 'text-slate-300');
            }
          });
          // Scroll content to top
          const content = document.getElementById('settingsContent');
          if (content) content.scrollTop = 0;
        }

        desktopBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.settingsTab)));
        mobileBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.settingsTab)));
      })();

      /* ── Settings responsive: show mobile nav on small screens ── */
      (function settingsResponsive() {
        const sidebar = document.getElementById('settingsSidebar');
        const mobileNav = document.getElementById('settingsMobileNav');
        const content = document.getElementById('settingsContent');
        if (!sidebar || !mobileNav) return;
        const mql = window.matchMedia('(max-width: 640px)');
        function apply(e) {
          if (e.matches) {
            sidebar.classList.add('hidden');
            mobileNav.classList.remove('hidden');
            mobileNav.classList.add('flex', 'flex-col');
            if (content) content.style.paddingTop = '5.5rem';
          } else {
            sidebar.classList.remove('hidden');
            mobileNav.classList.add('hidden');
            mobileNav.classList.remove('flex', 'flex-col');
            if (content) content.style.paddingTop = '';
          }
        }
        apply(mql);
        mql.addEventListener('change', apply);
      })();

      /* ── Populate device selectors in Call settings ── */
      (function initDeviceSelectors() {
        const camSel = document.getElementById('settingsCamera');
        const micSel = document.getElementById('settingsMic');
        const spkSel = document.getElementById('settingsSpeaker');
        if (!camSel && !micSel && !spkSel) return;

        async function populateDevices() {
          try {
            // Request permission so labels are available
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => null);
            const devices = await navigator.mediaDevices.enumerateDevices();
            if (stream) stream.getTracks().forEach(t => t.stop());

            if (camSel) {
              camSel.innerHTML = '<option value="">Default camera</option>';
              devices.filter(d => d.kind === 'videoinput').forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.textContent = d.label || 'Camera ' + (camSel.options.length);
                camSel.appendChild(opt);
              });
              camSel.value = localStorage.getItem('chatra_pref_camera') || '';
            }
            if (micSel) {
              micSel.innerHTML = '<option value="">Default microphone</option>';
              devices.filter(d => d.kind === 'audioinput').forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.textContent = d.label || 'Mic ' + (micSel.options.length);
                micSel.appendChild(opt);
              });
              micSel.value = localStorage.getItem('chatra_pref_mic') || '';
            }
            if (spkSel) {
              spkSel.innerHTML = '<option value="">Default speaker</option>';
              devices.filter(d => d.kind === 'audiooutput').forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.textContent = d.label || 'Speaker ' + (spkSel.options.length);
                spkSel.appendChild(opt);
              });
              spkSel.value = localStorage.getItem('chatra_pref_speaker') || '';
            }
          } catch (err) {
            console.warn('[settings] device enumeration failed', err);
          }
        }

        // Save device choices
        if (camSel) camSel.addEventListener('change', () => localStorage.setItem('chatra_pref_camera', camSel.value));
        if (micSel) micSel.addEventListener('change', () => localStorage.setItem('chatra_pref_mic', micSel.value));
        if (spkSel) spkSel.addEventListener('change', () => localStorage.setItem('chatra_pref_speaker', spkSel.value));

        // Populate on first settings open
        const observer = new MutationObserver(() => {
          if (settingsModal.classList.contains('modal-open')) {
            populateDevices();
            observer.disconnect();
          }
        });
        observer.observe(settingsModal, { attributes: true, attributeFilter: ['class'] });
      })();

      /* ── Save/load new call behaviour settings ── */
      (function initCallBehaviourSettings() {
        const ids = ['callStartCameraToggle', 'callStartMicToggle', 'callEchoCancelToggle', 'callNoiseSuppressionToggle', 'callAutoGainToggle', 'callDefaultCamSide', 'nsfwFilterToggle'];
        ids.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const key = 'chatra_pref_' + id;
          const saved = localStorage.getItem(key);
          if (el.type === 'checkbox') {
            if (saved !== null) el.checked = saved === 'true';
            el.addEventListener('change', () => localStorage.setItem(key, el.checked));
          } else {
            if (saved) el.value = saved;
            el.addEventListener('change', () => localStorage.setItem(key, el.value));
          }
        });
      })();

      async function loadSettingsModal() {
        
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

      
      if (sidePanelSettings) {
        sidePanelSettings.addEventListener('click', () => {
          loadSettingsModal();
          try { settingsModal.classList.remove('modal-closed'); settingsModal.classList.add('modal-open'); } catch(e){}
          closeSidePanel();
        });
      }

      
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

      
      async function performAccountDeletion(deleteMessages) {
        const uid = auth.currentUser?.uid;
        if (!uid) { showToast('Not signed in', 'error'); return; }
        try {
          deleteAccountMsg.textContent = 'Deleting...';
          deleteAccountMsg.className = 'text-xs text-yellow-400';

          
          if (deleteMessages) {
            const msgsSnap = await db.ref('messages').orderByChild('userId').equalTo(uid).once('value');
            const updates = {};
            msgsSnap.forEach(ch => { updates['/messages/' + ch.key] = null; });
            if (Object.keys(updates).length) await db.ref().update(updates);
          }

          
          await db.ref('userProfiles/' + uid).remove();
          await db.ref('users/' + uid).remove();
          await db.ref('friends/' + uid).remove();
          await db.ref('friendRequests/' + uid).remove();

          
          try {
            if (firebase.auth().currentUser) {
              await firebase.auth().currentUser.delete();
            }
          } catch (authDelErr) {
            console.warn('[account] auth delete failed (reauth may be required):', authDelErr);
            
            deleteAccountMsg.textContent = 'Account data removed. To fully delete your authentication account, please sign in and reauthenticate, then delete account from Settings.';
            deleteAccountMsg.className = 'text-xs text-amber-400';
            return;
          }

          
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

      
      const canvasConsentEnableBtn = document.getElementById("canvasConsentEnableBtn");
      const canvasConsentSkipBtn = document.getElementById("canvasConsentSkipBtn");
      const canvasConsentSettingsLink = document.getElementById("canvasConsentSettingsLink");
      const canvasConsentPrivacyLink = document.getElementById("canvasConsentPrivacyLink");

      if (canvasConsentEnableBtn) {
        canvasConsentEnableBtn.addEventListener("click", async () => {
          await grantCanvasConsent(currentUserId);
          hideCanvasConsentModal();
          
          if (currentUserId && FINGERPRINT_ENABLED) {
            await storeFingerprint(currentUserId);
          }
        });
      }

      
      if (canvasConsentSkipBtn) {
        canvasConsentSkipBtn.addEventListener("click", () => {
          hideCanvasConsentModal();
          
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
      
      
      if (canvasConsentSettingsLink) {
        canvasConsentSettingsLink.addEventListener("click", (e) => {
          e.preventDefault();
          hideCanvasConsentModal();
          
          const privacyModal = document.getElementById("privacySettingsModal");
          if (privacyModal) {
            privacyModal.classList.remove("modal-closed");
            privacyModal.classList.add("modal-open");
          }
        });
      }
      
      
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

      
      if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
          
          const link = 'https://tinyurl.com/chatraa';
          try { if (shareLinkInput) shareLinkInput.value = link; } catch (e) {}
          try {
            
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

      
      if (shareDownloadBtn) {
        shareDownloadBtn.addEventListener('click', async (e) => {
          const qr = shareDownloadBtn.dataset.qr || (shareQRCode ? shareQRCode.src : null) || 'https://image2url.com/images/1765859919064-72a6905d-3b5b-4ed0-82e3-fd76963651d4.png';

          
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
            
            const resp = await fetch(qr, { mode: 'cors' });
            if (!resp.ok) throw new Error('Network response was not ok: ' + resp.status);
            const blob = await resp.blob();

            
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = 'chatra-qr.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
            try { sendAnalyticsEvent('share_download', { method: 'download', qr_url: qr }); } catch (e) {}
            return;
          } catch (err) {
            console.warn('[share] fetch->blob download failed, falling back to opening image in new tab', err);
          }

          
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

          
          try {
            window.open(qr, '_blank', 'noopener');
            try { sendAnalyticsEvent('share_download', { method: 'open_tab', qr_url: qr }); } catch (e) {}
          } catch (err) {
            console.error('[share] final fallback open failed', err);
          }
        });
        shareDownloadBtn.addEventListener('touchend', (e) => { e.preventDefault(); shareDownloadBtn.click(); });
      }

      
      async function loadPrivacySettings() {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          console.log("[privacy] no uid");
          return;
        }
        
        // Reset save button state when loading settings
        savePrivacyBtn.disabled = false;
        savePrivacyBtn.textContent = "Save Settings";
        savePrivacyBtn.style.background = "";

        try {
          console.log("[privacy] loading settings for uid:", uid);
          const snap = await db.ref("userPrivacy/" + uid).once("value");
          const privacy = snap.val() || {};
          
          console.log("[privacy] loaded:", privacy);
          allowFriendRequestsToggle.checked = privacy.allowFriendRequests !== false;
          
          if (dmPrivacySelect) {
            dmPrivacySelect.value = privacy.dmPrivacy || 'anyone';
          }
          
          const groupVisibilitySelect = document.getElementById("groupVisibilitySelect");
          const allowGroupInvitesToggle = document.getElementById("allowGroupInvitesToggle");
          if (groupVisibilitySelect) {
            groupVisibilitySelect.value = privacy.groupVisibility || 'anyone';
          }
          if (allowGroupInvitesToggle) {
            allowGroupInvitesToggle.checked = privacy.allowGroupInvites !== false;
          }
          
          const callPrivacySelect = document.getElementById("callPrivacySelect");
          if (callPrivacySelect) {
            callPrivacySelect.value = privacy.callPrivacy || 'anyone';
          }
        } catch (err) {
          console.error("[privacy] error loading settings:", err);
        }
      }

      
      savePrivacyBtn.addEventListener("click", async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          showToast("Not logged in", "error");
          return;
        }

        if (savePrivacyBtn.disabled) return;
        savePrivacyBtn.disabled = true;
        savePrivacyBtn.textContent = "Saving...";

        try {
          console.log("[privacy] saving settings for uid:", uid);
          const groupVisibilitySelect = document.getElementById("groupVisibilitySelect");
          const allowGroupInvitesToggle = document.getElementById("allowGroupInvitesToggle");
          const callPrivacySelect = document.getElementById("callPrivacySelect");
          
          await db.ref("userPrivacy/" + uid).set({
            allowFriendRequests: allowFriendRequestsToggle.checked,
            dmPrivacy: dmPrivacySelect ? dmPrivacySelect.value : 'anyone',
            groupVisibility: groupVisibilitySelect ? groupVisibilitySelect.value : 'anyone',
            allowGroupInvites: allowGroupInvitesToggle ? allowGroupInvitesToggle.checked : true,
            callPrivacy: callPrivacySelect ? callPrivacySelect.value : 'anyone',
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

      
      function openDmModal() {
        if (!currentUserId) {
          dmError.textContent = "Please log in.";
          return;
        }
        dmError.textContent = "";
        dmModal.classList.remove("modal-closed");
        dmModal.classList.add("modal-open");
        dmActiveUser.textContent = activeDMTarget?.username || "Select a conversation";
        
        try { sendAnalyticsEvent('dm_open', { thread_id: activeDMThread || null, other_uid: activeDMTarget?.uid || null, mode: 'modal' }); } catch (e) {}
        
        
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

      
      const fastModeToggle = document.getElementById("fastModeToggle");
      const fastModeLabel = document.getElementById("fastModeLabel");

      function applyFastMode(enabled, persist = true) {
        FAST_MODE_ENABLED = !!enabled;
        
        // FAST MODE: Even smaller page size and disable animations
        // FAST MODE: Even smaller page size for faster loading
        PAGE_SIZE = enabled ? 20 : 75;
        document.body.classList.toggle("perf-lite", enabled);
        document.body.classList.toggle("reduce-motion", enabled);
        if (persist) saveUserSetting("fastMode", enabled);
        if (fastModeLabel) {
          fastModeLabel.textContent = enabled ? "Fast Mode (ON)" : "Fast Mode";
        }
        
        try {
          if (enabled) {
            if (typingCleanupInterval) { clearInterval(typingCleanupInterval); typingCleanupInterval = null; }
            
            stopRatingPromptLoop();
          } else {
            
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

      // ── Cloak / Stealth System ───────────────────────────
      (function initCloakSystem() {
        const CLOAK_KEY = 'chatra_cloak';
        const CLOAK_PRESETS = {
          drive: { title: 'My Drive - Google Drive', icon: 'https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png' },
          docs: { title: 'Untitled document - Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
          classroom: { title: 'Google Classroom', icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
          canvas: { title: 'Dashboard', icon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' },
          khan: { title: 'Khan Academy', icon: 'https://cdn.kastatic.org/images/favicon.ico?logo' },
          gmail: { title: 'Inbox - Gmail', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico' }
        };

        let cloakSettings = { tabDisguise: false, blackout: false, tabTitle: 'Google Drive', tabIcon: '', panicKey: '', autoRotate: false, autoRotateInterval: 30, blackoutDelay: 0, blackoutDismiss: 'auto', blackoutClicks: 3, panicRedirectUrl: 'https://classroom.google.com', redirectOnLeave: false, leaveRedirectUrl: 'https://classroom.google.com' };
        let originalTitle = document.title;
        let originalFavicon = '';
        let blackoutEl = null;
        let blackoutClickCount = 0;
        let rotateTimer = null;
        let rotateIndex = 0;
        let panicBtnEl = null;
        let redirectBtnEl = null;

        function loadCloakSettings() {
          try {
            const saved = localStorage.getItem(CLOAK_KEY);
            if (saved) cloakSettings = Object.assign(cloakSettings, JSON.parse(saved));
          } catch (e) {}
        }

        function saveCloakSettings() {
          try { localStorage.setItem(CLOAK_KEY, JSON.stringify(cloakSettings)); } catch (e) {}
        }

        function syncCloakUI() {
          const tabToggle = document.getElementById('cloakTabToggle');
          const blackoutToggle = document.getElementById('cloakBlackoutToggle');
          const tabTitle = document.getElementById('cloakTabTitle');
          const tabIcon = document.getElementById('cloakTabIcon');
          const tabOpts = document.getElementById('cloakTabOptions');
          const panicKey = document.getElementById('cloakPanicKey');

          if (tabToggle) tabToggle.checked = cloakSettings.tabDisguise;
          if (blackoutToggle) blackoutToggle.checked = cloakSettings.blackout;
          if (tabTitle) tabTitle.value = cloakSettings.tabTitle || 'Google Drive';
          if (tabIcon) tabIcon.value = cloakSettings.tabIcon || '';
          if (tabOpts) tabOpts.classList.toggle('hidden', !cloakSettings.tabDisguise);
          if (panicKey) panicKey.value = cloakSettings.panicKey || '';

          const autoRotateToggle = document.getElementById('cloakAutoRotate');
          const autoRotateInt = document.getElementById('cloakRotateInterval');
          const autoRotateOpts = document.getElementById('cloakAutoRotateOpts');
          const blackoutDelay = document.getElementById('cloakBlackoutDelay');
          const blackoutDismiss = document.getElementById('cloakBlackoutDismiss');
          const blackoutClicks = document.getElementById('cloakBlackoutClicks');
          const blackoutClicksOpts = document.getElementById('cloakBlackoutClicksOpts');
          const panicRedirectUrl = document.getElementById('cloakPanicRedirectUrl');
          if (autoRotateToggle) autoRotateToggle.checked = cloakSettings.autoRotate;
          if (autoRotateInt) autoRotateInt.value = cloakSettings.autoRotateInterval || 30;
          if (autoRotateOpts) autoRotateOpts.classList.toggle('hidden', !cloakSettings.autoRotate);
          if (blackoutDelay) blackoutDelay.value = cloakSettings.blackoutDelay || 0;
          if (blackoutDismiss) blackoutDismiss.value = cloakSettings.blackoutDismiss || 'auto';
          if (blackoutClicks) blackoutClicks.value = cloakSettings.blackoutClicks || 3;
          if (blackoutClicksOpts) blackoutClicksOpts.classList.toggle('hidden', cloakSettings.blackoutDismiss !== 'clicks');
          if (panicRedirectUrl) panicRedirectUrl.value = cloakSettings.panicRedirectUrl || 'https://classroom.google.com';

          var redirectOnLeaveToggle = document.getElementById('cloakRedirectOnLeave');
          var leaveRedirectUrl = document.getElementById('cloakLeaveRedirectUrl');
          var leaveOpts = document.getElementById('cloakRedirectOnLeaveOpts');
          if (redirectOnLeaveToggle) redirectOnLeaveToggle.checked = cloakSettings.redirectOnLeave;
          if (leaveRedirectUrl) leaveRedirectUrl.value = cloakSettings.leaveRedirectUrl || 'https://classroom.google.com';
          if (leaveOpts) leaveOpts.classList.toggle('hidden', !cloakSettings.redirectOnLeave);
        }

        // Save original favicon
        const existingIcon = document.querySelector('link[rel*="icon"]');
        if (existingIcon) originalFavicon = existingIcon.href;

        function setFavicon(url) {
          // Remove all existing favicons first to force browser to re-fetch
          document.querySelectorAll('link[rel*=\"icon\"]').forEach(function(el) { el.remove(); });
          var link = document.createElement('link');
          link.rel = 'icon';
          link.type = 'image/x-icon';
          link.href = url;
          document.head.appendChild(link);
          // Also add apple-touch-icon for iPad
          var apple = document.createElement('link');
          apple.rel = 'apple-touch-icon';
          apple.href = url;
          document.head.appendChild(apple);
        }

        function applyDisguise() {
          document.title = cloakSettings.tabTitle || 'Google Drive';
          if (cloakSettings.tabIcon) setFavicon(cloakSettings.tabIcon);
          else {
            const preset = Object.values(CLOAK_PRESETS).find(p => p.title === cloakSettings.tabTitle);
            if (preset) setFavicon(preset.icon);
          }
        }

        // Auto-rotate through presets while tab is hidden
        function startAutoRotate() {
          stopAutoRotate();
          if (!cloakSettings.autoRotate || !cloakSettings.tabDisguise) return;
          const keys = Object.keys(CLOAK_PRESETS);
          rotateIndex = 0;
          rotateTimer = setInterval(function() {
            rotateIndex = (rotateIndex + 1) % keys.length;
            const p = CLOAK_PRESETS[keys[rotateIndex]];
            document.title = p.title;
            setFavicon(p.icon);
          }, (cloakSettings.autoRotateInterval || 30) * 1000);
        }

        function stopAutoRotate() {
          if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
        }

        function removeDisguise() {
          document.title = originalTitle;
          if (originalFavicon) setFavicon(originalFavicon);
        }

        function showBlackout() {
          blackoutClickCount = 0;
          if (!blackoutEl) {
            blackoutEl = document.createElement('div');
            blackoutEl.id = 'cloakBlackout';
            blackoutEl.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;cursor:pointer;';
            blackoutEl.addEventListener('click', function() {
              var mode = cloakSettings.blackoutDismiss || 'auto';
              if (mode === 'click') {
                hideBlackout();
              } else if (mode === 'clicks') {
                blackoutClickCount++;
                var needed = parseInt(cloakSettings.blackoutClicks) || 3;
                if (blackoutClickCount >= needed) hideBlackout();
              }
              // 'auto' mode — clicks don't dismiss, timer does
            });
            document.body.appendChild(blackoutEl);
          }
          blackoutEl.style.display = 'block';
        }

        function hideBlackout() {
          if (blackoutEl) blackoutEl.style.display = 'none';
        }

        // Visibility change handler
        document.addEventListener('visibilitychange', function() {
          if (document.hidden) {
            if (cloakSettings.redirectOnLeave) {
              var leaveUrl = cloakSettings.leaveRedirectUrl || 'https://classroom.google.com';
              window.location.replace(leaveUrl);
              return;
            }
            if (cloakSettings.tabDisguise) {
              applyDisguise();
              startAutoRotate();
            }
            if (cloakSettings.blackout) showBlackout();
          } else {
            stopAutoRotate();
            if (cloakSettings.tabDisguise) removeDisguise();
            // Auto-unblack after delay (only in auto mode)
            if (cloakSettings.blackout && blackoutEl && blackoutEl.style.display !== 'none') {
              var mode = cloakSettings.blackoutDismiss || 'auto';
              if (mode === 'auto') {
                var delay = parseInt(cloakSettings.blackoutDelay) || 0;
                if (delay <= 0) {
                  hideBlackout();
                } else {
                  setTimeout(function() { hideBlackout(); }, delay * 1000);
                }
              }
              // 'click' and 'clicks' modes wait for user interaction
            }
          }
        });

        // Panic key handler (close tab)
        function triggerPanic() {
          window.close();
          // Fallback: replace page
          document.documentElement.innerHTML = '';
          window.location.replace('https://classroom.google.com');
        }

        // Redirect panic (instantly navigates to chosen URL)
        function triggerRedirectPanic() {
          var url = cloakSettings.panicRedirectUrl || 'https://classroom.google.com';
          window.location.replace(url);
        }

        document.addEventListener('keydown', function(e) {
          if (cloakSettings.panicKey && e.key === cloakSettings.panicKey) {
            triggerPanic();
          }
        });

        // On-screen panic button (subtle, bottom-left dot)
        function createPanicButton() {
          if (panicBtnEl) panicBtnEl.remove();
          if (!cloakSettings.panicKey) return; // only show when panic is enabled
          panicBtnEl = document.createElement('button');
          panicBtnEl.id = 'cloakPanicBtn';
          panicBtnEl.title = 'Panic';
          panicBtnEl.textContent = '·';
          panicBtnEl.style.cssText = 'position:fixed;bottom:8px;left:8px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(100,116,139,0.25);color:rgba(100,116,139,0.4);font-size:18px;line-height:18px;text-align:center;cursor:pointer;z-index:9999;padding:0;opacity:0.3;transition:opacity 0.2s;';
          panicBtnEl.addEventListener('mouseenter', function() { panicBtnEl.style.opacity = '0.7'; });
          panicBtnEl.addEventListener('mouseleave', function() { panicBtnEl.style.opacity = '0.3'; });
          panicBtnEl.addEventListener('click', function() { triggerPanic(); });
          document.body.appendChild(panicBtnEl);
        }

        function removePanicButton() {
          if (panicBtnEl) { panicBtnEl.remove(); panicBtnEl = null; }
        }

        // On-screen redirect button (subtle, bottom-left, next to panic dot)
        function createRedirectButton() {
          if (redirectBtnEl) redirectBtnEl.remove();
          if (!cloakSettings.panicRedirectUrl) return;
          redirectBtnEl = document.createElement('button');
          redirectBtnEl.id = 'cloakRedirectBtn';
          redirectBtnEl.title = 'Quick redirect';
          redirectBtnEl.textContent = '\u2192';
          var leftPos = cloakSettings.panicKey ? '34px' : '8px';
          redirectBtnEl.style.cssText = 'position:fixed;bottom:8px;left:' + leftPos + ';width:20px;height:20px;border-radius:50%;border:none;background:rgba(100,116,139,0.25);color:rgba(100,116,139,0.4);font-size:12px;line-height:20px;text-align:center;cursor:pointer;z-index:9999;padding:0;opacity:0.3;transition:opacity 0.2s;';
          redirectBtnEl.addEventListener('mouseenter', function() { redirectBtnEl.style.opacity = '0.7'; });
          redirectBtnEl.addEventListener('mouseleave', function() { redirectBtnEl.style.opacity = '0.3'; });
          redirectBtnEl.addEventListener('click', function() { triggerRedirectPanic(); });
          document.body.appendChild(redirectBtnEl);
        }

        function removeRedirectButton() {
          if (redirectBtnEl) { redirectBtnEl.remove(); redirectBtnEl = null; }
        }

        // Wire up settings UI
        function wireCloakSettings() {
          const tabToggle = document.getElementById('cloakTabToggle');
          const blackoutToggle = document.getElementById('cloakBlackoutToggle');
          const tabTitle = document.getElementById('cloakTabTitle');
          const tabIcon = document.getElementById('cloakTabIcon');
          const tabOpts = document.getElementById('cloakTabOptions');
          const panicKey = document.getElementById('cloakPanicKey');
          const aboutBlankBtn = document.getElementById('cloakAboutBlankBtn');

          if (tabToggle) tabToggle.addEventListener('change', function() {
            cloakSettings.tabDisguise = tabToggle.checked;
            if (tabOpts) tabOpts.classList.toggle('hidden', !tabToggle.checked);
            saveCloakSettings();
          });
          if (blackoutToggle) blackoutToggle.addEventListener('change', function() {
            cloakSettings.blackout = blackoutToggle.checked;
            saveCloakSettings();
          });
          if (tabTitle) tabTitle.addEventListener('input', function() {
            cloakSettings.tabTitle = tabTitle.value;
            saveCloakSettings();
          });
          if (tabIcon) tabIcon.addEventListener('input', function() {
            cloakSettings.tabIcon = tabIcon.value;
            saveCloakSettings();
          });
          if (panicKey) panicKey.addEventListener('change', function() {
            cloakSettings.panicKey = panicKey.value;
            saveCloakSettings();
            if (cloakSettings.panicKey) createPanicButton(); else removePanicButton();
          });

          // Auto-rotate wiring
          var autoRotateToggle = document.getElementById('cloakAutoRotate');
          var autoRotateInt = document.getElementById('cloakRotateInterval');
          var autoRotateOpts = document.getElementById('cloakAutoRotateOpts');
          var blackoutDelayEl = document.getElementById('cloakBlackoutDelay');

          if (autoRotateToggle) autoRotateToggle.addEventListener('change', function() {
            cloakSettings.autoRotate = autoRotateToggle.checked;
            if (autoRotateOpts) autoRotateOpts.classList.toggle('hidden', !autoRotateToggle.checked);
            saveCloakSettings();
          });
          if (autoRotateInt) autoRotateInt.addEventListener('change', function() {
            cloakSettings.autoRotateInterval = parseInt(autoRotateInt.value) || 30;
            saveCloakSettings();
          });
          if (blackoutDelayEl) blackoutDelayEl.addEventListener('change', function() {
            cloakSettings.blackoutDelay = parseInt(blackoutDelayEl.value) || 0;
            saveCloakSettings();
          });

          var blackoutDismissEl = document.getElementById('cloakBlackoutDismiss');
          var blackoutClicksEl = document.getElementById('cloakBlackoutClicks');
          var blackoutClicksOptsEl = document.getElementById('cloakBlackoutClicksOpts');
          var panicRedirectUrlEl = document.getElementById('cloakPanicRedirectUrl');

          if (blackoutDismissEl) blackoutDismissEl.addEventListener('change', function() {
            cloakSettings.blackoutDismiss = blackoutDismissEl.value;
            if (blackoutClicksOptsEl) blackoutClicksOptsEl.classList.toggle('hidden', blackoutDismissEl.value !== 'clicks');
            saveCloakSettings();
          });
          if (blackoutClicksEl) blackoutClicksEl.addEventListener('change', function() {
            cloakSettings.blackoutClicks = parseInt(blackoutClicksEl.value) || 3;
            saveCloakSettings();
          });
          if (panicRedirectUrlEl) panicRedirectUrlEl.addEventListener('input', function() {
            cloakSettings.panicRedirectUrl = panicRedirectUrlEl.value;
            saveCloakSettings();
            if (cloakSettings.panicRedirectUrl) createRedirectButton(); else removeRedirectButton();
          });

          // Redirect on leave wiring
          var redirectOnLeaveEl = document.getElementById('cloakRedirectOnLeave');
          var leaveRedirectUrlEl = document.getElementById('cloakLeaveRedirectUrl');
          var leaveOptsEl = document.getElementById('cloakRedirectOnLeaveOpts');

          if (redirectOnLeaveEl) redirectOnLeaveEl.addEventListener('change', function() {
            cloakSettings.redirectOnLeave = redirectOnLeaveEl.checked;
            if (leaveOptsEl) leaveOptsEl.classList.toggle('hidden', !redirectOnLeaveEl.checked);
            saveCloakSettings();
          });
          if (leaveRedirectUrlEl) leaveRedirectUrlEl.addEventListener('input', function() {
            cloakSettings.leaveRedirectUrl = leaveRedirectUrlEl.value;
            saveCloakSettings();
          });

          // Preset buttons
          document.querySelectorAll('.cloak-preset-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              const key = btn.getAttribute('data-cloak-preset');
              const preset = CLOAK_PRESETS[key];
              if (preset) {
                if (tabTitle) tabTitle.value = preset.title;
                if (tabIcon) tabIcon.value = preset.icon;
                cloakSettings.tabTitle = preset.title;
                cloakSettings.tabIcon = preset.icon;
                saveCloakSettings();
              }
            });
          });

          // About:blank launcher
          if (aboutBlankBtn) aboutBlankBtn.addEventListener('click', function() {
            var disguiseTitle = (cloakSettings.tabTitle || 'Google Drive').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // Find favicon URL: custom > preset match > default
            var disguiseIcon = cloakSettings.tabIcon || '';
            if (!disguiseIcon) {
              var presetKeys = Object.keys(CLOAK_PRESETS);
              for (var i = 0; i < presetKeys.length; i++) {
                if (CLOAK_PRESETS[presetKeys[i]].title === cloakSettings.tabTitle) {
                  disguiseIcon = CLOAK_PRESETS[presetKeys[i]].icon;
                  break;
                }
              }
            }
            var faviconTag = disguiseIcon ? '<link rel=\"icon\" href=\"' + disguiseIcon.replace(/"/g, '&quot;') + '\">' : '';
            var w = window.open('about:blank', '_blank');
            if (w) {
              w.document.write('<!DOCTYPE html><html style=\"height:100%;margin:0;\"><head><title>' + disguiseTitle +
                '</title>' + faviconTag +
                '</head><body style=\"margin:0;padding:0;height:100%;overflow:hidden;\"><iframe src=\"' +
                window.location.href.replace(/"/g, '&quot;') +
                '\" style=\"width:100%;height:100%;border:none;display:block;\"></iframe></body></html>');
              w.document.close();
            }
          });
        }

        loadCloakSettings();
        syncCloakUI();
        wireCloakSettings();
        if (cloakSettings.panicKey) createPanicButton();
        if (cloakSettings.panicRedirectUrl) createRedirectButton();
      })();

      
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
        
        if (typeof walkthroughActive !== 'undefined' && walkthroughActive) {
          console.log('[rating] walkthrough active, deferring prompt');
          
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
                ${profilePic ? `<img src="${escapeHtml(profilePic)}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-slate-400 text-sm">${escapeHtml(username.charAt(0).toUpperCase())}</div>`}
              </div>
              <div class="text-sm text-slate-100">${escapeHtml(username)}</div>
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
          // Use server-side filtering to avoid downloading entire database
          const q = query.toLowerCase();
          const usersSnap = await db.ref("users")
            .orderByChild("usernameLower")
            .startAt(q)
            .endAt(q + "\uf8ff")
            .limitToFirst(30)
            .once("value");
          let allUsers = usersSnap.val() || {};
          
          // Fallback if usernameLower index doesn't exist yet
          if (Object.keys(allUsers).length === 0) {
            const fallbackSnap = await db.ref("users").limitToFirst(500).once("value");
            allUsers = fallbackSnap.val() || {};
          }

          const matches = [];
          const profilePromises = [];
          
          Object.entries(allUsers).forEach(([uid, val]) => {
            const uname = val?.username || "";
            if (!uname) return;
            if (uid === currentUserId) return;
            if (uname.toLowerCase().includes(q)) {
              profilePromises.push(
                db.ref("userProfiles/" + uid).once("value").then(snap => {
                  const prof = snap.val() || {};
                  matches.push({ uid, username: uname, bio: prof.bio, profilePic: prof.profilePic });
                })
              );
            }
          });
          
          await Promise.all(profilePromises);

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


      
      if (dmMediaUploadBtn && dmMediaInput) {
        dmMediaUploadBtn.addEventListener("click", () => {
          dmMediaInput.click();
        });

        dmMediaInput.addEventListener("change", async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;

          if (!chatImagesEnabled) {
            showToast('Images are currently disabled by a moderator', 'error');
            dmMediaInput.value = '';
            return;
          }

          const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
          if (!allowedMediaTypes.includes(file.type)) {
            dmError.textContent = 'Unsupported file type. Images and videos only.';
            dmMediaInput.value = '';
            return;
          }
          if (file.size > 50 * 1024 * 1024) {
            dmError.textContent = 'File too large. Max 50MB.';
            dmMediaInput.value = '';
            return;
          }

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
            if (!privacyCheck.allowed) {
              dmError.textContent = privacyCheck.reason;
              dmMediaUploadBtn.disabled = false;
              dmSendBtn.disabled = false;
              return;
            }
            
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

            if (!(await canUpload())) {
              dmError.textContent = "Slow down! Wait a few seconds.";
              dmMediaUploadBtn.disabled = false;
              dmSendBtn.disabled = false;
              return;
            }

            const threadId =
              activeDMThread || (await ensureDmThread(activeDMTarget.uid, activeDMTarget.username));

            
            let caption = (dmInput.value || "").trim();
            if (caption) {
              for (let pattern of THREAT_PATTERNS) {
                pattern.lastIndex = 0;
                if (pattern.test(caption)) {
                  dmError.textContent = " Message blocked: Threats or violence are not allowed.";
                  dmInput.value = "";
                  dmMediaUploadBtn.disabled = false;
                  dmSendBtn.disabled = false;
                  return;
                }
              }
              for (let pattern of HATE_PATTERNS) {
                pattern.lastIndex = 0;
                if (pattern.test(caption)) {
                  dmError.textContent = " Message blocked: Hateful or harassing language is not allowed.";
                  dmInput.value = "";
                  dmMediaUploadBtn.disabled = false;
                  dmSendBtn.disabled = false;
                  return;
                }
              }
              caption = filterBadWords(caption);
            }

            const processed = await prepareFileForUpload(file);
            const uploadResult = await uploadToImageKit(processed);
            storeUploadTime();

            
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

        
        for (let pattern of THREAT_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            dmError.textContent = " Message blocked: Threats or violence are not allowed.";
            dmInput.value = "";
            return;
          }
        }
        
        for (let pattern of HATE_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            dmError.textContent = " Message blocked: Hateful or harassing language is not allowed.";
            dmInput.value = "";
            return;
          }
        }

        
        text = filterBadWords(text);
        if (typeof text === 'string' && text.startsWith('[FILTERED')) {
          currentWarningText = ' Message blocked: Hateful or harassing language is not allowed.';
          updateStatusBar();
          setTimeout(() => {
            currentWarningText = '';
            updateStatusBar();
          }, 4000);
          dmInput.value = '';
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

          
          try { sendAnalyticsEvent('message_sent', { thread_id: threadId, has_media: false }); } catch (e) {}

          
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

      
      document.querySelectorAll(".size-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const size = btn.getAttribute("data-size");
          setActiveSizeButton(size);
          applyMessageSize(size, true);
        });
      });

      // All theme mode class names
      const THEME_MODES = ['light-mode', 'midnight-mode', 'ocean-mode', 'forest-mode', 'sunset-mode'];
      
      function applyTheme(theme, persist = true) {
        // Remove all theme classes first
        THEME_MODES.forEach(mode => document.body.classList.remove(mode));
        
        // Apply the selected theme
        if (theme === "light") {
          document.body.classList.add("light-mode");
        } else if (theme === "midnight") {
          document.body.classList.add("midnight-mode");
        } else if (theme === "ocean") {
          document.body.classList.add("ocean-mode");
        } else if (theme === "forest") {
          document.body.classList.add("forest-mode");
        } else if (theme === "sunset") {
          document.body.classList.add("sunset-mode");
        }
        // 'dark' is the default, no class needed
        
        if (persist) saveUserSetting("theme", theme);
        console.log("[settings] theme applied:", theme);
      }
      
      function applyAccentColor(color, persist = true) {
        if (!color) return;
        // Calculate hover color (slightly darker)
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const hoverColor = '#' + [r, g, b].map(c => Math.max(0, c - 25).toString(16).padStart(2, '0')).join('');
        
        document.documentElement.style.setProperty('--accent-color', color);
        document.documentElement.style.setProperty('--accent-hover', hoverColor);
        document.body.setAttribute('data-accent', 'true');
        
        if (persist) saveUserSetting("accentColor", color);
        console.log("[settings] accent color applied:", color);
      }
      
      function resetAccentColor() {
        document.documentElement.style.removeProperty('--accent-color');
        document.documentElement.style.removeProperty('--accent-hover');
        document.body.removeAttribute('data-accent');
        saveUserSetting("accentColor", null);
        console.log("[settings] accent color reset");
      }

      function setActiveThemeButton(theme) {
        // Update dropdown
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
          themeSelect.value = theme;
        }
        // Legacy button support
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
      
      function setActiveAccentPreset(color) {
        document.querySelectorAll('.accent-preset').forEach(btn => {
          const isActive = btn.getAttribute('data-accent') === color;
          btn.classList.remove('ring-white', 'ring-offset-2', 'ring-offset-slate-900');
          if (isActive) {
            btn.classList.add('ring-white', 'ring-offset-2', 'ring-offset-slate-900');
          }
        });
      }

      // Theme dropdown handler
      const themeSelect = document.getElementById('themeSelect');
      if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
          const theme = e.target.value;
          applyTheme(theme);
        });
      }

      // Legacy button support
      document.querySelectorAll(".theme-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const theme = btn.getAttribute("data-theme");
          setActiveThemeButton(theme);
          applyTheme(theme);
        });
      });
      
      // Accent preset handlers
      document.querySelectorAll('.accent-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          const color = btn.getAttribute('data-accent');
          applyAccentColor(color);
          setActiveAccentPreset(color);
          const customAccentInput = document.getElementById('customAccentColor');
          if (customAccentInput) customAccentInput.value = color;
        });
      });
      
      // Custom accent color handlers
      const customAccentColor = document.getElementById('customAccentColor');
      const resetAccentBtn = document.getElementById('resetAccentBtn');
      
      if (customAccentColor) {
        customAccentColor.addEventListener('change', (e) => {
          const color = e.target.value;
          applyAccentColor(color);
          setActiveAccentPreset(color);
        });
      }
      
      if (resetAccentBtn) {
        resetAccentBtn.addEventListener('click', () => {
          resetAccentColor();
          if (customAccentColor) customAccentColor.value = '#0ea5e9';
          setActiveAccentPreset('#0ea5e9');
        });
      }
      
      // Feature Announcement Modal (saves to Firebase)
      async function showFeatureAnnouncement() {
        const modal = document.getElementById('featureAnnouncementModal');
        if (!modal || !currentUserId) return;
        
        // Check Firebase for dismissed status
        const userRef = firebase.database().ref(`users/${currentUserId}/settings/featureAnnouncementDismissed`);
        const snapshot = await userRef.once('value');
        const dismissed = snapshot.val();
        
        if (!dismissed || dismissed !== 'v1.5.0') {
          modal.style.display = 'flex';
          modal.classList.remove('hidden');
        }
      }
      
      async function hideFeatureAnnouncement() {
        const modal = document.getElementById('featureAnnouncementModal');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.add('hidden');
        }
        // Always save to Firebase when dismissed
        if (currentUserId) {
          await firebase.database().ref(`users/${currentUserId}/settings/featureAnnouncementDismissed`).set('v1.5.0');
        }
      }
      
      const dismissFeatureBtn = document.getElementById('dismissFeatureAnnouncement');
      if (dismissFeatureBtn) dismissFeatureBtn.addEventListener('click', hideFeatureAnnouncement);
      
      // Show feature announcement after a short delay on login
      setTimeout(() => {
        if (currentUserId) showFeatureAnnouncement();
      }, 2000);

      
      uploadPicBtn.addEventListener("click", () => {
        profilePicInput.click();
      });

      
      async function uploadToCloudinary(file) {
        const data = new FormData();
        data.append("file", file);
        data.append("upload_preset", "chat_upload");

        const res = await fetch("https://api.cloudinary.com/v1_1/dyi0oy0ce/upload", {
          method: "POST",
          body: data
        });

        const json = await res.json();
        
        
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

        const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedImageTypes.includes(file.type)) {
          showToast('Only JPEG, PNG, GIF, and WebP images are allowed', 'error');
          profilePicInput.value = '';
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          showToast('File too large. Max 10MB', 'error');
          profilePicInput.value = '';
          return;
        }

        try {
          uploadPicBtn.disabled = true;
          uploadPicBtn.textContent = "Uploading...";

          
          if (currentUserData.profilePicFileId) {
            try {
              console.log("[profile] deleting old profile picture");
              await deleteFromImageKit(currentUserData.profilePicFileId);
            } catch (err) {
              console.warn("[profile] couldn't delete old pic:", err.message);
            }
          }

          
          const processedFile = await prepareFileForUpload(file);
          const uploadResult = await uploadToImageKit(processedFile);

          
          profilePicPreview.innerHTML = "";
          const img = document.createElement("img");
          img.src = uploadResult.url;
          img.className = "h-full w-full object-cover rounded-full";
          img.onerror = () => {
            console.warn("[profile] failed to load image");
            setDefaultProfileIcon(profilePicPreview, 40);
          };
          profilePicPreview.appendChild(img);
          
          currentUserData.profilePic = uploadResult.url;
          currentUserData.profilePicFileId = uploadResult.fileId;
          currentUserData.profilePicDeleteToken = null;

          
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

      
      const profileBannerInput = document.getElementById("profileBannerInput");
      const profileBannerPreview = document.getElementById("profileBannerPreview");

      profileBannerPreview.addEventListener("click", () => {
        profileBannerInput.click();
      });

      profileBannerInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedImageTypes.includes(file.type)) {
          showToast('Only JPEG, PNG, GIF, and WebP images are allowed', 'error');
          profileBannerInput.value = '';
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          showToast('File too large. Max 10MB', 'error');
          profileBannerInput.value = '';
          return;
        }

        try {
          
          if (currentUserData.profileBannerFileId) {
            try {
              console.log("[profile] deleting old banner");
              await deleteFromImageKit(currentUserData.profileBannerFileId);
            } catch (err) {
              console.warn("[profile] couldn't delete old banner:", err.message);
            }
          }

          
          const processedFile = await prepareFileForUpload(file);
          const uploadResult = await uploadToImageKit(processedFile);

          
          profileBannerPreview.style.backgroundImage = `url('${uploadResult.url}')`;
          profileBannerPreview.style.backgroundSize = "cover";
          profileBannerPreview.style.backgroundPosition = "center";
          profileBannerPreview.innerHTML = "";

          currentUserData.profileBanner = uploadResult.url;
          currentUserData.profileBannerFileId = uploadResult.fileId;

          
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

          
          if (data.profileBanner) {
            profileBannerPreview.style.backgroundImage = `url('${encodeURI(data.profileBanner)}')`;
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

          
          if (data.profilePic) {
            try {
              profilePicPreview.innerHTML = "";
              const img = document.createElement("img");
              img.src = data.profilePic;
              img.className = "h-full w-full object-cover rounded-full";
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
          
          // Load frame settings
          loadFrameSettings(data);
          
          console.log("[profile] loaded successfully");
        } catch (err) {
          console.error("[profile] error loading profile:", err);
          showToast("Could not load profile", "error");
          profileBio.value = "";
          currentUserData = {};
        }
      }

      
      async function viewUserProfile(username, options = {}) {
        console.log("[profile] viewing profile for", username);
        currentViewingUsername = username;

        const isSelf = username === currentUsername;

        
        setFriendRequestStatus("");
        
        
        sendFriendRequestBtn.disabled = false;
        sendFriendRequestBtn.style.background = "";
        sendFriendRequestBtn.textContent = "Add Friend";
        blockUserBtn.disabled = false;
        blockUserBtn.style.background = "";
        blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
        delete blockUserBtn.dataset.action;
        delete blockUserBtn.dataset.targetUid;
        
        // Reset DM button
        if (profileDmBtn) {
          profileDmBtn.disabled = false;
          profileDmBtn.style.background = "";
          profileDmBtn.querySelector('span').textContent = "Send Message";
          delete profileDmBtn.dataset.targetUid;
        }

        
        if (isSelf) {
          sendFriendRequestBtn.disabled = true;
          sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
          sendFriendRequestBtn.textContent = "This is you";
          blockUserBtn.disabled = true;
          blockUserBtn.style.background = "rgb(100, 116, 139)";
          blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
          // Hide DM button for self
          if (profileDmBtn) {
            profileDmBtn.classList.add('hidden');
          }
        } else {
          // Show DM button for others
          if (profileDmBtn) {
            profileDmBtn.classList.remove('hidden');
          }
        }

        
        viewProfileName.textContent = username || "-";
        viewProfileBio.textContent = "Loading...";
        viewProfilePic.innerHTML = generateDefaultAvatar(username);
        
        // Reset staff badge
        const viewProfileBadge = document.getElementById('viewProfileBadge');
        if (viewProfileBadge) {
          viewProfileBadge.classList.add('hidden');
          viewProfileBadge.textContent = '';
        }
        
        // Reset online status dot - bigger and better styled
        const onlineStatusEl = document.getElementById('viewProfileOnlineStatus');
        if (onlineStatusEl) {
          onlineStatusEl.className = 'h-4 w-4 rounded-full bg-slate-500 ring-2 ring-slate-800 shadow-lg';
          onlineStatusEl.title = 'Offline';
        }

        
        const viewProfileBanner = document.getElementById("viewProfileBanner");
        viewProfileBanner.style.backgroundImage = "";
        
        const existingBannerImg = viewProfileBanner.querySelector('img.banner-gif');
        if (existingBannerImg) existingBannerImg.remove();

        
        let currentBannerUrl = null;
        let currentPicUrl = null;

        
        setTimeout(() => {
          clearProfileListeners();

          const renderProfile = (profile) => {
            
            const bannerUrl = profile?.profileBanner || null;
            if (bannerUrl !== currentBannerUrl) {
              currentBannerUrl = bannerUrl;
              if (bannerUrl) {
                if (isGifUrl(bannerUrl)) {
                  
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
                  
                  const existingGif = viewProfileBanner.querySelector('img.banner-gif');
                  if (existingGif) existingGif.remove();
                  viewProfileBanner.style.backgroundImage = `url('${encodeURI(bannerUrl)}')`;
                  viewProfileBanner.style.backgroundSize = "cover";
                  viewProfileBanner.style.backgroundPosition = "center";
                }
              } else {
                viewProfileBanner.style.backgroundImage = "";
                const existingGif = viewProfileBanner.querySelector('img.banner-gif');
                if (existingGif) existingGif.remove();
              }
            }

            
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
            
            // Apply profile frame if user has one
            if (!FAST_MODE_ENABLED && profile?.frameType && profile.frameType !== 'none') {
              applyFrameToAvatar(viewProfilePic, profile);
            } else {
              // Clear any existing frame classes
              viewProfilePic.classList.remove(
                'profile-frame-glow', 'profile-frame-spin', 'profile-frame-pulse',
                'profile-frame-rainbow', 'profile-frame-fire', 'profile-frame-electric', 'profile-frame-gradient'
              );
            }

            viewProfileBio.textContent = profile?.bio || "No bio yet";
          };

          fetchUserProfile(username)
            .then((profile) => {
              renderProfile(profile);

              const uid = profile?.uid;
              if (uid) {
                // Show staff badge if user has a staff role
                const viewProfileBadge = document.getElementById('viewProfileBadge');
                if (viewProfileBadge) {
                  const staffRole = getUserStaffRole(uid);
                  const ownerUid = 'u5yKqiZvioWuBGcGK3SWUBpUVrc2';
                  const coOwnerUid = '6n8hjmrUxhMHskX4BG8Ik9boMqa2';
                  
                  if (uid === ownerUid) {
                    viewProfileBadge.textContent = 'Owner';
                    viewProfileBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-900';
                    viewProfileBadge.classList.remove('hidden');
                  } else if (uid === coOwnerUid) {
                    viewProfileBadge.textContent = 'Co-Owner';
                    viewProfileBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white';
                    viewProfileBadge.classList.remove('hidden');
                  } else if (staffRole) {
                    viewProfileBadge.textContent = staffRole.name;
                    viewProfileBadge.className = `px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg ${staffRole.badgeClass}`;
                    viewProfileBadge.classList.remove('hidden');
                  } else {
                    viewProfileBadge.classList.add('hidden');
                  }
                }
                
                // Update online status with better styling
                const onlineStatusEl = document.getElementById('viewProfileOnlineStatus');
                if (onlineStatusEl) {
                  const isOnline = isUserOnline(uid);
                  onlineStatusEl.className = `h-4 w-4 rounded-full ring-2 ring-slate-800 shadow-lg ${isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`;
                  onlineStatusEl.title = isOnline ? 'Online' : 'Offline';
                }
                
                // Set up DM button with target uid and check privacy
                if (profileDmBtn && !isSelf) {
                  profileDmBtn.dataset.targetUid = uid;
                  
                  // AI always allows DMs
                  if (uid === AI_BOT_UID) {
                    profileDmBtn.disabled = false;
                    profileDmBtn.style.background = "";
                    profileDmBtn.querySelector('span').textContent = "Chat with AI";
                  } else {
                    // Check DM privacy for other users
                    checkDmPrivacy(uid).then(privacyCheck => {
                      if (!privacyCheck.allowed) {
                        profileDmBtn.disabled = true;
                        profileDmBtn.style.background = "rgb(100, 116, 139)";
                        profileDmBtn.querySelector('span').textContent = "DMs Disabled";
                        profileDmBtn.title = privacyCheck.reason || "This user is not accepting DMs";
                      } else {
                        profileDmBtn.disabled = false;
                        profileDmBtn.style.background = "";
                        profileDmBtn.querySelector('span').textContent = "Send Message";
                        profileDmBtn.title = "";
                      }
                    }).catch(() => {
                      // Default to allowing if check fails
                      profileDmBtn.disabled = false;
                    });
                  }
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
          
          await checkIfBlocked(username);
          
          
          await checkFriendshipStatus(username);

          
          showProfileAdminActions(username);
        } else {
          
          const profileAdminActions = document.getElementById("profileAdminActions");
          profileAdminActions.classList.add("hidden");
        }

        if (!options.silent) {
          viewProfileModal.classList.remove("modal-closed");
          viewProfileModal.classList.add("modal-open");
        }
      }

      
      async function showProfileAdminActions(targetUsername) {
        const profileAdminActions = document.getElementById("profileAdminActions");
        const profileBanBtn = document.getElementById("profileBanBtn");
        const profileMuteBtn = document.getElementById("profileMuteBtn");
        const profileWarnBtn = document.getElementById("profileWarnBtn");
        const profileClearHwBanBtn = document.getElementById("profileClearHwBanBtn");
        const now = Date.now();
        const ownerUid = "u5yKqiZvioWuBGcGK3SWUBpUVrc2";
        const coOwnerUid = "6n8hjmrUxhMHskX4BG8Ik9boMqa2";

        // Get current user's permissions
        const perms = getCurrentUserPermissions();
        const isStaff = isCurrentUserStaff() || isAdmin;

        console.log("[admin-profile] isAdmin:", isAdmin, "isStaff:", isStaff, "targetUsername:", targetUsername);

        // Hide admin actions if not staff/admin
        if (!isStaff) {
          profileAdminActions.classList.add("hidden");
          return;
        }

        // Look up target user
        const snap = await db.ref("users").orderByChild("username").equalTo(targetUsername).once("value");
        if (!snap.exists()) {
          console.log("[admin-profile] target user not found");
          profileAdminActions.classList.add("hidden");
          return;
        }

        const targetUid = Object.keys(snap.val())[0];
        console.log("[admin-profile] targetUid:", targetUid, "currentUserId:", currentUserId);

        // Can't moderate yourself
        if (targetUid === currentUserId) {
          profileAdminActions.classList.add("hidden");
          return;
        }

        // Can't moderate the owner
        if (targetUid === ownerUid) {
          profileAdminActions.classList.add("hidden");
          return;
        }

        // Co-owner can't moderate themselves
        if (currentUserId === coOwnerUid && targetUid === coOwnerUid) {
          profileAdminActions.classList.add("hidden");
          return;
        }

        // Get target user's staff role to check hierarchy
        const targetStaffRole = getUserStaffRole(targetUid);
        const currentStaffRole = getUserStaffRole(currentUserId);
        
        // Check if target is co-owner (only owner can moderate co-owner)
        if (targetUid === coOwnerUid && currentUserId !== ownerUid) {
          profileAdminActions.classList.add("hidden");
          return;
        }
        
        // Staff hierarchy check - can only moderate lower ranks (unless owner/co-owner)
        if (targetStaffRole && currentUserId !== ownerUid && currentUserId !== coOwnerUid) {
          const currentPriority = currentStaffRole?.priority || 0;
          const targetPriority = targetStaffRole?.priority || 0;
          if (targetPriority >= currentPriority) {
            // Can't moderate same or higher rank
            profileAdminActions.classList.add("hidden");
            return;
          }
        }

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

        // Show/hide buttons based on permissions
        if (profileBanBtn) {
          if (perms.canBan) {
            profileBanBtn.classList.remove("hidden");
            profileBanBtn.textContent = isBannedNow ? "🔓 Unban" : "🚫 Ban";
            profileBanBtn.onclick = async () => {
              const latestBanSnap = await db.ref("bannedUsers/" + targetUid).once("value");
              const latestBan = latestBanSnap.val();
              const latestNow = Date.now();
              const latestActive = !!(latestBan && (!latestBan.until || latestBan.until === 9999999999999 || latestBan.until > latestNow));
              if (latestActive) {
                await unbanUser(targetUid);
                profileBanBtn.textContent = "🚫 Ban";
              } else {
                showBanReasonModal(targetUid);
              }
            };
          } else {
            profileBanBtn.classList.add("hidden");
          }
        }

        if (profileMuteBtn) {
          if (perms.canMute) {
            profileMuteBtn.classList.remove("hidden");
            profileMuteBtn.textContent = isMutedNow ? "🔊 Unmute" : "🔇 Mute";
            profileMuteBtn.onclick = async () => {
              console.log("[admin-profile] mute button clicked");
              const latestMuteSnap = await db.ref("mutedUsers/" + targetUid).once("value");
              const latestMuteData = latestMuteSnap.val();
              const latestMuted = latestMuteData && latestMuteData.until && latestMuteData.until > Date.now();
              if (latestMuted) {
                console.log("[admin-profile] unMuting user:", targetUid);
                db.ref("mutedUsers/" + targetUid).remove().then(() => {
                  console.log("[admin-profile] user unmuted successfully");
                  profileMuteBtn.textContent = "🔇 Mute";
                }).catch((err) => {
                  console.error("[mute] failed to unmute user", err);
                });
              } else {
                showMuteReasonModal(targetUid);
              }
            };
          } else {
            profileMuteBtn.classList.add("hidden");
          }
        }

        if (profileWarnBtn) {
          if (perms.canWarn) {
            profileWarnBtn.classList.remove("hidden");
            profileWarnBtn.onclick = () => {
              showWarnReasonModal(targetUid);
            };
          } else {
            profileWarnBtn.classList.add("hidden");
          }
        }

        if (profileClearHwBanBtn) {
          if (perms.canHardwareBan) {
            profileClearHwBanBtn.classList.remove("hidden");
          } else {
            profileClearHwBanBtn.classList.add("hidden");
          }
        }
      }

      
      async function checkFriendshipStatus(targetUsername) {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        try {
          
          const snap = await db.ref("users").orderByChild("username").equalTo(targetUsername).once("value");
          if (!snap.exists()) {
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          const targetUid = Object.keys(snap.val())[0];
          
          sendFriendRequestBtn.dataset.targetUid = targetUid;
          sendFriendRequestBtn.dataset.targetUsername = targetUsername;

          
          const youBlockedThem = await db.ref("blockedUsers/" + uid + "/" + targetUid).once("value");
          if (youBlockedThem.exists()) {
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
            sendFriendRequestBtn.textContent = "Blocked";
            setFriendRequestStatus("You have blocked this user.", "warn");
            return;
          }
          
          
          const privacySnap = await db.ref("userPrivacy/" + targetUid).once("value");
          const privacy = privacySnap.val() || {};
          
          if (privacy.allowFriendRequests === false) {
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
            sendFriendRequestBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="inline mr-1"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Requests Disabled';
            setFriendRequestStatus("This user has disabled friend requests.", "warn");
            return;
          }

          
          const friendsSnap = await db.ref("friends/" + uid + "/" + targetUid).once("value");
          if (friendsSnap.exists()) {
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.style.background = "rgb(220, 38, 38)";
            sendFriendRequestBtn.textContent = "Unfriend";
            sendFriendRequestBtn.dataset.action = "unfriend";
            return;
          }

          
          const sentReqSnap = await db.ref("friendRequests/" + targetUid + "/incoming/" + uid).once("value");
          if (sentReqSnap.exists()) {
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
            sendFriendRequestBtn.textContent = "⏳ Pending";
            setFriendRequestStatus("Friend request already sent.", "info");
            return;
          }

          
          const reverseReqSnap = await db.ref("friendRequests/" + uid + "/incoming/" + targetUid).once("value");
          if (reverseReqSnap.exists()) {
            sendFriendRequestBtn.disabled = true;
            sendFriendRequestBtn.style.background = "rgb(100, 116, 139)";
            sendFriendRequestBtn.textContent = "📥 Incoming";
            setFriendRequestStatus("They sent you a friend request. Accept?", "info");
            return;
          }

          
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

      
      function generateDefaultAvatar(username) {
        const safeName = username || "?";
        const initial = safeName.charAt(0).toUpperCase();
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
        const colorIdx = (safeName.charCodeAt(0) || 0) % colors.length;
        const color = colors[colorIdx];
        return `<div class="h-full w-full rounded-full overflow-hidden bg-gradient-to-br ${color} flex items-center justify-center text-4xl font-bold text-white">${initial}</div>`;
      }

      
      function setDefaultProfileIcon(element, size = 40) {
        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        element.innerHTML = svg;
      }

      
      profileCloseBtn.addEventListener("click", () => {
        profileModal.classList.remove("modal-open");
        profileModal.classList.add("modal-closed");
        
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
          
          setTimeout(() => {
            profileBio.disabled = false;
            profileBio.style.opacity = "1";
            saveProfileBtn.style.display = "block";
            uploadPicBtn.style.display = "block";
          }, 100);
        }
      });

      
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
        
        
        try {
          
          if (!newUsername) {
            throw new Error("Username cannot be empty");
          }

          
          if (!isAiBotUser) {
            
            if (newUsername.length < 2) {
              throw new Error("Username too short (minimum 2 characters)");
            }

            if (newUsername.length > 12) {
              throw new Error("Username too long (maximum 12 characters)");
            }

            
            if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
              throw new Error("Username can only contain letters, numbers, underscore (_) and dash (-)");
            }

            
              if (/^[_-]|[_-]$/.test(newUsername)) {
              throw new Error("Username cannot start or end with _ or -");
            }

            
            badWordPattern.lastIndex = 0;
            if (badWordPattern.test(newUsername)) {
              throw new Error("Username not allowed");
            }

            
            if (isLocallyBlockedUsername(newUsername)) {
              throw new Error("Username not allowed");
            }
          } 

          
          if (profileBio.value.length > 150) {
            throw new Error("Bio is too long (maximum 150 characters)");
          }

          const usernameChanged = newUsername.toLowerCase() !== currentUsername.toLowerCase();
          const oldUsername = currentUsername;

          if (usernameChanged) {
            
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = "Checking username...";
            
            console.log("[profile] checking if username is taken:", newUsername);

            
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

            
            saveProfileBtn.textContent = "Saving...";

            
            const updates = {};
            updates["userProfiles/" + uid] = {
              username: newUsername,
              bio: profileBio.value.trim(),
              profilePic: currentUserData.profilePic || null,
              profilePicFileId: currentUserData.profilePicFileId || null,
              profileBanner: currentUserData.profileBanner || null,
              profileBannerFileId: currentUserData.profileBannerFileId || null,
              profilePicDeleteToken: currentUserData.profilePicDeleteToken || null,
              // Frame settings
              frameType: frameSettings.type || 'none',
              framePrimaryColor: frameSettings.primaryColor || '#38bdf8',
              frameSecondaryColor: frameSettings.secondaryColor || '#a855f7',
              frameSpeed: frameSettings.speed || 1,
              createdAt: currentUserData.createdAt || firebase.database.ServerValue.TIMESTAMP,
              updatedAt: firebase.database.ServerValue.TIMESTAMP,
            };
            updates["users/" + uid + "/username"] = newUsername;
            updates["users/" + uid + "/profilePic"] = currentUserData.profilePic || null;
            updates["users/" + uid + "/profilePicFileId"] = currentUserData.profilePicFileId || null;
            updates["users/" + uid + "/profileBanner"] = currentUserData.profileBanner || null;
            updates["users/" + uid + "/profileBannerFileId"] = currentUserData.profileBannerFileId || null;

            await db.ref().update(updates);

            
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

            
            originalProfilePic = currentUserData.profilePic || originalProfilePic;
            originalProfilePicDeleteToken = null; 

            console.log("[profile] saved successfully with new username:", newUsername);
            currentUsername = newUsername;
            updateChatUserLabel(newUsername);
            
            
            profileCache[newUsername] = null;
            if (oldUsername && oldUsername !== newUsername) {
              delete profileCache[oldUsername];
            }
            
            
            saveProfileBtn.textContent = "✓ Username Updated!";
            saveProfileBtn.style.background = "rgb(34, 197, 94)"; 
            setTimeout(() => {
              saveProfileBtn.textContent = originalText;
              saveProfileBtn.style.background = "";
              saveProfileBtn.disabled = false;
            }, 2500);

          } else {
            
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
              // Frame settings
              frameType: frameSettings.type || 'none',
              framePrimaryColor: frameSettings.primaryColor || '#38bdf8',
              frameSecondaryColor: frameSettings.secondaryColor || '#a855f7',
              frameSpeed: frameSettings.speed || 1,
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

            
            originalProfilePic = currentUserData.profilePic || originalProfilePic;
            originalProfilePicDeleteToken = null; 

            console.log("[profile] saved successfully (no username change)");
            
            
            saveProfileBtn.textContent = "Profile Saved!";
            saveProfileBtn.style.background = "rgb(34, 197, 94)"; 
            setTimeout(() => {
              saveProfileBtn.textContent = originalText;
              saveProfileBtn.style.background = "";
              saveProfileBtn.disabled = false;
            }, 2500);
          }

        } catch (err) {
          console.error("[profile] validation/save error:", err);
          
          
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

          
          saveProfileBtn.textContent = buttonText;
          saveProfileBtn.style.background = "rgb(239, 68, 68)"; 
          showToast(err.message || "Error saving profile", "error");

          setTimeout(() => {
            saveProfileBtn.textContent = originalText;
            saveProfileBtn.style.background = "";
            saveProfileBtn.disabled = false;
          }, 1500);
        }
      });

      
      let currentViewingUsername = null;

      const friendRequestsModal = document.getElementById("friendRequestsModal");
      const friendRequestsCloseBtn = document.getElementById("friendRequestsCloseBtn");
      const friendRequestsList = document.getElementById("friendRequestsList");
      const noFriendRequestsMsg = document.getElementById("noFriendRequestsMsg");
      const sendFriendRequestBtn = document.getElementById("sendFriendRequestBtn");
      const profileDmBtn = document.getElementById("profileDmBtn");
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
              
              
              try {
                const userSnap = await db.ref("users/" + req.fromUid + "/username").once("value");
                const fromUsername = userSnap.val() || "Unknown User";
                div.querySelector("span").textContent = fromUsername;
              } catch (err) {
                console.error("[friends] error loading username for:", req.fromUid, err);
                div.querySelector("span").textContent = "Unknown User";
              }
            }

            
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

      
      sendFriendRequestBtn.addEventListener("click", async () => {
        if (sendFriendRequestBtn.disabled) return;
        const uid = auth.currentUser?.uid;
        if (!uid) {
          logDetailedError("sendFriendRequest", new Error("Not logged in"));
          setFriendRequestStatus("Not logged in", "error");
          return;
        }
        
        
        if (sendFriendRequestBtn.dataset.action === "unfriend") {
          const targetUid = sendFriendRequestBtn.dataset.targetUid;
          const targetUsername = sendFriendRequestBtn.dataset.targetUsername;
          
          if (confirm(`Unfriend ${targetUsername}?`)) {
            try {
              console.log("[friends] unfriending:", targetUsername);
              
              
              await db.ref("friends/" + uid + "/" + targetUid).remove();
              await db.ref("friends/" + targetUid + "/" + uid).remove();
              
              console.log("[friends] unfriended successfully");
              
              
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

          
          console.log("[friends] checking if you blocked them");
          const youBlockedThem = await db.ref("blockedUsers/" + uid + "/" + targetUid).once("value");
          if (youBlockedThem.exists()) {
            setFriendRequestStatus("You have blocked this user. Unblock them first.", "warn");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          
          

          
          console.log("[friends] checking if already friends");
          const alreadyFriends = await db.ref("friends/" + uid + "/" + targetUid).once("value");
          if (alreadyFriends.exists()) {
            setFriendRequestStatus("You're already friends!", "info");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          
          console.log("[friends] checking for existing request at: friendRequests/" + targetUid + "/incoming/" + uid);
          const existingReq = await db.ref("friendRequests/" + targetUid + "/incoming/" + uid).once("value");
          if (existingReq.exists()) {
            setFriendRequestStatus("Friend request already sent!", "info");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          
          console.log("[friends] checking for reverse request at: friendRequests/" + uid + "/incoming/" + targetUid);
          const reverseReq = await db.ref("friendRequests/" + uid + "/incoming/" + targetUid).once("value");
          if (reverseReq.exists()) {
            setFriendRequestStatus("They already sent you a friend request. Accept?", "info");
            sendFriendRequestBtn.disabled = false;
            sendFriendRequestBtn.textContent = "Add Friend";
            return;
          }

          
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
            
            isBlocked = true;
            errorMsg = "You have been blocked by this user.";
            
            
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

      // Profile DM button click handler
      if (profileDmBtn) {
        profileDmBtn.addEventListener("click", async () => {
          const targetUsername = currentViewingUsername;
          const targetUid = profileDmBtn.dataset.targetUid;
          
          if (!targetUid || !targetUsername) {
            showToast("Unable to start DM", "error");
            return;
          }
          
          // Check if it's the AI
          const isAI = targetUid === AI_BOT_UID;
          
          // Close the profile modal
          viewProfileModal.classList.remove("modal-open");
          viewProfileModal.classList.add("modal-closed");
          
          // Open DM with this user - use the same logic as startDmWithUser
          try {
            const threadId = makeThreadId(currentUserId, targetUid);
            
            // Set up YOUR OWN participant entry (database rules only allow writing your own)
            await db.ref('dms/' + threadId + '/participants/' + currentUserId).set(true);
            
            // Update YOUR OWN DM inbox
            const now = Date.now();
            await db.ref('dmInbox/' + currentUserId + '/' + threadId).update({
              withUid: targetUid,
              withUsername: targetUsername,
              lastTime: now
            });
            
            // Try to set up the other user's participant entry (may fail due to permissions, that's ok)
            // They'll be added when they first access the thread
            try {
              await db.ref('dms/' + threadId + '/participants/' + targetUid).set(true);
              await db.ref('dmInbox/' + targetUid + '/' + threadId).update({
                withUid: currentUserId,
                withUsername: currentUsername,
                lastTime: now
              });
            } catch (e) {
              // Permission denied is expected if the other user needs to accept/open the DM first
              console.log('[profile-dm] could not set other user participant (expected):', e.message);
            }
            
            // Navigate to DM page
            const dmPage = document.getElementById('dmPage');
            const chatInterface = document.getElementById('chatInterface');
            
            if (dmPage && chatInterface) {
              chatInterface.classList.add('hidden');
              dmPage.classList.remove('hidden');
              
              // Open the DM thread
              openDmPageThread(targetUid, targetUsername, threadId);
            }
          } catch (e) {
            console.error('[profile-dm] error opening DM:', e);
            showToast("Error opening DM", "error");
          }
        });
      }

      
      async function acceptFriendRequest(fromUid) {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          logDetailedError("acceptFriendRequest", new Error("Not logged in"), { fromUid });
          return;
        }

        try {
          console.log("[friends] accepting request from:", fromUid);

          
          console.log("[friends] ensuring /friends paths exist");
          await ensureTargetFriendsList(uid);
          await ensureTargetFriendsList(fromUid);

          console.log("[friends] removing request from:", fromUid);
          
          await db.ref("friendRequests/" + uid + "/incoming/" + fromUid).remove();

          console.log("[friends] adding friend:", fromUid);
          
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

      
      // currentViewingUsername is now set directly inside viewUserProfile()

      
      let friendsFilterOnline = false;
      
      
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
            
            const youBlockedThem = await db.ref("blockedUsers/" + uid + "/" + friendUid).once("value");
            
            if (youBlockedThem.exists()) {
              console.log("[friends] skipping blocked user:", friendUid);
              continue;
            }
            
            
            const isOnline = isUserOnline(friendUid);
            
            
            if (filterOnlineOnly && !isOnline) {
              continue;
            }
            
            visibleCount++;

            const addedAt = new Date(friendData.addedAt).toLocaleDateString();

            const div = document.createElement("div");
            div.className = "p-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors cursor-pointer border border-slate-700/50";
            div.dataset.friendUid = friendUid;
            
            
            const avatarContainer = document.createElement("div");
            avatarContainer.className = "relative flex-shrink-0";
            
            const avatarDiv = document.createElement("div");
            avatarDiv.className = "h-10 w-10 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white text-sm font-bold relative";
            avatarDiv.innerHTML = "?";
            
            
            const onlineDot = document.createElement("span");
            onlineDot.className = `absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-800 ${isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`;
            
            avatarContainer.appendChild(avatarDiv);
            avatarContainer.appendChild(onlineDot);
            
            const infoDiv = document.createElement("div");
            infoDiv.className = "flex flex-col flex-1 ml-3";
            infoDiv.innerHTML = `
              <span class="text-sm font-medium text-slate-100">Loading...</span>
              <span class="text-xs text-slate-400">${isOnline ? '<span class="text-emerald-400">Online</span> \u2022 ' : ''}Added ${addedAt}</span>
            `;
            
            const container = document.createElement("div");
            container.className = "flex items-center gap-3 flex-1";
            container.appendChild(avatarContainer);
            container.appendChild(infoDiv);
            
            div.appendChild(container);
            
            
            ((friendUid, isOnline, addedAt) => {
              (async () => {
                try {
                  const userSnap = await db.ref("users/" + friendUid + "/username").once("value");
                  const friendUsername = userSnap.val() || "Unknown";
                  
                  
                  avatarDiv.innerHTML = friendUsername.charAt(0).toUpperCase();
                  infoDiv.innerHTML = `
                    <span class="text-sm font-medium text-slate-100">${escapeHtml(friendUsername)}</span>
                    <span class="text-xs text-slate-400">${isOnline ? '<span class="text-emerald-400">Online</span> \u2022 ' : ''}Added ${addedAt}</span>
                  `;
                  
                  
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
                      
                    }
                  }
                  
                  
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
          
          
          if (visibleCount === 0) {
            noFriendsMsg.style.display = "block";
            noFriendsMsg.textContent = filterOnlineOnly ? "No friends online" : "No friends yet";
          } else {
            noFriendsMsg.style.display = "none";
            noFriendsMsg.textContent = "No friends yet";
          }
        } catch (err) {
          logDetailedError("loadFriendsList", err, { uid });
          showToast("Error loading friends", "error");
        }
      }
      
      
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

            
            await loadBlockedUsersCache();
            startMessagesListener();

            
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

          
          const snap = await db.ref("users").orderByChild("username").equalTo(currentViewingUsername).once("value");
          if (!snap.exists()) {
            showToast("User not found", "error");
            blockUserBtn.disabled = false;
            blockUserBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Block User';
            return;
          }

          const targetUid = Object.keys(snap.val())[0];

          
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

          
          await db.ref("friends/" + uid + "/" + targetUid).remove();
          await db.ref("friends/" + targetUid + "/" + uid).remove();

          
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

              
              (async () => {
                try {
                  const usernameSnap = await db.ref("users/" + item.blockedUid + "/username").once("value");
                  const username = usernameSnap.val() || "Unknown User";
                  const blockedDate = new Date(item.blockedAt).toLocaleDateString();
                  
                  div.innerHTML = `
                    <div>
                      <span class="text-sm font-medium text-slate-100">${escapeHtml(username)}</span>
                      <span class="text-xs text-slate-400 block">Blocked ${blockedDate}</span>
                    </div>
                    <button class="unblock-btn px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-colors" data-blocked-uid="${item.blockedUid}">
                      Unblock
                    </button>
                  `;

                  
                  const unblockBtn = div.querySelector(".unblock-btn");
                  unblockBtn.addEventListener("click", async () => {
                    if (!confirm(`Unblock ${username}?`)) return;

                    try {
                      console.log("[block] unblocking:", username);
                      await db.ref("blockedUsers/" + uid + "/" + item.blockedUid).remove();
                      console.log("[block] unblocked successfully");
                      
                      
                      await loadBlockedUsersCache();
                      startMessagesListener();
                      
                      
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
          
          // Use server-side filtering with limitToFirst to avoid downloading all users
          const queryLower = query.toLowerCase();
          const snap = await db.ref("users")
            .orderByChild("usernameLower")
            .startAt(queryLower)
            .endAt(queryLower + "\uf8ff")
            .limitToFirst(20)
            .once("value");
          let users = snap.val();
          
          // Fallback: if no results with usernameLower index, try full download with limit
          if (!users) {
            const fallbackSnap = await db.ref("users").limitToFirst(500).once("value");
            users = fallbackSnap.val();
          }
          
          if (!users) {
            searchResults.innerHTML = '<p class="text-xs text-slate-400 p-2">No users found</p>';
            return;
          }

          const results = [];

          for (const [userId, userData] of Object.entries(users)) {
            if (userId === uid) continue; 
            
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

          
          results.sort((a, b) => a.username.localeCompare(b.username));

          
          searchResults.innerHTML = "";

          for (const user of results) {
            const div = document.createElement("div");
            div.className = "flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer";
            
            
            const profileSnap = await db.ref("userProfiles/" + user.uid).once("value");
            const profile = profileSnap.val() || {};
            
            const avatarHTML = profile.profilePic
              ? `<img src="${escapeHtml(profile.profilePic)}" class="h-10 w-10 rounded-full object-cover" />`
              : generateDefaultAvatar(user.username);

            div.innerHTML = `
              <div class="flex items-center gap-3 flex-1">
                <div class="h-10 w-10 rounded-full overflow-hidden">
                  ${avatarHTML}
                </div>
                <div>
                  <p class="text-sm font-medium text-slate-100">${escapeHtml(user.username)}</p>
                  <p class="text-xs text-slate-400">${escapeHtml(profile.bio || "No bio")}</p>
                </div>
              </div>
              <button class="add-friend-btn px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-colors" data-username="${escapeHtml(user.username)}">
                Add Friend
              </button>
            `;

            
            const userInfoDiv = div.querySelector("div.flex-1");
            userInfoDiv.addEventListener("click", () => {
              viewUserProfile(user.username);
            });

            
            const addBtn = div.querySelector(".add-friend-btn");
            
            
            (async () => {
              try {
                
                const youBlockedThem = await db.ref("blockedUsers/" + uid + "/" + user.uid).once("value");
                if (youBlockedThem.exists()) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(100, 116, 139)";
                  addBtn.textContent = "Blocked";
                  return;
                }

                
                const privacySnap = await db.ref("userPrivacy/" + user.uid).once("value");
                const privacy = privacySnap.val() || {};
                
                if (privacy.allowFriendRequests === false) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(100, 116, 139)";
                  addBtn.textContent = "Disabled";
                  return;
                }

                
                const friendsSnap = await db.ref("friends/" + uid + "/" + user.uid).once("value");
                if (friendsSnap.exists()) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(34, 197, 94)";
                  addBtn.textContent = "✓ Friends";
                  return;
                }

                
                const sentReqSnap = await db.ref("friendRequests/" + user.uid + "/incoming/" + uid).once("value");
                if (sentReqSnap.exists()) {
                  addBtn.disabled = true;
                  addBtn.style.background = "rgb(100, 116, 139)";
                  addBtn.textContent = "Pending";
                  return;
                }

                
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

      
      const imageViewerModal = document.getElementById("imageViewerModal");
      const imageViewerImg = document.getElementById("imageViewerImg");
      const closeImageViewer = document.getElementById("closeImageViewer");

      function openImageViewer(imageUrl) {
        imageViewerImg.src = imageUrl;
        imageViewerModal.style.display = "flex";
        document.body.style.overflow = "hidden";
        // Scan image in viewer for NSFW
        if (typeof scanDisplayedImage === 'function') scanDisplayedImage(imageViewerImg);
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

      
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && imageViewerModal.style.display === "flex") {
          closeImageViewerFunc();
        }
      });

      
      const deleteMessageModal = document.getElementById("deleteMessageModal");
      const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
      const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
      let pendingDeleteMessageId = null;
      let pendingDeleteToken = null;
      let pendingDeleteOptions = null; 

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

        
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.innerHTML = '<span class="animate-pulse">Deleting...</span>';

        try {
          if (pendingDeleteOptions && pendingDeleteOptions.isDm) {
            await deleteDmMessage(pendingDeleteOptions.threadId, pendingDeleteMessageId, pendingDeleteToken);
          } else if (pendingDeleteOptions && pendingDeleteOptions.isGroup && pendingDeleteOptions.groupId) {
            await deleteGroupMessage(pendingDeleteOptions.groupId, pendingDeleteMessageId, pendingDeleteToken);
          } else if (!pendingDeleteOptions?.isDm && !pendingDeleteOptions?.isGroup && activeGroupId) {
            // Only fall back to activeGroupId if no explicit options were set
            await deleteGroupMessage(activeGroupId, pendingDeleteMessageId, pendingDeleteToken);
          } else {
            await deleteMessage(pendingDeleteMessageId, pendingDeleteToken);
          }
          
          
          confirmDeleteBtn.innerHTML = '✓ Deleted';
          confirmDeleteBtn.className = "flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium";
          
          setTimeout(() => {
            closeDeleteMessageModal();
            
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = 'Delete';
            confirmDeleteBtn.className = "flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium";
          }, 800);
        } catch (err) {
          
          confirmDeleteBtn.innerHTML = '✗ Failed';
          confirmDeleteBtn.className = "flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium";
          
          setTimeout(() => {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = 'Delete';
            confirmDeleteBtn.className = "flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium";
          }, 2000);
        }
      });

      
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && deleteMessageModal.classList.contains("modal-open")) {
          closeDeleteMessageModal();
        }
      });

      
      async function reportMessage(messageId, messageData, reportedUsername, reason) {
        if (!messageId || !currentUserId || !currentUsername) {
          console.error("[report] missing required data");
          return;
        }

        
        let finalReason = reason;
        if (!finalReason || typeof finalReason !== 'string' || finalReason.trim() === "") {
          finalReason = prompt(`Report message from ${reportedUsername}?\n\nPlease describe the issue:\n(e.g., "Harassment", "Threats", "Spam", "Inappropriate content")`);
        }

        if (!finalReason || finalReason.trim() === "") {
          return; 
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
            status: "pending", 
          };

          
          await db.ref("reports").push(reportData);

          
          try {
            reportedMessages.add(messageId);
            const row = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
            if (row) {
              
              const reportBtn = row.querySelector('button[title="Report message"]');
              if (reportBtn && reportBtn.parentElement) {
                reportBtn.parentElement.removeChild(reportBtn);
              }
              const bubbleContainer = row.querySelector('.relative');
              if (bubbleContainer) {
                
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

          
          if (activeInlineReport && activeInlineReport.messageId === messageId) {
            try { cancelInlineReport(); } catch(_) {}
          }

          console.log("[report] message reported successfully:", messageId);
        } catch (err) {
          console.error("[report] error submitting report:", err);
          
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

      
      const walkthroughSteps = [
        {
          target: null, 
          title: "Welcome to Chatra! ðŸ‘‹",
          desc: "Let's take a quick 1-minute tour to help you get the most out of Chatra. You can skip this anytime.",
          position: "center"
        },
        {
          target: "#msgInput",
          title: "Send Messages 💬",
          desc: "Type your message here and press Enter or click Send. You can chat with everyone in the Global Chat!",
          position: "top"
        },
        {
          target: "#mediaUploadBtn",
          title: "Share Media 📷",
          desc: "Click here to upload images or videos to share with others. Supports most common formats.",
          position: "top"
        },
        {
          target: "#menuToggle",
          title: "Open the Menu ☰",
          desc: "Click the menu button (three dots) to access your profile, settings, friends, DMs, Patch Notes, Suggestions & Help (submit suggestions, bug reports, ideas, or ban appeals), and more!",
          position: "bottom"
        },
        {
          target: "#navDMs",
          title: "Direct Messages 📨",
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
          title: "Chat Area 📜",
          desc: "Messages appear here. You can reply to messages, react to them, and report inappropriate content.",
          position: "left"
        },
        {
          target: null, 
          title: "You're All Set! 🎉",
          desc: "That's the basics! Explore the menu for more features like adding friends, customizing your profile, and adjusting settings. Have fun chatting!",
          position: "center"
        }
      ];

      
      async function checkWalkthroughStatus() {
        if (!currentUserId) return false;
        
        try {
          
          const walkthroughSnap = await db.ref("userSettings/" + currentUserId + "/walkthroughCompleted").once("value");
          if (walkthroughSnap.val() === true) {
            console.log("[walkthrough] already completed");
            return false;
          }

          
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

          
          console.log("[walkthrough] new user, showing walkthrough");
          return true;
        } catch (err) {
          console.warn("[walkthrough] error checking status:", err);
          return false;
        }
      }

      
      async function startWalkthrough() {
        const shouldShow = await checkWalkthroughStatus();
        if (!shouldShow) return;

        walkthroughActive = true;
        walkthroughStep = 0;
        walkthroughOverlay.classList.remove("hidden");
        showWalkthroughStep(0);
      }

      
      function showWalkthroughStep(stepIndex) {
        const step = walkthroughSteps[stepIndex];
        if (!step) return;

        
        walkthroughStepBadge.textContent = `Step ${stepIndex + 1} of ${walkthroughSteps.length}`;

        
        walkthroughTitle.textContent = step.title;
        walkthroughDesc.textContent = step.desc;

        
        const progress = ((stepIndex + 1) / walkthroughSteps.length) * 100;
        walkthroughProgress.style.width = progress + "%";

        
        walkthroughPrevBtn.disabled = stepIndex === 0;
        walkthroughNextBtn.textContent = stepIndex === walkthroughSteps.length - 1 ? "Finish ✓" : "Next →";

        
        if (step.target && step.position !== "center") {
          const targetEl = document.querySelector(step.target);
          if (targetEl) {
            positionHighlight(targetEl);
            positionTooltip(targetEl, step.position);
            walkthroughHighlight.classList.remove("hidden");
          } else {
            
            centerTooltip();
            walkthroughHighlight.classList.add("hidden");
          }
        } else {
          
          centerTooltip();
          walkthroughHighlight.classList.add("hidden");
        }
      }

      
      function positionHighlight(targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const padding = 8;
        
        walkthroughHighlight.style.top = (rect.top - padding) + "px";
        walkthroughHighlight.style.left = (rect.left - padding) + "px";
        walkthroughHighlight.style.width = (rect.width + padding * 2) + "px";
        walkthroughHighlight.style.height = (rect.height + padding * 2) + "px";
      }

      
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

        
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (left < margin) left = margin;
        if (left + tooltipRect.width > vw - margin) left = vw - tooltipRect.width - margin;
        if (top < margin) top = margin;
        if (top + tooltipRect.height > vh - margin) top = vh - tooltipRect.height - margin;

        walkthroughTooltip.style.top = top + "px";
        walkthroughTooltip.style.left = left + "px";
      }

      
      function centerTooltip() {
        walkthroughTooltip.style.top = "50%";
        walkthroughTooltip.style.left = "50%";
        walkthroughTooltip.style.transform = "translate(-50%, -50%)";
        
        
        requestAnimationFrame(() => {
          const rect = walkthroughTooltip.getBoundingClientRect();
          walkthroughTooltip.style.top = (window.innerHeight / 2 - rect.height / 2) + "px";
          walkthroughTooltip.style.left = (window.innerWidth / 2 - rect.width / 2) + "px";
          walkthroughTooltip.style.transform = "";
        });
      }

      
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

      
      async function skipWalkthrough() {
        await completeWalkthrough();
      }

      
      function nextWalkthroughStep() {
        if (walkthroughStep < walkthroughSteps.length - 1) {
          walkthroughStep++;
          showWalkthroughStep(walkthroughStep);
        } else {
          completeWalkthrough();
        }
      }

      
      function prevWalkthroughStep() {
        if (walkthroughStep > 0) {
          walkthroughStep--;
          showWalkthroughStep(walkthroughStep);
        }
      }

      
      if (walkthroughNextBtn) {
        walkthroughNextBtn.addEventListener("click", nextWalkthroughStep);
      }
      if (walkthroughPrevBtn) {
        walkthroughPrevBtn.addEventListener("click", prevWalkthroughStep);
      }
      if (walkthroughSkipBtn) {
        walkthroughSkipBtn.addEventListener("click", skipWalkthrough);
      }

      
      window.addEventListener("resize", () => {
        if (walkthroughActive) {
          showWalkthroughStep(walkthroughStep);
        }
      });

      
      window.startWalkthrough = startWalkthrough;

