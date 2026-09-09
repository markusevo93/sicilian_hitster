// ============================================================
// KONFIGURATION — hier deine Spotify Client ID eintragen
// ============================================================
const CONFIG = {
  CLIENT_ID: '7e234b2795154f498c6e59a365f8aa50', // aus dem Spotify Developer Dashboard
  SCOPES: 'user-read-playback-state user-modify-playback-state',
  ROUND_SECONDS: 90,
};

const REDIRECT_URI = window.location.origin + window.location.pathname;

// ============================================================
// STATE
// ============================================================
const state = {
  accessToken: null,
  refreshToken: null,
  tokenExpiresAt: 0,
  songs: [],          // {titel, interpret, jahr, spotify_id?}
  playedIndices: new Set(),
  currentSong: null,
  deviceId: null,
  round: 1,
  timerHandle: null,
  timerRemaining: CONFIG.ROUND_SECONDS,
  isPlaying: false,
};

const el = (id) => document.getElementById(id);
const screens = {
  login: el('screen-login'),
  setup: el('screen-setup'),
  game: el('screen-game'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function toast(msg, ms = 3500) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add('hidden'), ms);
}

// ============================================================
// PKCE AUTH (kein Client Secret nötig — läuft komplett im Browser)
// ============================================================
function randomString(len = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

async function sha256base64url(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function startLogin() {
  if (CONFIG.CLIENT_ID === 'DEINE_SPOTIFY_CLIENT_ID') {
    toast('Bitte zuerst in app.js deine Spotify Client ID eintragen.');
    return;
  }
  const verifier = randomString(64);
  const challenge = await sha256base64url(verifier);
  localStorage.setItem('pkce_verifier', verifier);

  const params = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: CONFIG.SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('pkce_verifier');
  const body = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Token-Austausch fehlgeschlagen');
  const data = await res.json();
  saveTokens(data);
}

async function refreshAccessToken() {
  if (!state.refreshToken) return false;
  const body = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: state.refreshToken,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return false;
  const data = await res.json();
  saveTokens(data);
  return true;
}

function saveTokens(data) {
  state.accessToken = data.access_token;
  if (data.refresh_token) state.refreshToken = data.refresh_token;
  state.tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000;
  localStorage.setItem('sp_refresh_token', state.refreshToken || '');
}

async function ensureToken() {
  if (state.accessToken && Date.now() < state.tokenExpiresAt) return true;
  return refreshAccessToken();
}

// ============================================================
// SPOTIFY API HELPER
// ============================================================
async function spotifyFetch(path, options = {}) {
  await ensureToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) return spotifyFetch(path, options);
  }
  return res;
}

async function fetchDevices() {
  const res = await spotifyFetch('/me/player/devices');
  if (!res.ok) return [];
  const data = await res.json();
  return data.devices || [];
}

async function playTrack(uri, deviceId) {
  return spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: 0 }),
  });
}

async function pausePlayback(deviceId) {
  return spotifyFetch(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
}

async function searchTrackUri(titel, interpret) {
  const q = encodeURIComponent(`track:${titel} artist:${interpret}`);
  const res = await spotifyFetch(`/search?q=${q}&type=track&limit=1`);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.tracks?.items?.[0];
  return item ? item.uri : null;
}

// ============================================================
// CSV IMPORT — Format: titel;interpret;jahr[;spotify_id]
// ============================================================
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [, ...rows] = lines; // erste Zeile = Kopfzeile, wird übersprungen
  return rows.map((line) => {
    const [titel, interpret, jahr, spotify_id] = line.split(';').map((s) => s?.trim());
    return { titel, interpret, jahr, spotify_id: spotify_id || null };
  }).filter((s) => s.titel && s.interpret && s.jahr);
}

el('csv-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const songs = parseCsv(text);
  if (songs.length === 0) {
    toast('Keine gültigen Zeilen gefunden. Format: titel;interpret;jahr');
    return;
  }
  state.songs = songs;
  state.playedIndices.clear();
  localStorage.setItem('song_list', JSON.stringify(songs));
  el('csv-status').textContent = `${songs.length} Songs geladen ✓`;
  updateSetupCount();
  maybeEnableStart();
});

function updateSetupCount() {
  el('setup-count').textContent = state.songs.length
    ? `${state.songs.length} Songs bereit.`
    : '';
}

// ============================================================
// GERÄTE
// ============================================================
async function refreshDeviceList() {
  const select = el('device-select');
  select.innerHTML = '<option>Lade Geräte …</option>';
  const devices = await fetchDevices();
  if (devices.length === 0) {
    select.innerHTML = '<option value="">Kein Gerät gefunden — Spotify App öffnen</option>';
    return;
  }
  select.innerHTML = devices
    .map((d) => `<option value="${d.id}" ${d.is_active ? 'selected' : ''}>${d.name} (${d.type})</option>`)
    .join('');
  state.deviceId = select.value;
  maybeEnableStart();
}

el('device-select').addEventListener('change', (e) => {
  state.deviceId = e.target.value;
  maybeEnableStart();
});
el('btn-refresh-devices').addEventListener('click', refreshDeviceList);

function maybeEnableStart() {
  el('btn-start-game').disabled = !(state.songs.length > 0 && state.deviceId);
}

// ============================================================
// SPIEL-LOGIK
// ============================================================
function pickNextSong() {
  if (state.playedIndices.size >= state.songs.length) {
    state.playedIndices.clear(); // Liste durch — von vorn mischen
    toast('Alle Songs gespielt — Liste wird neu gemischt.');
  }
  let idx;
  do {
    idx = Math.floor(Math.random() * state.songs.length);
  } while (state.playedIndices.has(idx));
  state.playedIndices.add(idx);
  return state.songs[idx];
}

async function startRound() {
  el('reveal-card').classList.add('hidden');
  el('btn-reveal').disabled = true;
  el('round-counter').textContent = `Runde ${state.round}`;
  resetTimerDisplay();

  state.currentSong = pickNextSong();

  let uri = state.currentSong.spotify_id
    ? `spotify:track:${state.currentSong.spotify_id}`
    : await searchTrackUri(state.currentSong.titel, state.currentSong.interpret);

  if (!uri) {
    toast(`"${state.currentSong.titel}" nicht auf Spotify gefunden — überspringe.`);
    return startRound();
  }

  const res = await playTrack(uri, state.deviceId);
  if (!res.ok) {
    toast('Wiedergabe fehlgeschlagen. Ist das Gerät noch aktiv?');
    return;
  }
  state.isPlaying = true;
  el('vinyl').classList.remove('is-stopping');
  el('vinyl').classList.add('is-spinning');
  el('btn-play-pause').textContent = 'Pausieren';
  startTimer();
}

function startTimer() {
  clearInterval(state.timerHandle);
  state.timerRemaining = CONFIG.ROUND_SECONDS;
  updateTimerDisplay();
  state.timerHandle = setInterval(() => {
    state.timerRemaining -= 1;
    updateTimerDisplay();
    if (state.timerRemaining <= 0) {
      stopRoundPlayback();
    }
  }, 1000);
}

function resetTimerDisplay() {
  state.timerRemaining = CONFIG.ROUND_SECONDS;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const m = Math.floor(Math.max(state.timerRemaining, 0) / 60);
  const s = Math.max(state.timerRemaining, 0) % 60;
  el('timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
}

async function stopRoundPlayback() {
  clearInterval(state.timerHandle);
  state.isPlaying = false;
  await pausePlayback(state.deviceId);
  el('vinyl').classList.remove('is-spinning');
  el('vinyl').classList.add('is-stopping');
  el('btn-play-pause').textContent = 'Song abspielen';
  el('btn-reveal').disabled = false;
}

el('btn-play-pause').addEventListener('click', async () => {
  if (state.isPlaying) {
    await stopRoundPlayback();
  } else if (state.currentSong) {
    // erneut abspielen (z.B. nach manueller Pause) ohne neuen Song zu ziehen
    const uri = state.currentSong.spotify_id
      ? `spotify:track:${state.currentSong.spotify_id}`
      : await searchTrackUri(state.currentSong.titel, state.currentSong.interpret);
    if (uri) {
      await playTrack(uri, state.deviceId);
      state.isPlaying = true;
      el('vinyl').classList.remove('is-stopping');
      el('vinyl').classList.add('is-spinning');
      el('btn-play-pause').textContent = 'Pausieren';
      startTimer();
    }
  } else {
    startRound();
  }
});

el('btn-reveal').addEventListener('click', () => {
  const s = state.currentSong;
  el('reveal-year').textContent = s.jahr;
  el('reveal-title').textContent = s.titel;
  el('reveal-artist').textContent = s.interpret;
  el('reveal-card').classList.remove('hidden');
});

el('btn-next-round').addEventListener('click', () => {
  state.round += 1;
  startRound();
});

el('btn-quit').addEventListener('click', () => {
  clearInterval(state.timerHandle);
  pausePlayback(state.deviceId);
  state.round = 1;
  showScreen('setup');
  refreshDeviceList();
});

el('btn-start-game').addEventListener('click', () => {
  showScreen('game');
  startRound();
});

// ============================================================
// INIT / AUTH CALLBACK
// ============================================================
async function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  const storedRefresh = localStorage.getItem('sp_refresh_token');
  if (storedRefresh) state.refreshToken = storedRefresh;

  const storedSongs = localStorage.getItem('song_list');
  if (storedSongs) {
    state.songs = JSON.parse(storedSongs);
    el('csv-status').textContent = `${state.songs.length} Songs geladen ✓`;
    updateSetupCount();
  }

  if (code) {
    try {
      await exchangeCodeForToken(code);
      window.history.replaceState({}, '', REDIRECT_URI);
      showScreen('setup');
      await refreshDeviceList();
      maybeEnableStart();
      return;
    } catch (err) {
      toast('Login fehlgeschlagen: ' + err.message);
    }
  }

  if (state.refreshToken) {
    const ok = await refreshAccessToken();
    if (ok) {
      showScreen('setup');
      await refreshDeviceList();
      maybeEnableStart();
      return;
    }
  }

  showScreen('login');
}

el('btn-login').addEventListener('click', startLogin);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
