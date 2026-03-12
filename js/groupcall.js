// Chatra Group Video Call — WebRTC Mesh + Firebase Signaling
// Supports group FaceTime and global video rooms

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let localStream = null;
  let roomId = null;
  let roomRef = null;
  let roomType = null; // 'group' or 'global'
  let participants = {}; // uid -> { pc, videoEl, remoteStream, username }
  let pendingCandidates = {}; // uid -> [RTCIceCandidate]
  let videoHealthTimer = null;
  let myParticipantRef = null;
  let callStartTime = 0;
  let timerInterval = null;
  let camMuted = false;
  let micMuted = false;
  let chatOpen = false;
  let unreadChatCount = 0;
  let chatRef = null;
  let chatListener = null;
  let participantListener = null;
  let signalListeners = []; // cleanup refs
  let usingFrontCam = true;
  let selectedVideoDeviceId = null;
  let selectedAudioDeviceId = null;
  let selectedOutputDeviceId = null;

  let devicePickerOpen = false;
  let playRetryTimers = {}; // uid -> timer

  // ── Quality Presets & Adaptive State ────────────────────
  const QUALITY_PRESETS = {
    '1080p': { width: 1920, height: 1080, maxBitrate: 6000 },
    '720p':  { width: 1280, height: 720,  maxBitrate: 2500 },
    '480p':  { width: 854,  height: 480,  maxBitrate: 1200 },
    '360p':  { width: 640,  height: 360,  maxBitrate: 600  }
  };

  let currentAdaptiveQuality = null;
  let currentAdaptiveFps = null;
  let statsTimer = null;
  let prevStats = null;
  let networkQuality = 'good';
  let consecutivePoor = 0;
  let consecutiveGood = 0;

  function getQualitySettings() {
    try {
      const saved = localStorage.getItem('chatra_call_quality');
      if (saved) return Object.assign({ quality: 'auto', fps: 'auto', autoAdjust: true, showNetworkIndicator: true }, JSON.parse(saved));
    } catch (e) {}
    return { quality: 'auto', fps: 'auto', autoAdjust: true, showNetworkIndicator: true };
  }

  function getTargetQuality() {
    const qs = getQualitySettings();
    const q = currentAdaptiveQuality || qs.quality;
    if (q === 'auto' || !QUALITY_PRESETS[q]) return QUALITY_PRESETS['720p'];
    return QUALITY_PRESETS[q];
  }

  function getTargetFps() {
    const qs = getQualitySettings();
    if (qs.fps === 'auto') return currentAdaptiveFps || 30;
    return parseInt(qs.fps) || 30;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isEdge = /Edg\//i.test(navigator.userAgent);

  // STUN + TURN servers for NAT traversal
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

  const MAX_PARTICIPANTS = 8;

  function getDb() { return firebase.database(); }
  function getAuth() { return firebase.auth(); }
  function myUid() { return getAuth().currentUser && getAuth().currentUser.uid; }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text || ''));
    return div.innerHTML;
  }

  // Video constraints based on quality settings
  function getVideoConstraints() {
    const target = getTargetQuality();
    const fps = getTargetFps();
    if (isEdge) {
      return { width: { ideal: target.width }, height: { ideal: target.height }, frameRate: { ideal: fps } };
    }
    if (isIOS || isSafari) {
      return { width: { ideal: target.width }, height: { ideal: target.height }, frameRate: { ideal: fps }, facingMode: usingFrontCam ? 'user' : 'environment' };
    }
    return { width: { ideal: target.width }, height: { ideal: target.height }, frameRate: { ideal: fps, min: Math.min(15, fps) }, facingMode: usingFrontCam ? 'user' : 'environment' };
  }

  // ── Device Enumeration ─────────────────────────────────
  async function getDevices() {
    if (localStream) {
      try { return await navigator.mediaDevices.enumerateDevices(); } catch (e) { return []; }
    }
    let tempStream = null;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (devices.length && devices[0].label === '') {
        try { tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); } catch (_) {
          try { tempStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_2) {}
        }
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      if (tempStream) tempStream.getTracks().forEach(t => t.stop());
      return all;
    } catch (e) {
      if (tempStream) tempStream.getTracks().forEach(t => t.stop());
      return [];
    }
  }

  async function getVideoDevices() { return (await getDevices()).filter(d => d.kind === 'videoinput'); }
  async function getAudioDevices() { return (await getDevices()).filter(d => d.kind === 'audioinput'); }
  async function getOutputDevices() { return (await getDevices()).filter(d => d.kind === 'audiooutput'); }

  // ── Media ──────────────────────────────────────────────
  async function acquireMedia() {
    // Apply saved camera side preference
    const camSide = localStorage.getItem('chatra_pref_callDefaultCamSide');
    if (camSide === 'back') usingFrontCam = false;
    else if (camSide === 'front') usingFrontCam = true;

    // Apply saved device/audio prefs
    if (!selectedVideoDeviceId) {
      const savedCam = localStorage.getItem('chatra_pref_camera');
      if (savedCam) selectedVideoDeviceId = savedCam;
    }
    if (!selectedAudioDeviceId) {
      const savedMic = localStorage.getItem('chatra_pref_mic');
      if (savedMic) selectedAudioDeviceId = savedMic;
    }
    if (!selectedOutputDeviceId) {
      const savedSpk = localStorage.getItem('chatra_pref_speaker');
      if (savedSpk) selectedOutputDeviceId = savedSpk;
    }

    const echoCancel = localStorage.getItem('chatra_pref_callEchoCancelToggle') !== 'false';
    const noiseSup = localStorage.getItem('chatra_pref_callNoiseSuppressionToggle') !== 'false';
    const autoGain = localStorage.getItem('chatra_pref_callAutoGainToggle') !== 'false';

    const target = getTargetQuality();
    const fps = getTargetFps();
    const videoConstraint = selectedVideoDeviceId
      ? { deviceId: { exact: selectedVideoDeviceId }, width: { ideal: target.width }, height: { ideal: target.height }, frameRate: { ideal: fps } }
      : getVideoConstraints();
    const audioConstraint = selectedAudioDeviceId
      ? { deviceId: { exact: selectedAudioDeviceId }, echoCancellation: echoCancel, noiseSuppression: noiseSup, autoGainControl: autoGain }
      : { echoCancellation: echoCancel, noiseSuppression: noiseSup, autoGainControl: autoGain };

    const constraints = { video: videoConstraint, audio: audioConstraint };
    const fbAudio = selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true;

    const fallbacks = [
      constraints,
      { video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true, audio: fbAudio },
      { video: true, audio: fbAudio },
      { video: false, audio: fbAudio }
    ];
    for (let i = 0; i < fallbacks.length; i++) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia(fallbacks[i]);
        if (i > 0) console.warn('[GroupCall] Using fallback level', i);
        return localStream;
      } catch (e) {
        console.warn('[GroupCall] getUserMedia attempt', i, 'failed:', e.name);
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

  // Set SDP to prefer appropriate bitrate based on quality settings
  function setHighBitrate(sdp) {
    if (isSafari || isIOS) return sdp;
    const target = getTargetQuality();
    const maxBitrate = target.maxBitrate || 2500;
    const lines = sdp.split('\r\n');
    const result = [];
    let isVideo = false;
    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);
      if (lines[i].startsWith('m=video')) { isVideo = true; } else if (lines[i].startsWith('m=')) { isVideo = false; }
      if (isVideo && lines[i].startsWith('c=')) {
        if (i + 1 < lines.length && lines[i + 1].startsWith('b=')) { i++; }
        result.push('b=AS:' + maxBitrate);
      }
    }
    return result.join('\r\n');
  }

  // ── Peer Connection per participant ────────────────────
  function createPeerConnection(peerUid) {
    const config = { iceServers: ICE_SERVERS };
    if (!isSafari && !isIOS) config.iceCandidatePoolSize = 10;
    const pc = new RTCPeerConnection(config);

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    } else if (isSafari || isIOS) {
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    // ICE candidates → Firebase
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && roomRef) {
        const path = 'signals/' + myUid() + '_' + peerUid;
        roomRef.child(path).push(event.candidate.toJSON());
      }
    });

    // Receive remote tracks
    const remoteStream = new MediaStream();
    pc.addEventListener('track', (event) => {
      const existing = remoteStream.getTracks().find(t => t.id === event.track.id);
      if (!existing) {
        remoteStream.addTrack(event.track);
        console.log('[GroupCall] Added remote track from', peerUid, event.track.kind, 'total:', remoteStream.getTracks().length);
      }

      // Connect stream to video element (it may not exist yet — connectVideoToEl handles that)
      connectVideoToEl(peerUid, remoteStream);

      // Listen for track unmute/ended → re-trigger play for Safari
      event.track.addEventListener('unmute', () => {
        console.log('[GroupCall] Track unmuted from', peerUid, event.track.kind);
        connectVideoToEl(peerUid, remoteStream);
      });
      event.track.addEventListener('ended', () => {
        console.log('[GroupCall] Track ended from', peerUid, event.track.kind);
      });
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      const state = pc.iceConnectionState;
      console.log('[GroupCall] ICE', myUid(), '<->', peerUid, state);

      if (state === 'connected' || state === 'completed') {
        // Clear reconnecting label
        const tile = document.getElementById('gcTile_' + peerUid);
        if (tile) {
          const label = tile.querySelector('.gc-tile-status');
          if (label) label.remove();
        }
        // Force re-play video in case it failed earlier
        connectVideoToEl(peerUid, remoteStream);
      }

      if (state === 'disconnected') {
        // Show reconnecting label on tile
        const tile = document.getElementById('gcTile_' + peerUid);
        if (tile && !tile.querySelector('.gc-tile-status')) {
          const s = document.createElement('span');
          s.className = 'gc-tile-status';
          s.textContent = 'Reconnecting...';
          tile.appendChild(s);
        }
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            removePeer(peerUid);
          }
        }, 15000);
      }

      if (state === 'failed') {
        if (shouldIOffer(peerUid)) {
          pc.createOffer({ iceRestart: true }).then(offer => {
            offer.sdp = setHighBitrate(offer.sdp);
            return pc.setLocalDescription(offer);
          }).then(() => {
            roomRef.child('offers/' + myUid() + '_' + peerUid).set({
              type: pc.localDescription.type,
              sdp: pc.localDescription.sdp
            });
          }).catch(() => {});
        }
      }
    });

    return { pc, remoteStream };
  }

  // Deterministic: the peer with the "smaller" UID creates the offer
  function shouldIOffer(peerUid) {
    return myUid() < peerUid;
  }

  // ── Signaling ──────────────────────────────────────────
  async function connectToPeer(peerUid, peerName) {
    if (participants[peerUid]) return;

    const { pc, remoteStream } = createPeerConnection(peerUid);
    const videoEl = addVideoTile(peerUid, peerName);
    pendingCandidates[peerUid] = [];
    participants[peerUid] = { pc, remoteStream, videoEl, username: peerName };

    // If tracks already arrived before participants was set, connect now
    if (remoteStream.getTracks().length > 0) {
      connectVideoToEl(peerUid, remoteStream);
    }

    // Listen for ICE candidates FROM the peer TO me — queue if no remote desc yet
    const sigRef = roomRef.child('signals/' + peerUid + '_' + myUid());
    const sigListener = sigRef.on('child_added', (snap) => {
      const candidate = snap.val();
      if (!candidate) return;
      const iceCandidate = new RTCIceCandidate(candidate);
      if (pc.remoteDescription && pc.remoteDescription.type) {
        pc.addIceCandidate(iceCandidate).catch(() => {});
      } else {
        // Queue it — will be flushed when remote description is set
        console.log('[GroupCall] Queuing ICE candidate for', peerUid);
        if (pendingCandidates[peerUid]) pendingCandidates[peerUid].push(iceCandidate);
      }
    });
    signalListeners.push({ ref: sigRef, event: 'child_added', fn: sigListener });

    if (shouldIOffer(peerUid)) {
      // I create the offer
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      offer.sdp = setHighBitrate(offer.sdp);
      await pc.setLocalDescription(offer);
      await roomRef.child('offers/' + myUid() + '_' + peerUid).set({
        type: offer.type, sdp: offer.sdp
      });

      // Listen for answer
      const ansRef = roomRef.child('answers/' + peerUid + '_' + myUid());
      const ansListener = ansRef.on('value', async (snap) => {
        const answer = snap.val();
        if (answer && pc.signalingState === 'have-local-offer') {
          try {
            await pc.setRemoteDescription(answer);
            console.log('[GroupCall] Set remote desc (answer) from', peerUid);
            // Flush queued ICE candidates
            flushPendingCandidates(peerUid, pc);
          } catch (e) {
            console.error('[GroupCall] setRemoteDescription(answer) error:', e);
          }
        }
      });
      signalListeners.push({ ref: ansRef, event: 'value', fn: ansListener });
    } else {
      // I wait for an offer
      const offerRef = roomRef.child('offers/' + peerUid + '_' + myUid());
      const offerListener = offerRef.on('value', async (snap) => {
        const offer = snap.val();
        if (!offer || pc.signalingState === 'closed') return;
        if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
          try {
            await pc.setRemoteDescription(offer);
            console.log('[GroupCall] Set remote desc (offer) from', peerUid);
            const answer = await pc.createAnswer();
            answer.sdp = setHighBitrate(answer.sdp);
            await pc.setLocalDescription(answer);
            await roomRef.child('answers/' + myUid() + '_' + peerUid).set({
              type: answer.type, sdp: answer.sdp
            });
            // Flush queued ICE candidates
            flushPendingCandidates(peerUid, pc);
          } catch (e) {
            console.error('[GroupCall] offer handling error:', e);
          }
        }
      });
      signalListeners.push({ ref: offerRef, event: 'value', fn: offerListener });
    }

    updateParticipantCount();
  }

  // Flush queued ICE candidates after remote description is set
  function flushPendingCandidates(peerUid, pc) {
    const queued = pendingCandidates[peerUid];
    if (queued && queued.length > 0) {
      console.log('[GroupCall] Flushing', queued.length, 'queued candidates for', peerUid);
      while (queued.length) {
        const c = queued.shift();
        pc.addIceCandidate(c).catch(() => {});
      }
    }
  }

  // Connect remoteStream to the peer's video element and play it
  function connectVideoToEl(peerUid, remoteStream) {
    const p = participants[peerUid];
    if (!p || !p.videoEl) return;

    if (p.videoEl.srcObject !== remoteStream) {
      p.videoEl.srcObject = remoteStream;
    }

    // Set output device if selected
    if (selectedOutputDeviceId && typeof p.videoEl.setSinkId === 'function') {
      p.videoEl.setSinkId(selectedOutputDeviceId).catch(() => {});
    }

    // Play with retries
    const tryPlay = () => { const r = p.videoEl.play(); if (r) r.catch(() => {}); };
    tryPlay();
    if (!playRetryTimers[peerUid]) {
      let retries = 0;
      playRetryTimers[peerUid] = setInterval(() => {
        retries++;
        if (p.videoEl && p.videoEl.paused) tryPlay();
        if ((p.videoEl && !p.videoEl.paused) || retries >= 30) {
          clearInterval(playRetryTimers[peerUid]);
          delete playRetryTimers[peerUid];
        }
      }, 500);
    }
  }

  function removePeer(peerUid) {
    const p = participants[peerUid];
    if (!p) return;
    if (p.pc) p.pc.close();
    if (p.videoEl && p.videoEl.parentNode) p.videoEl.parentNode.remove();
    if (playRetryTimers[peerUid]) {
      clearInterval(playRetryTimers[peerUid]);
      delete playRetryTimers[peerUid];
    }
    delete pendingCandidates[peerUid];
    delete participants[peerUid];
    updateGridLayout();
    updateParticipantCount();
  }

  // ── Room Management ────────────────────────────────────

  async function joinRoom(id, type, groupName) {
    if (roomRef) {
      if (typeof showToast === 'function') showToast('Already in a call', 'error');
      return;
    }

    roomId = id;
    roomType = type;
    roomRef = getDb().ref('groupCalls/' + id);

    // Check participant count
    const partSnap = await roomRef.child('participants').once('value');
    const existing = partSnap.val() || {};
    if (Object.keys(existing).length >= MAX_PARTICIPANTS) {
      roomRef = null;
      roomId = null;
      if (typeof showToast === 'function') showToast('Room is full (max ' + MAX_PARTICIPANTS + ')', 'error');
      return;
    }

    try {
      await acquireMedia();
    } catch (e) {
      roomRef = null;
      roomId = null;
      if (typeof showToast === 'function') showToast('Camera/mic access denied', 'error');
      return;
    }

    // If we only got audio (camera failed), show notice
    if (localStream && localStream.getVideoTracks().length === 0) {
      if (typeof showToast === 'function') showToast('Camera unavailable — audio only', 'info');
    }

    showGroupCallUI(groupName || 'Video Room', type === 'global');

    // Register ourselves
    myParticipantRef = roomRef.child('participants/' + myUid());
    await myParticipantRef.set({
      username: window.currentUsername || 'User',
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    // Remove on disconnect
    myParticipantRef.onDisconnect().remove();

    callStartTime = Date.now();
    startTimer();

    // Show local video
    const localVid = document.getElementById('gcLocalVideo');
    if (localVid && localStream) {
      localVid.srcObject = localStream;
      localVid.play().catch(() => {});
    }
    // Connect to existing participants
    const existingParts = partSnap.val() || {};
    for (const [uid, data] of Object.entries(existingParts)) {
      if (uid !== myUid()) {
        connectToPeer(uid, data.username || 'User');
      }
    }

    // Listen for new participants joining/leaving
    participantListener = roomRef.child('participants').on('child_added', (snap) => {
      const uid = snap.key;
      const data = snap.val();
      if (uid !== myUid() && !participants[uid]) {
        connectToPeer(uid, data.username || 'User');
      }
    });

    roomRef.child('participants').on('child_removed', (snap) => {
      removePeer(snap.key);
    });

    // Start in-call chat
    startGroupCallChat();

    // Start periodic video health check — catches any stuck/black videos
    startVideoHealthCheck();

    // Start adaptive quality monitor
    startStatsMonitor();
    setTimeout(function () { applyAdaptiveParamsAllPeers(getTargetQuality().maxBitrate > 2500 ? '720p' : (currentAdaptiveQuality || '720p'), getTargetFps()); }, 2000);

    // If group call, notify members
    if (type === 'group') {
      roomRef.child('meta').update({
        groupName: groupName || '',
        startedBy: myUid(),
        startedByName: window.currentUsername || 'User',
        active: true
      });
    }
  }

  // ── Adaptive Bitrate & Network Quality Monitor ─────────
  function startStatsMonitor() {
    stopStatsMonitor();
    prevStats = null;
    consecutivePoor = 0;
    consecutiveGood = 0;
    networkQuality = 'good';
    currentAdaptiveQuality = null;
    currentAdaptiveFps = null;

    statsTimer = setInterval(function () {
      if (Object.keys(participants).length === 0) return;
      collectStats();
    }, 2000);
  }

  function stopStatsMonitor() {
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
    prevStats = null;
    var ind = document.getElementById('gcNetworkIndicator');
    if (ind) ind.remove();
  }

  async function collectStats() {
    // Collect stats from all peer connections and average them
    var totalRtt = 0, rttCount = 0;
    var totalLoss = 0, lossCount = 0;
    var totalBytesSent = 0, totalBytesRecv = 0;
    var totalFramesSent = 0, totalFramesRecv = 0;
    var totalJitter = 0, jitterCount = 0;
    var timestamp = 0;

    var peerUids = Object.keys(participants);
    for (var i = 0; i < peerUids.length; i++) {
      var p = participants[peerUids[i]];
      if (!p || !p.pc) continue;
      try {
        var stats = await p.pc.getStats();
        stats.forEach(function (report) {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime != null) { totalRtt += report.currentRoundTripTime * 1000; rttCount++; }
          }
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            totalBytesSent += (report.bytesSent || 0);
            totalFramesSent += (report.framesEncoded || 0);
            if (report.timestamp) timestamp = Math.max(timestamp, report.timestamp);
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            totalBytesRecv += (report.bytesReceived || 0);
            totalFramesRecv += (report.framesDecoded || 0);
            if (report.packetsLost != null && report.packetsReceived != null) {
              var total = report.packetsReceived + report.packetsLost;
              if (total > 0) { totalLoss += (report.packetsLost / total) * 100; lossCount++; }
            }
            if (report.jitter != null) { totalJitter += report.jitter * 1000; jitterCount++; }
          }
        });
      } catch (e) {}
    }

    var rtt = rttCount > 0 ? totalRtt / rttCount : null;
    var packetLoss = lossCount > 0 ? totalLoss / lossCount : 0;
    var jitter = jitterCount > 0 ? totalJitter / jitterCount : 0;

    var current = { bytesSent: totalBytesSent, bytesReceived: totalBytesRecv, framesSent: totalFramesSent, framesReceived: totalFramesRecv, timestamp: timestamp };

    if (prevStats && timestamp > prevStats.timestamp) {
      var dt = (timestamp - prevStats.timestamp) / 1000;
      var sendBitrate = ((totalBytesSent - prevStats.bytesSent) * 8) / (dt * 1000);
      var recvBitrate = ((totalBytesRecv - prevStats.bytesReceived) * 8) / (dt * 1000);
      var sendFps = (totalFramesSent - prevStats.framesSent) / dt;
      var recvFps = (totalFramesRecv - prevStats.framesReceived) / dt;

      var quality = evaluateNetworkQuality(rtt, packetLoss, sendBitrate, recvBitrate, jitter);
      networkQuality = quality;

      updateGcNetworkIndicator(quality, rtt, sendBitrate, recvBitrate, sendFps, recvFps, packetLoss);

      var qs = getQualitySettings();
      if (qs.autoAdjust && qs.quality === 'auto') {
        adaptQuality(quality, sendBitrate, rtt, packetLoss);
      }

      console.log('[GroupCall] Stats: rtt=' + (rtt ? rtt.toFixed(0) + 'ms' : '?') +
        ' loss=' + packetLoss.toFixed(1) + '% send=' + sendBitrate.toFixed(0) + 'kbps' +
        ' recv=' + recvBitrate.toFixed(0) + 'kbps fps=' + sendFps.toFixed(0) +
        '/' + recvFps.toFixed(0) + ' quality=' + quality);
    }

    prevStats = current;
  }

  function evaluateNetworkQuality(rtt, packetLoss, sendBitrate, recvBitrate, jitter) {
    var score = 100;
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
    var target = getTargetQuality();
    if (sendBitrate > 0 && sendBitrate < target.maxBitrate * 0.2) score -= 20;
    else if (sendBitrate > 0 && sendBitrate < target.maxBitrate * 0.5) score -= 10;
    if (score >= 80) return 'excellent';
    if (score >= 55) return 'good';
    if (score >= 30) return 'fair';
    return 'poor';
  }

  function adaptQuality(quality, sendBitrate, rtt, packetLoss) {
    if (Object.keys(participants).length === 0) return;
    var QUALITY_LADDER = ['360p', '480p', '720p', '1080p'];
    var FPS_LADDER = [15, 24, 30, 60];

    var curQ = currentAdaptiveQuality || '720p';
    var curQIdx = QUALITY_LADDER.indexOf(curQ);
    var curFps = currentAdaptiveFps || 30;
    var curFIdx = FPS_LADDER.indexOf(curFps);

    if (quality === 'poor' || quality === 'fair') {
      consecutivePoor++;
      consecutiveGood = 0;
    } else {
      consecutiveGood++;
      consecutivePoor = 0;
    }

    var newQIdx = curQIdx;
    var newFIdx = curFIdx >= 0 ? curFIdx : 2;

    if (consecutivePoor >= 2) {
      if (newFIdx > 0) { newFIdx--; }
      else if (newQIdx > 0) { newQIdx--; newFIdx = Math.min(2, FPS_LADDER.length - 1); }
      consecutivePoor = 0;
    }

    if (consecutiveGood >= 5) {
      if (newFIdx < FPS_LADDER.length - 1) { newFIdx++; }
      else if (newQIdx < QUALITY_LADDER.length - 1) { newQIdx++; newFIdx = 2; }
      consecutiveGood = 0;
    }

    var newQ = QUALITY_LADDER[newQIdx];
    var newFps = FPS_LADDER[newFIdx];

    if (newQ !== curQ || newFps !== curFps) {
      console.log('[GroupCall] Adaptive: changing', curQ, curFps + 'fps ->', newQ, newFps + 'fps');
      currentAdaptiveQuality = newQ;
      currentAdaptiveFps = newFps;
      applyAdaptiveParamsAllPeers(newQ, newFps);
    }
  }

  async function applyAdaptiveParamsAllPeers(qualityKey, fps) {
    var preset = QUALITY_PRESETS[qualityKey];
    if (!preset) return;

    var peerUids = Object.keys(participants);
    for (var i = 0; i < peerUids.length; i++) {
      var p = participants[peerUids[i]];
      if (!p || !p.pc) continue;
      var sender = p.pc.getSenders().find(function (s) { return s.track && s.track.kind === 'video'; });
      if (!sender) continue;
      try {
        var params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.maxBitrate * 1000;
        params.encodings[0].maxFramerate = fps;
        if (localStream) {
          var vt = localStream.getVideoTracks()[0];
          var settings = vt ? vt.getSettings() : null;
          if (settings && settings.width && settings.height) {
            var scaleFactor = Math.max(1, settings.width / preset.width);
            params.encodings[0].scaleResolutionDownBy = Math.round(scaleFactor * 10) / 10;
          }
        }
        await sender.setParameters(params);
      } catch (e) {
        console.warn('[GroupCall] setParameters failed for peer', peerUids[i], e.message);
      }
    }
  }

  function updateGcNetworkIndicator(quality, rtt, sendBitrate, recvBitrate, sendFps, recvFps, packetLoss) {
    var qs = getQualitySettings();
    if (!qs.showNetworkIndicator) return;
    var overlay = document.getElementById('gcOverlay');
    if (!overlay) return;

    var ind = document.getElementById('gcNetworkIndicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'gcNetworkIndicator';
      ind.className = 'vc-network-indicator';
      overlay.appendChild(ind);
    }

    var colors = { excellent: '#22c55e', good: '#22c55e', fair: '#eab308', poor: '#ef4444' };
    var labels = { excellent: 'Excellent', good: 'Good', fair: 'Unstable', poor: 'Poor' };
    var bars = quality === 'excellent' ? 4 : quality === 'good' ? 3 : quality === 'fair' ? 2 : 1;
    var color = colors[quality];

    var barsHtml = '';
    for (var i = 0; i < 4; i++) {
      var h = 4 + i * 4;
      var active = i < bars;
      barsHtml += '<div style="width:3px;height:' + h + 'px;border-radius:1px;background:' + (active ? color : 'rgba(255,255,255,0.2)') + ';"></div>';
    }

    var rttStr = rtt != null ? Math.round(rtt) + 'ms' : '--';
    var bitrateStr = sendBitrate > 1000 ? (sendBitrate / 1000).toFixed(1) + 'Mbps' : Math.round(sendBitrate) + 'kbps';

    ind.innerHTML = '<div class="vc-net-bars">' + barsHtml + '</div>' +
      '<span class="vc-net-label" style="color:' + color + '">' + labels[quality] + '</span>' +
      '<span class="vc-net-detail">' + rttStr + ' \u00B7 ' + bitrateStr + '</span>';
  }

  function leaveRoom() {
    if (!roomRef) return;

    // Log call to history before clearing state
    const uid = myUid();
    if (uid && callStartTime > 0) {
      const duration = Math.floor((Date.now() - callStartTime) / 1000);
      const peerNames = Object.values(participants).map(p => p.username || 'User').join(', ') || 'Group Call';
      if (window.ChatraVideoCall && window.ChatraVideoCall.logCallHistory) {
        window.ChatraVideoCall.logCallHistory(uid, {
          peerUid: roomId || '',
          peerName: peerNames,
          type: 'outgoing',
          callType: roomType || 'group',
          startedAt: callStartTime,
          endedAt: Date.now(),
          duration: duration
        });
      }
    }

    stopTimer();
    stopGroupCallChat();
    stopVideoHealthCheck();
    stopStatsMonitor();

    // Remove ourselves
    if (myParticipantRef) {
      myParticipantRef.onDisconnect().cancel();
      myParticipantRef.remove().catch(() => {});
      myParticipantRef = null;
    }

    // Close all peer connections
    for (const uid of Object.keys(participants)) {
      removePeer(uid);
    }

    // Clean up listeners
    if (participantListener) {
      roomRef.child('participants').off();
      participantListener = null;
    }
    for (const sl of signalListeners) {
      sl.ref.off(sl.event, sl.fn);
    }
    signalListeners = [];

    // If we're the last one, clean up the room
    roomRef.child('participants').once('value', (snap) => {
      const parts = snap.val();
      if (!parts || Object.keys(parts).length === 0) {
        roomRef.remove().catch(() => {});
      }
    });

    // Clean up play retry timers
    for (const uid of Object.keys(playRetryTimers)) {
      clearInterval(playRetryTimers[uid]);
    }
    playRetryTimers = {};
    pendingCandidates = {};

    stopMedia();

    roomRef = null;
    roomId = null;
    roomType = null;
    callStartTime = 0;
    camMuted = false;
    micMuted = false;
    chatOpen = false;
    unreadChatCount = 0;
    usingFrontCam = true;
    selectedVideoDeviceId = null;
    selectedAudioDeviceId = null;
    devicePickerOpen = false;

    hideGroupCallUI();
  }

  // ── UI ─────────────────────────────────────────────────

  function showGroupCallUI(title, isGlobal) {
    let overlay = document.getElementById('gcOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'gcOverlay';
    overlay.className = 'videocall-overlay';
    overlay.innerHTML = `
      <div class="videocall-status">
        <span class="vc-peer-name">${escapeHtml(title)}</span>
        <span id="gcParticipantCount" class="vc-timer" style="margin-right:8px">1</span>
        <span id="gcTimer" class="vc-timer">00:00</span>
      </div>
      <div class="gc-video-grid" id="gcVideoGrid">
        <div class="gc-video-tile gc-local-tile">
          <video id="gcLocalVideo" autoplay playsinline webkit-playsinline muted></video>
          <span class="gc-tile-name">You</span>
        </div>
      </div>
      <div class="videocall-controls">
        <button id="gcToggleMic" class="vc-btn vc-btn-toggle" title="Toggle microphone">
          <svg viewBox="0 0 24 24"><path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </button>
        <button id="gcToggleCam" class="vc-btn vc-btn-toggle" title="Toggle camera">
          <svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        </button>
        <button id="gcEndCall" class="vc-btn vc-btn-end" title="Leave call">
          <svg viewBox="0 0 24 24"><path d="M22.5 12.5c0-1-.8-1.5-1.5-1.5h-3c-.7 0-1.5.7-1.5 1.5v1c-1.2.5-2.5.8-4 .8s-2.8-.3-4-.8v-1C8.5 11.7 7.7 11 7 11H4c-.7 0-1.5.5-1.5 1.5S3.24 16 5 16.5c2 .6 4.5 1 7.5 1s5.5-.4 7.5-1c1.76-.5 2.5-3 2.5-4z" fill="white" stroke="none"/></svg>
        </button>
        <button id="gcFlipCam" class="vc-btn vc-btn-flip" title="Flip camera">
          <svg viewBox="0 0 24 24"><path d="M20 5h-3.17L15 3H9L7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><circle cx="12" cy="13" r="4"/><path d="M16 9l2-2m0 0l-2-2m2 2h-4" stroke="white" fill="none" stroke-width="1.5"/></svg>
        </button>
        <button id="gcDevicePickerBtn" class="vc-btn vc-btn-toggle" title="Switch camera or mic">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button id="gcChatBtn" class="vc-btn vc-btn-toggle" title="In-call chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="gcChatBadge" class="vc-chat-badge hidden">0</span>
        </button>
        <div id="gcDevicePicker" class="vc-device-picker hidden"></div>
      </div>
      <div id="gcChatPanel" class="vc-chat-panel hidden">
        <div class="vc-chat-header">
          <span>Chat</span>
          <button id="gcChatClose" class="vc-chat-close">&times;</button>
        </div>
        <div id="gcChatMessages" class="vc-chat-messages"></div>
        <form id="gcChatForm" class="vc-chat-form" onsubmit="return false">
          <input id="gcChatInput" type="text" placeholder="Type a message..." autocomplete="off" maxlength="500" />
          <button type="submit" class="vc-chat-send">Send</button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('gcToggleMic').addEventListener('click', () => {
      if (!localStream) return;
      micMuted = !micMuted;
      localStream.getAudioTracks().forEach(t => { t.enabled = !micMuted; });
      document.getElementById('gcToggleMic').classList.toggle('off', micMuted);
    });

    document.getElementById('gcToggleCam').addEventListener('click', () => {
      if (!localStream) return;
      camMuted = !camMuted;
      localStream.getVideoTracks().forEach(t => { t.enabled = !camMuted; });
      document.getElementById('gcToggleCam').classList.toggle('off', camMuted);
      const localVid = document.getElementById('gcLocalVideo');
      const localTile = localVid && localVid.closest('.gc-video-tile');
      if (localTile) localTile.classList.toggle('gc-cam-off', camMuted);
    });

    document.getElementById('gcEndCall').addEventListener('click', () => leaveRoom());
    document.getElementById('gcFlipCam').addEventListener('click', gcFlipCamera);
    document.getElementById('gcDevicePickerBtn').addEventListener('click', gcToggleDevicePicker);

    document.getElementById('gcChatBtn').addEventListener('click', () => {
      chatOpen = !chatOpen;
      document.getElementById('gcChatPanel').classList.toggle('hidden', !chatOpen);
      if (chatOpen) {
        unreadChatCount = 0;
        updateGroupChatBadge();
        const msgs = document.getElementById('gcChatMessages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
      }
    });
    document.getElementById('gcChatClose').addEventListener('click', () => {
      chatOpen = false;
      document.getElementById('gcChatPanel').classList.add('hidden');
    });
    document.getElementById('gcChatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      sendGroupCallChatMsg();
    });

    overlay.addEventListener('touchmove', (e) => {
      if (!e.target.closest('.vc-chat-messages')) e.preventDefault();
    }, { passive: false });
  }

  function hideGroupCallUI() {
    const overlay = document.getElementById('gcOverlay');
    if (overlay) overlay.remove();
  }

  function addVideoTile(peerUid, peerName) {
    const grid = document.getElementById('gcVideoGrid');
    if (!grid) return null;

    const tile = document.createElement('div');
    tile.className = 'gc-video-tile';
    tile.id = 'gcTile_' + peerUid;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
    tile.appendChild(video);

    const label = document.createElement('span');
    label.className = 'gc-tile-name';
    label.textContent = peerName || 'User';
    tile.appendChild(label);

    grid.appendChild(tile);
    updateGridLayout();
    return video;
  }

  function updateGridLayout() {
    const grid = document.getElementById('gcVideoGrid');
    if (!grid) return;
    const count = grid.children.length;
    // CSS grid: auto columns based on participant count
    if (count <= 1) {
      grid.style.gridTemplateColumns = '1fr';
    } else if (count <= 4) {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else {
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    }
  }

  function updateParticipantCount() {
    const el = document.getElementById('gcParticipantCount');
    if (el) {
      const count = Object.keys(participants).length + 1; // +1 for self
      el.textContent = count + (count === 1 ? ' person' : ' people');
    }
  }

  // ── Video Health Check ─────────────────────────────────
  // Periodically checks all peer videos and re-plays any that are paused/stuck
  function startVideoHealthCheck() {
    stopVideoHealthCheck();
    videoHealthTimer = setInterval(() => {
      for (const uid of Object.keys(participants)) {
        const p = participants[uid];
        if (!p || !p.videoEl) continue;

        // If video element has a srcObject with tracks but is paused, try playing
        if (p.videoEl.srcObject && p.videoEl.srcObject.getTracks().length > 0 && p.videoEl.paused) {
          console.log('[GroupCall] Health check: re-playing paused video for', uid);
          p.videoEl.play().catch(() => {});
        }

        // If video element has no srcObject but remoteStream has tracks, reconnect
        if ((!p.videoEl.srcObject || p.videoEl.srcObject.getTracks().length === 0) && p.remoteStream && p.remoteStream.getTracks().length > 0) {
          console.log('[GroupCall] Health check: reconnecting stream for', uid);
          p.videoEl.srcObject = p.remoteStream;
          p.videoEl.play().catch(() => {});
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

  // ── Flip Camera ────────────────────────────────────────
  async function gcFlipCamera() {
    if (!localStream) return;
    usingFrontCam = !usingFrontCam;
    selectedVideoDeviceId = null;
    await gcSwitchVideoDevice(null);
  }

  // Switch video device mid-call
  async function gcSwitchVideoDevice(deviceId) {
    if (!localStream) return;
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

        // Replace track on all peer connections
        for (const uid of Object.keys(participants)) {
          const p = participants[uid];
          if (p && p.pc) {
            const sender = p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) await sender.replaceTrack(newTrack);
          }
        }

        if (deviceId) selectedVideoDeviceId = deviceId;
        const localVid = document.getElementById('gcLocalVideo');
        if (localVid) {
          localVid.srcObject = localStream;
          localVid.play().catch(() => {});
        }
        return;
      } catch (err) {
        console.warn('[GroupCall] switchVideoDevice attempt', i, 'failed:', err.name);
      }
    }
    if (!deviceId) usingFrontCam = !usingFrontCam;
  }

  // Switch audio device mid-call
  async function gcSwitchAudioDevice(deviceId) {
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

      // Replace track on all peer connections
      for (const uid of Object.keys(participants)) {
        const p = participants[uid];
        if (p && p.pc) {
          const sender = p.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) await sender.replaceTrack(newTrack);
        }
      }

      selectedAudioDeviceId = deviceId;
      if (micMuted) newTrack.enabled = false;
    } catch (err) {
      console.warn('[GroupCall] switchAudioDevice failed', err);
    }
  }

  // Switch audio output device (speaker/headphones)
  async function gcSwitchOutputDevice(deviceId) {
    selectedOutputDeviceId = deviceId;
    // Apply to all remote video elements
    for (const uid of Object.keys(participants)) {
      const p = participants[uid];
      if (p && p.videoEl && typeof p.videoEl.setSinkId === 'function') {
        p.videoEl.setSinkId(deviceId).catch(() => {});
      }
    }
  }

  // ── Device Picker UI ───────────────────────────────────
  async function gcToggleDevicePicker() {
    const picker = document.getElementById('gcDevicePicker');
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

    const activeVideoId = localStream && localStream.getVideoTracks()[0]
      ? localStream.getVideoTracks()[0].getSettings().deviceId : null;
    const activeAudioId = localStream && localStream.getAudioTracks()[0]
      ? localStream.getAudioTracks()[0].getSettings().deviceId : null;
    const activeOutputId = selectedOutputDeviceId || '';

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

    picker.querySelectorAll('.vc-picker-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        if (type === 'video') await gcSwitchVideoDevice(id);
        else if (type === 'audio') await gcSwitchAudioDevice(id);
        else if (type === 'output') await gcSwitchOutputDevice(id);
        gcToggleDevicePicker();
        setTimeout(gcToggleDevicePicker, 50);
      });
    });
  }

  // ── In-Call Chat ───────────────────────────────────────
  function startGroupCallChat() {
    if (!roomRef) return;
    chatRef = roomRef.child('chat');
    chatListener = chatRef.orderByChild('time').on('child_added', (snap) => {
      const msg = snap.val();
      if (!msg) return;
      const msgsEl = document.getElementById('gcChatMessages');
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
        updateGroupChatBadge();
        showFloatingChatMsg(msg.name || 'User', msg.text);
      }
    });
  }

  // Show a floating chat message toast at the bottom of the call screen
  function showFloatingChatMsg(name, text) {
    const overlay = document.getElementById('gcOverlay');
    if (!overlay) return;

    const toast = document.createElement('div');
    toast.className = 'vc-floating-msg';
    toast.innerHTML = '<strong>' + escapeHtml(name) + '</strong> ' + escapeHtml(text.length > 80 ? text.slice(0, 80) + '...' : text);
    toast.addEventListener('click', () => {
      toast.remove();
      chatOpen = true;
      document.getElementById('gcChatPanel').classList.remove('hidden');
      unreadChatCount = 0;
      updateGroupChatBadge();
      const msgs = document.getElementById('gcChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    });
    overlay.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('vc-floating-msg-out');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function stopGroupCallChat() {
    if (chatRef && chatListener) chatRef.off('child_added', chatListener);
    chatRef = null;
    chatListener = null;
  }

  function sendGroupCallChatMsg() {
    const input = document.getElementById('gcChatInput');
    if (!input || !roomRef) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    roomRef.child('chat').push({
      uid: myUid(),
      name: window.currentUsername || 'Me',
      text: text.slice(0, 500),
      time: Date.now()
    });
  }

  function updateGroupChatBadge() {
    const badge = document.getElementById('gcChatBadge');
    if (!badge) return;
    if (unreadChatCount > 0) {
      badge.textContent = unreadChatCount > 99 ? '99+' : unreadChatCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ── Timer ──────────────────────────────────────────────
  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      if (!callStartTime) return;
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const el = document.getElementById('gcTimer');
      if (el) el.textContent = mm + ':' + ss;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ── Global Video Room ──────────────────────────────────
  // The global room has a fixed ID and anyone can join
  const GLOBAL_ROOM_ID = 'global_video_room';
  let globalRoomCountRef = null;
  let globalRoomCountListener = null;

  function listenGlobalRoomCount() {
    if (globalRoomCountRef) return;
    globalRoomCountRef = getDb().ref('groupCalls/' + GLOBAL_ROOM_ID + '/participants');
    globalRoomCountListener = globalRoomCountRef.on('value', (snap) => {
      const parts = snap.val() || {};
      const count = Object.keys(parts).length;
      const el = document.getElementById('globalVideoRoomCount');
      if (el) {
        el.textContent = count > 0 ? count + ' in video' : '';
        el.classList.toggle('hidden', count === 0);
      }
    });
  }

  function stopListeningGlobalRoomCount() {
    if (globalRoomCountRef && globalRoomCountListener) {
      globalRoomCountRef.off('value', globalRoomCountListener);
    }
    globalRoomCountRef = null;
    globalRoomCountListener = null;
  }

  function joinGlobalRoom() {
    joinRoom(GLOBAL_ROOM_ID, 'global', 'Global Video Room');
  }

  // ── Group Call Notifications ───────────────────────────
  let groupCallListeners = {}; // groupId -> listener

  function listenGroupCallStatus(groupId) {
    if (groupCallListeners[groupId]) return;
    const ref = getDb().ref('groupCalls/group_' + groupId + '/participants');
    groupCallListeners[groupId] = ref.on('value', (snap) => {
      const parts = snap.val() || {};
      const count = Object.keys(parts).length;
      // Update the group header or a notification badge
      const badge = document.getElementById('groupCallBadge_' + groupId);
      if (badge) {
        badge.textContent = count > 0 ? count + ' in call' : '';
        badge.classList.toggle('hidden', count === 0);
      }
      // Show toast if someone started a call and we're not in it
      if (count > 0 && !roomRef) {
        const joinBanner = document.getElementById('groupCallJoinBanner');
        if (joinBanner) {
          joinBanner.classList.remove('hidden');
          const names = Object.values(parts).map(p => p.username || 'User');
          joinBanner.querySelector('.gc-banner-text').textContent = names.join(', ') + (count === 1 ? ' is' : ' are') + ' in a call';
        }
      }
    });
  }

  function stopListeningGroupCall(groupId) {
    if (groupCallListeners[groupId]) {
      getDb().ref('groupCalls/group_' + groupId + '/participants').off('value', groupCallListeners[groupId]);
      delete groupCallListeners[groupId];
    }
  }

  function startGroupCall(groupId, groupName) {
    joinRoom('group_' + groupId, 'group', groupName);
  }

  function joinGroupCall(groupId, groupName) {
    joinRoom('group_' + groupId, 'group', groupName);
  }

  // ── Exports ────────────────────────────────────────────
  window.ChatraGroupCall = {
    joinGlobalRoom: joinGlobalRoom,
    startGroupCall: startGroupCall,
    joinGroupCall: joinGroupCall,
    leaveRoom: leaveRoom,
    listenGlobalRoomCount: listenGlobalRoomCount,
    stopListeningGlobalRoomCount: stopListeningGlobalRoomCount,
    listenGroupCallStatus: listenGroupCallStatus,
    stopListeningGroupCall: stopListeningGroupCall,
    isInGroupCall: function () { return !!roomRef; }
  };

})();
