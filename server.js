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
      sseClients: { edits: [], coins: [], likes: [] },
      coinsRanking: {},
      likesRanking: {}
    };
  }
  return rooms[roomId];
}

// ============================================
// MEDIA STORAGE (in-memory, temporary)
// ============================================
const mediaStore = {}; // { mediaId: { data: Buffer, mimeType: string, createdAt: number } }

// Clean up media older than 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, media] of Object.entries(mediaStore)) {
    if (now - media.createdAt > 10 * 60 * 1000) {
      delete mediaStore[id];
    }
  }
}, 60 * 1000);

// Clean up empty rooms every 30 minutes
setInterval(() => {
  for (const [id, room] of Object.entries(rooms)) {
    const hasClients = room.sseClients.edits.length > 0 ||
                       room.sseClients.coins.length > 0 ||
                       room.sseClients.likes.length > 0;
    const hasData = Object.keys(room.coinsRanking).length > 0 ||
                    Object.keys(room.likesRanking).length > 0;
    if (!hasClients && !hasData) {
      delete rooms[id];
    }
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
// MEDIA ENDPOINT - serve uploaded media files
// ============================================
app.get('/media/:id', (req, res) => {
  const media = mediaStore[req.params.id];
  if (!media) {
    res.status(404).send('Media not found');
    return;
  }
  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(media.data);
});

// ============================================
// OVERLAY PAGES
// ============================================

app.get('/overlay/:roomId/edits', (req, res) => {
  const { roomId } = req.params;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getEditsHTML(roomId));
});

app.get('/overlay/:roomId/edits/:screen', (req, res) => {
  const { roomId } = req.params;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getEditsHTML(roomId));
});

app.get('/overlay/:roomId/ranking/coins', (req, res) => {
  const { roomId } = req.params;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getRankingHTML(roomId, 'coins'));
});

app.get('/overlay/:roomId/ranking/likes', (req, res) => {
  const { roomId } = req.params;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getRankingHTML(roomId, 'likes'));
});

// ============================================
// SSE ENDPOINTS
// ============================================

app.get('/sse/:roomId/edits', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('data: {"type":"connected"}\n\n');
  room.sseClients.edits.push(res);
  req.on('close', () => {
    room.sseClients.edits = room.sseClients.edits.filter(c => c !== res);
  });
});

app.get('/sse/:roomId/ranking/coins', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
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
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.likesRanking })}\n\n`);
  room.sseClients.likes.push(res);
  req.on('close', () => {
    room.sseClients.likes = room.sseClients.likes.filter(c => c !== res);
  });
});

// ============================================
// WEBSOCKET - Electron app connects here
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

      // Media upload - store in memory and return URL
      if (msg.type === 'media') {
        const buffer = Buffer.from(msg.data, 'base64');
        mediaStore[msg.id] = {
          data: buffer,
          mimeType: msg.mimeType,
          createdAt: Date.now()
        };
        // Confirm media stored
        ws.send(JSON.stringify({ type: 'media-ready', id: msg.id }));
      }

      // Edit trigger - send media URL to overlay
      if (msg.type === 'edit') {
        const mediaUrl = `/media/${msg.mediaId}`;
        const event = JSON.stringify({
          type: 'play',
          giftName: msg.giftName,
          mediaUrl: mediaUrl,
          duration: msg.duration,
          isGif: msg.isGif
        });
        room.sseClients.edits.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Coins ranking update
      if (msg.type === 'coins') {
        room.coinsRanking = msg.data;
        const event = JSON.stringify({ type: 'full', data: msg.data });
        room.sseClients.coins.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Likes ranking update
      if (msg.type === 'likes') {
        room.likesRanking = msg.data;
        const event = JSON.stringify({ type: 'full', data: msg.data });
        room.sseClients.likes.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

    } catch (e) {}
  });

  ws.on('close', () => {
    roomId = null;
  });
});

// ============================================
// OVERLAY HTML GENERATORS
// ============================================

function getEditsHTML(roomId) {
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
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #media-container {
    display: none;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
  }
  #media-container.active { display: flex; }
  #media-container video,
  #media-container img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
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
  let hideTimeout = null;

  const evtSource = new EventSource('/sse/${roomId}/edits');

  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'play') {
      playMedia(data);
    }
  };

  function playMedia(data) {
    if (hideTimeout) clearTimeout(hideTimeout);

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
    } else {
      video.src = src;
      video.style.display = 'block';
      video.play().catch(() => {});
    }

    hideTimeout = setTimeout(() => {
      container.classList.remove('active');
      toast.classList.remove('active');
      video.pause();
      video.src = '';
      gif.src = '';
    }, data.duration * 1000);
  }
</script>
</body>
</html>`;
}

function getRankingHTML(roomId, type) {
  const title = type === 'coins' ? '\\u{1FA99} Ranking de Moedas' : '\\u2764\\uFE0F Ranking de Likes';
  const sseUrl = `/sse/${roomId}/ranking/${type}`;
  const valueKey = type === 'coins' ? 'coins' : 'likes';
  const valueIcon = type === 'coins' ? '\\u{1FA99}' : '\\u2764\\uFE0F';
  const accentColor = type === 'coins' ? '#f1c40f' : '#e74c3c';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    font-family: 'Segoe UI', -apple-system, sans-serif;
    color: white;
    padding: 16px;
    overflow-y: auto;
  }
  .ranking-title {
    font-size: 20px; font-weight: 800; text-align: center;
    margin-bottom: 12px; text-shadow: 0 2px 8px rgba(0,0,0,0.6);
    color: ${accentColor};
  }
  .ranking-list { display: flex; flex-direction: column; gap: 6px; }
  .ranking-item {
    display: flex; align-items: center; gap: 10px;
    background: rgba(20, 25, 40, 0.85); border-radius: 12px;
    padding: 8px 14px; border: 1px solid rgba(255,255,255,0.08);
    backdrop-filter: blur(8px); animation: slideIn 0.3s ease-out;
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
  .pos-other { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
  .avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(255,255,255,0.1); overflow: hidden; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 16px;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .user-info { flex: 1; min-width: 0; }
  .user-name { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .user-id { font-size: 10px; color: rgba(255,255,255,0.4); }
  .value {
    font-size: 15px; font-weight: 800; color: ${accentColor};
    flex-shrink: 0; text-shadow: 0 0 8px ${accentColor}40;
  }
  .empty { text-align: center; color: rgba(255,255,255,0.3); padding: 40px; font-size: 14px; }
</style>
</head>
<body>
<div class="ranking-title">${title}</div>
<div class="ranking-list" id="list"></div>
<script>
  const list = document.getElementById('list');
  const evtSource = new EventSource('${sseUrl}');

  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') renderRanking(msg.data);
  };

  function renderRanking(data) {
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
      const avatar = user.profilePictureUrl
        ? '<img src="' + user.profilePictureUrl + '" onerror="this.parentElement.innerHTML=\\'\\u{1F464}\\'">'
        : '\\u{1F464}';
      const val = user.${valueKey}.toLocaleString();
      return '<div class="ranking-item">' +
        '<div class="pos ' + posClass + '">' + pos + '</div>' +
        '<div class="avatar">' + avatar + '</div>' +
        '<div class="user-info"><div class="user-name">' + esc(user.nickname) + '</div>' +
        '<div class="user-id">@' + esc(user.id) + '</div></div>' +
        '<div class="value">${valueIcon} ' + val + '</div></div>';
    }).join('');
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
</script>
</body>
</html>`;
}

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
  console.log(`TikTok Live Relay running on port ${PORT}`);
});
