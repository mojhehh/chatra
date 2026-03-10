// Chatra Group Video Call — WebRTC Mesh + Firebase Signaling
// Supports group FaceTime and global video rooms

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let localStream = null;
  let roomId = null;
  let roomRef = null;
  let roomType = null; // 'group' or 'global'
  let participants = {}; // uid -> { pc, videoEl, audioEl, username }
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

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isEdge = /Edg\//i.test(navigator.userAgent);

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
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

  // Preferred video constraints — 1080p 60fps, graceful fallback
  function getVideoConstraints() {
    if (isEdge) {
      return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } };
    }
    if (isIOS || isSafari) {
      return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode: usingFrontCam ? 'user' : 'environment' };
    }
    return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, min: 30 }, facingMode: usingFrontCam ? 'user' : 'environment' };
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
    const videoConstraint = selectedVideoDeviceId
      ? { deviceId: { exact: selectedVideoDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
      : getVideoConstraints();
    const audioConstraint = selectedAudioDeviceId
      ? { deviceId: { exact: selectedAudioDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

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

  // Set SDP to prefer high bitrate
  function setHighBitrate(sdp) {
    if (isSafari || isIOS) return sdp;
    const lines = sdp.split('\r\n');
    const result = [];
    let isVideo = false;
    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);
      if (lines[i].startsWith('m=video')) { isVideo = true; } else if (lines[i].startsWith('m=')) { isVideo = false; }
      if (isVideo && lines[i].startsWith('c=')) {
        if (i + 1 < lines.length && lines[i + 1].startsWith('b=')) { i++; }
        result.push('b=AS:6000');
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
      if (!existing) remoteStream.addTrack(event.track);

      const p = participants[peerUid];
      if (p && p.videoEl) {
        p.videoEl.srcObject = remoteStream;

        // Set output device if selected
        if (selectedOutputDeviceId && typeof p.videoEl.setSinkId === 'function') {
          p.videoEl.setSinkId(selectedOutputDeviceId).catch(() => {});
        }

        // Play with retries for Safari autoplay restrictions
        const tryPlay = () => { const r = p.videoEl.play(); if (r) r.catch(() => {}); };
        tryPlay();
        if (!playRetryTimers[peerUid]) {
          let retries = 0;
          playRetryTimers[peerUid] = setInterval(() => {
            retries++;
            if (p.videoEl && p.videoEl.paused) tryPlay();
            if ((p.videoEl && !p.videoEl.paused) || retries >= 20) {
              clearInterval(playRetryTimers[peerUid]);
              delete playRetryTimers[peerUid];
            }
          }, 500);
        }
      }

      // Listen for track unmute → re-trigger play for Safari
      event.track.addEventListener('unmute', () => {
        const pe = participants[peerUid];
        if (pe && pe.videoEl && pe.videoEl.paused) pe.videoEl.play().catch(() => {});
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
    participants[peerUid] = { pc, remoteStream, videoEl, username: peerName };

    // Listen for ICE candidates FROM the peer TO me
    const sigRef = roomRef.child('signals/' + peerUid + '_' + myUid());
    const sigListener = sigRef.on('child_added', (snap) => {
      const candidate = snap.val();
      if (candidate && pc.remoteDescription && pc.remoteDescription.type) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
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
          await pc.setRemoteDescription(answer);
          // Process any queued ICE candidates
          sigRef.once('value', (candSnap) => {
            const cands = candSnap.val() || {};
            Object.values(cands).forEach(c => {
              pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            });
          });
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
          await pc.setRemoteDescription(offer);
          const answer = await pc.createAnswer();
          answer.sdp = setHighBitrate(answer.sdp);
          await pc.setLocalDescription(answer);
          await roomRef.child('answers/' + myUid() + '_' + peerUid).set({
            type: answer.type, sdp: answer.sdp
          });
          // Process any queued ICE candidates
          sigRef.once('value', (candSnap) => {
            const cands = candSnap.val() || {};
            Object.values(cands).forEach(c => {
              pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            });
          });
        }
      });
      signalListeners.push({ ref: offerRef, event: 'value', fn: offerListener });
    }

    updateParticipantCount();
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
    delete participants[peerUid];
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

  function leaveRoom() {
    if (!roomRef) return;

    stopTimer();
    stopGroupCallChat();

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
      }
    });
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
