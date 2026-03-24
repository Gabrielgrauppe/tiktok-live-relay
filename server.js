const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 10000;

// ============================================
// ROOMS - each user has a unique room
// ============================================
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      sseClients: {
        edits1: [], edits2: [], edits3: [],
        coins: [], likes: [],
        characters: [],
        jar: [],
        scoreboard: [],
        timer: []
      },
      coinsRanking: {},
      likesRanking: {},
      coinsConfig: { bg: 'transparent', side: 'left' },
      likesConfig: { bg: 'transparent', side: 'left' }
    };
  }
  return rooms[roomId];
}

// ============================================
// MEDIA STORAGE (in-memory, temporary)
// ============================================
const mediaStore = {};

setInterval(() => {
  const now = Date.now();
  for (const [id, media] of Object.entries(mediaStore)) {
    if (now - media.createdAt > 10 * 60 * 1000) {
      delete mediaStore[id];
    }
  }
}, 60 * 1000);

setInterval(() => {
  for (const [id, room] of Object.entries(rooms)) {
    const s = room.sseClients;
    const hasClients = s.edits1.length > 0 || s.edits2.length > 0 || s.edits3.length > 0 ||
                       s.coins.length > 0 || s.likes.length > 0 || s.characters.length > 0 || s.jar.length > 0 || s.scoreboard.length > 0;
    const hasData = Object.keys(room.coinsRanking).length > 0 ||
                    Object.keys(room.likesRanking).length > 0;
    if (!hasClients && !hasData) delete rooms[id];
  }
}, 30 * 60 * 1000);

// ============================================
// CORS
// ============================================
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(200); return; }
  next();
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/ping', (req, res) => {
  res.json({ status: true, message: 'TikTok Live Relay is running!' });
});

// ============================================
// MEDIA ENDPOINT
// ============================================
app.get('/media/:id', (req, res) => {
  const media = mediaStore[req.params.id];
  if (!media) { res.status(404).send('Media not found'); return; }
  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(media.data);
});

// ============================================
// OVERLAY PAGES
// ============================================

// Edits overlay - scene 1, 2, or 3
app.get('/overlay/:roomId/edits/:scene', (req, res) => {
  const { roomId, scene } = req.params;
  const sceneNum = parseInt(scene) || 1;
  if (sceneNum < 1 || sceneNum > 3) { res.status(400).send('Scene must be 1, 2, or 3'); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getEditsHTML(roomId, sceneNum));
});

// Coins ranking overlay
app.get('/overlay/:roomId/ranking/coins', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getRankingHTML(req.params.roomId, 'coins'));
});

// Likes ranking overlay
app.get('/overlay/:roomId/ranking/likes', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getRankingHTML(req.params.roomId, 'likes'));
});

// Characters overlay
app.get('/overlay/:roomId/characters', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getCharactersHTML(req.params.roomId));
});

// Scoreboard overlay
app.get('/overlay/:roomId/scoreboard', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getScoreboardHTML(req.params.roomId));
});

// Jar overlay
app.get('/overlay/:roomId/jar', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getJarHTML(req.params.roomId));
});

app.get('/overlay/:roomId/timer', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getTimerHTML(req.params.roomId));
});

// ============================================
// SSE ENDPOINTS
// ============================================

// Edits SSE per scene
app.get('/sse/:roomId/edits/:scene', (req, res) => {
  const { roomId, scene } = req.params;
  const sceneNum = parseInt(scene) || 1;
  const key = 'edits' + sceneNum;
  const room = getRoom(roomId);
  if (!room.sseClients[key]) { res.status(400).send('Invalid scene'); return; }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('data: {"type":"connected"}\n\n');
  room.sseClients[key].push(res);
  req.on('close', () => {
    room.sseClients[key] = room.sseClients[key].filter(c => c !== res);
  });
});

app.get('/sse/:roomId/ranking/coins', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write(`data: ${JSON.stringify({ type: 'config', ...room.coinsConfig })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.coinsRanking })}\n\n`);
  room.sseClients.coins.push(res);
  req.on('close', () => {
    room.sseClients.coins = room.sseClients.coins.filter(c => c !== res);
  });
});

app.get('/sse/:roomId/ranking/likes', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write(`data: ${JSON.stringify({ type: 'config', ...room.likesConfig })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.likesRanking })}\n\n`);
  room.sseClients.likes.push(res);
  req.on('close', () => {
    room.sseClients.likes = room.sseClients.likes.filter(c => c !== res);
  });
});

// Scoreboard SSE
app.get('/sse/:roomId/scoreboard', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  // Send current state
  const sb = room.scoreboard || { left: 0, right: 0, leftName: 'Streamer', rightName: 'Chat', theme: 'neon' };
  res.write(`data: ${JSON.stringify({ type: 'full', ...sb })}\n\n`);
  room.sseClients.scoreboard.push(res);
  req.on('close', () => {
    room.sseClients.scoreboard = room.sseClients.scoreboard.filter(c => c !== res);
  });
});

// Jar SSE
app.get('/sse/:roomId/jar', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('data: {"type":"connected"}\n\n');
  room.sseClients.jar.push(res);
  req.on('close', () => {
    room.sseClients.jar = room.sseClients.jar.filter(c => c !== res);
  });
});

// Characters SSE
app.get('/sse/:roomId/characters', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('data: {"type":"connected"}\n\n');
  room.sseClients.characters.push(res);
  req.on('close', () => {
    room.sseClients.characters = room.sseClients.characters.filter(c => c !== res);
  });
});

app.get('/sse/:roomId/timer', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('data: {"type":"connected"}\n\n');
  room.sseClients.timer.push(res);
  req.on('close', () => {
    room.sseClients.timer = room.sseClients.timer.filter(c => c !== res);
  });
});

// ============================================
// WEBSOCKET
// ============================================
wss.on('connection', (ws) => {
  let roomId = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'join') {
        roomId = msg.roomId;
        getRoom(roomId);
        ws.send(JSON.stringify({ type: 'joined', roomId }));
        return;
      }

      if (!roomId) return;
      const room = getRoom(roomId);

      // Media upload
      if (msg.type === 'media') {
        const buffer = Buffer.from(msg.data, 'base64');
        mediaStore[msg.id] = { data: buffer, mimeType: msg.mimeType, createdAt: Date.now() };
        ws.send(JSON.stringify({ type: 'media-ready', id: msg.id }));
      }

      // Edit trigger - route to correct scene
      if (msg.type === 'edit') {
        const scene = msg.scene || 1;
        const key = 'edits' + scene;
        const mediaUrl = `/media/${msg.mediaId}`;
        const event = JSON.stringify({
          type: 'play',
          giftName: msg.giftName,
          mediaUrl: mediaUrl,
          duration: msg.duration,
          isGif: msg.isGif
        });
        if (room.sseClients[key]) {
          room.sseClients[key].forEach(client => {
            try { client.write(`data: ${event}\n\n`); } catch (e) {}
          });
        }
      }

      // Coins ranking
      if (msg.type === 'coins') {
        room.coinsRanking = msg.data;
        const event = JSON.stringify({ type: 'full', data: msg.data });
        room.sseClients.coins.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Likes ranking
      if (msg.type === 'likes') {
        room.likesRanking = msg.data;
        const event = JSON.stringify({ type: 'full', data: msg.data });
        room.sseClients.likes.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Ranking config update (bg color, side)
      if (msg.type === 'ranking-config') {
        const target = msg.ranking; // 'coins' or 'likes'
        const config = { bg: msg.bg || 'transparent', side: msg.side || 'left', theme: msg.theme || 'clean', customColor: msg.customColor || '' };
        if (target === 'coins') room.coinsConfig = config;
        if (target === 'likes') room.likesConfig = config;
        const event = JSON.stringify({ type: 'config', ...config });
        const clients = room.sseClients[target] || [];
        clients.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Scoreboard update
      if (msg.type === 'scoreboard') {
        room.scoreboard = { left: msg.left, right: msg.right, leftName: msg.leftName, rightName: msg.rightName, theme: msg.theme };
        const event = JSON.stringify({ type: 'full', ...room.scoreboard });
        room.sseClients.scoreboard.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Jar gift event
      if (msg.type === 'jar-gift') {
        const event = JSON.stringify({ type: 'gift', giftImage: msg.giftImage, giftName: msg.giftName, count: msg.count || 1, coins: msg.coins || 0 });
        room.sseClients.jar.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Jar reset
      if (msg.type === 'jar-reset') {
        const event = JSON.stringify({ type: 'reset' });
        room.sseClients.jar.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Timer update
      if (msg.type === 'timer') {
        room.timerState = { seconds: msg.seconds, running: msg.running, theme: msg.theme };
        const event = JSON.stringify({ type: 'timer', seconds: msg.seconds, running: msg.running });
        room.sseClients.timer.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Timer config
      if (msg.type === 'timer-config') {
        room.timerTheme = msg.theme;
        const event = JSON.stringify({ type: 'config', theme: msg.theme });
        room.sseClients.timer.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Character events (evolution + appear)
      if (msg.type === 'character') {
        const event = JSON.stringify(msg);
        room.sseClients.characters.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

    } catch (e) {}
  });

  ws.on('close', () => { roomId = null; });
});

// ============================================
// OVERLAY HTML GENERATORS
// ============================================

function getEditsHTML(roomId, scene) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
  }
  #media-container {
    display: none;
    width: 100%;
    height: 100%;
  }
  #media-container.active { display: block; }
  #media-container video,
  #media-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .gift-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.75);
    color: white;
    padding: 10px 24px;
    border-radius: 30px;
    font-family: 'Segoe UI', sans-serif;
    font-size: 18px;
    font-weight: 600;
    display: none;
    z-index: 10;
    animation: fadeInDown 0.4s ease-out;
  }
  .gift-toast.active { display: block; }
  @keyframes fadeInDown {
    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
</head>
<body>
<div class="gift-toast" id="toast"></div>
<div id="media-container">
  <video id="video" autoplay></video>
  <img id="gif" style="display:none">
</div>
<script>
  const container = document.getElementById('media-container');
  const video = document.getElementById('video');
  const gif = document.getElementById('gif');
  const toast = document.getElementById('toast');

  // Queue system
  const queue = [];
  let isPlaying = false;

  const evtSource = new EventSource('/sse/${roomId}/edits/${scene}');

  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'play') {
      queue.push(data);
      if (!isPlaying) playNext();
    }
  };

  function playNext() {
    if (queue.length === 0) {
      isPlaying = false;
      container.classList.remove('active');
      toast.classList.remove('active');
      video.pause();
      video.src = '';
      gif.src = '';
      return;
    }

    isPlaying = true;
    const data = queue.shift();

    video.style.display = 'none';
    gif.style.display = 'none';
    video.pause();
    video.src = '';

    toast.textContent = '\\u{1F381} ' + data.giftName;
    toast.classList.add('active');
    container.classList.add('active');

    const src = data.mediaUrl;

    if (data.isGif) {
      gif.src = src;
      gif.style.display = 'block';
      setTimeout(() => playNext(), data.duration * 1000);
    } else {
      video.src = src;
      video.style.display = 'block';
      video.play().catch(() => {});
      // When video ends naturally, play next
      video.onended = () => playNext();
      // Fallback timeout in case video is shorter or has issues
      setTimeout(() => {
        if (isPlaying && queue.length > 0) playNext();
        else if (isPlaying && queue.length === 0) {
          isPlaying = false;
          container.classList.remove('active');
          toast.classList.remove('active');
          video.pause();
          video.src = '';
        }
      }, data.duration * 1000);
    }
  }
</script>
</body>
</html>`;
}

function getRankingHTML(roomId, type) {
  const sseUrl = `/sse/${roomId}/ranking/${type}`;
  const valueKey = type === 'coins' ? 'coins' : 'likes';
  const valueIcon = type === 'coins' ? '\\u{1FA99}' : '\\u2764\\uFE0F';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=MedievalSharp&family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    font-family: 'Segoe UI', -apple-system, sans-serif;
    color: white;
    padding: 16px;
    overflow-y: auto;
    transition: background 0.3s;
  }
  .ranking-list { display: flex; flex-direction: column; gap: 6px; }
  .ranking-item {
    display: flex; align-items: center; gap: 10px;
    flex-direction: row;
    background: transparent; border-radius: 12px;
    padding: 8px 14px;
    animation: slideIn 0.3s ease-out;
    transition: all 0.3s;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .pos {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; flex-shrink: 0;
  }
  .pos-1 { background: linear-gradient(135deg, #f1c40f, #e67e22); color: #1a1a2e; }
  .pos-2 { background: linear-gradient(135deg, #bdc3c7, #95a5a6); color: #1a1a2e; }
  .pos-3 { background: linear-gradient(135deg, #e67e22, #d35400); color: #1a1a2e; }
  .pos-other { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.6); }
  .avatar {
    width: 42px; height: 42px; border-radius: 50%;
    background: rgba(255,255,255,0.1); overflow: hidden; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 16px;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-frame-1 {
    border: 3px solid #f1c40f;
    box-shadow: 0 0 12px rgba(241, 196, 15, 0.5);
  }
  .avatar-frame-2 {
    border: 3px solid #bdc3c7;
    box-shadow: 0 0 10px rgba(189, 195, 199, 0.4);
  }
  .avatar-frame-3 {
    border: 3px solid #e67e22;
    box-shadow: 0 0 10px rgba(230, 126, 34, 0.4);
  }
  .user-info { flex: 1; min-width: 0; text-align: left; }
  .user-name {
    font-size: 14px; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  }
  .user-value {
    font-size: 13px; font-weight: 800;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  }
  .empty { text-align: center; color: rgba(255,255,255,0.3); padding: 40px; font-size: 14px; }

  /* THEME: CLEAN */
  .theme-clean .ranking-item { background: transparent; }
  .theme-clean .user-value { color: #f1c40f; }

  /* THEME: NEON */
  .theme-neon .ranking-item {
    background: rgba(10,10,30,0.7); border: 1px solid rgba(0,212,255,0.3);
    box-shadow: 0 0 8px rgba(0,212,255,0.1);
  }
  .theme-neon .user-name { color: #00d4ff; text-shadow: 0 0 8px rgba(0,212,255,0.5); }
  .theme-neon .user-value { color: #ff3366; text-shadow: 0 0 8px rgba(255,51,102,0.5); }
  .theme-neon .avatar-frame-1 { border-color: #00d4ff; box-shadow: 0 0 15px rgba(0,212,255,0.6); }
  .theme-neon .avatar-frame-2 { border-color: #ff3366; box-shadow: 0 0 12px rgba(255,51,102,0.4); }
  .theme-neon .avatar-frame-3 { border-color: #ffd700; box-shadow: 0 0 12px rgba(255,215,0,0.4); }

  /* THEME: MEDIEVAL */
  .theme-medieval .ranking-item {
    background: rgba(30,20,10,0.8); border: 1px solid rgba(201,164,74,0.4);
  }
  .theme-medieval .ranking-item { font-family: 'MedievalSharp', cursive; }
  .theme-medieval .user-name { color: #ffd700; }
  .theme-medieval .user-value { color: #c9a44a; }
  .theme-medieval .avatar-frame-1 { border-color: #ffd700; box-shadow: 0 0 15px rgba(255,215,0,0.5); }
  .theme-medieval .avatar-frame-2 { border-color: #c0c0c0; box-shadow: 0 0 12px rgba(192,192,192,0.4); }
  .theme-medieval .avatar-frame-3 { border-color: #cd7f32; box-shadow: 0 0 12px rgba(205,127,50,0.4); }

  /* THEME: RETRO */
  .theme-retro .ranking-item {
    background: rgba(0,0,0,0.85); border: 1px solid #39ff14;
    font-family: 'Press Start 2P', monospace;
  }
  .theme-retro .user-name { color: #39ff14; font-size: 10px; text-shadow: 0 0 6px rgba(57,255,20,0.6); }
  .theme-retro .user-value { color: #39ff14; font-size: 10px; }
  .theme-retro .avatar-frame-1 { border-color: #39ff14; box-shadow: 0 0 10px rgba(57,255,20,0.6); }
  .theme-retro .avatar-frame-2 { border-color: #00ffff; box-shadow: 0 0 8px rgba(0,255,255,0.4); }
  .theme-retro .avatar-frame-3 { border-color: #ff00ff; box-shadow: 0 0 8px rgba(255,0,255,0.4); }

  /* THEME: FIRE */
  .theme-fire .ranking-item {
    background: rgba(40,10,0,0.8); border: 1px solid rgba(255,107,53,0.4);
  }
  .theme-fire .user-name { color: #fff44f; }
  .theme-fire .user-value { color: #ff6b35; text-shadow: 0 0 8px rgba(255,107,53,0.5); }
  .theme-fire .avatar-frame-1 { border-color: #ff4500; box-shadow: 0 0 15px rgba(255,69,0,0.6), 0 0 30px rgba(255,69,0,0.3); }
  .theme-fire .avatar-frame-2 { border-color: #ff6b35; box-shadow: 0 0 12px rgba(255,107,53,0.4); }
  .theme-fire .avatar-frame-3 { border-color: #ffd700; box-shadow: 0 0 10px rgba(255,215,0,0.4); }

  /* THEME: ICE */
  .theme-ice .ranking-item {
    background: rgba(10,20,40,0.8); border: 1px solid rgba(135,206,235,0.3);
  }
  .theme-ice .user-name { color: #e0f0ff; }
  .theme-ice .user-value { color: #87ceeb; text-shadow: 0 0 8px rgba(135,206,235,0.5); }
  .theme-ice .avatar-frame-1 { border-color: #87ceeb; box-shadow: 0 0 15px rgba(135,206,235,0.6); }
  .theme-ice .avatar-frame-2 { border-color: #b0e0e6; box-shadow: 0 0 12px rgba(176,224,230,0.4); }
  .theme-ice .avatar-frame-3 { border-color: #4fc3f7; box-shadow: 0 0 10px rgba(79,195,247,0.4); }

  /* THEME: ROYALTY */
  .theme-royalty .ranking-item {
    background: linear-gradient(135deg, rgba(50,20,80,0.85), rgba(30,10,60,0.85));
    border: 1px solid rgba(186,133,255,0.4);
  }
  .theme-royalty .user-name { color: #e8d5ff; }
  .theme-royalty .user-value { color: #ffd700; text-shadow: 0 0 8px rgba(255,215,0,0.5); }
  .theme-royalty .pos-1 { background: linear-gradient(135deg, #ffd700, #ffaa00); }
  .theme-royalty .pos-2 { background: linear-gradient(135deg, #e8d5ff, #ba85ff); color: #1a1a2e; }
  .theme-royalty .pos-3 { background: linear-gradient(135deg, #ff69b4, #ff1493); color: white; }
  .theme-royalty .avatar-frame-1 { border-color: #ffd700; box-shadow: 0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(186,133,255,0.3); }
  .theme-royalty .avatar-frame-2 { border-color: #ba85ff; box-shadow: 0 0 15px rgba(186,133,255,0.5); }
  .theme-royalty .avatar-frame-3 { border-color: #ff69b4; box-shadow: 0 0 12px rgba(255,105,180,0.4); }

  /* THEME: CUSTOM (just bg color, clean look) */
  .theme-custom .ranking-item { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); }
  .theme-custom .user-value { color: #f1c40f; }
</style>
</head>
<body>
<div id="theme-wrapper" class="theme-clean">
<div class="ranking-list" id="list"></div>
</div>
<script>
  const list = document.getElementById('list');
  const wrapper = document.getElementById('theme-wrapper');
  const evtSource = new EventSource('${sseUrl}');
  let currentSide = 'left';
  let currentTheme = 'clean';

  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') renderRanking(msg.data);
    if (msg.type === 'config') applyConfig(msg);
  };

  function applyConfig(cfg) {
    if (cfg.theme !== undefined) {
      currentTheme = cfg.theme;
      wrapper.className = 'theme-' + cfg.theme;
      if (cfg.theme === 'custom' && cfg.customColor) {
        document.body.style.background = cfg.customColor;
      } else if (cfg.theme === 'clean') {
        document.body.style.background = 'transparent';
      } else {
        document.body.style.background = 'transparent';
      }
    }
    if (cfg.bg !== undefined && currentTheme !== 'custom') {
      document.body.style.background = cfg.bg;
    }
    if (cfg.side !== undefined) {
      currentSide = cfg.side;
      const isRight = cfg.side === 'right';
      document.querySelectorAll('.ranking-item').forEach(item => {
        item.style.flexDirection = isRight ? 'row-reverse' : 'row';
      });
      document.querySelectorAll('.user-info').forEach(el => {
        el.style.textAlign = isRight ? 'right' : 'left';
      });
      const style = document.getElementById('dynamic-style');
      if (style) {
        style.textContent = '@keyframes slideIn { from { opacity: 0; transform: translateX(' + (isRight ? '20px' : '-20px') + '); } to { opacity: 1; transform: translateX(0); } }';
      }
    }
  }

  function renderRanking(data) {
    const isRight = currentSide === 'right';
    const sorted = Object.entries(data)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.${valueKey} - a.${valueKey})
      .slice(0, 20);

    if (sorted.length === 0) {
      list.innerHTML = '<div class="empty">Aguardando dados...</div>';
      return;
    }

    list.innerHTML = sorted.map((user, i) => {
      const pos = i + 1;
      const posClass = pos <= 3 ? 'pos-' + pos : 'pos-other';
      const frameClass = pos <= 3 ? 'avatar-frame-' + pos : '';
      const avatar = user.profilePictureUrl
        ? '<img src="' + user.profilePictureUrl + '" onerror="this.parentElement.innerHTML=\\'\\u{1F464}\\'">'
        : '\\u{1F464}';
      const val = user.${valueKey}.toLocaleString();
      return '<div class="ranking-item" style="flex-direction:' + (isRight ? 'row-reverse' : 'row') + '">' +
        '<div class="pos ' + posClass + '">' + pos + '</div>' +
        '<div class="avatar ' + frameClass + '">' + avatar + '</div>' +
        '<div class="user-info" style="text-align:' + (isRight ? 'right' : 'left') + '">' +
        '<div class="user-name">' + esc(user.nickname) + '</div>' +
        '<div class="user-value">${valueIcon} ' + val + '</div>' +
        '</div></div>';
    }).join('');
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  const dynStyle = document.createElement('style');
  dynStyle.id = 'dynamic-style';
  document.head.appendChild(dynStyle);
</script>
</body>
</html>`;
}

function getCharactersHTML(roomId) {
  const sseUrl = `/sse/${roomId}/characters`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
    font-family: 'Segoe UI', -apple-system, sans-serif;
  }

  /* Evolution overlay */
  #evolution-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 100;
    background: rgba(0, 0, 0, 0.7);
  }
  #evolution-overlay.active { display: flex; }

  .evo-title {
    font-size: 28px;
    font-weight: 900;
    color: #f1c40f;
    text-shadow: 0 0 20px rgba(241,196,15,0.8), 0 4px 12px rgba(0,0,0,0.5);
    margin-bottom: 10px;
    animation: pulseGlow 1s ease-in-out infinite alternate;
  }
  @keyframes pulseGlow {
    from { text-shadow: 0 0 20px rgba(241,196,15,0.8); }
    to { text-shadow: 0 0 40px rgba(241,196,15,1), 0 0 60px rgba(241,196,15,0.5); }
  }

  .evo-nickname {
    font-size: 20px;
    color: white;
    margin-bottom: 20px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.5);
  }

  .evo-chars {
    display: flex;
    align-items: center;
    gap: 30px;
    margin-bottom: 20px;
  }
  .evo-char {
    width: 350px;
    height: 450px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .evo-char img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 12px rgba(255,255,255,0.3));
  }
  .evo-char.old { opacity: 0.5; animation: fadeOut 2s forwards; }
  .evo-char.new { animation: scaleIn 0.8s ease-out; }
  .evo-arrow {
    font-size: 48px;
    color: #f1c40f;
    animation: arrowPulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes fadeOut { to { opacity: 0.2; transform: scale(0.8); } }
  @keyframes scaleIn {
    from { transform: scale(0) rotate(-10deg); opacity: 0; }
    to { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes arrowPulse {
    from { transform: translateX(-5px); }
    to { transform: translateX(5px); }
  }

  .evo-level {
    font-size: 24px;
    font-weight: 800;
    color: #2ecc71;
    text-shadow: 0 0 10px rgba(46,204,113,0.5);
  }

  /* Particles */
  .particle {
    position: fixed;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    pointer-events: none;
    animation: particleFloat 2s ease-out forwards;
  }
  @keyframes particleFloat {
    0% { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-200px) scale(0); }
  }

  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Orbitron:wght@700;900&display=swap');

  /* Character appear */
  #appear-container {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    display: none;
    flex-direction: column;
    align-items: center;
    z-index: 50;
    padding-bottom: 10px;
  }
  #appear-container.active { display: flex; }

  .appear-char {
    width: 400px;
    height: 500px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: bounceIn 0.6s ease-out;
  }
  .appear-char img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 20px rgba(0,0,0,0.6));
  }
  @keyframes bounceIn {
    0% { transform: translateY(100px) scale(0); opacity: 0; }
    60% { transform: translateY(-10px) scale(1.1); opacity: 1; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }

  .appear-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 4px;
    gap: 3px;
  }

  .appear-name {
    font-family: 'Cinzel', serif;
    font-size: 26px;
    font-weight: 900;
    color: #fff;
    text-shadow: 0 0 15px rgba(255,215,0,0.8), 0 2px 4px rgba(0,0,0,0.8);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .appear-health {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }
  .appear-health-label {
    font-family: 'Orbitron', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: #ff4444;
    text-shadow: 0 0 8px rgba(255,68,68,0.6);
  }
  .appear-health-bar {
    width: 180px;
    height: 14px;
    background: rgba(0,0,0,0.6);
    border-radius: 7px;
    border: 1px solid rgba(255,68,68,0.4);
    overflow: hidden;
    position: relative;
  }
  .appear-health-fill {
    height: 100%;
    border-radius: 7px;
    background: linear-gradient(90deg, #ff4444, #ff6b6b);
    box-shadow: 0 0 10px rgba(255,68,68,0.5);
    transition: width 0.5s ease;
  }
  .appear-health-text {
    font-family: 'Orbitron', sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  }

  .appear-role {
    font-family: 'Cinzel', serif;
    font-size: 15px;
    font-weight: 700;
    color: #00e5ff;
    text-shadow: 0 0 12px rgba(0,229,255,0.6), 0 1px 3px rgba(0,0,0,0.6);
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-top: 1px;
  }
</style>
</head>
<body>

<div id="evolution-overlay"></div>
<div id="appear-container">
  <div class="appear-char" id="appear-char"></div>
  <div class="appear-info">
    <div class="appear-name" id="appear-name"></div>
    <div class="appear-health">
      <span class="appear-health-label">HP</span>
      <div class="appear-health-bar"><div class="appear-health-fill" id="appear-hp"></div></div>
      <span class="appear-health-text" id="appear-hp-text"></span>
    </div>
    <div class="appear-role" id="appear-role"></div>
  </div>
</div>

<script>
  const evoOverlay = document.getElementById('evolution-overlay');
  const appearContainer = document.getElementById('appear-container');
  const appearChar = document.getElementById('appear-char');
  const appearName = document.getElementById('appear-name');

  const queue = [];
  let isBusy = false;

  const evtSource = new EventSource('${sseUrl}');
  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.eventType || msg.type === 'evolution' || msg.type === 'appear' || msg.type === 'character') {
      queue.push(msg);
      if (!isBusy) processNext();
    }
  };

  function processNext() {
    if (queue.length === 0) { isBusy = false; return; }
    isBusy = true;
    const evt = queue.shift();
    const subType = evt.eventType || evt.type;

    if (subType === 'evolution' || evt.fromLevel !== undefined) {
      showEvolution(evt);
    } else if (subType === 'appear' || evt.image) {
      showAppear(evt);
    } else {
      processNext();
    }
  }

  function showEvolution(data) {
    const prevImg = data.prevImage || '';
    const newImg = data.newImage || '';

    evoOverlay.innerHTML =
      '<div class="evo-title">\\u2B50 EVOLU\\u00C7\\u00C3O! \\u2B50</div>' +
      '<div class="evo-nickname">' + esc(data.nickname) + '</div>' +
      '<div class="evo-chars">' +
        (prevImg ? '<div class="evo-char old"><img src="' + prevImg + '"></div>' : '') +
        '<div class="evo-arrow">\\u27A1\\uFE0F</div>' +
        '<div class="evo-char new"><img src="' + newImg + '"></div>' +
      '</div>' +
      '<div class="evo-level">N\\u00EDvel ' + data.toLevel + ' - ' + esc(data.charName || '') + '</div>';

    evoOverlay.classList.add('active');
    spawnParticles();

    setTimeout(() => {
      evoOverlay.classList.remove('active');
      evoOverlay.innerHTML = '';
      processNext();
    }, 6000);
  }

  function showAppear(data) {
    const img = data.image || '';
    if (!img) { processNext(); return; }

    const duration = (data.duration || 5) * 1000;

    appearChar.innerHTML = '<img src="' + img + '">';

    appearName.textContent = esc(data.nickname);

    // HP based on level: lv10=200, lv20=450, lv30=700, lv40=900, lv50=1200
    const hpMap = { 10: 200, 20: 450, 30: 700, 40: 900, 50: 1200 };
    const lvl = data.level || 10;
    const hp = hpMap[lvl] || 200;
    const maxHp = 1200;
    document.getElementById('appear-hp').style.width = ((hp / maxHp) * 100) + '%';
    document.getElementById('appear-hp-text').textContent = hp + '/' + hp;

    // Role/function
    const role = data.role || data.charName || '';
    document.getElementById('appear-role').textContent = role;
    document.getElementById('appear-role').style.display = role ? 'block' : 'none';

    appearContainer.classList.add('active');

    setTimeout(() => {
      appearContainer.classList.remove('active');
      processNext();
    }, duration);
  }

  function spawnParticles() {
    const colors = ['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22'];
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.top = (50 + Math.random() * 40) + 'vh';
      p.style.animationDelay = (Math.random() * 1) + 's';
      p.style.width = (4 + Math.random() * 8) + 'px';
      p.style.height = p.style.width;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 3000);
    }
  }

  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
</script>
</body>
</html>`;
}

// ============================================
// SCOREBOARD OVERLAY HTML
// ============================================
function getScoreboardHTML(roomId) {
  const sseUrl = `/sse/${roomId}/scoreboard`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Cinzel:wght@700;900&family=Press+Start+2P&family=Russo+One&family=Rajdhani:wght@700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .scoreboard {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    position: relative;
  }

  .sb-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 28px;
    min-width: 180px;
    position: relative;
  }

  .sb-name {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .sb-score {
    font-size: 64px;
    font-weight: 900;
    line-height: 1;
  }

  .sb-vs {
    font-size: 22px;
    font-weight: 900;
    padding: 8px 14px;
    z-index: 5;
  }

  /* ===== THEME: NEON ===== */
  .theme-neon .sb-side.left {
    background: linear-gradient(135deg, rgba(0,200,255,0.15), rgba(0,100,255,0.25));
    border: 2px solid #00d4ff;
    border-radius: 16px 0 0 16px;
    box-shadow: 0 0 25px rgba(0,212,255,0.3), inset 0 0 20px rgba(0,212,255,0.1);
  }
  .theme-neon .sb-side.right {
    background: linear-gradient(135deg, rgba(255,50,50,0.25), rgba(255,0,80,0.15));
    border: 2px solid #ff3366;
    border-radius: 0 16px 16px 0;
    box-shadow: 0 0 25px rgba(255,51,102,0.3), inset 0 0 20px rgba(255,51,102,0.1);
  }
  .theme-neon .sb-name { font-family: 'Orbitron', sans-serif; }
  .theme-neon .sb-side.left .sb-name { color: #00d4ff; text-shadow: 0 0 15px rgba(0,212,255,0.8); }
  .theme-neon .sb-side.right .sb-name { color: #ff3366; text-shadow: 0 0 15px rgba(255,51,102,0.8); }
  .theme-neon .sb-score { font-family: 'Orbitron', sans-serif; color: #fff; text-shadow: 0 0 20px rgba(255,255,255,0.5); }
  .theme-neon .sb-vs {
    font-family: 'Orbitron', sans-serif;
    color: #ffd700;
    text-shadow: 0 0 15px rgba(255,215,0,0.8);
    background: rgba(0,0,0,0.6);
    border-radius: 50%;
    width: 50px; height: 50px;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #ffd700;
    box-shadow: 0 0 20px rgba(255,215,0,0.3);
  }

  /* ===== THEME: MEDIEVAL ===== */
  .theme-medieval .sb-side.left {
    background: linear-gradient(135deg, rgba(40,60,120,0.8), rgba(20,30,80,0.9));
    border: 3px solid #8b7355;
    border-radius: 12px 0 0 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2);
  }
  .theme-medieval .sb-side.right {
    background: linear-gradient(135deg, rgba(120,30,30,0.8), rgba(80,10,10,0.9));
    border: 3px solid #8b7355;
    border-radius: 0 12px 12px 0;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2);
  }
  .theme-medieval .sb-name { font-family: 'Cinzel', serif; color: #ffd700; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
  .theme-medieval .sb-score { font-family: 'Cinzel', serif; color: #fff; text-shadow: 0 3px 6px rgba(0,0,0,0.6); }
  .theme-medieval .sb-vs {
    font-family: 'Cinzel', serif;
    color: #ffd700;
    background: linear-gradient(135deg, #5c4033, #3e2723);
    border: 3px solid #8b7355;
    border-radius: 8px;
    padding: 6px 12px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
  }

  /* ===== THEME: RETRO/ARCADE ===== */
  .theme-retro .sb-side.left {
    background: #111;
    border: 3px solid #00ff41;
    border-radius: 4px 0 0 4px;
    box-shadow: 0 0 10px rgba(0,255,65,0.3), inset 0 0 15px rgba(0,255,65,0.05);
  }
  .theme-retro .sb-side.right {
    background: #111;
    border: 3px solid #ff00ff;
    border-radius: 0 4px 4px 0;
    box-shadow: 0 0 10px rgba(255,0,255,0.3), inset 0 0 15px rgba(255,0,255,0.05);
  }
  .theme-retro .sb-name { font-family: 'Press Start 2P', monospace; font-size: 11px; }
  .theme-retro .sb-side.left .sb-name { color: #00ff41; }
  .theme-retro .sb-side.right .sb-name { color: #ff00ff; }
  .theme-retro .sb-score { font-family: 'Press Start 2P', monospace; font-size: 48px; color: #fff; }
  .theme-retro .sb-vs {
    font-family: 'Press Start 2P', monospace;
    font-size: 14px;
    color: #ffff00;
    background: #111;
    border: 2px solid #ffff00;
    padding: 6px 10px;
  }

  /* ===== THEME: FIRE ===== */
  .theme-fire .sb-side.left {
    background: linear-gradient(180deg, rgba(255,100,0,0.3), rgba(200,50,0,0.5));
    border: 2px solid #ff6600;
    border-radius: 14px 0 0 14px;
    box-shadow: 0 0 30px rgba(255,100,0,0.3), inset 0 -10px 30px rgba(255,50,0,0.2);
  }
  .theme-fire .sb-side.right {
    background: linear-gradient(180deg, rgba(255,100,0,0.3), rgba(200,50,0,0.5));
    border: 2px solid #ff6600;
    border-radius: 0 14px 14px 0;
    box-shadow: 0 0 30px rgba(255,100,0,0.3), inset 0 -10px 30px rgba(255,50,0,0.2);
  }
  .theme-fire .sb-name { font-family: 'Russo One', sans-serif; color: #ffd700; text-shadow: 0 0 10px rgba(255,100,0,0.8), 0 2px 4px rgba(0,0,0,0.5); }
  .theme-fire .sb-score { font-family: 'Russo One', sans-serif; color: #fff; text-shadow: 0 0 15px rgba(255,150,0,0.6); }
  .theme-fire .sb-vs {
    font-family: 'Russo One', sans-serif;
    color: #ffd700;
    background: rgba(200,50,0,0.7);
    border: 2px solid #ff6600;
    border-radius: 50%;
    width: 48px; height: 48px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 20px rgba(255,100,0,0.5);
  }

  /* ===== THEME: ICE ===== */
  .theme-ice .sb-side.left {
    background: linear-gradient(180deg, rgba(100,200,255,0.2), rgba(50,150,220,0.35));
    border: 2px solid rgba(150,220,255,0.6);
    border-radius: 14px 0 0 14px;
    box-shadow: 0 0 25px rgba(100,200,255,0.2), inset 0 0 20px rgba(200,240,255,0.08);
  }
  .theme-ice .sb-side.right {
    background: linear-gradient(180deg, rgba(100,200,255,0.2), rgba(50,150,220,0.35));
    border: 2px solid rgba(150,220,255,0.6);
    border-radius: 0 14px 14px 0;
    box-shadow: 0 0 25px rgba(100,200,255,0.2), inset 0 0 20px rgba(200,240,255,0.08);
  }
  .theme-ice .sb-name { font-family: 'Rajdhani', sans-serif; font-size: 20px; color: #b0e0ff; text-shadow: 0 0 12px rgba(150,220,255,0.7); }
  .theme-ice .sb-score { font-family: 'Rajdhani', sans-serif; color: #fff; text-shadow: 0 0 20px rgba(150,220,255,0.5); }
  .theme-ice .sb-vs {
    font-family: 'Rajdhani', sans-serif;
    color: #b0e0ff;
    background: rgba(30,80,120,0.7);
    border: 2px solid rgba(150,220,255,0.5);
    border-radius: 50%;
    width: 48px; height: 48px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 15px rgba(100,200,255,0.3);
  }

  /* ===== THEME: ROYALTY ===== */
  .theme-royalty .sb-side.left {
    background: linear-gradient(180deg, rgba(80,30,120,0.8), rgba(50,15,80,0.9));
    border: 2px solid rgba(186,133,255,0.6);
    border-radius: 14px 0 0 14px;
    box-shadow: 0 0 25px rgba(186,133,255,0.3), inset 0 0 20px rgba(186,133,255,0.08);
  }
  .theme-royalty .sb-side.right {
    background: linear-gradient(180deg, rgba(120,30,60,0.8), rgba(80,15,40,0.9));
    border: 2px solid rgba(255,105,180,0.6);
    border-radius: 0 14px 14px 0;
    box-shadow: 0 0 25px rgba(255,105,180,0.3), inset 0 0 20px rgba(255,105,180,0.08);
  }
  .theme-royalty .sb-name { font-family: 'Rajdhani', sans-serif; font-size: 20px; color: #e8d5ff; text-shadow: 0 0 12px rgba(186,133,255,0.7); }
  .theme-royalty .sb-score { font-family: 'Rajdhani', sans-serif; color: #ffd700; text-shadow: 0 0 20px rgba(255,215,0,0.5); }
  .theme-royalty .sb-vs {
    font-family: 'Rajdhani', sans-serif;
    color: #ffd700;
    background: linear-gradient(135deg, rgba(80,30,120,0.8), rgba(50,15,80,0.9));
    border: 2px solid #ffd700;
    border-radius: 50%;
    width: 48px; height: 48px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 20px rgba(255,215,0,0.4);
  }

  /* Score change animation */
  @keyframes scorePop {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); }
    100% { transform: scale(1); }
  }
  .score-pop { animation: scorePop 0.3s ease-out; }
</style>
</head>
<body>

<div class="scoreboard theme-neon" id="scoreboard">
  <div class="sb-side left">
    <div class="sb-name" id="sb-left-name">Streamer</div>
    <div class="sb-score" id="sb-left-score">0</div>
  </div>
  <div class="sb-vs">VS</div>
  <div class="sb-side right">
    <div class="sb-name" id="sb-right-name">Chat</div>
    <div class="sb-score" id="sb-right-score">0</div>
  </div>
</div>

<script>
  const board = document.getElementById('scoreboard');
  const leftName = document.getElementById('sb-left-name');
  const rightName = document.getElementById('sb-right-name');
  const leftScore = document.getElementById('sb-left-score');
  const rightScore = document.getElementById('sb-right-score');

  function popAnim(el) {
    el.classList.remove('score-pop');
    void el.offsetWidth;
    el.classList.add('score-pop');
  }

  const evtSource = new EventSource('${sseUrl}');
  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') {
      const oldLeft = leftScore.textContent;
      const oldRight = rightScore.textContent;

      leftName.textContent = msg.leftName || 'Streamer';
      rightName.textContent = msg.rightName || 'Chat';
      leftScore.textContent = msg.left || 0;
      rightScore.textContent = msg.right || 0;

      if (String(msg.left) !== oldLeft) popAnim(leftScore);
      if (String(msg.right) !== oldRight) popAnim(rightScore);

      // Apply theme
      board.className = 'scoreboard theme-' + (msg.theme || 'neon');
    }
  };
</script>
</body>
</html>`;
}

// ============================================
// JAR OVERLAY HTML
// ============================================
function getJarHTML(roomId) {
  const sseUrl = `/sse/${roomId}/jar`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    font-family: 'Orbitron', sans-serif;
  }

  .jar-scene {
    position: relative;
    width: 500px;
    height: 100vh;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  /* Jar body - glass effect */
  .jar {
    position: relative;
    width: 280px;
    height: 400px;
    margin-bottom: 20px;
    z-index: 10;
  }

  .jar-body {
    position: absolute;
    bottom: 0;
    left: 20px;
    right: 20px;
    height: 340px;
    background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.08) 100%);
    border: 3px solid rgba(255,255,255,0.25);
    border-bottom: 4px solid rgba(255,255,255,0.35);
    border-radius: 0 0 30px 30px;
    overflow: visible;
    backdrop-filter: blur(2px);
    box-shadow:
      inset 0 0 40px rgba(100,200,255,0.05),
      inset -15px 0 30px rgba(255,255,255,0.03),
      0 0 30px rgba(100,200,255,0.1),
      0 10px 40px rgba(0,0,0,0.3);
  }

  /* Glass shine */
  .jar-body::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 10px;
    width: 20px;
    height: 80%;
    background: linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02));
    border-radius: 10px;
    pointer-events: none;
  }

  .jar-body::after {
    content: '';
    position: absolute;
    right: 12px;
    top: 20px;
    width: 8px;
    height: 60%;
    background: linear-gradient(180deg, rgba(255,255,255,0.08), transparent);
    border-radius: 5px;
    pointer-events: none;
  }

  /* Jar neck/rim */
  .jar-neck {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 180px;
    height: 60px;
    z-index: 11;
  }

  .jar-rim {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 20px;
    background: linear-gradient(180deg, #8ec8e8, #6ab0d6, #4a96c4);
    border: 2px solid rgba(255,255,255,0.4);
    border-radius: 8px 8px 0 0;
    box-shadow: 0 -2px 10px rgba(100,200,255,0.3), inset 0 2px 4px rgba(255,255,255,0.3);
  }

  .jar-rim-bottom {
    position: absolute;
    top: 18px;
    left: -10px;
    right: -10px;
    height: 15px;
    background: linear-gradient(180deg, #7bbdd9, #5aa5c8);
    border: 2px solid rgba(255,255,255,0.3);
    border-radius: 0 0 5px 5px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  }

  .jar-neck-body {
    position: absolute;
    top: 32px;
    left: 5px;
    right: 5px;
    height: 30px;
    background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
    border-left: 3px solid rgba(255,255,255,0.2);
    border-right: 3px solid rgba(255,255,255,0.2);
  }

  /* Gift container inside jar */
  .jar-gifts {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 340px;
    overflow: hidden;
    border-radius: 0 0 27px 27px;
  }

  /* Overflow area outside jar */
  .jar-overflow {
    position: absolute;
    bottom: 0;
    left: -120px;
    right: -120px;
    height: 80px;
    z-index: 5;
    overflow: hidden;
  }

  /* Individual gift item */
  .gift-item {
    position: absolute;
    width: 36px;
    height: 36px;
    pointer-events: none;
    transition: none;
  }
  .gift-item img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));
  }

  /* Falling animation */
  @keyframes giftFall {
    0% { transform: translateY(-100px) rotate(0deg) scale(0.5); opacity: 0; }
    15% { opacity: 1; scale: 1; }
    70% { transform: translateY(var(--fall-y)) rotate(var(--rot)) scale(1); }
    85% { transform: translateY(calc(var(--fall-y) - 8px)) rotate(var(--rot)); }
    100% { transform: translateY(var(--fall-y)) rotate(var(--rot2)); opacity: 1; }
  }

  /* Glow pulse on jar when gift arrives */
  .jar-body.pulse {
    box-shadow:
      inset 0 0 40px rgba(100,200,255,0.05),
      inset -15px 0 30px rgba(255,255,255,0.03),
      0 0 50px rgba(255,200,50,0.4),
      0 0 80px rgba(255,150,50,0.2),
      0 10px 40px rgba(0,0,0,0.3);
    transition: box-shadow 0.3s;
  }

  /* Big gift (1000+ coins) */
  .gift-item.gift-big {
    width: 60px;
    height: 60px;
  }
  .gift-item.gift-big img {
    filter: drop-shadow(0 0 8px rgba(255,215,0,0.6)) drop-shadow(0 2px 4px rgba(0,0,0,0.4));
  }
</style>
</head>
<body>

<div class="jar-scene">
  <div class="jar">
    <div class="jar-neck">
      <div class="jar-rim"></div>
      <div class="jar-rim-bottom"></div>
      <div class="jar-neck-body"></div>
    </div>
    <div class="jar-body" id="jar-body">
      <div class="jar-gifts" id="jar-gifts"></div>
    </div>
  </div>
  <div class="jar-overflow" id="jar-overflow"></div>
</div>

<script>
  const jarGifts = document.getElementById('jar-gifts');
  const jarOverflow = document.getElementById('jar-overflow');
  const jarBody = document.getElementById('jar-body');
  let totalGifts = 0;
  let insideGifts = [];
  const JAR_WIDTH = 240; // inner width
  const JAR_HEIGHT = 340;
  const GIFT_SIZE = 36;
  const MAX_INSIDE = 120; // max gifts visible inside before overflow
  const COLS = Math.floor(JAR_WIDTH / GIFT_SIZE);

  function getNextInsidePos() {
    const row = Math.floor(insideGifts.length / COLS);
    const col = insideGifts.length % COLS;
    const x = 8 + col * (GIFT_SIZE + 2) + (Math.random() * 4 - 2);
    const y = JAR_HEIGHT - GIFT_SIZE - 4 - row * (GIFT_SIZE - 4) + (Math.random() * 3 - 1);
    return { x, y };
  }

  function addGift(giftImage, giftName, count, coins) {
    const isBig = coins >= 1000;
    const itemSize = isBig ? 60 : 36;
    for (let c = 0; c < Math.min(count, 5); c++) {
      totalGifts++;

      // Pulse effect
      jarBody.classList.add('pulse');
      setTimeout(() => jarBody.classList.remove('pulse'), 400);

      const el = document.createElement('div');
      el.className = 'gift-item' + (isBig ? ' gift-big' : '');
      el.innerHTML = '<img src="' + giftImage + '" alt="" onerror="this.src=\\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 36 36%22><text y=%2228%22 font-size=%2228%22>🎁</text></svg>\\'">';

      if (insideGifts.length < MAX_INSIDE) {
        // Inside jar
        const pos = getNextInsidePos();
        const rot = Math.random() * 40 - 20;
        const rot2 = rot + (Math.random() * 10 - 5);
        el.style.setProperty('--fall-y', pos.y + 'px');
        el.style.setProperty('--rot', rot + 'deg');
        el.style.setProperty('--rot2', rot2 + 'deg');
        el.style.left = pos.x + 'px';
        el.style.animation = 'giftFall 0.8s ease-out forwards';
        el.style.animationDelay = (c * 150) + 'ms';
        jarGifts.appendChild(el);
        insideGifts.push(el);
      } else {
        // Overflow outside jar
        const x = Math.random() * 460 - 80;
        const y = Math.random() * 50;
        el.style.left = x + 'px';
        el.style.bottom = y + 'px';
        el.style.transform = 'rotate(' + (Math.random() * 60 - 30) + 'deg)';
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        jarOverflow.appendChild(el);
        setTimeout(() => { el.style.opacity = '1'; }, c * 150 + 50);
      }
    }
  }

  function resetJar() {
    jarGifts.innerHTML = '';
    jarOverflow.innerHTML = '';
    insideGifts = [];
    totalGifts = 0;
    counterEl.textContent = '0';
  }

  const evtSource = new EventSource('${sseUrl}');
  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'gift') {
      addGift(msg.giftImage, msg.giftName, msg.count || 1, msg.coins || 0);
    }
    if (msg.type === 'reset') {
      resetJar();
    }
  };
</script>
</body>
</html>`;
}

// ============================================
// TIMER OVERLAY
// ============================================
function getTimerHTML(roomId) {
  const sseUrl = `/sse/${roomId}/timer`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=MedievalSharp&family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    overflow: hidden;
  }
  .timer-container {
    padding: 30px 60px;
    border-radius: 20px;
    position: relative;
    text-align: center;
  }
  .timer-time {
    font-size: 72px;
    font-weight: 900;
    letter-spacing: 6px;
    line-height: 1;
  }
  .timer-label {
    font-size: 14px;
    margin-top: 8px;
    letter-spacing: 4px;
    text-transform: uppercase;
    opacity: 0.8;
  }
  /* NEON */
  .theme-neon .timer-container {
    background: rgba(10,10,30,0.85);
    border: 2px solid #00d4ff;
    box-shadow: 0 0 30px rgba(0,212,255,0.3), inset 0 0 30px rgba(0,212,255,0.05);
  }
  .theme-neon .timer-time {
    font-family: 'Orbitron', monospace;
    color: #00d4ff;
    text-shadow: 0 0 20px rgba(0,212,255,0.8), 0 0 40px rgba(0,212,255,0.4);
  }
  .theme-neon .timer-label { font-family: 'Orbitron', monospace; color: #ff3366; text-shadow: 0 0 10px rgba(255,51,102,0.5); }
  /* MEDIEVAL */
  .theme-medieval .timer-container {
    background: linear-gradient(135deg, rgba(30,20,10,0.9), rgba(50,35,15,0.9));
    border: 3px solid #c9a44a;
    box-shadow: 0 0 20px rgba(201,164,74,0.3);
  }
  .theme-medieval .timer-time {
    font-family: 'MedievalSharp', cursive;
    color: #ffd700;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(255,215,0,0.3);
  }
  .theme-medieval .timer-label { font-family: 'MedievalSharp', cursive; color: #c9a44a; }
  /* RETRO */
  .theme-retro .timer-container {
    background: rgba(0,0,0,0.9);
    border: 3px solid #39ff14;
    box-shadow: 0 0 20px rgba(57,255,20,0.3);
  }
  .theme-retro .timer-time {
    font-family: 'Press Start 2P', monospace;
    color: #39ff14;
    font-size: 48px;
    text-shadow: 0 0 10px rgba(57,255,20,0.8), 3px 3px 0 #006400;
  }
  .theme-retro .timer-label { font-family: 'Press Start 2P', monospace; color: #39ff14; font-size: 10px; }
  /* FIRE */
  .theme-fire .timer-container {
    background: linear-gradient(180deg, rgba(40,10,0,0.9), rgba(80,20,0,0.9));
    border: 2px solid #ff6b35;
    box-shadow: 0 0 30px rgba(255,107,53,0.4), 0 0 60px rgba(255,69,0,0.2);
  }
  .theme-fire .timer-time {
    font-family: 'Orbitron', monospace;
    background: linear-gradient(180deg, #fff44f, #ff6b35, #ff4500);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 10px rgba(255,69,0,0.6));
  }
  .theme-fire .timer-label { font-family: 'Orbitron', monospace; color: #ff6b35; }
  /* ICE */
  .theme-ice .timer-container {
    background: linear-gradient(180deg, rgba(10,20,40,0.9), rgba(20,40,80,0.9));
    border: 2px solid #87ceeb;
    box-shadow: 0 0 30px rgba(135,206,235,0.3);
  }
  .theme-ice .timer-time {
    font-family: 'Orbitron', monospace;
    background: linear-gradient(180deg, #ffffff, #87ceeb, #4fc3f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 10px rgba(135,206,235,0.5));
  }
  .theme-ice .timer-label { font-family: 'Orbitron', monospace; color: #87ceeb; }

  /* ROYALTY THEME */
  .theme-royalty .timer-container {
    background: linear-gradient(135deg, rgba(50,20,80,0.9), rgba(30,10,60,0.9));
    border: 2px solid #ba85ff;
    box-shadow: 0 0 30px rgba(186,133,255,0.3), 0 0 60px rgba(255,215,0,0.15);
  }
  .theme-royalty .timer-time {
    font-family: 'Orbitron', monospace;
    background: linear-gradient(180deg, #ffd700, #ba85ff, #ffd700);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 15px rgba(255,215,0,0.5));
  }
  .theme-royalty .timer-label { font-family: 'Orbitron', monospace; color: #ba85ff; text-shadow: 0 0 10px rgba(186,133,255,0.5); }

  @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }
  .pulse { animation: pulse 0.5s ease-out; }
  .low-time .timer-time { animation: blink 1s infinite; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
</head>
<body>
<div id="theme-wrapper" class="theme-neon">
  <div class="timer-container" id="timer-container">
    <div class="timer-time" id="timer-time">00:00:00</div>
    <div class="timer-label">LIVE TIMER</div>
  </div>
</div>
<script>
  const timerEl = document.getElementById('timer-time');
  const container = document.getElementById('timer-container');
  const wrapper = document.getElementById('theme-wrapper');
  let currentSeconds = 0;
  let isRunning = false;
  let localInterval = null;

  function formatTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function updateDisplay() {
    timerEl.textContent = formatTime(currentSeconds);
    if (currentSeconds <= 60 && currentSeconds > 0 && isRunning) {
      wrapper.classList.add('low-time');
    } else {
      wrapper.classList.remove('low-time');
    }
  }

  function startLocalCountdown() {
    if (localInterval) clearInterval(localInterval);
    localInterval = setInterval(() => {
      if (isRunning && currentSeconds > 0) {
        currentSeconds--;
        updateDisplay();
      }
    }, 1000);
  }

  startLocalCountdown();

  const evtSource = new EventSource('${sseUrl}');
  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'timer') {
      const prevSeconds = currentSeconds;
      currentSeconds = msg.seconds;
      isRunning = msg.running;
      updateDisplay();
      if (currentSeconds > prevSeconds) {
        container.classList.add('pulse');
        setTimeout(() => container.classList.remove('pulse'), 500);
      }
    }
    if (msg.type === 'config') {
      if (msg.theme) wrapper.className = 'theme-' + msg.theme;
    }
  };
</script>
</body></html>`;
}

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
  console.log(`TikTok Live Relay running on port ${PORT}`);
});
