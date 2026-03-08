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
  let devicePickerOpen = false;

  // Detect iPad / iOS Safari early
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // STUN/TURN servers — Google public + Metered free TURN for NAT traversal
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];

  // Preferred video constraints — 1080p 60fps, graceful fallback
  function getVideoConstraints() {
    const ideal = {
      width: { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 },
      frameRate: { ideal: 60, min: 30 },
      facingMode: usingFrontCam ? 'user' : 'environment'
    };
    // Safari / iPad sometimes chokes on width/height ideal, so simplify
    if (isIOS || isSafari) {
      return {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
        facingMode: usingFrontCam ? 'user' : 'environment'
      };
    }
    return ideal;
  }

  // ── Firebase helpers ───────────────────────────────────
  function getDb() { return firebase.database(); }
  function getAuth() { return firebase.auth(); }
  function myUid() { return getAuth().currentUser && getAuth().currentUser.uid; }

  // ── Device Enumeration ─────────────────────────────────
  async function getDevices() {
    // Need a temporary stream to trigger permission prompt so labels are visible
    let tempStream = null;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      // If labels are empty, we need permission first
      if (devices.length && devices[0].label === '') {
        tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
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

  // ── Media ──────────────────────────────────────────────
  async function acquireMedia() {
    const videoConstraint = selectedVideoDeviceId
      ? { deviceId: { exact: selectedVideoDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
      : getVideoConstraints();
    const audioConstraint = selectedAudioDeviceId
      ? { deviceId: { exact: selectedAudioDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

    const constraints = { video: videoConstraint, audio: audioConstraint };
    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      // Fallback: lower resolution, keep device selection
      console.warn('[VideoCall] HD failed, falling back', e);
      const fbVideo = selectedVideoDeviceId
        ? { deviceId: { exact: selectedVideoDeviceId } }
        : { facingMode: usingFrontCam ? 'user' : 'environment' };
      const fbAudio = selectedAudioDeviceId
        ? { deviceId: { exact: selectedAudioDeviceId } }
        : true;
      localStream = await navigator.mediaDevices.getUserMedia({ video: fbVideo, audio: fbAudio });
    }
    return localStream;
  }

  function stopMedia() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
  }

  // ── Peer Connection ────────────────────────────────────
  function createPeerConnection(callId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Prefer high-bitrate for 1080p
    pc.addEventListener('negotiationneeded', async () => {
      // handled by offer/answer flow
    });

    // Send ICE candidates to Firebase
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && callId) {
        const side = isCaller ? 'callerCandidates' : 'calleeCandidates';
        getDb().ref('calls/' + callId + '/' + side).push(event.candidate.toJSON());
      }
    });

    // Receive remote stream
    pc.addEventListener('track', (event) => {
      const remoteVideo = document.getElementById('vcRemoteVideo');
      const waitingEl = document.getElementById('vcWaiting');
      if (remoteVideo && event.streams && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.classList.remove('hidden');
        // Safari needs explicit play()
        remoteVideo.play().catch(() => {});
        if (waitingEl) waitingEl.classList.add('hidden');
        // Start timer when connected
        if (!callStartTime) {
          callStartTime = Date.now();
          startTimer();
        }
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log('[VideoCall] ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        endCall();
      }
    });

    peerConnection = pc;
    return pc;
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

      // Listen for answer
      callRef.child('answer').on('value', async (snap) => {
        const answer = snap.val();
        if (answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      // Listen for callee ICE candidates
      callRef.child('calleeCandidates').on('child_added', (snap) => {
        const candidate = snap.val();
        if (candidate) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
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

      // Listen for caller ICE candidates
      callRef.child('callerCandidates').on('child_added', (snap) => {
        const candidate = snap.val();
        if (candidate) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
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
    stopTimer();

    if (callRef) {
      callRef.update({ status: 'ended' }).catch(() => {});
      callRef.child('answer').off();
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
    devicePickerOpen = false;

    hideCallUI();
    hideIncomingUI();
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
      </div>
      <div id="vcDevicePicker" class="vc-device-picker hidden"></div>
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
    localStream.getVideoTracks().forEach(t => t.stop());

    const videoConstraint = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
      : getVideoConstraints();

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: false });
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
    } catch (err) {
      console.warn('[VideoCall] switchVideoDevice failed', err);
      if (!deviceId) usingFrontCam = !usingFrontCam;
    }
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

    const [videoDevices, audioDevices] = await Promise.all([getVideoDevices(), getAudioDevices()]);

    // Determine currently active device IDs from tracks
    const activeVideoId = localStream && localStream.getVideoTracks()[0]
      ? localStream.getVideoTracks()[0].getSettings().deviceId : null;
    const activeAudioId = localStream && localStream.getAudioTracks()[0]
      ? localStream.getAudioTracks()[0].getSettings().deviceId : null;

    let html = '';

    if (videoDevices.length > 1) {
      html += '<div class="vc-picker-section"><div class="vc-picker-label">Camera</div>';
      videoDevices.forEach((d, i) => {
        const active = d.deviceId === activeVideoId;
        const name = d.label || ('Camera ' + (i + 1));
        html += '<button class="vc-picker-item' + (active ? ' active' : '') + '" data-type="video" data-id="' + escapeHtml(d.deviceId) + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' +
          '<span>' + escapeHtml(name) + '</span>' +
          (active ? '<span class="vc-picker-check">✓</span>' : '') +
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
          (active ? '<span class="vc-picker-check">✓</span>' : '') +
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
        } else {
          await switchAudioDevice(id);
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
