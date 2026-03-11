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

  // Speaking indicator state
  let localAudioContext = null;
  let localAnalyser = null;
  let speakingCheckTimer = null;
  let isSpeakingLocal = false;
  let isSpeakingRemote = false;
  let remoteAudioContext = null;
  let remoteAnalyser = null;

  // Detect iPad / iOS Safari early
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isEdge = /Edg\//i.test(navigator.userAgent);

  // STUN + TURN servers for NAT traversal
  // TURN relay servers are critical for connections behind symmetric NATs
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Free TURN relay servers (Open Relay Project by Metered)
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'e8dd65b92f6bceea5c748e51',
      credential: 'kfm2QQqcGy/mj0jv'
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'e8dd65b92f6bceea5c748e51',
      credential: 'kfm2QQqcGy/mj0jv'
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'e8dd65b92f6bceea5c748e51',
      credential: 'kfm2QQqcGy/mj0jv'
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'e8dd65b92f6bceea5c748e51',
      credential: 'kfm2QQqcGy/mj0jv'
    }
  ];

  // ── Quality Settings & Presets ───────────────────────────
  const QUALITY_PRESETS = {
    '1080p': { width: 1920, height: 1080, maxBitrate: 6000 },
    '720p':  { width: 1280, height: 720,  maxBitrate: 2500 },
    '480p':  { width: 854,  height: 480,  maxBitrate: 1200 },
    '360p':  { width: 640,  height: 360,  maxBitrate: 600  }
  };

  // Current quality settings (loaded from localStorage)
  let qualitySettings = {
    quality: 'auto',      // 'auto', '1080p', '720p', '480p', '360p'
    fps: 'auto',          // 'auto', '60', '30', '24', '15'
    autoAdjust: true,
    showNetworkIndicator: true
  };

  function loadQualitySettings() {
    try {
      const saved = localStorage.getItem('chatra_call_quality');
      if (saved) {
        const parsed = JSON.parse(saved);
        qualitySettings = Object.assign(qualitySettings, parsed);
      }
    } catch (e) {}
    // Sync UI if settings modal is open
    syncQualityUI();
  }

  function saveQualitySettings() {
    try {
      localStorage.setItem('chatra_call_quality', JSON.stringify(qualitySettings));
    } catch (e) {}
  }

  function syncQualityUI() {
    const qs = document.getElementById('callQualitySelect');
    const fs = document.getElementById('callFpsSelect');
    const aa = document.getElementById('callAutoAdjustToggle');
    const ni = document.getElementById('callNetworkIndicatorToggle');
    if (qs) qs.value = qualitySettings.quality;
    if (fs) fs.value = qualitySettings.fps;
    if (aa) aa.checked = qualitySettings.autoAdjust;
    if (ni) ni.checked = qualitySettings.showNetworkIndicator;
  }

  function initQualitySettingsUI() {
    const qs = document.getElementById('callQualitySelect');
    const fs = document.getElementById('callFpsSelect');
    const aa = document.getElementById('callAutoAdjustToggle');
    const ni = document.getElementById('callNetworkIndicatorToggle');

    if (qs) qs.addEventListener('change', () => {
      qualitySettings.quality = qs.value;
      saveQualitySettings();
    });
    if (fs) fs.addEventListener('change', () => {
      qualitySettings.fps = fs.value;
      saveQualitySettings();
    });
    if (aa) aa.addEventListener('change', () => {
      qualitySettings.autoAdjust = aa.checked;
      saveQualitySettings();
    });
    if (ni) ni.addEventListener('change', () => {
      qualitySettings.showNetworkIndicator = ni.checked;
      saveQualitySettings();
      // Hide indicator if turned off mid-call
      const ind = document.getElementById('vcNetworkIndicator');
      if (ind) ind.classList.toggle('hidden', !ni.checked);
    });
  }

  // Get the target resolution based on quality setting and adaptive state
  function getTargetQuality() {
    const q = currentAdaptiveQuality || qualitySettings.quality;
    if (q === 'auto' || !QUALITY_PRESETS[q]) {
      // Default to 720p for auto — adaptive will scale up/down
      return QUALITY_PRESETS['720p'];
    }
    return QUALITY_PRESETS[q];
  }

  function getTargetFps() {
    if (qualitySettings.fps === 'auto') {
      return currentAdaptiveFps || 30;
    }
    return parseInt(qualitySettings.fps) || 30;
  }

  // ── Adaptive Bitrate State ─────────────────────────────
  let currentAdaptiveQuality = null; // null = use settings, or '720p' etc.
  let currentAdaptiveFps = null;
  let statsTimer = null;
  let prevStats = null;
  let networkQuality = 'good'; // 'excellent', 'good', 'fair', 'poor'
  let consecutivePoor = 0;
  let consecutiveGood = 0;

  // Preferred video constraints — 1080p 60fps, graceful fallback
  function getVideoConstraints() {
    const target = getTargetQuality();
    const fps = getTargetFps();

    // Edge chokes on min constraints and facingMode on desktop
    if (isEdge) {
      return {
        width: { ideal: target.width },
        height: { ideal: target.height },
        frameRate: { ideal: fps }
      };
    }
    // Safari / iPad — keep facingMode but drop min constraints
    if (isIOS || isSafari) {
      return {
        width: { ideal: target.width },
        height: { ideal: target.height },
        frameRate: { ideal: fps },
        facingMode: usingFrontCam ? 'user' : 'environment'
      };
    }
    return {
      width: { ideal: target.width },
      height: { ideal: target.height },
      frameRate: { ideal: fps, min: Math.min(15, fps) },
      facingMode: usingFrontCam ? 'user' : 'environment'
    };
  }

  // ── Firebase helpers ───────────────────────────────────
  function getDb() { return firebase.database(); }
  function getAuth() { return firebase.auth(); }
  function myUid() { return getAuth().currentUser && getAuth().currentUser.uid; }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text || ''));
    return div.innerHTML;
  }

  // Fetch a user's profile pic from Firebase (returns URL or null)
  async function fetchProfilePic(uid) {
    if (!uid) return null;
    try {
      const snap = await getDb().ref('users/' + uid + '/profilePic').once('value');
      return snap.val() || null;
    } catch (e) { return null; }
  }

  // Truncate long names with ellipsis
  function truncName(name, max) {
    if (!name) return 'Unknown';
    return name.length > max ? name.slice(0, max) + '..' : name;
  }

  // ── Speaking Indicator ─────────────────────────────────
  function startSpeakingDetection() {
    stopSpeakingDetection();
    // Local audio analysis
    if (localStream) {
      try {
        localAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = localAudioContext.createMediaStreamSource(localStream);
        localAnalyser = localAudioContext.createAnalyser();
        localAnalyser.fftSize = 256;
        localAnalyser.smoothingTimeConstant = 0.5;
        source.connect(localAnalyser);
      } catch (e) { console.warn('[VideoCall] Local audio analyser failed:', e); }
    }
    // Remote audio analysis
    if (remoteStream) {
      try {
        remoteAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const src = remoteAudioContext.createMediaStreamSource(remoteStream);
        remoteAnalyser = remoteAudioContext.createAnalyser();
        remoteAnalyser.fftSize = 256;
        remoteAnalyser.smoothingTimeConstant = 0.5;
        src.connect(remoteAnalyser);
      } catch (e) { console.warn('[VideoCall] Remote audio analyser failed:', e); }
    }

    speakingCheckTimer = setInterval(() => {
      // Check local speaking
      const wasLocal = isSpeakingLocal;
      if (localAnalyser) {
        const data = new Uint8Array(localAnalyser.frequencyBinCount);
        localAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        isSpeakingLocal = avg > 15;
      }
      if (isSpeakingLocal !== wasLocal) updateSpeakingUI('local', isSpeakingLocal);

      // Check remote speaking
      const wasRemote = isSpeakingRemote;
      if (remoteAnalyser) {
        const data = new Uint8Array(remoteAnalyser.frequencyBinCount);
        remoteAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        isSpeakingRemote = avg > 15;
      }
      if (isSpeakingRemote !== wasRemote) updateSpeakingUI('remote', isSpeakingRemote);
    }, 150);
  }

  function stopSpeakingDetection() {
    if (speakingCheckTimer) { clearInterval(speakingCheckTimer); speakingCheckTimer = null; }
    if (localAudioContext) { localAudioContext.close().catch(() => {}); localAudioContext = null; localAnalyser = null; }
    if (remoteAudioContext) { remoteAudioContext.close().catch(() => {}); remoteAudioContext = null; remoteAnalyser = null; }
    isSpeakingLocal = false;
    isSpeakingRemote = false;
  }

  function updateSpeakingUI(who, speaking) {
    if (who === 'local') {
      const el = document.getElementById('vcLocalVideo');
      if (el) el.classList.toggle('vc-speaking', speaking);
      // Also highlight camera-off overlay if cam is off
      const coff = document.getElementById('vcLocalCamOff');
      if (coff) coff.classList.toggle('vc-speaking', speaking);
    } else {
      const el = document.getElementById('vcRemoteVideo');
      if (el) el.classList.toggle('vc-speaking', speaking);
      const coff = document.getElementById('vcRemoteCamOff');
      if (coff) coff.classList.toggle('vc-speaking', speaking);
    }
  }

  // Connect remote stream to speaking analyser (called when remote tracks arrive)
  function hookRemoteSpeaking() {
    if (!remoteStream || remoteAudioContext) return;
    try {
      remoteAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      const src = remoteAudioContext.createMediaStreamSource(remoteStream);
      remoteAnalyser = remoteAudioContext.createAnalyser();
      remoteAnalyser.fftSize = 256;
      remoteAnalyser.smoothingTimeConstant = 0.5;
      src.connect(remoteAnalyser);
    } catch (e) {}
  }

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
    const config = {
      iceServers: ICE_SERVERS
    };
    // Safari does NOT support iceCandidatePoolSize — omit it entirely
    if (!isSafari && !isIOS) {
      config.iceCandidatePoolSize = 10;
    }
    const pc = new RTCPeerConnection(config);

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    } else if (isSafari || isIOS) {
      // Ensure transceivers exist even without local media so Safari negotiates receive channels
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    // Send ICE candidates to Firebase
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && callId) {
        const side = isCaller ? 'callerCandidates' : 'calleeCandidates';
        console.log('[VideoCall]', side, 'pushing candidate:', event.candidate.candidate.substring(0, 60));
        getDb().ref('calls/' + callId + '/' + side).push(event.candidate.toJSON());
      }
      if (!event.candidate) {
        console.log('[VideoCall] ICE gathering complete (null candidate)');
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
      event.track.addEventListener('ended', () => {
        console.log('[VideoCall] Remote track ended:', event.track.kind);
        if (event.track.kind === 'video') updateRemoteCamOff(true);
      });
      event.track.addEventListener('mute', () => {
        console.log('[VideoCall] Remote track muted:', event.track.kind);
        if (event.track.kind === 'video') updateRemoteCamOff(true);
      });
      event.track.addEventListener('unmute', () => {
        console.log('[VideoCall] Remote track unmuted:', event.track.kind);
        if (event.track.kind === 'video') updateRemoteCamOff(false);
        // Safari sometimes mutes then unmutes — re-trigger play
        if (rv && rv.paused) rv.play().catch(() => {});
      });

      // Hook remote audio for speaking detection
      if (event.track.kind === 'audio') hookRemoteSpeaking();

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
              console.warn('[VideoCall] ICE disconnected 8s, attempting restart');
              attemptIceRestart();
            }
          }, 8000);
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
    if (iceRestartAttempts > 5) {
      console.error('[VideoCall] ICE restart failed after 5 attempts');
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

  // Set SDP to prefer appropriate bitrate based on quality settings
  function setHighBitrate(sdp) {
    // Safari uses different SDP format — skip manipulation to avoid breaking negotiation
    if (isSafari || isIOS) return sdp;

    const target = getTargetQuality();
    const maxBitrate = target.maxBitrate || 2500;

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
        result.push('b=AS:' + maxBitrate);
      }
    }
    return result.join('\r\n');
  }

  // ── Video Health Check ──────────────────────────────────
  // Periodically checks remote video and re-plays if paused/stuck
  let videoHealthTimer = null;

  function startVideoHealthCheck() {
    stopVideoHealthCheck();
    videoHealthTimer = setInterval(() => {
      const rv = document.getElementById('vcRemoteVideo');
      if (!rv || !peerConnection) return;

      // If video element has srcObject with tracks but is paused, try playing
      if (rv.srcObject && rv.srcObject.getTracks().length > 0 && rv.paused) {
        console.log('[VideoCall] Health check: re-playing paused remote video');
        rv.play().catch(() => {});
      }

      // If remoteStream has tracks but video element lost them, reconnect
      if (remoteStream && remoteStream.getTracks().length > 0 && (!rv.srcObject || rv.srcObject.getTracks().length === 0)) {
        console.log('[VideoCall] Health check: reconnecting remote stream');
        rv.srcObject = remoteStream;
        rv.classList.remove('hidden');
        rv.play().catch(() => {});
      }

      // If connected but remote video still hidden, force show
      if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
        if (remoteStream && remoteStream.getVideoTracks().length > 0 && rv.classList.contains('hidden')) {
          rv.classList.remove('hidden');
          const waitEl = document.getElementById('vcWaiting');
          if (waitEl) waitEl.classList.add('hidden');
        }
      }
    }, 3000);
  }

  function stopVideoHealthCheck() {
    if (videoHealthTimer) {
      clearInterval(videoHealthTimer);
      videoHealthTimer = null;
    }
  }

  // ── Adaptive Bitrate & Network Quality Monitor ─────────
  // Monitors WebRTC stats every 2 seconds and adapts encoding parameters

  function startStatsMonitor() {
    stopStatsMonitor();
    prevStats = null;
    consecutivePoor = 0;
    consecutiveGood = 0;
    networkQuality = 'good';
    currentAdaptiveQuality = null;
    currentAdaptiveFps = null;

    statsTimer = setInterval(() => {
      if (!peerConnection) return;
      collectStats();
    }, 2000);
  }

  function stopStatsMonitor() {
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
    prevStats = null;
    const ind = document.getElementById('vcNetworkIndicator');
    if (ind) ind.remove();
  }

  async function collectStats() {
    if (!peerConnection) return;
    try {
      const stats = await peerConnection.getStats();
      let rtt = null;
      let packetLoss = 0;
      let bytesSent = 0;
      let bytesReceived = 0;
      let framesSent = 0;
      let framesReceived = 0;
      let jitter = 0;
      let timestamp = 0;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime != null) rtt = report.currentRoundTripTime * 1000; // to ms
        }
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          bytesSent = report.bytesSent || 0;
          framesSent = report.framesEncoded || 0;
          timestamp = report.timestamp;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          bytesReceived = report.bytesReceived || 0;
          framesReceived = report.framesDecoded || 0;
          if (report.packetsLost != null && report.packetsReceived != null) {
            const total = report.packetsReceived + report.packetsLost;
            if (total > 0) packetLoss = (report.packetsLost / total) * 100;
          }
          if (report.jitter != null) jitter = report.jitter * 1000; // to ms
        }
      });

      const current = { bytesSent, bytesReceived, framesSent, framesReceived, timestamp };

      if (prevStats && timestamp > prevStats.timestamp) {
        const dt = (timestamp - prevStats.timestamp) / 1000; // seconds
        const sendBitrate = ((bytesSent - prevStats.bytesSent) * 8) / (dt * 1000); // kbps
        const recvBitrate = ((bytesReceived - prevStats.bytesReceived) * 8) / (dt * 1000); // kbps
        const sendFps = (framesSent - prevStats.framesSent) / dt;
        const recvFps = (framesReceived - prevStats.framesReceived) / dt;

        // Evaluate network quality
        const quality = evaluateNetworkQuality(rtt, packetLoss, sendBitrate, recvBitrate, jitter);
        networkQuality = quality;

        // Update UI indicator
        updateNetworkIndicator(quality, rtt, sendBitrate, recvBitrate, sendFps, recvFps, packetLoss);

        // Adaptive adjustment
        if (qualitySettings.autoAdjust && qualitySettings.quality === 'auto') {
          adaptQuality(quality, sendBitrate, rtt, packetLoss);
        }

        console.log('[VideoCall] Stats: rtt=' + (rtt ? rtt.toFixed(0) + 'ms' : '?') +
          ' loss=' + packetLoss.toFixed(1) + '% send=' + sendBitrate.toFixed(0) + 'kbps' +
          ' recv=' + recvBitrate.toFixed(0) + 'kbps fps=' + sendFps.toFixed(0) +
          '/' + recvFps.toFixed(0) + ' quality=' + quality);
      }

      prevStats = current;
    } catch (e) {
      // getStats not available or failed
    }
  }

  function evaluateNetworkQuality(rtt, packetLoss, sendBitrate, recvBitrate, jitter) {
    // Score-based approach
    let score = 100;

    if (rtt != null) {
      if (rtt > 500) score -= 40;
      else if (rtt > 300) score -= 25;
      else if (rtt > 150) score -= 10;
    }

    if (packetLoss > 10) score -= 35;
    else if (packetLoss > 5) score -= 20;
    else if (packetLoss > 2) score -= 10;

    if (jitter > 100) score -= 15;
    else if (jitter > 50) score -= 8;

    // Low bitrate relative to target
    const target = getTargetQuality();
    if (sendBitrate > 0 && sendBitrate < target.maxBitrate * 0.2) score -= 20;
    else if (sendBitrate > 0 && sendBitrate < target.maxBitrate * 0.5) score -= 10;

    if (score >= 80) return 'excellent';
    if (score >= 55) return 'good';
    if (score >= 30) return 'fair';
    return 'poor';
  }

  function adaptQuality(quality, sendBitrate, rtt, packetLoss) {
    if (!peerConnection) return;

    const QUALITY_LADDER = ['360p', '480p', '720p', '1080p'];
    const FPS_LADDER = [15, 24, 30, 60];

    // Get current adaptive level
    const curQ = currentAdaptiveQuality || '720p';
    const curQIdx = QUALITY_LADDER.indexOf(curQ);
    const curFps = currentAdaptiveFps || 30;
    const curFIdx = FPS_LADDER.indexOf(curFps);

    if (quality === 'poor' || quality === 'fair') {
      consecutivePoor++;
      consecutiveGood = 0;
    } else {
      consecutiveGood++;
      consecutivePoor = 0;
    }

    let newQIdx = curQIdx;
    let newFIdx = curFIdx >= 0 ? curFIdx : 2;

    // Scale DOWN if poor for 2+ consecutive checks (4+ seconds)
    if (consecutivePoor >= 2) {
      // Drop FPS first, then resolution
      if (newFIdx > 0) {
        newFIdx--;
      } else if (newQIdx > 0) {
        newQIdx--;
        newFIdx = Math.min(2, FPS_LADDER.length - 1); // reset FPS to 30
      }
      consecutivePoor = 0; // reset so it doesn't keep dropping every cycle
    }

    // Scale UP if good for 5+ consecutive checks (10+ seconds)
    if (consecutiveGood >= 5) {
      // Raise FPS first, then resolution
      if (newFIdx < FPS_LADDER.length - 1) {
        newFIdx++;
      } else if (newQIdx < QUALITY_LADDER.length - 1) {
        newQIdx++;
        newFIdx = 2; // start at 30 FPS for new resolution
      }
      consecutiveGood = 0;
    }

    const newQ = QUALITY_LADDER[newQIdx];
    const newFps = FPS_LADDER[newFIdx];

    if (newQ !== curQ || newFps !== curFps) {
      console.log('[VideoCall] Adaptive: changing', curQ, curFps + 'fps ->', newQ, newFps + 'fps');
      currentAdaptiveQuality = newQ;
      currentAdaptiveFps = newFps;
      applyAdaptiveParams(newQ, newFps);
    }
  }

  async function applyAdaptiveParams(qualityKey, fps) {
    if (!peerConnection) return;

    const preset = QUALITY_PRESETS[qualityKey];
    if (!preset) return;

    // Use RTCRtpSender.setParameters to change encoding without renegotiation
    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (!sender) return;

    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = preset.maxBitrate * 1000; // kbps to bps
      params.encodings[0].maxFramerate = fps;

      // scaleResolutionDownBy — scale from actual captured to target
      // Only if we know the captured dimensions
      if (localStream) {
        const settings = localStream.getVideoTracks()[0]?.getSettings();
        if (settings && settings.width && settings.height) {
          const scaleFactor = Math.max(1, settings.width / preset.width);
          params.encodings[0].scaleResolutionDownBy = Math.round(scaleFactor * 10) / 10;
        }
      }

      await sender.setParameters(params);
    } catch (e) {
      console.warn('[VideoCall] setParameters failed:', e.message);
    }
  }

  function updateNetworkIndicator(quality, rtt, sendBitrate, recvBitrate, sendFps, recvFps, packetLoss) {
    if (!qualitySettings.showNetworkIndicator) return;

    const overlay = document.getElementById('vcOverlay');
    if (!overlay) return;

    let ind = document.getElementById('vcNetworkIndicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'vcNetworkIndicator';
      ind.className = 'vc-network-indicator';
      overlay.appendChild(ind);
    }

    const colors = { excellent: '#22c55e', good: '#22c55e', fair: '#eab308', poor: '#ef4444' };
    const labels = { excellent: 'Excellent', good: 'Good', fair: 'Unstable', poor: 'Poor' };
    const bars = quality === 'excellent' ? 4 : quality === 'good' ? 3 : quality === 'fair' ? 2 : 1;
    const color = colors[quality];

    let barsHtml = '';
    for (let i = 0; i < 4; i++) {
      const h = 4 + i * 4;
      const active = i < bars;
      barsHtml += '<div style="width:3px;height:' + h + 'px;border-radius:1px;background:' + (active ? color : 'rgba(255,255,255,0.2)') + ';"></div>';
    }

    const rttStr = rtt != null ? Math.round(rtt) + 'ms' : '--';
    const bitrateStr = sendBitrate > 1000 ? (sendBitrate / 1000).toFixed(1) + 'Mbps' : Math.round(sendBitrate) + 'kbps';

    ind.innerHTML = '<div class="vc-net-bars">' + barsHtml + '</div>' +
      '<span class="vc-net-label" style="color:' + color + '">' + labels[quality] + '</span>' +
      '<span class="vc-net-detail">' + rttStr + ' · ' + bitrateStr + '</span>';
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

    // Prime the remote video element for Safari — touch play() in user gesture chain
    // so later programmatic play() calls are allowed
    const warmRv = document.getElementById('vcRemoteVideo');
    if (warmRv) warmRv.play().catch(() => {});

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
      startCallChat(callId);
      startVideoHealthCheck();
      startStatsMonitor();
      startSpeakingDetection();

      // Apply initial quality params after first track is sent
      setTimeout(() => applyAdaptiveParams(
        currentAdaptiveQuality || (qualitySettings.quality === 'auto' ? '720p' : qualitySettings.quality),
        getTargetFps()
      ), 2000);

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
            await pc.setRemoteDescription(answer);
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
              // Log as unanswered outgoing call
              const uid = myUid();
              if (uid && currentPeerUid) {
                logCallHistory(uid, {
                  peerUid: currentPeerUid,
                  peerName: currentPeerName || 'Unknown',
                  type: 'outgoing',
                  callType: 'dm',
                  startedAt: Date.now(),
                  endedAt: Date.now(),
                  duration: 0
                });
              }
              // Clean up callee's signal so they don't see a stale incoming call
              if (currentPeerUid) {
                getDb().ref('callSignals/' + currentPeerUid).remove().catch(() => {});
              }
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

    // Prime the remote video element for Safari — touch play() in user gesture chain
    const warmRv = document.getElementById('vcRemoteVideo');
    if (warmRv) warmRv.play().catch(() => {});

    try {
      await acquireMedia();
      showLocalVideo();

      callRef = getDb().ref('calls/' + callId);
      const pc = createPeerConnection(callId);
      startCallChat(callId);
      startVideoHealthCheck();
      startStatsMonitor();
      startSpeakingDetection();

      // Apply initial quality params after connection
      setTimeout(() => applyAdaptiveParams(
        currentAdaptiveQuality || (qualitySettings.quality === 'auto' ? '720p' : qualitySettings.quality),
        getTargetFps()
      ), 2000);

      // Get the offer
      const callSnap = await callRef.once('value');
      const callData = callSnap.val();
      if (!callData || !callData.offer) {
        throw new Error('Call data not found');
      }

      console.log('[VideoCall] Callee: setting remote description (offer)');
      await pc.setRemoteDescription(callData.offer);

      // Create answer
      const answer = await pc.createAnswer();
      answer.sdp = setHighBitrate(answer.sdp);
      await pc.setLocalDescription(answer);

      console.log('[VideoCall] Callee: local/remote descriptions set, signaling:', pc.signalingState);

      // Write answer to Firebase
      await callRef.update({
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active'
      });

      console.log('[VideoCall] Callee: answer written to Firebase');

      // NOW listen for caller ICE candidates — after both descriptions are set
      callRef.child('callerCandidates').on('child_added', (snap) => {
        const candidate = snap.val();
        if (candidate) {
          const iceCandidate = new RTCIceCandidate(candidate);
          console.log('[VideoCall] Callee: adding caller candidate');
          pc.addIceCandidate(iceCandidate).catch((e) => {
            console.warn('[VideoCall] Callee addIceCandidate error:', e.name, e.message);
          });
        }
      });

      // Listen for ICE restart — caller may re-send offer
      // IMPORTANT: Track the raw Firebase SDP to detect changes.
      // Do NOT compare pc.remoteDescription.sdp (browser-normalized) with Firebase SDP.
      let lastOfferSdp = callData.offer.sdp;
      callRef.child('offer').on('value', async (snap) => {
        const newOffer = snap.val();
        if (!newOffer || !pc || pc.signalingState === 'closed') return;
        // Compare raw Firebase SDP against what we last processed
        if (newOffer.sdp === lastOfferSdp) return;
        lastOfferSdp = newOffer.sdp;
        try {
          console.log('[VideoCall] Callee: received ICE restart offer');
          await pc.setRemoteDescription(newOffer);
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
    stopVideoHealthCheck();
    stopStatsMonitor();
    stopSpeakingDetection();

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
    stopCallChat();

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

    // Log call to history before clearing state
    const uid = myUid();
    if (uid && currentPeerUid && callStartTime > 0) {
      const duration = Math.floor((Date.now() - callStartTime) / 1000);
      logCallHistory(uid, {
        peerUid: currentPeerUid,
        peerName: currentPeerName || 'Unknown',
        type: isCaller ? 'outgoing' : 'incoming',
        callType: 'dm',
        startedAt: callStartTime,
        endedAt: Date.now(),
        duration: duration
      });
    }

    // Clear signals — both our own and the peer's
    if (uid) getDb().ref('callSignals/' + uid).remove().catch(() => {});
    if (currentPeerUid) getDb().ref('callSignals/' + currentPeerUid).remove().catch(() => {});

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
    incomingRef.on('value', async (snap) => {
      const data = snap.val();
      if (!data || data.type !== 'incoming') return;
      if (peerConnection) {
        // Already in a call; auto-decline
        declineCall(data.callId);
        return;
      }

      // Validate the call still exists and isn't stale
      try {
        const callSnap = await getDb().ref('calls/' + data.callId).once('value');
        const callData = callSnap.val();
        if (!callData || callData.status === 'ended' || callData.status === 'missed') {
          // Stale call — clean up and show missed call notification
          getDb().ref('callSignals/' + uid).remove().catch(() => {});
          logCallHistory(uid, {
            peerUid: data.callerUid,
            peerName: data.callerName || 'Unknown',
            type: 'missed',
            callType: 'dm',
            startedAt: Date.now(),
            endedAt: Date.now(),
            duration: 0
          });
          if (typeof showToast === 'function') {
            showToast('Missed call from ' + (data.callerName || 'Unknown'), 'info');
          }
          return;
        }
      } catch (e) {
        // Call data doesn't exist — stale signal
        getDb().ref('callSignals/' + uid).remove().catch(() => {});
        logCallHistory(uid, {
          peerUid: data.callerUid,
          peerName: data.callerName || 'Unknown',
          type: 'missed',
          callType: 'dm',
          startedAt: Date.now(),
          endedAt: Date.now(),
          duration: 0
        });
        if (typeof showToast === 'function') {
          showToast('Missed call from ' + (data.callerName || 'Unknown'), 'info');
        }
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

    const safeName = escapeHtml(truncName(peerName, 20));
    const initial = escapeHtml((peerName || '?')[0].toUpperCase());

    overlay = document.createElement('div');
    overlay.id = 'vcOverlay';
    overlay.className = 'videocall-overlay';
    overlay.innerHTML = `
      <div class="videocall-status">
        <span class="vc-peer-name">${safeName}</span>
        <span id="vcTimer" class="vc-timer">00:00</span>
      </div>
      <div class="videocall-videos">
        <div id="vcWaiting" class="videocall-waiting">
          <div class="pulse-ring">
            <div id="vcRingAvatar" class="vc-ring-avatar"><span>${initial}</span></div>
          </div>
          <p class="vc-ring-name">${safeName}</p>
          <p style="font-size:14px;color:#94a3b8;">${isOutgoing ? 'Calling...' : 'Connecting...'}</p>
        </div>
        <video id="vcRemoteVideo" class="videocall-remote hidden" autoplay playsinline webkit-playsinline></video>
        <div id="vcRemoteCamOff" class="vc-cam-off-overlay hidden">
          <div id="vcRemoteCamAvatar" class="vc-cam-off-avatar"><span>${initial}</span></div>
          <p id="vcRemoteCamName" class="vc-cam-off-name">${safeName}</p>
        </div>
        <video id="vcLocalVideo" class="videocall-local" autoplay playsinline webkit-playsinline muted></video>
        <div id="vcLocalCamOff" class="vc-local-cam-off hidden">
          <div id="vcLocalCamAvatar" class="vc-cam-off-avatar vc-cam-off-avatar-sm"><span id="vcLocalInitial"></span></div>
          <p id="vcLocalCamName" class="vc-cam-off-name-sm"></p>
        </div>
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
        <button id="vcChatBtn" class="vc-btn vc-btn-toggle" title="In-call chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="vcChatBadge" class="vc-chat-badge hidden">0</span>
        </button>
        <div id="vcDevicePicker" class="vc-device-picker hidden"></div>
      </div>
      <div id="vcChatPanel" class="vc-chat-panel hidden">
        <div class="vc-chat-header">
          <span>Chat</span>
          <button id="vcChatClose" class="vc-chat-close">&times;</button>
        </div>
        <div id="vcChatMessages" class="vc-chat-messages"></div>
        <form id="vcChatForm" class="vc-chat-form" onsubmit="return false">
          <input id="vcChatInput" type="text" placeholder="Type a message..." autocomplete="off" maxlength="500" />
          <button type="submit" class="vc-chat-send">Send</button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    // Wire buttons
    document.getElementById('vcToggleMic').addEventListener('click', toggleMic);
    document.getElementById('vcToggleCam').addEventListener('click', toggleCam);
    document.getElementById('vcEndCall').addEventListener('click', () => endCall());
    document.getElementById('vcFlipCam').addEventListener('click', flipCamera);
    document.getElementById('vcDevicePickerBtn').addEventListener('click', toggleDevicePicker);
    document.getElementById('vcChatBtn').addEventListener('click', toggleCallChat);
    document.getElementById('vcChatClose').addEventListener('click', () => {
      document.getElementById('vcChatPanel').classList.add('hidden');
    });
    document.getElementById('vcChatForm').addEventListener('submit', sendCallChatMessage);

    // Prevent iOS scroll bounce on overlay (but allow chat panel scroll)
    overlay.addEventListener('touchmove', (e) => {
      if (!e.target.closest('.vc-chat-messages')) e.preventDefault();
    }, { passive: false });

    // Load peer profile pic into ring avatar and cam-off overlay
    if (currentPeerUid) {
      fetchProfilePic(currentPeerUid).then((url) => {
        if (url) {
          const ringAv = document.getElementById('vcRingAvatar');
          if (ringAv) ringAv.innerHTML = '<img src="' + escapeHtml(url) + '" class="vc-ring-avatar-img" onerror="this.parentElement.innerHTML=\'<span>' + initial + '</span>\'" />';
          const camAv = document.getElementById('vcRemoteCamAvatar');
          if (camAv) camAv.innerHTML = '<img src="' + escapeHtml(url) + '" class="vc-cam-off-img" onerror="this.parentElement.innerHTML=\'<span>' + initial + '</span>\'" />';
        }
      });
    }
    // Set local user info for cam-off overlay
    const myName = window.currentUsername || 'You';
    const myInitial = myName[0].toUpperCase();
    const lcn = document.getElementById('vcLocalCamName');
    if (lcn) lcn.textContent = truncName(myName, 14);
    const lci = document.getElementById('vcLocalInitial');
    if (lci) lci.textContent = myInitial;
    // Load own profile pic
    const myId = myUid();
    if (myId) {
      fetchProfilePic(myId).then((url) => {
        if (url) {
          const lcAv = document.getElementById('vcLocalCamAvatar');
          if (lcAv) lcAv.innerHTML = '<img src="' + escapeHtml(url) + '" class="vc-cam-off-img" onerror="this.parentElement.innerHTML=\'<span>' + escapeHtml(myInitial) + '</span>\'" />';
        }
      });
    }
  }

  function hideCallUI() {
    const overlay = document.getElementById('vcOverlay');
    if (overlay) overlay.remove();
  }

  function updateRemoteCamOff(isOff) {
    const rv = document.getElementById('vcRemoteVideo');
    const coff = document.getElementById('vcRemoteCamOff');
    if (rv) rv.classList.toggle('hidden', isOff);
    if (coff) coff.classList.toggle('hidden', !isOff);
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

    const safeName = escapeHtml(truncName(callerName, 20));
    const initial = escapeHtml((callerName || '?')[0].toUpperCase());

    const modal = document.createElement('div');
    modal.id = 'vcIncoming';
    modal.className = 'videocall-incoming';
    modal.innerHTML = `
      <div class="videocall-incoming-card">
        <div id="vcIncomingAvatar" class="caller-avatar">${initial}</div>
        <div class="caller-name">${safeName}</div>
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

    // Fetch and show caller's profile pic
    if (callerUid) {
      fetchProfilePic(callerUid).then((url) => {
        const av = document.getElementById('vcIncomingAvatar');
        if (av && url) {
          av.innerHTML = '<img src="' + escapeHtml(url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.textContent=\'' + initial + '\'" />';
        }
      });
    }

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
    // Show/hide local cam-off overlay
    const lco = document.getElementById('vcLocalCamOff');
    if (lco) lco.classList.toggle('hidden', !camMuted);
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

  // ── In-Call Chat ───────────────────────────────────────
  let chatRef = null;
  let chatListener = null;
  let chatOpen = false;
  let unreadChatCount = 0;

  function toggleCallChat() {
    const panel = document.getElementById('vcChatPanel');
    if (!panel) return;
    chatOpen = !chatOpen;
    panel.classList.toggle('hidden', !chatOpen);
    if (chatOpen) {
      unreadChatCount = 0;
      updateChatBadge();
      const msgs = document.getElementById('vcChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
      const input = document.getElementById('vcChatInput');
      if (input) input.focus();
    }
  }

  function updateChatBadge() {
    const badge = document.getElementById('vcChatBadge');
    if (!badge) return;
    if (unreadChatCount > 0) {
      badge.textContent = unreadChatCount > 99 ? '99+' : unreadChatCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Show a floating chat message toast at the bottom of the call screen
  function showFloatingChatMsg(name, text) {
    const overlay = document.getElementById('vcOverlay');
    if (!overlay) return;

    const toast = document.createElement('div');
    toast.className = 'vc-floating-msg';
    toast.innerHTML = '<strong>' + escapeHtml(name) + '</strong> ' + escapeHtml(text.length > 80 ? text.slice(0, 80) + '...' : text);
    toast.addEventListener('click', () => {
      toast.remove();
      toggleCallChat();
    });
    overlay.appendChild(toast);

    // Auto-remove after 2.5 seconds
    setTimeout(() => {
      toast.classList.add('vc-floating-msg-out');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function startCallChat(callId) {
    if (chatRef) stopCallChat();
    chatRef = getDb().ref('calls/' + callId + '/chat');
    chatListener = chatRef.orderByChild('time').on('child_added', (snap) => {
      const msg = snap.val();
      if (!msg) return;
      const msgsEl = document.getElementById('vcChatMessages');
      if (!msgsEl) return;
      const isMine = msg.uid === myUid();
      const div = document.createElement('div');
      div.className = 'vc-chat-msg' + (isMine ? ' vc-chat-mine' : '');
      div.innerHTML = (!isMine ? '<span class="vc-chat-name">' + escapeHtml(msg.name || 'User') + '</span>' : '') +
        '<span class="vc-chat-text">' + escapeHtml(msg.text) + '</span>';
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      if (!isMine && !chatOpen) {
        unreadChatCount++;
        updateChatBadge();
        showFloatingChatMsg(msg.name || 'User', msg.text);
      }
    });
  }

  function stopCallChat() {
    if (chatRef && chatListener) {
      chatRef.off('child_added', chatListener);
    }
    chatRef = null;
    chatListener = null;
    chatOpen = false;
    unreadChatCount = 0;
  }

  function sendCallChatMessage(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('vcChatInput');
    if (!input || !currentCallId) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    getDb().ref('calls/' + currentCallId + '/chat').push({
      uid: myUid(),
      name: window.currentUsername || 'Me',
      text: text.slice(0, 500),
      time: Date.now()
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

  // ── Call History Logging ───────────────────────────────
  function logCallHistory(uid, entry) {
    if (!uid) return;
    try {
      getDb().ref('callHistory/' + uid).push({
        peerUid: entry.peerUid || '',
        peerName: entry.peerName || 'Unknown',
        type: entry.type || 'outgoing',     // outgoing, incoming, missed
        callType: entry.callType || 'dm',   // dm, group, global
        startedAt: entry.startedAt || Date.now(),
        endedAt: entry.endedAt || Date.now(),
        duration: entry.duration || 0,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (e) {
      console.warn('[VideoCall] Failed to log call history:', e);
    }
  }

  // ── Call History Panel UI ──────────────────────────────
  let callHistoryLoaded = false;
  let callHistoryFilter = 'all';

  function openCallHistory() {
    const panel = document.getElementById('callHistoryPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    loadCallHistory();
  }

  function closeCallHistory() {
    const panel = document.getElementById('callHistoryPanel');
    if (panel) panel.classList.add('hidden');
  }

  function loadCallHistory() {
    const uid = myUid();
    if (!uid) return;

    const list = document.getElementById('callHistoryList');
    if (!list) return;
    list.innerHTML = '<p class="call-history-empty">Loading...</p>';

    getDb().ref('callHistory/' + uid).orderByChild('timestamp').limitToLast(100).once('value', (snap) => {
      const data = snap.val();
      if (!data) {
        list.innerHTML = '<p class="call-history-empty">No call history yet</p>';
        return;
      }

      const entries = Object.values(data).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      renderCallHistory(entries);
      callHistoryLoaded = true;
    });
  }

  function renderCallHistory(entries) {
    const list = document.getElementById('callHistoryList');
    if (!list) return;
    list.innerHTML = '';

    const filtered = callHistoryFilter === 'all' ? entries : entries.filter(e => e.type === callHistoryFilter);

    if (filtered.length === 0) {
      list.innerHTML = '<p class="call-history-empty">No ' + (callHistoryFilter === 'all' ? '' : callHistoryFilter + ' ') + 'calls</p>';
      return;
    }

    filtered.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'call-history-item';

      // Icon based on type
      let icon = '', typeClass = '';
      if (entry.type === 'missed') {
        icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="1" y1="1" x2="23" y2="23" stroke="#ef4444" stroke-width="2"/></svg>';
        typeClass = 'missed';
      } else if (entry.type === 'incoming') {
        icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"/><polyline points="16 2 16 8 22 8" stroke="#22c55e"/></svg>';
        typeClass = 'incoming';
      } else {
        icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"/><polyline points="8 22 8 16 2 16" stroke="#38bdf8"/></svg>';
        typeClass = 'outgoing';
      }

      // Format duration
      const dur = entry.duration || 0;
      let durStr = '';
      if (dur > 0) {
        const h = Math.floor(dur / 3600);
        const m = Math.floor((dur % 3600) / 60);
        const s = dur % 60;
        if (h > 0) durStr = h + 'h ' + m + 'm';
        else if (m > 0) durStr = m + 'm ' + s + 's';
        else durStr = s + 's';
      }

      // Format timestamp
      const date = new Date(entry.startedAt || 0);
      const now = new Date();
      let timeStr = '';
      if (date.toDateString() === now.toDateString()) {
        timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      item.innerHTML =
        '<div class="call-history-icon ' + typeClass + '">' + icon + '</div>' +
        '<div class="call-history-info">' +
          '<span class="call-history-name">' + escapeHtml(entry.peerName) + '</span>' +
          '<span class="call-history-meta">' +
            '<span class="call-history-type">' + entry.type.charAt(0).toUpperCase() + entry.type.slice(1) +
            (entry.callType !== 'dm' ? ' (' + entry.callType + ')' : '') + '</span>' +
            (durStr ? ' &middot; ' + durStr : '') +
          '</span>' +
        '</div>' +
        '<span class="call-history-time">' + timeStr + '</span>';

      // Click to call back (DM calls only)
      if (entry.callType === 'dm' && entry.peerUid) {
        item.style.cursor = 'pointer';
        item.title = 'Call ' + escapeHtml(entry.peerName);
        item.addEventListener('click', () => {
          closeCallHistory();
          startCall(entry.peerUid, entry.peerName);
        });
      }

      list.appendChild(item);
    });
  }

  // Wire up call history panel events
  function initCallHistoryUI() {
    const closeBtn = document.getElementById('callHistoryClose');
    if (closeBtn) closeBtn.addEventListener('click', closeCallHistory);

    const sideBtn = document.getElementById('sidePanelCallHistory');
    if (sideBtn) {
      sideBtn.addEventListener('click', () => {
        openCallHistory();
        // Close side panel if open
        const sidePanel = document.getElementById('sidePanel');
        if (sidePanel) sidePanel.style.transform = 'translateX(-100%)';
        const overlay = document.getElementById('sideOverlay');
        if (overlay) overlay.classList.add('hidden');
      });
    }

    // Tab filtering
    document.querySelectorAll('.call-history-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.call-history-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        callHistoryFilter = tab.dataset.filter;
        loadCallHistory();
      });
    });
  }

  // Initialize call history + quality settings UI when DOM is ready
  function initAllUI() {
    initCallHistoryUI();
    loadQualitySettings();
    initQualitySettingsUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllUI);
  } else {
    initAllUI();
  }

  // ── Exports ────────────────────────────────────────────
  window.ChatraVideoCall = {
    startCall: startCall,
    answerCall: answerCall,
    declineCall: declineCall,
    endCall: endCall,
    listenForIncomingCalls: listenForIncomingCalls,
    stopListeningForCalls: stopListeningForCalls,
    isInCall: function () { return !!peerConnection; },
    openCallHistory: openCallHistory,
    closeCallHistory: closeCallHistory,
    logCallHistory: logCallHistory
  };

})();
