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

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
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

  // ── Media ──────────────────────────────────────────────
  async function acquireMedia() {
    const fallbacks = [
      { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } },
      { video: true, audio: true },
      { video: false, audio: true }
    ];
    for (let i = 0; i < fallbacks.length; i++) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia(fallbacks[i]);
        return localStream;
      } catch (e) {
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

  // ── Peer Connection per participant ────────────────────
  function createPeerConnection(peerUid) {
    const config = { iceServers: ICE_SERVERS };
    if (!isSafari && !isIOS) config.iceCandidatePoolSize = 4;
    const pc = new RTCPeerConnection(config);

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
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
        p.videoEl.play().catch(() => {});
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      const state = pc.iceConnectionState;
      console.log('[GroupCall] ICE', myUid(), '<->', peerUid, state);
      if (state === 'failed') {
        // Try ICE restart
        if (shouldIOffer(peerUid)) {
          pc.createOffer({ iceRestart: true }).then(offer => {
            return pc.setLocalDescription(offer);
          }).then(() => {
            roomRef.child('offers/' + myUid() + '_' + peerUid).set({
              type: pc.localDescription.type,
              sdp: pc.localDescription.sdp
            });
          }).catch(() => {});
        }
      }
      if (state === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            removePeer(peerUid);
          }
        }, 15000);
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

    stopMedia();

    roomRef = null;
    roomId = null;
    roomType = null;
    callStartTime = 0;
    camMuted = false;
    micMuted = false;
    chatOpen = false;
    unreadChatCount = 0;

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
        <button id="gcChatBtn" class="vc-btn vc-btn-toggle" title="In-call chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="gcChatBadge" class="vc-chat-badge hidden">0</span>
        </button>
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
      camMuted; // not used, mic:
      micMuted = !micMuted;
      localStream.getAudioTracks().forEach(t => { t.enabled = !micMuted; });
      document.getElementById('gcToggleMic').classList.toggle('off', micMuted);
    });

    document.getElementById('gcToggleCam').addEventListener('click', () => {
      if (!localStream) return;
      camMuted = !camMuted;
      localStream.getVideoTracks().forEach(t => { t.enabled = !camMuted; });
      document.getElementById('gcToggleCam').classList.toggle('off', camMuted);
    });

    document.getElementById('gcEndCall').addEventListener('click', () => leaveRoom());

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
