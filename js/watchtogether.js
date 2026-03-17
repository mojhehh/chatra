// Chatra Watch Together — YouTube search + YouTube embed player
// Synced playback through Firebase Realtime Database

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let serverUrl = null;      // Cloudflare tunnel URL for melodify server
  let currentVideo = null;   // { id, title, artist, duration, thumbnail }
  let isHost = false;
  let currentRoomId = null;
  let roomRef = null;
  let syncListener = null;
  let participantRef = null;
  let chatListener = null;
  let seekDebounce = null;
  let syncPaused = false;    // true while we're processing an incoming sync
  let lastSyncTime = 0;
  let queue = [];            // upcoming videos
  let searchTimeout = null;
  let ytPlayer = null;       // YouTube IFrame Player instance
  let ytReady = false;       // YouTube API ready flag
  let ytApiLoaded = false;   // Whether we set up the onYouTubeIframeAPIReady callback
  let usingServerFallback = false; // true when using <video> server stream
  let ytEmbedTimeout = null; // timeout for YT embed fallback check

  // ── Firebase helpers ───────────────────────────────────
  function getDb() { return firebase.database(); }
  function getAuth() { return firebase.auth(); }
  function myUid() { return getAuth().currentUser && getAuth().currentUser.uid; }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text || ''));
    return div.innerHTML;
  }

  // ── YouTube IFrame Player API ──────────────────────────
  function initYouTubeAPI() {
    if (ytApiLoaded) return;
    ytApiLoaded = true;

    // The API script is loaded in index.html; set up the callback
    if (window.YT && window.YT.Player) {
      ytReady = true;
    } else {
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        ytReady = true;
        if (typeof prev === 'function') prev();
      };
    }
  }

  function showLoading(msg) {
    var container = document.getElementById('wtPlayer');
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = '<div class="wt-loading"><div class="wt-spinner"></div><p>' + escapeHtml(msg || 'Loading...') + '</p></div>';
  }

  function createYTPlayer(videoId) {
    var container = document.getElementById('wtPlayer');
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = '';
    usingServerFallback = false;

    // Create a child div for the player
    var playerDiv = document.createElement('div');
    playerDiv.id = 'wtYTPlayerInner';
    container.appendChild(playerDiv);

    ytPlayer = new YT.Player('wtYTPlayerInner', {
      width: '100%',
      height: '100%',
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        fs: 1,
        playsinline: 1
      },
      events: {
        onReady: onYTPlayerReady,
        onStateChange: onYTStateChange,
        onPlaybackRateChange: onYTRateChange,
        onError: onYTError
      }
    });

    // Fallback: if YT embed doesn't start playing within 6s, use server
    clearTimeout(ytEmbedTimeout);
    ytEmbedTimeout = setTimeout(function () {
      if (!usingServerFallback && ytPlayer) {
        try {
          var state = ytPlayer.getPlayerState();
          // -1=unstarted, 3=buffering — if stuck, fall back
          if (state === -1 || state === 3 || state === undefined) {
            console.warn('[Watch] YouTube embed timed out, falling back to server stream');
            fallbackToServer(videoId);
          }
        } catch (e) {
          console.warn('[Watch] YouTube embed check failed, falling back to server stream');
          fallbackToServer(videoId);
        }
      }
    }, 6000);
  }

  function onYTPlayerReady(event) {
    clearTimeout(ytEmbedTimeout);
    event.target.playVideo();
    // Sync initial state if host
    if (isHost && currentRoomId) {
      setTimeout(syncPlayState, 500);
    }
  }

  function onYTStateChange(event) {
    var state = event.data;
    // YT.PlayerState: ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3, CUED=5
    if (state === YT.PlayerState.PLAYING) {
      clearTimeout(ytEmbedTimeout); // YT is working, cancel fallback
    }
    if (state === YT.PlayerState.ENDED) {
      playNext();
    } else if (isHost && !syncPaused && (state === YT.PlayerState.PLAYING || state === YT.PlayerState.PAUSED)) {
      clearTimeout(seekDebounce);
      seekDebounce = setTimeout(syncPlayState, 300);
    }
  }

  function onYTRateChange() {
    if (isHost && !syncPaused) {
      clearTimeout(seekDebounce);
      seekDebounce = setTimeout(syncPlayState, 300);
    }
  }

  function onYTError(event) {
    console.warn('[Watch] YouTube player error:', event.data, '— falling back to server');
    clearTimeout(ytEmbedTimeout);
    if (currentVideo) {
      fallbackToServer(currentVideo.id);
    }
  }

  // ── Server Video Fallback (when YouTube is blocked) ────
  async function fallbackToServer(videoId) {
    if (usingServerFallback) return;
    usingServerFallback = true;

    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
      try { ytPlayer.destroy(); } catch (e) {}
      ytPlayer = null;
    }

    showLoading('Preparing video on server...');
    if (typeof showToast === 'function') showToast('Downloading video on server — this may take a moment...', 'info');

    var url = await fetchServerUrl();

    try {
      await fetch(url + '/api/video/prepare/' + encodeURIComponent(videoId), { method: 'POST' });
    } catch (e) {
      console.warn('[Watch] prepare call failed, falling back to direct load');
    }

    var ready = false;
    for (var attempt = 0; attempt < 120; attempt++) {
      await new Promise(function (r) { setTimeout(r, 2000); });
      try {
        var resp = await fetch(url + '/api/video/status/' + encodeURIComponent(videoId));
        var data = await resp.json();
        if (data.status === 'ready') { ready = true; break; }
        if (data.status === 'error') {
          if (typeof showToast === 'function') showToast('Server could not load video', 'error');
          showLoading('');
          usingServerFallback = false;
          return;
        }
        showLoading('Downloading video on server... (' + (attempt + 1) + 's)');
      } catch (e) {
        break;
      }
    }

    if (!ready) {
      if (typeof showToast === 'function') showToast('Video download timed out', 'error');
      showLoading('');
      usingServerFallback = false;
      return;
    }

    var container = document.getElementById('wtPlayer');
    if (!container) return;

    container.innerHTML = '';
    var videoEl = document.createElement('video');
    videoEl.id = 'wtServerVideo';
    videoEl.className = 'wt-server-video';
    videoEl.controls = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.src = url + '/api/video/' + encodeURIComponent(videoId);
    container.appendChild(videoEl);

    videoEl.addEventListener('play', function () { if (isHost) syncPlayState(); });
    videoEl.addEventListener('pause', function () { if (isHost) syncPlayState(); });
    videoEl.addEventListener('seeked', function () {
      if (isHost) {
        clearTimeout(seekDebounce);
        seekDebounce = setTimeout(syncPlayState, 300);
      }
    });
    videoEl.addEventListener('ended', function () { playNext(); });
    videoEl.addEventListener('ratechange', function () {
      if (isHost) {
        clearTimeout(seekDebounce);
        seekDebounce = setTimeout(syncPlayState, 300);
      }
    });
    videoEl.addEventListener('canplay', function () {
      if (typeof showToast === 'function') showToast('Video ready!', 'info');
    });
    videoEl.addEventListener('error', function () {
      if (typeof showToast === 'function') showToast('Video failed to load from server', 'error');
    });

    videoEl.load();
    videoEl.play().catch(function () {});
  }

  // ── Server URL (from procces Firebase or direct) ──────
  async function fetchServerUrl() {
    if (serverUrl) return serverUrl;
    try {
      var resp = await fetch('https://procces-3efd9-default-rtdb.firebaseio.com/backends/melodify.json');
      var data = await resp.json();
      if (data && data.url) {
        serverUrl = data.url;
        console.log('[Watch] Server URL:', serverUrl);
        return serverUrl;
      }
    } catch (e) {
      console.warn('[Watch] Could not fetch server URL:', e);
    }
    // Fallback to localhost
    serverUrl = 'http://localhost:8092';
    return serverUrl;
  }

  // ── Search ─────────────────────────────────────────────
  async function searchVideos(query) {
    var url = await fetchServerUrl();
    try {
      var resp = await fetch(url + '/api/search?q=' + encodeURIComponent(query) + '&max=8');
      var data = await resp.json();
      return data.results || [];
    } catch (e) {
      console.error('[Watch] Search error:', e);
      return [];
    }
  }

  function renderSearchResults(results) {
    var container = document.getElementById('wtSearchResults');
    if (!container) return;
    if (!results || results.length === 0) {
      container.innerHTML = '<p class="text-slate-500 text-sm text-center py-4">No results found</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      html += '<button class="wt-search-item" data-id="' + escapeHtml(r.id) + '" data-title="' + escapeHtml(r.title) + '" data-artist="' + escapeHtml(r.artist) + '" data-duration="' + (r.duration || 0) + '" data-thumb="' + escapeHtml(r.thumbnail) + '">';
      html += '<img src="' + escapeHtml(r.thumbnail) + '" class="wt-search-thumb" loading="lazy" onerror="this.style.display=\'none\'" />';
      html += '<div class="wt-search-info">';
      html += '<span class="wt-search-title">' + escapeHtml(r.title) + '</span>';
      html += '<span class="wt-search-meta">' + escapeHtml(r.artist) + ' · ' + escapeHtml(r.duration_string || '') + '</span>';
      html += '</div>';
      html += '</button>';
    }
    container.innerHTML = html;

    // Wire click handlers
    container.querySelectorAll('.wt-search-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var video = {
          id: btn.dataset.id,
          title: btn.dataset.title,
          artist: btn.dataset.artist,
          duration: parseInt(btn.dataset.duration) || 0,
          thumbnail: btn.dataset.thumb
        };
        if (currentRoomId) {
          addToQueue(video);
        } else {
          playVideo(video);
        }
      });
    });
  }

  // ── Player ─────────────────────────────────────────────
  async function playVideo(video) {
    currentVideo = video;
    usingServerFallback = false;
    clearTimeout(ytEmbedTimeout);
    var placeholder = document.getElementById('wtPlaceholder');
    var playerContainer = document.getElementById('wtPlayer');
    var playerInfo = document.getElementById('wtPlayerInfo');
    var playerTitle = document.getElementById('wtPlayerTitle');
    var playerArtist = document.getElementById('wtPlayerArtist');

    if (placeholder) placeholder.classList.add('hidden');
    if (playerInfo) playerInfo.classList.remove('hidden');
    if (playerTitle) playerTitle.textContent = video.title;
    if (playerArtist) playerArtist.textContent = video.artist;

    // Try YouTube IFrame Player API first
    if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function' && !usingServerFallback) {
      ytPlayer.loadVideoById(video.id);
      // Set fallback timeout
      clearTimeout(ytEmbedTimeout);
      ytEmbedTimeout = setTimeout(function () {
        if (!usingServerFallback) {
          try {
            var state = ytPlayer.getPlayerState();
            if (state === -1 || state === 3 || state === undefined) {
              fallbackToServer(video.id);
            }
          } catch (e) { fallbackToServer(video.id); }
        }
      }, 6000);
    } else if (ytReady) {
      createYTPlayer(video.id);
    } else {
      // YT API not loaded (might be blocked) — wait briefly then fall back to server
      showLoading('Connecting...');
      var waited = 0;
      var waitInterval = setInterval(function () {
        waited += 200;
        if (ytReady) {
          clearInterval(waitInterval);
          createYTPlayer(video.id);
        } else if (waited >= 3000) {
          // YT API itself is blocked, go straight to server
          clearInterval(waitInterval);
          console.warn('[Watch] YouTube API failed to load, using server stream');
          fallbackToServer(video.id);
        }
      }, 200);
    }

    // If in a room and I'm host, sync the video + play state
    if (currentRoomId && isHost && roomRef) {
      roomRef.child('video').set({
        id: video.id,
        title: video.title,
        artist: video.artist,
        duration: video.duration,
        thumbnail: video.thumbnail
      });
      setTimeout(syncPlayState, 1000);
    }
  }

  function stopVideo() {
    clearTimeout(ytEmbedTimeout);
    var placeholder = document.getElementById('wtPlaceholder');
    var playerContainer = document.getElementById('wtPlayer');
    var playerInfo = document.getElementById('wtPlayerInfo');

    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
      try { ytPlayer.destroy(); } catch (e) {}
      ytPlayer = null;
    }
    if (playerContainer) {
      playerContainer.innerHTML = '';
      playerContainer.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (playerInfo) playerInfo.classList.add('hidden');
    currentVideo = null;
    usingServerFallback = false;
  }

  // ── Queue ──────────────────────────────────────────────
  function addToQueue(video) {
    // If nothing is playing, play immediately
    if (!currentVideo) {
      playVideo(video);
      return;
    }
    queue.push(video);
    renderQueue();
    if (typeof showToast === 'function') showToast('Added to queue', 'info');
    // Sync queue to room
    if (currentRoomId && isHost && roomRef) {
      roomRef.child('queue').set(queue);
    }
  }

  function playNext() {
    if (queue.length === 0) {
      stopVideo();
      return;
    }
    var next = queue.shift();
    renderQueue();
    playVideo(next);
    if (currentRoomId && isHost && roomRef) {
      roomRef.child('queue').set(queue);
    }
  }

  function renderQueue() {
    var container = document.getElementById('wtQueue');
    if (!container) return;
    if (queue.length === 0) {
      container.innerHTML = '<p class="text-slate-500 text-xs text-center py-2">Queue is empty</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < queue.length; i++) {
      var v = queue[i];
      html += '<div class="wt-queue-item">';
      html += '<span class="wt-queue-num">' + (i + 1) + '</span>';
      html += '<img src="' + escapeHtml(v.thumbnail) + '" class="wt-queue-thumb" onerror="this.style.display=\'none\'" />';
      html += '<div class="wt-queue-info">';
      html += '<span class="wt-queue-title">' + escapeHtml(v.title) + '</span>';
      html += '<span class="wt-queue-artist">' + escapeHtml(v.artist) + '</span>';
      html += '</div>';
      html += '<button class="wt-queue-remove" data-idx="' + i + '" title="Remove">&times;</button>';
      html += '</div>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.wt-queue-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx);
        queue.splice(idx, 1);
        renderQueue();
        if (currentRoomId && isHost && roomRef) {
          roomRef.child('queue').set(queue);
        }
      });
    });
  }

  // ── Watch Together Rooms (Firebase sync) ───────────────
  function generateRoomId() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  async function createRoom() {
    var uid = myUid();
    if (!uid) return;
    if (currentRoomId) {
      if (typeof showToast === 'function') showToast('Already in a room', 'error');
      return;
    }

    var roomId = generateRoomId();
    currentRoomId = roomId;
    isHost = true;
    roomRef = getDb().ref('watchRooms/' + roomId);

    await roomRef.set({
      host: uid,
      hostName: window.currentUsername || 'Unknown',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      video: currentVideo ? {
        id: currentVideo.id,
        title: currentVideo.title,
        artist: currentVideo.artist,
        duration: currentVideo.duration,
        thumbnail: currentVideo.thumbnail
      } : null,
      playState: currentVideo ? { playing: false, time: 0, updatedAt: Date.now() } : null,
      queue: queue
    });

    // Register self
    participantRef = roomRef.child('participants/' + uid);
    await participantRef.set({ name: window.currentUsername || 'User', joinedAt: firebase.database.ServerValue.TIMESTAMP });
    participantRef.onDisconnect().remove();

    // Clean up room when host disconnects
    roomRef.onDisconnect().remove();

    listenToRoom();
    updateRoomUI();
    if (typeof showToast === 'function') showToast('Room created! Share the code: ' + roomId, 'info');
  }

  async function joinRoom(roomId) {
    var uid = myUid();
    if (!uid) return;
    if (currentRoomId) {
      if (typeof showToast === 'function') showToast('Already in a room', 'error');
      return;
    }

    roomRef = getDb().ref('watchRooms/' + roomId);
    var snap = await roomRef.once('value');
    if (!snap.exists()) {
      if (typeof showToast === 'function') showToast('Room not found', 'error');
      roomRef = null;
      return;
    }

    currentRoomId = roomId;
    isHost = false;

    // Register self
    participantRef = roomRef.child('participants/' + uid);
    await participantRef.set({ name: window.currentUsername || 'User', joinedAt: firebase.database.ServerValue.TIMESTAMP });
    participantRef.onDisconnect().remove();

    // Load current state
    var data = snap.val();
    if (data.video) {
      await playVideo(data.video);
    }
    if (data.queue) {
      queue = data.queue;
      renderQueue();
    }
    if (data.playState) {
      applyPlayState(data.playState);
    }

    listenToRoom();
    updateRoomUI();
    if (typeof showToast === 'function') showToast('Joined room!', 'info');
  }

  function leaveRoom() {
    if (!currentRoomId) return;

    if (participantRef) {
      participantRef.onDisconnect().cancel();
      participantRef.remove().catch(function () {});
      participantRef = null;
    }

    if (syncListener) {
      roomRef.child('playState').off('value', syncListener);
      syncListener = null;
    }
    if (chatListener) {
      roomRef.child('chat').off('child_added', chatListener);
      chatListener = null;
    }
    roomRef.child('video').off();
    roomRef.child('queue').off();
    roomRef.child('participants').off();

    // If host, remove the room
    if (isHost && roomRef) {
      roomRef.onDisconnect().cancel();
      roomRef.remove().catch(function () {});
    }

    roomRef = null;
    currentRoomId = null;
    isHost = false;
    updateRoomUI();
    if (typeof showToast === 'function') showToast('Left room', 'info');
  }

  function listenToRoom() {
    if (!roomRef) return;

    // Sync play state (non-host)
    syncListener = roomRef.child('playState').on('value', function (snap) {
      if (isHost) return; // host doesn't react to its own updates
      var state = snap.val();
      if (state) applyPlayState(state);
    });

    // Sync video changes
    roomRef.child('video').on('value', function (snap) {
      if (isHost) return;
      var vid = snap.val();
      if (vid && (!currentVideo || vid.id !== currentVideo.id)) {
        playVideo(vid);
      }
    });

    // Sync queue
    roomRef.child('queue').on('value', function (snap) {
      if (isHost) return;
      var q = snap.val();
      queue = q || [];
      renderQueue();
    });

    // Participant count
    roomRef.child('participants').on('value', function (snap) {
      var parts = snap.val() || {};
      var uids = Object.keys(parts);
      var count = uids.length;
      var el = document.getElementById('wtParticipantCount');
      if (el) el.textContent = count + (count === 1 ? ' viewer' : ' viewers');
      renderParticipantList(parts);
    });

    // Chat
    chatListener = roomRef.child('chat').orderByChild('ts').limitToLast(50).on('child_added', function (snap) {
      var msg = snap.val();
      if (msg) appendRoomChat(msg);
    });
  }

  function applyPlayState(state) {
    if (!currentVideo) return;
    syncPaused = true;

    var serverTime = state.time || 0;
    var elapsed = (Date.now() - (state.updatedAt || Date.now())) / 1000;
    var expectedTime = state.playing ? serverTime + elapsed : serverTime;

    if (usingServerFallback) {
      // Server <video> fallback
      var videoEl = document.getElementById('wtServerVideo');
      if (!videoEl) { syncPaused = false; return; }
      if (Math.abs(videoEl.currentTime - expectedTime) > 2) {
        videoEl.currentTime = expectedTime;
      }
      if (state.playing && videoEl.paused) {
        videoEl.play().catch(function () {});
      } else if (!state.playing && !videoEl.paused) {
        videoEl.pause();
      }
      if (state.playbackRate && videoEl.playbackRate !== state.playbackRate) {
        videoEl.playbackRate = state.playbackRate;
      }
    } else {
      // YouTube player
      if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') { syncPaused = false; return; }
      var currentTime = ytPlayer.getCurrentTime() || 0;
      if (Math.abs(currentTime - expectedTime) > 2) {
        ytPlayer.seekTo(expectedTime, true);
      }
      var playerState = ytPlayer.getPlayerState();
      if (state.playing && playerState !== YT.PlayerState.PLAYING) {
        ytPlayer.playVideo();
      } else if (!state.playing && playerState === YT.PlayerState.PLAYING) {
        ytPlayer.pauseVideo();
      }
      if (state.playbackRate && typeof ytPlayer.setPlaybackRate === 'function') {
        var curRate = ytPlayer.getPlaybackRate() || 1;
        if (curRate !== state.playbackRate) ytPlayer.setPlaybackRate(state.playbackRate);
      }
    }

    setTimeout(function () { syncPaused = false; }, 500);
  }

  function syncPlayState() {
    if (!roomRef || !isHost || syncPaused) return;

    var playing = false;
    var time = 0;

    if (usingServerFallback) {
      var videoEl = document.getElementById('wtServerVideo');
      if (!videoEl) return;
      playing = !videoEl.paused;
      time = videoEl.currentTime || 0;
    } else {
      if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
      var playerState = ytPlayer.getPlayerState();
      playing = playerState === YT.PlayerState.PLAYING;
      time = ytPlayer.getCurrentTime() || 0;
    }

    var rate = 1;
    if (usingServerFallback) {
      var vEl = document.getElementById('wtServerVideo');
      if (vEl) rate = vEl.playbackRate || 1;
    } else if (ytPlayer && typeof ytPlayer.getPlaybackRate === 'function') {
      rate = ytPlayer.getPlaybackRate() || 1;
    }

    roomRef.child('playState').set({
      playing: playing,
      time: time,
      playbackRate: rate,
      updatedAt: Date.now()
    });
  }

  // ── Room Chat ──────────────────────────────────────────
  function sendRoomChat(text) {
    if (!roomRef || !text.trim()) return;
    var uid = myUid();
    roomRef.child('chat').push({
      uid: uid,
      name: window.currentUsername || 'User',
      text: text.trim().substring(0, 300),
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function fetchProfilePicUrl(uid) {
    return firebase.database().ref('users/' + uid + '/profilePic').once('value').then(function (s) {
      return s.val() || null;
    }).catch(function () { return null; });
  }

  function renderParticipantList(parts) {
    var container = document.getElementById('wtParticipantList');
    if (!container) return;
    var label = container.querySelector('p');
    container.innerHTML = '';
    if (label) container.appendChild(label);
    else {
      var p = document.createElement('p');
      p.className = 'text-[10px] text-slate-500 uppercase tracking-wider font-semibold';
      p.textContent = 'Participants';
      container.appendChild(p);
    }

    var uids = Object.keys(parts);
    uids.forEach(function (uid) {
      var info = parts[uid];
      var name = (info && info.name) || 'User';
      var initial = name[0].toUpperCase();
      var row = document.createElement('div');
      row.className = 'wt-participant-row';
      row.innerHTML = '<div class="wt-participant-avatar"><span>' + escapeHtml(initial) + '</span></div>' +
        '<span class="wt-participant-name">' + escapeHtml(name) + '</span>';
      container.appendChild(row);
      fetchProfilePicUrl(uid).then(function (url) {
        if (url) {
          var av = row.querySelector('.wt-participant-avatar');
          if (av) av.innerHTML = '<img src="' + escapeHtml(url) + '" class="wt-participant-img" onerror="this.parentElement.innerHTML=\'<span>' + escapeHtml(initial) + '</span>\'" />';
        }
      });
    });
  }

  function appendRoomChat(msg) {
    var container = document.getElementById('wtRoomChatMessages');
    if (!container) return;
    var isMine = msg.uid === myUid();
    var name = (msg.name || 'User');
    var initial = name[0].toUpperCase();
    var div = document.createElement('div');
    div.className = 'wt-chat-msg' + (isMine ? ' wt-chat-mine' : '');
    div.innerHTML = '<div class="wt-chat-avatar" id="wtChatAv_' + (msg.ts || '') + '"><span>' + escapeHtml(initial) + '</span></div>' +
      '<div class="wt-chat-bubble"><span class="wt-chat-name">' + escapeHtml(name) + '</span>' +
      '<span class="wt-chat-text">' + escapeHtml(msg.text) + '</span></div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    if (msg.uid) {
      fetchProfilePicUrl(msg.uid).then(function (url) {
        if (url) {
          var av = div.querySelector('.wt-chat-avatar');
          if (av) av.innerHTML = '<img src="' + escapeHtml(url) + '" class="wt-chat-avatar-img" onerror="this.parentElement.innerHTML=\'<span>' + escapeHtml(initial) + '</span>\'" />';
        }
      });
    }
  }

  // ── Room UI Updates ────────────────────────────────────
  function updateRoomUI() {
    var roomPanel = document.getElementById('wtRoomPanel');
    var createBtn = document.getElementById('wtCreateRoom');
    var joinBtn = document.getElementById('wtJoinRoom');
    var leaveBtn = document.getElementById('wtLeaveRoom');
    var roomCode = document.getElementById('wtRoomCode');
    var hostBadge = document.getElementById('wtHostBadge');
    var copyBtn = document.getElementById('wtCopyCode');

    if (currentRoomId) {
      if (roomPanel) roomPanel.classList.remove('hidden');
      if (createBtn) createBtn.classList.add('hidden');
      if (joinBtn) joinBtn.classList.add('hidden');
      if (leaveBtn) leaveBtn.classList.remove('hidden');
      if (roomCode) { roomCode.textContent = currentRoomId; roomCode.classList.remove('hidden'); }
      if (copyBtn) copyBtn.classList.remove('hidden');
      if (hostBadge) hostBadge.classList.toggle('hidden', !isHost);
    } else {
      if (roomPanel) roomPanel.classList.add('hidden');
      if (createBtn) createBtn.classList.remove('hidden');
      if (joinBtn) joinBtn.classList.remove('hidden');
      if (leaveBtn) leaveBtn.classList.add('hidden');
      if (roomCode) roomCode.classList.add('hidden');
      if (copyBtn) copyBtn.classList.add('hidden');
      if (hostBadge) hostBadge.classList.add('hidden');
    }
  }

  // ── Init (called when watch page is shown) ─────────────
  function initWatchPage() {
    // Initialize YouTube IFrame API
    initYouTubeAPI();

    // Fetch server URL in background
    fetchServerUrl();

    // Wire search
    var searchInput = document.getElementById('wtSearchInput');
    if (searchInput && !searchInput._wired) {
      searchInput._wired = true;
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimeout);
        var q = searchInput.value.trim();
        if (q.length < 2) return;
        searchTimeout = setTimeout(function () {
          var loading = document.getElementById('wtSearchResults');
          if (loading) loading.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Searching...</p>';
          searchVideos(q).then(renderSearchResults);
        }, 400);
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(searchTimeout);
          var q = searchInput.value.trim();
          if (!q) return;
          var loading = document.getElementById('wtSearchResults');
          if (loading) loading.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Searching...</p>';
          searchVideos(q).then(renderSearchResults);
        }
      });
    }

    // Wire room buttons
    var createBtn = document.getElementById('wtCreateRoom');
    if (createBtn && !createBtn._wired) {
      createBtn._wired = true;
      createBtn.addEventListener('click', createRoom);
    }
    var joinBtn = document.getElementById('wtJoinRoom');
    if (joinBtn && !joinBtn._wired) {
      joinBtn._wired = true;
      joinBtn.addEventListener('click', function () {
        var code = prompt('Enter room code:');
        if (code && code.trim()) joinRoom(code.trim());
      });
    }
    var leaveBtn = document.getElementById('wtLeaveRoom');
    if (leaveBtn && !leaveBtn._wired) {
      leaveBtn._wired = true;
      leaveBtn.addEventListener('click', leaveRoom);
    }

    // Wire room chat
    var chatForm = document.getElementById('wtRoomChatForm');
    if (chatForm && !chatForm._wired) {
      chatForm._wired = true;
      chatForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = document.getElementById('wtRoomChatInput');
        if (input && input.value.trim()) {
          sendRoomChat(input.value);
          input.value = '';
        }
      });
    }

    // Wire copy room code
    var copyBtn = document.getElementById('wtCopyCode');
    if (copyBtn && !copyBtn._wired) {
      copyBtn._wired = true;
      copyBtn.addEventListener('click', function () {
        var code = document.getElementById('wtRoomCode');
        if (code && code.textContent) {
          navigator.clipboard.writeText(code.textContent).then(function () {
            if (typeof showToast === 'function') showToast('Room code copied!', 'info');
          }).catch(function () {});
        }
      });
    }

    renderQueue();
    updateRoomUI();
  }

  // ── Exports ────────────────────────────────────────────
  window.ChatraWatch = {
    init: initWatchPage,
    createRoom: createRoom,
    joinRoom: joinRoom,
    leaveRoom: leaveRoom,
    searchVideos: searchVideos,
    playVideo: playVideo
  };

})();
