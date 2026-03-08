// Chatra Video Calling — WebRTC + Firebase Signaling
// Targets 1080p 60fps, iPad/Safari compatible

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let localStream = null;
  let peerConnection = null;
  let callRef = null;         // Firebase ref for this call
  let candidatesRef = null;   // ICE candidates ref
  let callListenerOff = null; // detach function
  let incomingRef = null;     // listener for incoming calls
  let ringtoneInterval = null;
  let timerInterval = null;
  let callStartTime = 0;
  let currentCallId = null;
  let currentPeerUid = null;
  let currentPeerName = null;
  let isCaller = false;
  let camMuted = false;
  let micMuted = false;
  let usingFrontCam = true;
  let selectedVideoDeviceId = null; // null = default
  let selectedAudioDeviceId = null; // null = default
  let selectedOutputDeviceId = null; // null = default (speaker output)
  let devicePickerOpen = false;
  let disconnectTimer = null; // timer for ICE disconnected recovery
  let pendingCandidates = []; // queue ICE candidates until remote description is set
  let remoteStream = null;    // single persistent remote MediaStream
  let playRetryTimer = null;  // retry .play() for Safari

  // Detect iPad / iOS Safari early
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isEdge = /Edg\//i.test(navigator.userAgent);

  // STUN/TURN servers — Google STUN + Metered TURN relay for NAT traversal
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Free TURN relay — needed when both peers are behind symmetric NAT (school networks)
    { urls: 'turn:a.relay.metered.ca:80', username: 'e44b2c44e7d089613232af0f', credential: 'ZYvJLJQBNVfOz4o5' },
    { urls: 'turn:a.relay.metered.ca:80?transport=tcp', username: 'e44b2c44e7d089613232af0f', credential: 'ZYvJLJQBNVfOz4o5' },
    { urls: 'turn:a.relay.metered.ca:443', username: 'e44b2c44e7d089613232af0f', credential: 'ZYvJLJQBNVfOz4o5' },
    { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'e44b2c44e7d089613232af0f', credential: 'ZYvJLJQBNVfOz4o5' }
  ];

  // Preferred video constraints — 1080p 60fps, graceful fallback
  function getVideoConstraints() {
    // Edge chokes on min constraints and facingMode on desktop
    if (isEdge) {
      return {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 }
      };
    }
    // Safari / iPad — keep facingMode but drop min constraints
    if (isIOS || isSafari) {
      return {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
        facingMode: usingFrontCam ? 'user' : 'environment'
      };
    }
    return {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60, min: 30 },
      facingMode: usingFrontCam ? 'user' : 'environment'
    };
  }

  // ── Firebase helpers ───────────────────────────────────
  function getDb() { return firebase.database(); }
  function getAuth() { return firebase.auth(); }
  function myUid() { return getAuth().currentUser && getAuth().currentUser.uid; }

  // ── Device Enumeration ─────────────────────────────────
  async function getDevices() {
    // If we already have a stream, permission is granted — enumerate directly
    if (localStream) {
      try { return await navigator.mediaDevices.enumerateDevices(); } catch (e) { return []; }
    }
    let tempStream = null;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (devices.length && devices[0].label === '') {
        // Try video+audio first, fall back to audio-only (Edge camera may be locked)
        try {
          tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (_) {
          try { tempStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_2) {}
        }
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      if (tempStream) tempStream.getTracks().forEach(t => t.stop());
      return all;
    } catch (e) {
      if (tempStream) tempStream.getTracks().forEach(t => t.stop());
      console.warn('[VideoCall] enumerateDevices failed', e);
      return [];
    }
  }

  async function getVideoDevices() {
    const all = await getDevices();
    return all.filter(d => d.kind === 'videoinput');
  }

  async function getAudioDevices() {
    const all = await getDevices();
    return all.filter(d => d.kind === 'audioinput');
  }

  async function getOutputDevices() {
    const all = await getDevices();
    return all.filter(d => d.kind === 'audiooutput');
  }

  // ── Media ──────────────────────────────────────────────
  async function acquireMedia() {
    const videoConstraint = selectedVideoDeviceId
      ? { deviceId: { exact: selectedVideoDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
      : getVideoConstraints();
    const audioConstraint = selectedAudioDeviceId
      ? { deviceId: { exact: selectedAudioDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

    const constraints = { video: videoConstraint, audio: audioConstraint };
    const fbAudio = selectedAudioDeviceId
      ? { deviceId: { exact: selectedAudioDeviceId } }
      : true;

    // Progressive fallback chain for browser compatibility (Edge, Safari, etc.)
    const fallbacks = [
      constraints,
      // Drop resolution/fps, keep device if selected
      { video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true, audio: fbAudio },
      // Bare minimum video
      { video: true, audio: fbAudio },
      // Audio only
      { video: false, audio: fbAudio }
    ];

    for (let i = 0; i < fallbacks.length; i++) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia(fallbacks[i]);
        if (i > 0) console.warn('[VideoCall] Using fallback level', i);
        return localStream;
      } catch (e) {
        console.warn('[VideoCall] getUserMedia attempt', i, 'failed:', e.name);
        if (i === fallbacks.length - 1) throw e;
      }
    }
  }

  function stopMedia() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
  }

  // ── Peer Connection ────────────────────────────────────
  function createPeerConnection(callId) {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Send ICE candidates to Firebase
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && callId) {
        const side = isCaller ? 'callerCandidates' : 'calleeCandidates';
        getDb().ref('calls/' + callId + '/' + side).push(event.candidate.toJSON());
      }
    });

    // Log ICE gathering progress
    pc.addEventListener('icegatheringstatechange', () => {
      console.log('[VideoCall] ICE gathering state:', pc.iceGatheringState);
    });

    // Create a single persistent remote stream up front
    if (!remoteStream) remoteStream = new MediaStream();
    const remoteVideo = document.getElementById('vcRemoteVideo');
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream;
    }

    // Receive remote tracks
    pc.addEventListener('track', (event) => {
      console.log('[VideoCall] track event:', event.track.kind, 'readyState:', event.track.readyState, 'streams:', event.streams ? event.streams.length : 0);
      const rv = document.getElementById('vcRemoteVideo');
      const waitingEl = document.getElementById('vcWaiting');

      // Always add to our single persistent stream
      if (remoteStream) {
        const existing = remoteStream.getTracks().find(t => t.id === event.track.id);
        if (!existing) {
          remoteStream.addTrack(event.track);
          console.log('[VideoCall] Added remote track, total tracks:', remoteStream.getTracks().length);
        }
      }

      // Also listen for track ending/muting so we know
      event.track.addEventListener('ended', () => console.log('[VideoCall] Remote track ended:', event.track.kind));
      event.track.addEventListener('mute', () => console.log('[VideoCall] Remote track muted:', event.track.kind));
      event.track.addEventListener('unmute', () => {
        console.log('[VideoCall] Remote track unmuted:', event.track.kind);
        // Safari sometimes mutes then unmutes — re-trigger play
        if (rv && rv.paused) rv.play().catch(() => {});
      });

      if (rv) {
        if (rv.srcObject !== remoteStream) rv.srcObject = remoteStream;
        rv.classList.remove('hidden');

        // Set output device if selected
        if (selectedOutputDeviceId && typeof rv.setSinkId === 'function') {
          rv.setSinkId(selectedOutputDeviceId).catch(() => {});
        }

        // Play with retries for Safari autoplay restrictions
        const tryPlay = () => {
          const p = rv.play();
          if (p) p.catch((e) => console.warn('[VideoCall] play() blocked:', e.name));
        };
        tryPlay();
        if (!playRetryTimer) {
          let retries = 0;
          playRetryTimer = setInterval(() => {
            retries++;
            if (rv.paused) tryPlay();
            if (!rv.paused || retries >= 20) {
              clearInterval(playRetryTimer);
              playRetryTimer = null;
            }
          }, 500);
        }
      }
      if (waitingEl) waitingEl.classList.add('hidden');
      if (!callStartTime) {
        callStartTime = Date.now();
        startTimer();
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      const state = pc.iceConnectionState;
      console.log('[VideoCall] ICE state:', state);

      if (state === 'connected' || state === 'completed') {
        if (disconnectTimer) {
          clearTimeout(disconnectTimer);
          disconnectTimer = null;
        }
        const waitEl = document.getElementById('vcWaiting');
        if (waitEl) waitEl.classList.add('hidden');
      }

      if (state === 'disconnected') {
        const waitEl = document.getElementById('vcWaiting');
        if (waitEl) {
          waitEl.classList.remove('hidden');
          const p = waitEl.querySelector('p');
          if (p) p.textContent = 'Reconnecting...';
        }
        if (!disconnectTimer) {
          disconnectTimer = setTimeout(() => {
            disconnectTimer = null;
            if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
              // Try ICE restart before giving up
              console.warn('[VideoCall] ICE disconnected 15s, attempting restart');
              attemptIceRestart();
            }
          }, 15000);
        }
      }

      if (state === 'failed') {
        // Try ICE restart first, only end call if restart fails
        console.warn('[VideoCall] ICE failed, attempting restart');
        attemptIceRestart();
      }
    });

    peerConnection = pc;
    return pc;
  }

  // ICE restart — renegotiate without tearing down the call
  let iceRestartAttempts = 0;
  async function attemptIceRestart() {
    if (!peerConnection || !callRef || !isCaller) {
      // Only caller initiates ICE restart; callee just waits
      if (!isCaller && peerConnection && peerConnection.iceConnectionState === 'failed') {
        // Callee waits 10s for caller to restart, then ends
        setTimeout(() => {
          if (peerConnection && peerConnection.iceConnectionState === 'failed') {
            endCall();
          }
        }, 10000);
      }
      return;
    }
    iceRestartAttempts++;
    if (iceRestartAttempts > 3) {
      console.error('[VideoCall] ICE restart failed after 3 attempts');
      endCall();
      return;
    }
    try {
      console.log('[VideoCall] ICE restart attempt', iceRestartAttempts);
      const offer = await peerConnection.createOffer({ iceRestart: true });
      offer.sdp = setHighBitrate(offer.sdp);
      await peerConnection.setLocalDescription(offer);
      await callRef.update({
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null  // clear old answer so callee re-answers
      });
      // Clear old candidates
      await callRef.child('callerCandidates').remove();
      await callRef.child('calleeCandidates').remove();
      pendingCandidates = [];
    } catch (e) {
      console.error('[VideoCall] ICE restart error:', e);
      endCall();
    }
  }

  // Set SDP to prefer high bitrate
  function setHighBitrate(sdp) {
    // Increase video bitrate to ~6 Mbps for 1080p60
    // Modify the SDP b= line for video
    const lines = sdp.split('\r\n');
    const result = [];
    let isVideo = false;
    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);
      if (lines[i].startsWith('m=video')) {
        isVideo = true;
      } else if (lines[i].startsWith('m=')) {
        isVideo = false;
      }
      // Insert bandwidth after c= line in video section
      if (isVideo && lines[i].startsWith('c=')) {
        // Remove any existing b= line
        if (i + 1 < lines.length && lines[i + 1].startsWith('b=')) {
          i++; // skip old b= line
        }
        result.push('b=AS:6000');
      }
    }
    return result.join('\r\n');
  }

  // ── Calling Flow ───────────────────────────────────────

  // Start an outgoing call
  async function startCall(peerUid, peerUsername) {
    if (peerConnection) {
      if (typeof showToast === 'function') showToast('Already in a call', 'error');
      return;
    }
    const uid = myUid();
    if (!uid || uid === peerUid) return;

    currentPeerUid = peerUid;
    currentPeerName = peerUsername;
    isCaller = true;

    showCallUI(peerUsername, true);

    try {
      await acquireMedia();
      showLocalVideo();

      // If we only got audio (camera failed), show notice
      if (localStream && localStream.getVideoTracks().length === 0) {
        if (typeof showToast === 'function') showToast('Camera unavailable \u2014 audio only', 'info');
      }

      // Create call document in Firebase
      const callId = getDb().ref('calls').push().key;
      currentCallId = callId;
      callRef = getDb().ref('calls/' + callId);

      const pc = createPeerConnection(callId);

      // Create offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      // Boost bitrate in SDP
      offer.sdp = setHighBitrate(offer.sdp);
      await pc.setLocalDescription(offer);

      // Write to Firebase
      await callRef.set({
        callerUid: uid,
        calleeUid: peerUid,
        callerName: window.currentUsername || 'Unknown',
        calleeName: peerUsername,
        offer: { type: offer.type, sdp: offer.sdp },
        status: 'ringing',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });

      // Notify callee via their inbox
      await getDb().ref('callSignals/' + peerUid).set({
        callId: callId,
        callerUid: uid,
        callerName: window.currentUsername || 'Unknown',
        type: 'incoming',
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      // Listen for answer — MUST set remote description before adding ICE candidates
      callRef.child('answer').on('value', async (snap) => {
        const answer = snap.val();
        if (answer && pc.signalingState === 'have-local-offer') {
          console.log('[VideoCall] Caller: setting remote description (answer)');
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            // Flush any ICE candidates that arrived before the answer
            console.log('[VideoCall] Flushing', pendingCandidates.length, 'queued candidates');
            while (pendingCandidates.length) {
              const c = pendingCandidates.shift();
              pc.addIceCandidate(c).catch(() => {});
            }
            // Reset restart counter on successful reconnection
            iceRestartAttempts = 0;
          } catch (e) {
            console.error('[VideoCall] setRemoteDescription(answer) error:', e);
          }
        }
      });

      // Listen for callee ICE candidates — queue if remote description not yet set
      callRef.child('calleeCandidates').on('child_added', (snap) => {
        const candidate = snap.val();
        if (candidate) {
          const iceCandidate = new RTCIceCandidate(candidate);
          if (pc.remoteDescription && pc.remoteDescription.type) {
            pc.addIceCandidate(iceCandidate).catch(() => {});
          } else {
            console.log('[VideoCall] Queuing candidate (no remote desc yet)');
            pendingCandidates.push(iceCandidate);
          }
        }
      });

      // Listen for call status changes (declined/ended)
      callRef.child('status').on('value', (snap) => {
        const status = snap.val();
        if (status === 'declined' || status === 'ended') {
          if (status === 'declined' && typeof showToast === 'function') {
            showToast('Call declined', 'info');
          }
          endCall();
        }
      });

      // Auto-timeout after 45 seconds if not answered
      setTimeout(() => {
        if (callRef && !callStartTime) {
          callRef.child('status').once('value', (snap) => {
            if (snap.val() === 'ringing') {
              callRef.update({ status: 'missed' });
              if (typeof showToast === 'function') showToast('No answer', 'info');
              endCall();
            }
          });
        }
      }, 45000);

    } catch (err) {
      console.error('[VideoCall] startCall error', err);
      if (typeof showToast === 'function') showToast('Could not start call: ' + err.message, 'error');
      endCall();
    }
  }

  // Answer an incoming call
  async function answerCall(callId, callerUid, callerName) {
    if (peerConnection) {
      if (typeof showToast === 'function') showToast('Already in a call', 'error');
      return;
    }

    currentCallId = callId;
    currentPeerUid = callerUid;
    currentPeerName = callerName;
    isCaller = false;

    hideIncomingUI();
    showCallUI(callerName, false);

    try {
      await acquireMedia();
      showLocalVideo();

      callRef = getDb().ref('calls/' + callId);
      const pc = createPeerConnection(callId);

      // Get the offer
      const callSnap = await callRef.once('value');
      const callData = callSnap.val();
      if (!callData || !callData.offer) {
        throw new Error('Call data not found');
      }

      console.log('[VideoCall] Callee: setting remote description (offer)');
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));

      // Create answer
      const answer = await pc.createAnswer();
      answer.sdp = setHighBitrate(answer.sdp);
      await pc.setLocalDescription(answer);

      // Write answer to Firebase
      await callRef.update({
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active'
      });

      // NOW listen for caller ICE candidates — after both descriptions are set
      // Queue any that arrive during processing
      const calleePendingCandidates = [];
      let calleeRemoteReady = true; // remote desc already set above

      callRef.child('callerCandidates').on('child_added', (snap) => {
        const candidate = snap.val();
        if (candidate) {
          const iceCandidate = new RTCIceCandidate(candidate);
          pc.addIceCandidate(iceCandidate).catch((e) => {
            console.warn('[VideoCall] Callee addIceCandidate error:', e.name);
          });
        }
      });

      // Listen for ICE restart — caller may re-send offer
      callRef.child('offer').on('value', async (snap) => {
        const newOffer = snap.val();
        if (!newOffer || !pc || pc.signalingState === 'closed') return;
        // Only process if this is a NEW offer (ICE restart)
        if (pc.remoteDescription && pc.remoteDescription.sdp === newOffer.sdp) return;
        try {
          console.log('[VideoCall] Callee: received ICE restart offer');
          await pc.setRemoteDescription(new RTCSessionDescription(newOffer));
          const newAnswer = await pc.createAnswer();
          newAnswer.sdp = setHighBitrate(newAnswer.sdp);
          await pc.setLocalDescription(newAnswer);
          await callRef.update({ answer: { type: newAnswer.type, sdp: newAnswer.sdp } });
          console.log('[VideoCall] Callee: sent ICE restart answer');
        } catch (e) {
          console.error('[VideoCall] Callee ICE restart error:', e);
        }
      });

      // Listen for status changes
      callRef.child('status').on('value', (snap) => {
        const status = snap.val();
        if (status === 'ended') {
          endCall();
        }
      });

    } catch (err) {
      console.error('[VideoCall] answerCall error', err);
      if (typeof showToast === 'function') showToast('Could not answer call: ' + err.message, 'error');
      endCall();
    }
  }

  // Decline an incoming call
  function declineCall(callId) {
    hideIncomingUI();
    if (callId) {
      getDb().ref('calls/' + callId).update({ status: 'declined' });
      // Clear the signal
      const uid = myUid();
      if (uid) getDb().ref('callSignals/' + uid).remove();
    }
  }

  // End current call
  function endCall() {
    // Guard against double calls
    if (endCall._running) return;
    endCall._running = true;

    stopTimer();

    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }

    if (playRetryTimer) {
      clearInterval(playRetryTimer);
      playRetryTimer = null;
    }

    pendingCandidates = [];
    remoteStream = null;
    iceRestartAttempts = 0;

    if (callRef) {
      callRef.update({ status: 'ended' }).catch(() => {});
      callRef.child('answer').off();
      callRef.child('offer').off();
      callRef.child('callerCandidates').off();
      callRef.child('calleeCandidates').off();
      callRef.child('status').off();

      // Clean up call data after a delay
      const cRef = callRef;
      setTimeout(() => { cRef.remove().catch(() => {}); }, 5000);
      callRef = null;
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    stopMedia();

    // Clear signals
    const uid = myUid();
    if (uid) getDb().ref('callSignals/' + uid).remove().catch(() => {});

    currentCallId = null;
    currentPeerUid = null;
    currentPeerName = null;
    isCaller = false;
    camMuted = false;
    micMuted = false;
    callStartTime = 0;
    selectedVideoDeviceId = null;
    selectedAudioDeviceId = null;
    // Keep selectedOutputDeviceId across calls — user preference
    devicePickerOpen = false;

    hideCallUI();
    hideIncomingUI();
    endCall._running = false;
  }

  // ── Incoming Call Listener ─────────────────────────────
  function listenForIncomingCalls() {
    const uid = myUid();
    if (!uid) return;

    // Clean up old listener
    if (incomingRef) {
      incomingRef.off();
    }

    incomingRef = getDb().ref('callSignals/' + uid);
    incomingRef.on('value', (snap) => {
      const data = snap.val();
      if (!data || data.type !== 'incoming') return;
      if (peerConnection) {
        // Already in a call; auto-decline
        declineCall(data.callId);
        return;
      }
      showIncomingUI(data.callId, data.callerUid, data.callerName);
    });
  }

  function stopListeningForCalls() {
    if (incomingRef) {
      incomingRef.off();
      incomingRef = null;
    }
  }

  // ── UI Builders ────────────────────────────────────────

  function showCallUI(peerName, isOutgoing) {
    // Remove existing overlay just in case
    let overlay = document.getElementById('vcOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'vcOverlay';
    overlay.className = 'videocall-overlay';
    overlay.innerHTML = `
      <div class="videocall-status">
        <span class="vc-peer-name">${escapeHtml(peerName)}</span>
        <span id="vcTimer" class="vc-timer">00:00</span>
      </div>
      <div class="videocall-videos">
        <div id="vcWaiting" class="videocall-waiting">
          <div class="pulse-ring"></div>
          <p style="font-size:16px;font-weight:500;">${isOutgoing ? 'Calling...' : 'Connecting...'}</p>
        </div>
        <video id="vcRemoteVideo" class="videocall-remote hidden" autoplay playsinline></video>
        <video id="vcLocalVideo" class="videocall-local" autoplay playsinline muted></video>
      </div>
      <div class="videocall-controls">
        <button id="vcToggleMic" class="vc-btn vc-btn-toggle" title="Toggle microphone">
          <svg viewBox="0 0 24 24"><path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </button>
        <button id="vcToggleCam" class="vc-btn vc-btn-toggle" title="Toggle camera">
          <svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        </button>
        <button id="vcEndCall" class="vc-btn vc-btn-end" title="End call">
          <svg viewBox="0 0 24 24"><path d="M22.5 12.5c0-1-.8-1.5-1.5-1.5h-3c-.7 0-1.5.7-1.5 1.5v1c-1.2.5-2.5.8-4 .8s-2.8-.3-4-.8v-1C8.5 11.7 7.7 11 7 11H4c-.7 0-1.5.5-1.5 1.5S3.24 16 5 16.5c2 .6 4.5 1 7.5 1s5.5-.4 7.5-1c1.76-.5 2.5-3 2.5-4z" fill="white" stroke="none"/></svg>
        </button>
        <button id="vcFlipCam" class="vc-btn vc-btn-flip" title="Flip camera">
          <svg viewBox="0 0 24 24"><path d="M20 5h-3.17L15 3H9L7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><circle cx="12" cy="13" r="4"/><path d="M16 9l2-2m0 0l-2-2m2 2h-4" stroke="white" fill="none" stroke-width="1.5"/></svg>
        </button>
        <button id="vcDevicePickerBtn" class="vc-btn vc-btn-toggle" title="Switch camera or mic">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <div id="vcDevicePicker" class="vc-device-picker hidden"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Wire buttons
    document.getElementById('vcToggleMic').addEventListener('click', toggleMic);
    document.getElementById('vcToggleCam').addEventListener('click', toggleCam);
    document.getElementById('vcEndCall').addEventListener('click', () => endCall());
    document.getElementById('vcFlipCam').addEventListener('click', flipCamera);
    document.getElementById('vcDevicePickerBtn').addEventListener('click', toggleDevicePicker);

    // Prevent iOS scroll bounce
    overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  function hideCallUI() {
    const overlay = document.getElementById('vcOverlay');
    if (overlay) overlay.remove();
  }

  function showLocalVideo() {
    const localVideo = document.getElementById('vcLocalVideo');
    if (localVideo && localStream) {
      localVideo.srcObject = localStream;
      // Safari needs this explicit play
      localVideo.play().catch(() => {});
    }
  }

  function showIncomingUI(callId, callerUid, callerName) {
    // Remove existing
    hideIncomingUI();

    const modal = document.createElement('div');
    modal.id = 'vcIncoming';
    modal.className = 'videocall-incoming';
    modal.innerHTML = `
      <div class="videocall-incoming-card">
        <div class="caller-avatar">${escapeHtml((callerName || '?')[0].toUpperCase())}</div>
        <div class="caller-name">${escapeHtml(callerName || 'Unknown')}</div>
        <div class="caller-label">Incoming video call</div>
        <div class="videocall-incoming-actions">
          <button id="vcDeclineBtn" class="vc-decline-btn" title="Decline">
            <svg viewBox="0 0 24 24"><path d="M22.5 12.5c0-1-.8-1.5-1.5-1.5h-3c-.7 0-1.5.7-1.5 1.5v1c-1.2.5-2.5.8-4 .8s-2.8-.3-4-.8v-1C8.5 11.7 7.7 11 7 11H4c-.7 0-1.5.5-1.5 1.5S3.24 16 5 16.5c2 .6 4.5 1 7.5 1s5.5-.4 7.5-1c1.76-.5 2.5-3 2.5-4z" fill="white" stroke="none"/></svg>
          </button>
          <button id="vcAnswerBtn" class="vc-answer-btn" title="Answer">
            <svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('vcDeclineBtn').addEventListener('click', () => declineCall(callId));
    document.getElementById('vcAnswerBtn').addEventListener('click', () => answerCall(callId, callerUid, callerName));

    // Auto-dismiss after 45 seconds
    setTimeout(() => {
      if (document.getElementById('vcIncoming')) {
        declineCall(callId);
      }
    }, 45000);
  }

  function hideIncomingUI() {
    const modal = document.getElementById('vcIncoming');
    if (modal) modal.remove();
  }

  // ── Controls ───────────────────────────────────────────

  function toggleMic() {
    if (!localStream) return;
    micMuted = !micMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !micMuted; });
    const btn = document.getElementById('vcToggleMic');
    if (btn) btn.classList.toggle('off', micMuted);
  }

  function toggleCam() {
    if (!localStream) return;
    camMuted = !camMuted;
    localStream.getVideoTracks().forEach(t => { t.enabled = !camMuted; });
    const btn = document.getElementById('vcToggleCam');
    if (btn) btn.classList.toggle('off', camMuted);
    const localVideo = document.getElementById('vcLocalVideo');
    if (localVideo) localVideo.classList.toggle('hidden-video', camMuted);
  }

  async function flipCamera() {
    if (!localStream || !peerConnection) return;
    usingFrontCam = !usingFrontCam;
    selectedVideoDeviceId = null; // reset to let facingMode pick
    await switchVideoDevice(null);
  }

  // Switch video device mid-call (deviceId = null uses facingMode)
  async function switchVideoDevice(deviceId) {
    if (!localStream) return;
    // Stop existing video tracks FIRST so Edge releases the camera
    localStream.getVideoTracks().forEach(t => t.stop());

    const attempts = [];
    if (deviceId) {
      attempts.push({ deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } });
      attempts.push({ deviceId: { exact: deviceId } });
    } else {
      attempts.push(getVideoConstraints());
      attempts.push({ facingMode: usingFrontCam ? 'user' : 'environment' });
      attempts.push(true);
    }

    for (let i = 0; i < attempts.length; i++) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: attempts[i], audio: false });
        const newTrack = newStream.getVideoTracks()[0];

        const oldTrack = localStream.getVideoTracks()[0];
        if (oldTrack) localStream.removeTrack(oldTrack);
        localStream.addTrack(newTrack);

        if (peerConnection) {
          const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) await sender.replaceTrack(newTrack);
        }

        if (deviceId) selectedVideoDeviceId = deviceId;
        showLocalVideo();
        return; // success
      } catch (err) {
        console.warn('[VideoCall] switchVideoDevice attempt', i, 'failed:', err.name);
      }
    }
    // All attempts failed — if not using deviceId, revert flip
    if (!deviceId) usingFrontCam = !usingFrontCam;
    console.warn('[VideoCall] switchVideoDevice: all attempts failed');
  }

  // Switch audio device mid-call
  async function switchAudioDevice(deviceId) {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => t.stop());

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      const newTrack = newStream.getAudioTracks()[0];

      const oldTrack = localStream.getAudioTracks()[0];
      if (oldTrack) localStream.removeTrack(oldTrack);
      localStream.addTrack(newTrack);

      if (peerConnection) {
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender) await sender.replaceTrack(newTrack);
      }

      selectedAudioDeviceId = deviceId;
      if (micMuted) newTrack.enabled = false;
    } catch (err) {
      console.warn('[VideoCall] switchAudioDevice failed', err);
    }
  }

  // Switch audio output device (speaker/headphones)
  async function switchOutputDevice(deviceId) {
    selectedOutputDeviceId = deviceId;
    const rv = document.getElementById('vcRemoteVideo');
    if (rv && typeof rv.setSinkId === 'function') {
      try {
        await rv.setSinkId(deviceId);
        console.log('[VideoCall] Output device set to', deviceId);
      } catch (err) {
        console.warn('[VideoCall] setSinkId failed', err);
      }
    }
  }

  // ── Device Picker UI ───────────────────────────────────
  async function toggleDevicePicker() {
    const picker = document.getElementById('vcDevicePicker');
    if (!picker) return;
    if (!picker.classList.contains('hidden')) {
      picker.classList.add('hidden');
      devicePickerOpen = false;
      return;
    }
    devicePickerOpen = true;
    picker.innerHTML = '<p style="color:#94a3b8;font-size:13px;padding:8px 12px;">Loading devices...</p>';
    picker.classList.remove('hidden');

    const [videoDevices, audioDevices, outputDevices] = await Promise.all([
      getVideoDevices(), getAudioDevices(), getOutputDevices()
    ]);

    // Determine currently active device IDs from tracks
    const activeVideoId = localStream && localStream.getVideoTracks()[0]
      ? localStream.getVideoTracks()[0].getSettings().deviceId : null;
    const activeAudioId = localStream && localStream.getAudioTracks()[0]
      ? localStream.getAudioTracks()[0].getSettings().deviceId : null;
    // For output, check remoteVideo's sinkId or our stored preference
    const rv = document.getElementById('vcRemoteVideo');
    const activeOutputId = selectedOutputDeviceId || (rv && rv.sinkId) || '';

    let html = '';

    if (videoDevices.length > 1) {
      html += '<div class="vc-picker-section"><div class="vc-picker-label">Camera</div>';
      videoDevices.forEach((d, i) => {
        const active = d.deviceId === activeVideoId;
        const name = d.label || ('Camera ' + (i + 1));
        html += '<button class="vc-picker-item' + (active ? ' active' : '') + '" data-type="video" data-id="' + escapeHtml(d.deviceId) + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' +
          '<span>' + escapeHtml(name) + '</span>' +
          (active ? '<span class="vc-picker-check">\u2713</span>' : '') +
          '</button>';
      });
      html += '</div>';
    }

    if (audioDevices.length > 1) {
      html += '<div class="vc-picker-section"><div class="vc-picker-label">Microphone</div>';
      audioDevices.forEach((d, i) => {
        const active = d.deviceId === activeAudioId;
        const name = d.label || ('Mic ' + (i + 1));
        html += '<button class="vc-picker-item' + (active ? ' active' : '') + '" data-type="audio" data-id="' + escapeHtml(d.deviceId) + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>' +
          '<span>' + escapeHtml(name) + '</span>' +
          (active ? '<span class="vc-picker-check">\u2713</span>' : '') +
          '</button>';
      });
      html += '</div>';
    }

    // Output devices (speakers/headphones) — only shown if setSinkId is supported
    if (outputDevices.length > 0 && typeof HTMLMediaElement.prototype.setSinkId === 'function') {
      html += '<div class="vc-picker-section"><div class="vc-picker-label">Speaker</div>';
      outputDevices.forEach((d, i) => {
        const active = d.deviceId === activeOutputId || (!activeOutputId && d.deviceId === 'default');
        const name = d.label || ('Speaker ' + (i + 1));
        html += '<button class="vc-picker-item' + (active ? ' active' : '') + '" data-type="output" data-id="' + escapeHtml(d.deviceId) + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>' +
          '<span>' + escapeHtml(name) + '</span>' +
          (active ? '<span class="vc-picker-check">\u2713</span>' : '') +
          '</button>';
      });
      html += '</div>';
    }

    if (!html) {
      html = '<p style="color:#94a3b8;font-size:13px;padding:12px;">Only one camera and mic detected</p>';
    }

    picker.innerHTML = html;

    // Wire click handlers
    picker.querySelectorAll('.vc-picker-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        if (type === 'video') {
          await switchVideoDevice(id);
        } else if (type === 'audio') {
          await switchAudioDevice(id);
        } else if (type === 'output') {
          await switchOutputDevice(id);
        }
        // Re-render to update checkmarks
        toggleDevicePicker();
        setTimeout(toggleDevicePicker, 50);
      });
    });
  }

  // ── Timer ──────────────────────────────────────────────
  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      if (!callStartTime) return;
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const el = document.getElementById('vcTimer');
      if (el) el.textContent = mm + ':' + ss;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ── Util ───────────────────────────────────────────────
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text || ''));
    return div.innerHTML;
  }

  // ── Exports ────────────────────────────────────────────
  window.ChatraVideoCall = {
    startCall: startCall,
    answerCall: answerCall,
    declineCall: declineCall,
    endCall: endCall,
    listenForIncomingCalls: listenForIncomingCalls,
    stopListeningForCalls: stopListeningForCalls,
    isInCall: function () { return !!peerConnection; }
  };

})();
