const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 10000;

// Serve background images for overlays
app.get('/velho-oeste.png', (req, res) => res.sendFile(__dirname + '/velho-oeste.png'));
app.get('/crown.svg', (req, res) => res.sendFile(__dirname + '/crown.svg'));

// Health check endpoint
app.get('/', (req, res) => res.send('OK'));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), rooms: Object.keys(rooms).length }));

// ============================================
// ROOMS - each user has a unique room
// ============================================
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      sseClients: {
        edits1: [], edits2: [], edits3: [],
        coins: [], likes: [], points: [], membrosAcao: [],
        characters: [],
        jar: [],
        scoreboard: [],
        timer: [],
        goalCoins: [],
        goalLikes: [],
        goalPix: [],
        membros: [],
        topScore: [],
        topGift: [],
        topCombo: []
      },
      coinsRanking: {},
      likesRanking: {},
      pointsRanking: {},
      coinsConfig: { bg: 'transparent', side: 'left', theme: 'clean', customColor: '' },
      likesConfig: { bg: 'transparent', side: 'left', theme: 'clean', customColor: '' },
      pointsConfig: { bg: 'transparent', side: 'left', theme: 'clean', customColor: '', label: 'points', valueColor: '#f1c40f', labelColor: '#aaaaaa', nameColor: '#ffffff' },
      jarTheme: 'clean',
      jarCustomColor: '',
      jarCapacity: 1000,
      goalCoins: { text: '', target: 2000, current: 0, theme: 'neon', customColor: '', style: 'default' },
      goalLikes: { text: '', target: 5000, current: 0, theme: 'neon', customColor: '', style: 'default' },
      goalPix: { text: '', target: 100, current: 0, theme: 'neon', customColor: '', style: 'default' },
      membros: { title: 'Membros', members: [] },
      membrosAcao: { title: 'Membros Ação', members: [], giftName: 'Heart Me', giftImage: '', subText: '', subTextSize: 9, subValueSize: 9, subTextColor: '#ffdc50', subValueColor: '#ffdc50' },
      topScore: { title: 'TOP', desc: '', subtitle: 'PONTUAÇÃO', name: '', avatar: '', valor: 0 },
      topGift: null,
      topCombo: null,
      topGiftConfig: { label: 'Maior Presente', labelColor: '#ffffff', nameColor: '#FFD700', valueColor: '#ffffff' },
      topComboConfig: { label: 'Maior Combo', labelColor: '#ffffff', nameColor: '#FFD700', comboColor: '#ff6464' }
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

app.get('/overlay/:roomId/goal/:goalType', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getGoalHTML(req.params.roomId, req.params.goalType));
});

// Membros overlay
app.get('/overlay/:roomId/membros', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getMembrosHTML(req.params.roomId));
});

// Top Score overlay
app.get('/overlay/:roomId/top-score', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getTopScoreHTML(req.params.roomId));
});

// Top Gift overlay
app.get('/overlay/:roomId/top-gift', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getTopGiftHTML(req.params.roomId));
});

// Membros Ação overlay
app.get('/overlay/:roomId/membros-acao', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getMembrosAcaoHTML(req.params.roomId));
});

// Points ranking overlay
app.get('/overlay/:roomId/ranking/points', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getRankingPointsHTML(req.params.roomId));
});

// Top Combo overlay
app.get('/overlay/:roomId/top-combo', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getTopComboHTML(req.params.roomId));
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

app.get('/sse/:roomId/membros-acao', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.membrosAcao })}\n\n`);
  room.sseClients.membrosAcao.push(res);
  req.on('close', () => { room.sseClients.membrosAcao = room.sseClients.membrosAcao.filter(c => c !== res); });
});

app.get('/sse/:roomId/ranking/points', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'config', ...room.pointsConfig })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.pointsRanking })}\n\n`);
  room.sseClients.points.push(res);
  req.on('close', () => { room.sseClients.points = room.sseClients.points.filter(c => c !== res); });
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
  const sb = room.scoreboard || { left: 0, right: 0, leftName: 'Streamer', rightName: 'Chat', theme: 'neon', style: 'default', customColor: '' };
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
  res.write(`data: ${JSON.stringify({ type: 'config', theme: room.jarTheme || 'clean', customColor: room.jarCustomColor || '', capacity: room.jarCapacity || 1000 })}\n\n`);
  room.sseClients.jar.push(res);
  req.on('close', () => {
    room.sseClients.jar = room.sseClients.jar.filter(c => c !== res);
  });
});

// Goal SSE
app.get('/sse/:roomId/goal/:goalType', (req, res) => {
  const room = getRoom(req.params.roomId);
  const gt = req.params.goalType === 'likes' ? 'goalLikes' : (req.params.goalType === 'pix' ? 'goalPix' : 'goalCoins');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('data: {"type":"connected"}\n\n');
  const goalState = room[gt] || { text: '', target: 2000, current: 0 };
  res.write(`data: ${JSON.stringify({ type: 'goal', ...goalState })}\n\n`);
  room.sseClients[gt].push(res);
  req.on('close', () => {
    room.sseClients[gt] = room.sseClients[gt].filter(c => c !== res);
  });
});

// Top Score SSE
app.get('/sse/:roomId/top-score', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.topScore })}\n\n`);
  room.sseClients.topScore.push(res);
  req.on('close', () => {
    room.sseClients.topScore = room.sseClients.topScore.filter(c => c !== res);
  });
});

// Top Gift SSE
app.get('/sse/:roomId/top-gift', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.topGift, config: room.topGiftConfig })}\n\n`);
  room.sseClients.topGift.push(res);
  req.on('close', () => { room.sseClients.topGift = room.sseClients.topGift.filter(c => c !== res); });
});

// Top Combo SSE
app.get('/sse/:roomId/top-combo', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.topCombo, config: room.topComboConfig })}\n\n`);
  room.sseClients.topCombo.push(res);
  req.on('close', () => { room.sseClients.topCombo = room.sseClients.topCombo.filter(c => c !== res); });
});

// Membros SSE
app.get('/sse/:roomId/membros', (req, res) => {
  const room = getRoom(req.params.roomId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write(`data: ${JSON.stringify({ type: 'full', data: room.membros })}\n\n`);
  room.sseClients.membros.push(res);
  req.on('close', () => {
    room.sseClients.membros = room.sseClients.membros.filter(c => c !== res);
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
          isGif: msg.isGif,
          senderNickname: msg.senderNickname || '',
          senderPhoto: msg.senderPhoto || '',
          volume: msg.volume !== undefined ? msg.volume : 100
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

      // Points ranking
      if (msg.type === 'points') {
        room.pointsRanking = msg.data;
        const event = JSON.stringify({ type: 'full', data: msg.data });
        room.sseClients.points.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Ranking config update (bg color, side)
      if (msg.type === 'ranking-config') {
        const target = msg.ranking; // 'coins', 'likes' or 'points'
        const config = { bg: msg.bg || 'transparent', side: msg.side || 'left', theme: msg.theme || 'clean', customColor: msg.customColor || '' };
        if (target === 'coins') room.coinsConfig = config;
        if (target === 'likes') room.likesConfig = config;
        const event = JSON.stringify({ type: 'config', ...config });
        const clients = room.sseClients[target] || [];
        clients.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Points config update (colors, label, theme, side)
      if (msg.type === 'points-config') {
        const { type: _t, ...cfg } = msg;
        room.pointsConfig = { ...room.pointsConfig, ...cfg };
        const event = JSON.stringify({ type: 'config', ...room.pointsConfig });
        room.sseClients.points.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Scoreboard update
      if (msg.type === 'scoreboard') {
        room.scoreboard = { left: msg.left, right: msg.right, leftName: msg.leftName, rightName: msg.rightName, theme: msg.theme, customColor: msg.customColor || '', style: msg.style || 'default' };
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
        room.timerCustomColor = msg.customColor || '';
        const event = JSON.stringify({ type: 'config', theme: msg.theme, customColor: msg.customColor });
        room.sseClients.timer.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Jar config
      if (msg.type === 'jar-config') {
        room.jarTheme = msg.theme || 'clean';
        room.jarCustomColor = msg.customColor || '';
        if (typeof msg.capacity === 'number' && msg.capacity > 0) {
          room.jarCapacity = msg.capacity;
        }
        const event = JSON.stringify({ type: 'config', theme: room.jarTheme, customColor: room.jarCustomColor, capacity: room.jarCapacity });
        room.sseClients.jar.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch (e) {}
        });
      }

      // Goal updates
      if (msg.type === 'goal-update') {
        const gt = msg.goalType === 'likes' ? 'goalLikes' : (msg.goalType === 'pix' ? 'goalPix' : 'goalCoins');
        room[gt] = { text: msg.text || '', target: msg.target || 2000, current: msg.current || 0, theme: msg.theme || 'neon', customColor: msg.customColor || '', style: msg.style || 'default' };
        const event = JSON.stringify({ type: 'goal', ...room[gt] });
        room.sseClients[gt].forEach(client => {
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

      // Membros
      if (msg.type === 'membros-title') {
        room.membros.title = msg.title || 'Membros';
        const event = JSON.stringify({ type: 'full', data: room.membros });
        room.sseClients.membros.forEach(c => { try { c.write(`data: ${event}\n\n`); } catch(e){} });
      }
      if (msg.type === 'membros-add') {
        const exists = room.membros.members.find(m => m.userId === msg.userId);
        if (!exists) {
          room.membros.members.push({ userId: msg.userId, nickname: msg.nickname, profilePictureUrl: msg.profilePictureUrl || '' });
          const event = JSON.stringify({ type: 'full', data: room.membros });
          room.sseClients.membros.forEach(c => { try { c.write(`data: ${event}\n\n`); } catch(e){} });
        }
      }
      if (msg.type === 'top-score-update') {
        room.topScore = { title: msg.title || 'TOP', desc: msg.desc || '', subtitle: msg.subtitle || 'PONTUAÇÃO', name: msg.name || '', avatar: msg.avatar || '', valor: msg.valor || 0 };
        const ev = JSON.stringify({ type: 'full', data: room.topScore });
        room.sseClients.topScore.forEach(c => { try { c.write(`data: ${ev}\n\n`); } catch(e){} });
      }

      if (msg.type === 'membros-reset') {
        room.membros.members = [];
        const event = JSON.stringify({ type: 'full', data: room.membros });
        room.sseClients.membros.forEach(c => { try { c.write(`data: ${event}\n\n`); } catch(e){} });
      }

      // Membros Ação
      if (msg.type === 'membros-acao-config') {
        room.membrosAcao.title        = msg.title        ?? room.membrosAcao.title;
        room.membrosAcao.giftName     = msg.giftName     ?? room.membrosAcao.giftName;
        room.membrosAcao.giftImage    = msg.giftImage    ?? room.membrosAcao.giftImage;
        room.membrosAcao.subText      = msg.subText      ?? room.membrosAcao.subText;
        room.membrosAcao.subTextSize   = msg.subTextSize   ?? room.membrosAcao.subTextSize;
        room.membrosAcao.subValueSize  = msg.subValueSize  ?? room.membrosAcao.subValueSize;
        room.membrosAcao.subTextColor  = msg.subTextColor  ?? room.membrosAcao.subTextColor;
        room.membrosAcao.subValueColor = msg.subValueColor ?? room.membrosAcao.subValueColor;
        const ev = JSON.stringify({ type: 'full', data: room.membrosAcao });
        room.sseClients.membrosAcao.forEach(c => { try { c.write(`data: ${ev}\n\n`); } catch(e){} });
      }
      if (msg.type === 'membros-acao-add') {
        const exists = room.membrosAcao.members.find(m => m.userId === msg.userId);
        if (exists) {
          exists.value = (exists.value || 0) + (msg.value || 0);
          exists.nickname = msg.nickname || exists.nickname;
          exists.profilePictureUrl = msg.profilePictureUrl || exists.profilePictureUrl;
        } else {
          room.membrosAcao.members.push({ userId: msg.userId, nickname: msg.nickname, profilePictureUrl: msg.profilePictureUrl || '', value: msg.value || 0 });
        }
        const ev = JSON.stringify({ type: 'full', data: room.membrosAcao });
        room.sseClients.membrosAcao.forEach(c => { try { c.write(`data: ${ev}\n\n`); } catch(e){} });
      }
      if (msg.type === 'membros-acao-reset') {
        room.membrosAcao.members = [];
        const ev = JSON.stringify({ type: 'full', data: room.membrosAcao });
        room.sseClients.membrosAcao.forEach(c => { try { c.write(`data: ${ev}\n\n`); } catch(e){} });
      }

      // Top Gift update
      if (msg.type === 'top-gift-update') {
        room.topGift = { giftName: msg.giftName, giftPictureUrl: msg.giftPictureUrl, diamonds: msg.diamonds, nickname: msg.nickname, profilePictureUrl: msg.profilePictureUrl };
        const ev = JSON.stringify({ type: 'full', data: room.topGift, config: room.topGiftConfig });
        room.sseClients.topGift.forEach(c => { try { c.write(`data: ${ev}\n\n`); } catch(e){} });
      }

      // Top Combo update
      if (msg.type === 'top-combo-update') {
        room.topCombo = { giftName: msg.giftName, giftPictureUrl: msg.giftPictureUrl, comboCount: msg.comboCount, nickname: msg.nickname, profilePictureUrl: msg.profilePictureUrl };
        const ev = JSON.stringify({ type: 'full', data: room.topCombo, config: room.topComboConfig });
        room.sseClients.topCombo.forEach(c => { try { c.write(`data: ${ev}\n\n`); } catch(e){} });
      }

      // Top Gift config
      if (msg.type === 'top-gift-config') {
        room.topGiftConfig = { label: msg.label || 'Maior Presente', labelColor: msg.labelColor || '#ffffff', nameColor: msg.nameColor || '#FFD700', valueColor: msg.valueColor || '#ffffff' };
        const ev = JSON.stringify({ type: 'full', data: room.topGift, config: room.topGiftConfig });
        room.sseClients.topGift.forEach(c => { try { c.write(`data: ${ev}\n\n`); } catch(e){} });
      }

      // Top Combo config
      if (msg.type === 'top-combo-config') {
        room.topComboConfig = { label: msg.label || 'Maior Combo', labelColor: msg.labelColor || '#ffffff', nameColor: msg.nameColor || '#FFD700', comboColor: msg.comboColor || '#ff6464' };
        const ev = JSON.stringify({ type: 'full', data: room.topCombo, config: room.topComboConfig });
        room.sseClients.topCombo.forEach(c => { try { c.write(`data: ${ev}\n\n`); } catch(e){} });
      }

      // Top Gift reset
      if (msg.type === 'top-gift-reset') {
        room.topGift = null;
        room.sseClients.topGift.forEach(c => { try { c.write(`data: ${JSON.stringify({ type: 'full', data: null, config: room.topGiftConfig })}\n\n`); } catch(e){} });
      }

      // Top Combo reset
      if (msg.type === 'top-combo-reset') {
        room.topCombo = null;
        room.sseClients.topCombo.forEach(c => { try { c.write(`data: ${JSON.stringify({ type: 'full', data: null, config: room.topComboConfig })}\n\n`); } catch(e){} });
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
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 30px;
    font-family: 'Segoe UI', sans-serif;
    font-size: 16px;
    font-weight: 600;
    display: none;
    z-index: 10;
    animation: fadeInDown 0.4s ease-out;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(255,255,255,0.15);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }
  .gift-toast.active { display: flex; }
  .sender-photo {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #ffd700;
    flex-shrink: 0;
  }
  .sender-info {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .sender-name {
    font-size: 15px;
    font-weight: 700;
    color: #ffd700;
  }
  .sender-gift {
    font-size: 12px;
    color: rgba(255,255,255,0.7);
  }
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

    // Show sender photo + name + gift
    let toastHTML = '';
    if (data.senderPhoto) {
      toastHTML += '<img class="sender-photo" src="' + data.senderPhoto + '" onerror="this.style.display=\\'none\\'">';
    }
    if (data.senderNickname) {
      toastHTML += '<div class="sender-info"><span class="sender-name">' + data.senderNickname + '</span><span class="sender-gift">\\u{1F381} ' + data.giftName + '</span></div>';
    } else {
      toastHTML += '<div class="sender-info"><span class="sender-name">\\u{1F381} ' + data.giftName + '</span></div>';
    }
    toast.innerHTML = toastHTML;
    toast.classList.add('active');
    container.classList.add('active');

    const src = data.mediaUrl;

    // Apply volume
    const vol = (data.volume !== undefined ? data.volume : 100) / 100;
    video.volume = Math.max(0, Math.min(1, vol));

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
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=MedievalSharp&family=Press+Start+2P&family=Rye&display=swap" rel="stylesheet">
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
    transition: all 0.3s;
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
  @keyframes royalGlow {
    0%, 100% { box-shadow: 0 0 15px rgba(255,215,0,0.4), 0 0 30px rgba(186,133,255,0.2); }
    50% { box-shadow: 0 0 25px rgba(255,215,0,0.7), 0 0 50px rgba(186,133,255,0.4); }
  }
  @keyframes crownFloat {
    0%, 100% { transform: translateY(0) rotate(-5deg); }
    50% { transform: translateY(-3px) rotate(5deg); }
  }
  .theme-royalty .ranking-item {
    background: linear-gradient(135deg, rgba(60,20,100,0.9), rgba(40,10,70,0.85), rgba(60,20,100,0.9));
    border: 1px solid rgba(255,215,0,0.35);
    box-shadow: inset 0 0 20px rgba(186,133,255,0.08), 0 2px 8px rgba(0,0,0,0.3);
    position: relative;
  }
  .theme-royalty .ranking-item:nth-child(1) {
    border: 2px solid rgba(255,215,0,0.7);
    animation: royalGlow 3s ease-in-out infinite;
    background: linear-gradient(135deg, rgba(80,30,120,0.95), rgba(50,15,80,0.9), rgba(80,30,120,0.95));
  }
  .theme-royalty .ranking-item:nth-child(1)::before {
    content: '\\1F451';
    position: absolute;
    top: -18px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 28px;
    animation: crownFloat 2s ease-in-out infinite;
    filter: drop-shadow(0 0 8px rgba(255,215,0,0.8));
    z-index: 10;
  }
  .theme-royalty .ranking-item:nth-child(1) { margin-top: 14px; }
  .theme-royalty .user-name {
    color: #f0e6ff;
    text-shadow: 0 0 6px rgba(186,133,255,0.4);
    font-weight: 800;
  }
  .theme-royalty .ranking-item:nth-child(1) .user-name {
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255,215,0,0.6);
  }
  .theme-royalty .user-value {
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255,215,0,0.6);
    font-weight: 900;
  }
  .theme-royalty .pos-1 {
    background: linear-gradient(135deg, #ffd700, #ffaa00, #ffd700);
    color: #3a1560;
    font-weight: 900;
    box-shadow: 0 0 12px rgba(255,215,0,0.6);
  }
  .theme-royalty .pos-2 {
    background: linear-gradient(135deg, #c0c0c0, #e8e8e8, #c0c0c0);
    color: #3a1560;
    box-shadow: 0 0 8px rgba(192,192,192,0.4);
  }
  .theme-royalty .pos-3 {
    background: linear-gradient(135deg, #cd7f32, #e8a952, #cd7f32);
    color: #3a1560;
    box-shadow: 0 0 8px rgba(205,127,50,0.4);
  }
  .theme-royalty .avatar-frame-1 {
    border: 3px solid #ffd700;
    box-shadow: 0 0 20px rgba(255,215,0,0.7), 0 0 40px rgba(255,215,0,0.3), inset 0 0 8px rgba(255,215,0,0.2);
  }
  .theme-royalty .avatar-frame-2 {
    border: 3px solid #c0c0c0;
    box-shadow: 0 0 15px rgba(192,192,192,0.5), 0 0 30px rgba(186,133,255,0.2);
  }
  .theme-royalty .avatar-frame-3 {
    border: 3px solid #cd7f32;
    box-shadow: 0 0 12px rgba(205,127,50,0.5), 0 0 25px rgba(186,133,255,0.15);
  }

  /* THEME: CUSTOM (just bg color, clean look) */
  .theme-custom .ranking-item { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); }
  .theme-custom .user-value { color: #f1c40f; }

  /* ===== THEME: VELHO-OESTE ===== */
  .theme-velho-oeste #list { display: none; }
  #vo-container { display: none; }
  .theme-velho-oeste #vo-container { display: block; }

  @keyframes voSwing {
    0%,100% { transform: rotate(-0.6deg) translateX(0); }
    50%      { transform: rotate(0.6deg)  translateX(0); }
  }
  @keyframes voEntrada {
    from { opacity:0; transform: translateX(55px) rotate(2deg); }
    to   { opacity:1; transform: translateX(0)    rotate(0deg); }
  }
  @keyframes voEntrada2 {
    from { opacity:0; transform: translateX(55px); }
    to   { opacity:1; transform: translateX(0); }
  }
  @keyframes voEntrada3 {
    from { opacity:0; transform: translateX(55px); }
    to   { opacity:1; transform: translateX(0); }
  }
  @keyframes hatBounce {
    0%,100% { transform: translateY(0)   rotate(-6deg); }
    50%      { transform: translateY(-5px) rotate(4deg);  }
  }
  @keyframes legendPulse {
    0%,100% { letter-spacing:2px; text-shadow: 0 0 6px #b8860b, 0 0 12px rgba(184,134,11,0.4); }
    50%      { letter-spacing:3px; text-shadow: 0 0 10px #ffd700, 0 0 20px rgba(255,215,0,0.5); }
  }
  @keyframes shimmerGold {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes dustUp {
    0%   { opacity:0.5; transform:scale(1)   translateY(0); }
    100% { opacity:0;   transform:scale(1.8) translateY(-18px); }
  }
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
      // Reset velho-oeste container when switching away
      if (cfg.theme !== 'velho-oeste') {
        const vo = document.getElementById('vo-container');
        if (vo) vo.style.display = 'none';
      }
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
      // direction update handled per-element in renderRanking
    }
  }

  function mkEl(tag, css, text) {
    const el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function makeAvatar(url, size, borderColor, glowColor) {
    const wrap = mkEl('div',
      'position:relative;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;');
    const ring = mkEl('div',
      'position:absolute;inset:-4px;border-radius:50%;' +
      'background:conic-gradient(' + borderColor + ',#3a2000,' + borderColor + ',#3a2000,' + borderColor + ');' +
      'box-shadow:0 0 10px ' + glowColor + ',0 0 22px ' + glowColor + '33;');
    const inner = mkEl('div',
      'position:absolute;inset:0;border-radius:50%;overflow:hidden;background:#1a0f00;' +
      'display:flex;align-items:center;justify-content:center;font-size:' + Math.floor(size * 0.4) + 'px;');
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      img.onerror = function() { inner.textContent = '\\u{1F464}'; };
      inner.appendChild(img);
    } else { inner.textContent = '\\u{1F464}'; }
    wrap.appendChild(ring);
    wrap.appendChild(inner);
    return wrap;
  }

  function spawnDust(parent) {
    for (let i = 0; i < 5; i++) {
      const d = mkEl('div',
        'position:absolute;bottom:4px;left:' + (10 + i * 18) + 'px;' +
        'width:6px;height:6px;border-radius:50%;' +
        'background:rgba(180,130,60,0.55);pointer-events:none;' +
        'animation:dustUp ' + (0.6 + Math.random() * 0.5) + 's ease-out forwards;');
      parent.appendChild(d);
      setTimeout(() => d.remove(), 1200);
    }
  }

  function renderVelhoOeste(data) {
    const sorted = Object.entries(data)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.${valueKey} - a.${valueKey})
      .slice(0, 3);

    let vo = document.getElementById('vo-container');
    const isNew = !vo;
    if (isNew) {
      vo = mkEl('div', '');
      vo.id = 'vo-container';
      wrapper.insertBefore(vo, list);
    }

    // Board styles
    vo.style.cssText =
      'position:relative;width:390px;padding:18px 16px 20px;border-radius:5px;' +
      'background:linear-gradient(160deg,#2c1c0a 0%,#1a0f04 35%,#2e1e0c 65%,#1a0f04 100%);' +
      'border:2px solid #6b4218;' +
      'box-shadow:inset 0 0 50px rgba(0,0,0,0.55),inset 2px 2px 10px rgba(255,180,40,0.07),' +
      '0 10px 40px rgba(0,0,0,0.75),0 2px 8px rgba(0,0,0,0.5);' +
      'font-family:Rye,cursive;overflow:visible;' +
      'animation:voSwing 5s ease-in-out infinite;transform-origin:top center;';

    vo.innerHTML = '';

    // ── Wood grains ──
    for (let i = 0; i < 7; i++) {
      vo.appendChild(mkEl('div',
        'position:absolute;left:0;right:0;top:' + (20 + i * 62) + 'px;height:1px;pointer-events:none;' +
        'background:linear-gradient(90deg,transparent,rgba(90,55,10,0.25) 20%,rgba(90,55,10,0.12) 80%,transparent);'));
    }

    // ── Corner nails ──
    [['6px','6px'],['6px','calc(100% - 16px)'],['calc(100% - 16px)','6px'],['calc(100% - 16px)','calc(100% - 16px)']].forEach(([t,l]) => {
      vo.appendChild(mkEl('div',
        'position:absolute;top:' + t + ';left:' + l + ';width:10px;height:10px;border-radius:50%;pointer-events:none;' +
        'background:radial-gradient(circle at 35% 35%,#d4a84b,#7a5010);' +
        'box-shadow:0 1px 4px rgba(0,0,0,0.7);'));
    });

    // ── Title ──
    const typeLabel = '${type === 'coins' ? 'MOEDAS' : 'CURTIDAS'}';
    const icon = '${type === 'coins' ? '\u{1FA99}' : '❤️'}';
    vo.appendChild(mkEl('div',
      'text-align:center;font-size:11px;color:#c8943a;letter-spacing:4px;text-transform:uppercase;' +
      'text-shadow:0 2px 5px rgba(0,0,0,0.9),0 0 18px rgba(160,100,10,0.3);' +
      'margin-bottom:14px;padding-bottom:8px;' +
      'border-bottom:1px solid rgba(160,100,10,0.3);',
      '— RANKING DE ' + typeLabel + ' —'));

    if (sorted.length === 0) {
      vo.appendChild(mkEl('div',
        'text-align:center;color:rgba(190,140,50,0.45);padding:40px 20px;font-size:12px;',
        'Aguardando pistoleiros...'));
      return;
    }

    // ══════════════════════════════════════
    //  1st PLACE — WANTED POSTER STYLE
    // ══════════════════════════════════════
    if (sorted[0]) {
      const u = sorted[0];
      const s1 = mkEl('div',
        'position:relative;display:flex;align-items:center;gap:14px;' +
        'padding:14px 14px 12px;margin-bottom:10px;border-radius:4px;' +
        'background:linear-gradient(145deg,#caa96c 0%,#b8935a 25%,#d6b47a 50%,#b08040 75%,#caa96c 100%);' +
        'border:2px solid #7a5510;' +
        'box-shadow:inset 0 0 22px rgba(0,0,0,0.22),0 5px 14px rgba(0,0,0,0.6),' +
        '0 0 0 1px rgba(210,170,60,0.25);' +
        'animation:voEntrada 0.55s cubic-bezier(.22,1,.36,1);overflow:visible;');

      // Cowboy hat
      const hat = mkEl('div',
        'position:absolute;top:-30px;left:10px;font-size:38px;line-height:1;z-index:10;' +
        'animation:hatBounce 3.2s ease-in-out infinite;' +
        'filter:drop-shadow(0 3px 7px rgba(0,0,0,0.75));');
      hat.textContent = '\\u{1F920}';
      s1.appendChild(hat);

      // Avatar
      s1.appendChild(makeAvatar(u.profilePictureUrl, 72, '#d4a84b', 'rgba(180,120,10,0.8)'));

      // Right side
      const info1 = mkEl('div', 'flex:1;min-width:0;');

      // "LENDA" badge
      const badge = mkEl('div',
        'font-size:8px;color:#3d1e00;letter-spacing:2px;text-transform:uppercase;' +
        'margin-bottom:5px;animation:legendPulse 2.2s ease-in-out infinite;',
        '\\u2605 LENDA DO OESTE \\u2605');
      info1.appendChild(badge);

      // Name
      const nm1 = mkEl('div',
        'font-size:17px;color:#1e0d00;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
        'max-width:215px;text-shadow:1px 1px 2px rgba(255,255,255,0.15);margin-bottom:5px;');
      nm1.textContent = u.nickname;
      info1.appendChild(nm1);

      // Value — shimmer gold
      const vl1 = mkEl('div',
        'font-size:14px;font-weight:bold;' +
        'background:linear-gradient(90deg,#7a4800,#d4a030,#f0c040,#d4a030,#7a4800);' +
        'background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;' +
        'animation:shimmerGold 2.5s linear infinite;');
      vl1.textContent = icon + ' ' + u.${valueKey}.toLocaleString('pt-BR');
      info1.appendChild(vl1);

      s1.appendChild(info1);

      // Wax seal / stamp
      const seal = mkEl('div',
        'position:absolute;bottom:7px;right:9px;font-size:20px;opacity:0.3;transform:rotate(18deg);');
      seal.textContent = '\\u2605';
      s1.appendChild(seal);

      vo.appendChild(s1);
      setTimeout(() => spawnDust(s1), 200);
    }

    // ══════════════════════════════════════
    //  2nd & 3rd PLACE
    // ══════════════════════════════════════
    const rowDefs = [
      { label:'II',  medalGrad:'linear-gradient(145deg,#e8e8e8,#a8a8a8,#d0d0d0)', medalBorder:'#808080',
        rowBorder:'rgba(160,160,160,0.25)', glowColor:'rgba(180,180,180,0.4)', textColor:'#c8c8c8',
        valColor:'rgba(210,210,210,0.9)', delay:'0.72s', anim:'voEntrada2' },
      { label:'III', medalGrad:'linear-gradient(145deg,#e0a060,#cd7f32,#a05020)', medalBorder:'#8b5a1a',
        rowBorder:'rgba(150,90,20,0.28)', glowColor:'rgba(160,100,20,0.45)', textColor:'#c09060',
        valColor:'rgba(190,130,60,0.9)', delay:'0.88s', anim:'voEntrada3' },
    ];

    sorted.slice(1).forEach((u, idx) => {
      const rd = rowDefs[idx];
      const row = mkEl('div',
        'display:flex;align-items:center;gap:10px;padding:9px 11px;margin-bottom:6px;border-radius:3px;' +
        'background:linear-gradient(135deg,rgba(38,18,4,0.92),rgba(22,10,2,0.97));' +
        'border:1px solid ' + rd.rowBorder + ';' +
        'box-shadow:inset 0 0 14px rgba(0,0,0,0.45),0 3px 8px rgba(0,0,0,0.45);' +
        'animation:' + rd.anim + ' ' + rd.delay + ' cubic-bezier(.22,1,.36,1) both;');

      // Medal badge
      const medal = mkEl('div',
        'width:32px;height:32px;border-radius:50%;flex-shrink:0;' +
        'background:' + rd.medalGrad + ';border:1px solid ' + rd.medalBorder + ';' +
        'display:flex;align-items:center;justify-content:center;font-size:10px;color:#1a0a00;' +
        'box-shadow:0 2px 6px rgba(0,0,0,0.5),inset 0 1px 2px rgba(255,255,255,0.25);',
        rd.label);
      row.appendChild(medal);

      // Avatar
      row.appendChild(makeAvatar(u.profilePictureUrl, 42, rd.medalBorder, rd.glowColor));

      // Name + value
      const infoSm = mkEl('div', 'flex:1;min-width:0;');
      const nmSm = mkEl('div',
        'font-size:13px;color:' + rd.textColor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
        'max-width:200px;text-shadow:0 1px 4px rgba(0,0,0,0.9);margin-bottom:3px;');
      nmSm.textContent = u.nickname;
      infoSm.appendChild(nmSm);
      infoSm.appendChild(mkEl('div',
        'font-size:11px;color:' + rd.valColor + ';text-shadow:0 1px 3px rgba(0,0,0,0.7);',
        icon + ' ' + u.${valueKey}.toLocaleString('pt-BR')));
      row.appendChild(infoSm);

      vo.appendChild(row);
      setTimeout(() => spawnDust(row), 300 + idx * 120);
    });
  }

  function renderRanking(data) {
    if (currentTheme === 'velho-oeste') { renderVelhoOeste(data); return; }

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
        ? '<img src="' + user.profilePictureUrl + '" onerror="this.parentElement.innerHTML=String.fromCodePoint(128100)" style="width:100%;height:100%;object-fit:cover;">'
        : String.fromCodePoint(128100);
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

function getRankingPointsHTML(roomId) {
  const sseUrl = `/sse/${roomId}/ranking/points`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=MedievalSharp&family=Press+Start+2P&family=Rye&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:transparent; font-family:'Segoe UI',-apple-system,sans-serif; color:white; padding:16px; overflow-y:auto; transition:background 0.3s; }
  .ranking-list { display:flex; flex-direction:column; gap:6px; }
  .ranking-item { display:flex; align-items:center; gap:10px; flex-direction:row; background:transparent; border-radius:12px; padding:8px 14px; transition:all 0.3s; }
  .pos { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; flex-shrink:0; }
  .pos-1 { background:linear-gradient(135deg,#f1c40f,#e67e22); color:#1a1a2e; }
  .pos-2 { background:linear-gradient(135deg,#bdc3c7,#95a5a6); color:#1a1a2e; }
  .pos-3 { background:linear-gradient(135deg,#e67e22,#d35400); color:#1a1a2e; }
  .pos-other { background:rgba(255,255,255,0.15); color:rgba(255,255,255,0.6); }
  .avatar { width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.1); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:16px; }
  .avatar img { width:100%; height:100%; object-fit:cover; }
  .avatar-frame-1 { border:3px solid #f1c40f; box-shadow:0 0 12px rgba(241,196,15,0.5); }
  .avatar-frame-2 { border:3px solid #bdc3c7; box-shadow:0 0 10px rgba(189,195,199,0.4); }
  .avatar-frame-3 { border:3px solid #e67e22; box-shadow:0 0 10px rgba(230,126,34,0.4); }
  .user-info { flex:1; min-width:0; text-align:left; }
  .user-name { font-size:14px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 4px rgba(0,0,0,0.8); }
  .user-value { font-size:13px; font-weight:800; text-shadow:0 1px 4px rgba(0,0,0,0.8); }
  .val-num { }
  .val-label { font-size:11px; font-weight:600; margin-left:3px; }
  .empty { text-align:center; color:rgba(255,255,255,0.3); padding:40px; font-size:14px; }

  /* THEME: CLEAN */
  .theme-clean .ranking-item { background:transparent; }
  /* THEME: NEON */
  .theme-neon .ranking-item { background:rgba(10,10,30,0.7); border:1px solid rgba(0,212,255,0.3); box-shadow:0 0 8px rgba(0,212,255,0.1); }
  .theme-neon .user-name { color:#00d4ff; text-shadow:0 0 8px rgba(0,212,255,0.5); }
  .theme-neon .avatar-frame-1 { border-color:#00d4ff; box-shadow:0 0 15px rgba(0,212,255,0.6); }
  .theme-neon .avatar-frame-2 { border-color:#ff3366; box-shadow:0 0 12px rgba(255,51,102,0.4); }
  .theme-neon .avatar-frame-3 { border-color:#ffd700; box-shadow:0 0 12px rgba(255,215,0,0.4); }
  /* THEME: MEDIEVAL */
  .theme-medieval .ranking-item { background:rgba(30,20,10,0.8); border:1px solid rgba(201,164,74,0.4); font-family:'MedievalSharp',cursive; }
  .theme-medieval .avatar-frame-1 { border-color:#ffd700; box-shadow:0 0 15px rgba(255,215,0,0.5); }
  .theme-medieval .avatar-frame-2 { border-color:#c0c0c0; box-shadow:0 0 12px rgba(192,192,192,0.4); }
  .theme-medieval .avatar-frame-3 { border-color:#cd7f32; box-shadow:0 0 12px rgba(205,127,50,0.4); }
  /* THEME: RETRO */
  .theme-retro .ranking-item { background:rgba(0,0,0,0.85); border:1px solid #39ff14; font-family:'Press Start 2P',monospace; }
  .theme-retro .user-name { color:#39ff14; font-size:10px; text-shadow:0 0 6px rgba(57,255,20,0.6); }
  .theme-retro .avatar-frame-1 { border-color:#39ff14; box-shadow:0 0 10px rgba(57,255,20,0.6); }
  .theme-retro .avatar-frame-2 { border-color:#00ffff; }
  .theme-retro .avatar-frame-3 { border-color:#ff00ff; }
  /* THEME: FIRE */
  .theme-fire .ranking-item { background:rgba(40,10,0,0.8); border:1px solid rgba(255,107,53,0.4); }
  .theme-fire .user-name { color:#fff44f; }
  .theme-fire .avatar-frame-1 { border-color:#ff4500; box-shadow:0 0 15px rgba(255,69,0,0.6),0 0 30px rgba(255,69,0,0.3); }
  .theme-fire .avatar-frame-2 { border-color:#ff6b35; }
  .theme-fire .avatar-frame-3 { border-color:#ffd700; }
  /* THEME: ICE */
  .theme-ice .ranking-item { background:rgba(10,20,40,0.8); border:1px solid rgba(135,206,235,0.3); }
  .theme-ice .user-name { color:#e0f0ff; }
  .theme-ice .avatar-frame-1 { border-color:#87ceeb; box-shadow:0 0 15px rgba(135,206,235,0.6); }
  .theme-ice .avatar-frame-2 { border-color:#b0e0e6; }
  .theme-ice .avatar-frame-3 { border-color:#4fc3f7; }
  /* THEME: ROYALTY */
  @keyframes royalGlow { 0%,100%{box-shadow:0 0 15px rgba(255,215,0,0.4),0 0 30px rgba(186,133,255,0.2);} 50%{box-shadow:0 0 25px rgba(255,215,0,0.7),0 0 50px rgba(186,133,255,0.4);} }
  @keyframes crownFloat { 0%,100%{transform:translateY(0) rotate(-5deg);} 50%{transform:translateY(-3px) rotate(5deg);} }
  .theme-royalty .ranking-item { background:linear-gradient(135deg,rgba(60,20,100,0.9),rgba(40,10,70,0.85),rgba(60,20,100,0.9)); border:1px solid rgba(255,215,0,0.35); box-shadow:inset 0 0 20px rgba(186,133,255,0.08),0 2px 8px rgba(0,0,0,0.3); position:relative; }
  .theme-royalty .ranking-item:nth-child(1) { border:2px solid rgba(255,215,0,0.7); animation:royalGlow 3s ease-in-out infinite; background:linear-gradient(135deg,rgba(80,30,120,0.95),rgba(50,15,80,0.9),rgba(80,30,120,0.95)); }
  .theme-royalty .ranking-item:nth-child(1)::before { content:'\\1F451'; position:absolute; top:-18px; left:50%; transform:translateX(-50%); font-size:28px; animation:crownFloat 2s ease-in-out infinite; filter:drop-shadow(0 0 8px rgba(255,215,0,0.8)); z-index:10; }
  .theme-royalty .ranking-item:nth-child(1) { margin-top:14px; }
  .theme-royalty .user-name { color:#f0e6ff; font-weight:800; }
  .theme-royalty .ranking-item:nth-child(1) .user-name { color:#ffd700; text-shadow:0 0 10px rgba(255,215,0,0.6); }
  .theme-royalty .pos-1 { background:linear-gradient(135deg,#ffd700,#ffaa00,#ffd700); color:#3a1560; font-weight:900; box-shadow:0 0 12px rgba(255,215,0,0.6); }
  .theme-royalty .pos-2 { background:linear-gradient(135deg,#c0c0c0,#e8e8e8,#c0c0c0); color:#3a1560; }
  .theme-royalty .pos-3 { background:linear-gradient(135deg,#cd7f32,#e8a952,#cd7f32); color:#3a1560; }
  .theme-royalty .avatar-frame-1 { border:3px solid #ffd700; box-shadow:0 0 20px rgba(255,215,0,0.7),0 0 40px rgba(255,215,0,0.3),inset 0 0 8px rgba(255,215,0,0.2); }
  .theme-royalty .avatar-frame-2 { border:3px solid #c0c0c0; box-shadow:0 0 15px rgba(192,192,192,0.5); }
  .theme-royalty .avatar-frame-3 { border:3px solid #cd7f32; box-shadow:0 0 12px rgba(205,127,50,0.5); }
  /* THEME: CUSTOM */
  .theme-custom .ranking-item { background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); }
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
  let cfg = { label:'points', valueColor:'#f1c40f', labelColor:'#aaaaaa', nameColor:'#ffffff' };

  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') renderRanking(msg.data);
    if (msg.type === 'config') applyConfig(msg);
  };

  function applyConfig(c) {
    if (c.label !== undefined) cfg.label = c.label;
    if (c.valueColor !== undefined) cfg.valueColor = c.valueColor;
    if (c.labelColor !== undefined) cfg.labelColor = c.labelColor;
    if (c.nameColor !== undefined) cfg.nameColor = c.nameColor;
    if (c.theme !== undefined) {
      wrapper.className = 'theme-' + c.theme;
      document.body.style.background = (c.theme === 'custom' && c.customColor) ? c.customColor : 'transparent';
    }
    if (c.bg !== undefined && c.theme !== 'custom') document.body.style.background = c.bg;
    if (c.side !== undefined) {
      currentSide = c.side;
      document.querySelectorAll('.ranking-item').forEach(item => item.style.flexDirection = c.side === 'right' ? 'row-reverse' : 'row');
      document.querySelectorAll('.user-info').forEach(el => el.style.textAlign = c.side === 'right' ? 'right' : 'left');
    }
    // Re-apply colors to existing items
    document.querySelectorAll('.user-name').forEach(el => el.style.color = cfg.nameColor);
    document.querySelectorAll('.val-num').forEach(el => el.style.color = cfg.valueColor);
    document.querySelectorAll('.val-label').forEach(el => el.style.color = cfg.labelColor);
  }

  function renderRanking(data) {
    const sorted = Object.entries(data)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 20);
    list.innerHTML = '';
    if (sorted.length === 0) {
      list.innerHTML = '<div class="empty">Nenhum ponto registrado ainda</div>';
      return;
    }
    sorted.forEach((u, i) => {
      const pos = i + 1;
      const item = document.createElement('div');
      item.className = 'ranking-item';
      item.style.flexDirection = currentSide === 'right' ? 'row-reverse' : 'row';

      const posEl = document.createElement('div');
      posEl.className = 'pos ' + (pos <= 3 ? 'pos-' + pos : 'pos-other');
      posEl.textContent = pos;

      const av = document.createElement('div');
      av.className = 'avatar' + (pos <= 3 ? ' avatar-frame-' + pos : '');
      if (u.profilePictureUrl) {
        const img = document.createElement('img');
        img.src = u.profilePictureUrl;
        img.onerror = () => { av.textContent = '\\u{1F464}'; };
        av.appendChild(img);
      } else { av.textContent = '\\u{1F464}'; }

      const info = document.createElement('div');
      info.className = 'user-info';
      info.style.textAlign = currentSide === 'right' ? 'right' : 'left';

      const name = document.createElement('div');
      name.className = 'user-name';
      name.style.color = cfg.nameColor;
      name.textContent = u.nickname || u.id;

      const valWrap = document.createElement('div');
      valWrap.className = 'user-value';

      const valNum = document.createElement('span');
      valNum.className = 'val-num';
      valNum.style.color = cfg.valueColor;
      valNum.textContent = (u.points || 0).toLocaleString('pt-BR');

      const valLbl = document.createElement('span');
      valLbl.className = 'val-label';
      valLbl.style.color = cfg.labelColor;
      valLbl.textContent = ' ' + cfg.label;

      valWrap.appendChild(valNum);
      valWrap.appendChild(valLbl);
      info.appendChild(name);
      info.appendChild(valWrap);
      item.appendChild(posEl);
      item.appendChild(av);
      item.appendChild(info);
      list.appendChild(item);
    });
  }
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
  @keyframes royalPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(255,215,0,0.3); }
    50% { box-shadow: 0 0 40px rgba(255,215,0,0.6); }
  }
  .theme-royalty .sb-side.left {
    background: linear-gradient(180deg, rgba(80,30,120,0.85), rgba(50,15,80,0.9));
    border: 2px solid rgba(255,215,0,0.5);
    border-radius: 14px 0 0 14px;
    box-shadow: 0 0 25px rgba(186,133,255,0.3), inset 0 0 30px rgba(255,215,0,0.05);
  }
  .theme-royalty .sb-side.right {
    background: linear-gradient(180deg, rgba(100,15,40,0.85), rgba(60,10,30,0.9));
    border: 2px solid rgba(255,215,0,0.5);
    border-radius: 0 14px 14px 0;
    box-shadow: 0 0 25px rgba(255,105,180,0.2), inset 0 0 30px rgba(255,215,0,0.05);
  }
  .theme-royalty .sb-name {
    font-family: 'Rajdhani', sans-serif;
    font-size: 20px;
    color: #ffd700;
    text-shadow: 0 0 12px rgba(255,215,0,0.6), 0 2px 4px rgba(0,0,0,0.5);
  }
  .theme-royalty .sb-score {
    font-family: 'Rajdhani', sans-serif;
    color: #fff;
    text-shadow: 0 0 20px rgba(255,215,0,0.5), 0 0 40px rgba(186,133,255,0.3);
  }
  .theme-royalty .sb-vs {
    font-family: 'Rajdhani', sans-serif;
    color: #ffd700;
    background: linear-gradient(135deg, rgba(60,20,100,0.9), rgba(40,10,70,0.95));
    border: 3px solid #ffd700;
    border-radius: 50%;
    width: 52px; height: 52px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 25px rgba(255,215,0,0.5);
    animation: royalPulse 3s ease-in-out infinite;
    font-weight: 900;
  }

  /* Score change animation */
  @keyframes scorePop {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); }
    100% { transform: scale(1); }
  }
  .score-pop { animation: scorePop 0.3s ease-out; }

  /* ===== ESTILO PREMIUM ===== */
  .style-premium .sb-side {
    background: rgba(10,10,30,0.92) !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    clip-path: polygon(14px 0%,calc(100% - 14px) 0%,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0% calc(100% - 14px),0% 14px);
    padding: 14px 28px;
    position: relative;
  }
  .style-premium .sb-vs {
    background: rgba(10,10,30,0.92) !important;
    border: none !important;
    border-radius: 0 !important;
    clip-path: polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
    width: 58px; height: 58px;
    box-shadow: none !important;
  }
  /* Corner accent dots — hidden by default, shown in premium */
  .sb-ca { display:none; position:absolute; width:18px; height:18px; z-index:5; }
  .style-premium .sb-ca { display:block; }
  .sb-ca-tl { top:2px; left:2px; }
  .sb-ca-tr { top:2px; right:2px; }
  .sb-ca-bl { bottom:2px; left:2px; }
  .sb-ca-br { bottom:2px; right:2px; }
  .sb-ca::before { content:''; position:absolute; width:3px; height:14px; }
  .sb-ca::after  { content:''; position:absolute; width:14px; height:3px; }
  .sb-ca-tl::before { top:0; left:0; }  .sb-ca-tl::after { top:0; left:0; }
  .sb-ca-tr::before { top:0; right:0; } .sb-ca-tr::after { top:0; right:0; }
  .sb-ca-bl::before { bottom:0; left:0; } .sb-ca-bl::after { bottom:0; left:0; }
  .sb-ca-br::before { bottom:0; right:0; } .sb-ca-br::after { bottom:0; right:0; }

  /* Theme colors for premium corners & VS glow */
  .style-premium.theme-neon .sb-side.left .sb-ca::before,
  .style-premium.theme-neon .sb-side.left .sb-ca::after { background:#00d4ff; box-shadow:0 0 6px rgba(0,212,255,.8); }
  .style-premium.theme-neon .sb-side.right .sb-ca::before,
  .style-premium.theme-neon .sb-side.right .sb-ca::after { background:#ff3366; box-shadow:0 0 6px rgba(255,51,102,.8); }
  .style-premium.theme-neon .sb-vs { color:#ffd700; text-shadow:0 0 12px rgba(255,215,0,.8); filter:drop-shadow(0 0 8px rgba(255,215,0,.5)); }
  .style-premium.theme-neon .sb-name.left-n { color:#00d4ff; text-shadow:0 0 12px rgba(0,212,255,.7); }
  .style-premium.theme-neon .sb-name.right-n { color:#ff3366; text-shadow:0 0 12px rgba(255,51,102,.7); }
  .style-premium.theme-neon .sb-score { color:#fff; text-shadow:0 0 20px rgba(255,255,255,.4); }

  .style-premium.theme-fire .sb-ca::before,
  .style-premium.theme-fire .sb-ca::after { background:#ff6b35; box-shadow:0 0 6px rgba(255,107,53,.8); }
  .style-premium.theme-fire .sb-vs { color:#ffd700; text-shadow:0 0 12px rgba(255,215,0,.8); filter:drop-shadow(0 0 8px rgba(255,107,53,.5)); }
  .style-premium.theme-fire .sb-name { color:#ffd700; text-shadow:0 0 10px rgba(255,107,53,.8); }
  .style-premium.theme-fire .sb-score { color:#fff; text-shadow:0 0 15px rgba(255,107,53,.5); }

  .style-premium.theme-ice .sb-ca::before,
  .style-premium.theme-ice .sb-ca::after { background:#87ceeb; box-shadow:0 0 6px rgba(135,206,235,.8); }
  .style-premium.theme-ice .sb-vs { color:#b0e0ff; filter:drop-shadow(0 0 8px rgba(135,206,235,.5)); }
  .style-premium.theme-ice .sb-name { color:#b0e0ff; text-shadow:0 0 10px rgba(135,206,235,.7); }
  .style-premium.theme-ice .sb-score { color:#fff; text-shadow:0 0 15px rgba(135,206,235,.5); }

  .style-premium.theme-medieval .sb-ca::before,
  .style-premium.theme-medieval .sb-ca::after { background:#ffd700; box-shadow:0 0 6px rgba(255,215,0,.8); }
  .style-premium.theme-medieval .sb-vs { color:#ffd700; filter:drop-shadow(0 0 8px rgba(255,215,0,.5)); }
  .style-premium.theme-medieval .sb-name { color:#ffd700; text-shadow:0 0 10px rgba(255,215,0,.6); }
  .style-premium.theme-medieval .sb-score { color:#fff; text-shadow:0 0 15px rgba(255,215,0,.4); }

  .style-premium.theme-retro .sb-side { background:#111 !important; }
  .style-premium.theme-retro .sb-ca::before,
  .style-premium.theme-retro .sb-ca::after { background:#00ff41; box-shadow:0 0 6px rgba(0,255,65,.8); }
  .style-premium.theme-retro .sb-vs { color:#ffff00; filter:drop-shadow(0 0 8px rgba(0,255,65,.5)); }
  .style-premium.theme-retro .sb-name { color:#00ff41; }
  .style-premium.theme-retro .sb-score { color:#fff; }

  .style-premium.theme-royalty .sb-ca::before,
  .style-premium.theme-royalty .sb-ca::after { background:#ffd700; box-shadow:0 0 6px rgba(255,215,0,.8); }
  .style-premium.theme-royalty .sb-vs { color:#ffd700; filter:drop-shadow(0 0 8px rgba(255,215,0,.5)); }
  .style-premium.theme-royalty .sb-name { color:#ffd700; }
  .style-premium.theme-royalty .sb-score { color:#fff; text-shadow:0 0 20px rgba(186,133,255,.5); }

  .style-premium.theme-custom .sb-ca::before,
  .style-premium.theme-custom .sb-ca::after { background:#fff; box-shadow:0 0 6px rgba(255,255,255,.6); }
  .style-premium.theme-custom .sb-vs { color:#fff; }
  .style-premium.theme-custom .sb-name { color:#fff; }
  .style-premium.theme-custom .sb-score { color:#fff; }

  /* ===== THEME: CUSTOM ===== */
  .theme-custom .sb-side.left {
    background: rgba(0,0,0,0.5);
    border: 2px solid rgba(255,255,255,0.2);
    border-radius: 14px 0 0 14px;
  }
  .theme-custom .sb-side.right {
    background: rgba(0,0,0,0.5);
    border: 2px solid rgba(255,255,255,0.2);
    border-radius: 0 14px 14px 0;
  }
  .theme-custom .sb-name { font-family: 'Rajdhani', sans-serif; font-size: 20px; color: #fff; }
  .theme-custom .sb-score { font-family: 'Rajdhani', sans-serif; color: #ffd700; }
  .theme-custom .sb-vs {
    font-family: 'Rajdhani', sans-serif;
    color: #fff;
    background: rgba(0,0,0,0.6);
    border: 2px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    width: 48px; height: 48px;
    display: flex; align-items: center; justify-content: center;
  }
</style>
</head>
<body>

<div class="scoreboard theme-neon" id="scoreboard">
  <div class="sb-side left">
    <div class="sb-ca sb-ca-tl"></div><div class="sb-ca sb-ca-tr"></div>
    <div class="sb-ca sb-ca-bl"></div><div class="sb-ca sb-ca-br"></div>
    <div class="sb-name left-n" id="sb-left-name">Streamer</div>
    <div class="sb-score" id="sb-left-score">0</div>
  </div>
  <div class="sb-vs" id="sb-vs">VS</div>
  <div class="sb-side right">
    <div class="sb-ca sb-ca-tl"></div><div class="sb-ca sb-ca-tr"></div>
    <div class="sb-ca sb-ca-bl"></div><div class="sb-ca sb-ca-br"></div>
    <div class="sb-name right-n" id="sb-right-name">Chat</div>
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

      // Apply style + theme
      const theme = msg.theme || 'neon';
      const style = msg.style || 'default';
      board.className = 'scoreboard style-' + style + ' theme-' + theme;
      if (theme === 'custom' && msg.customColor) {
        document.body.style.background = msg.customColor;
      } else {
        document.body.style.background = 'transparent';
      }
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
    align-items: center;
    justify-content: center;
    font-family: 'Orbitron', sans-serif;
  }

  .jar-scene {
    position: relative;
    width: 600px;
    height: 600px;
  }

  /* Physics container - holds all gift elements, ABOVE the jar so gifts overflow visually */
  .physics-container {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 12;
  }

  /* Jar body - glass effect */
  .jar {
    position: absolute;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    width: 280px;
    height: 400px;
    z-index: 10;
    pointer-events: none;
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

  /* Individual gift item - positioned via transform by physics */
  .gift-item {
    position: absolute;
    left: 0;
    top: 0;
    width: 32px;
    height: 32px;
    pointer-events: none;
    will-change: transform;
  }
  .gift-item img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));
  }

  /* Big gift (1000+ coins) */
  .gift-item.gift-big {
    width: 48px;
    height: 48px;
  }
  .gift-item.gift-big img {
    filter: drop-shadow(0 0 8px rgba(255,215,0,0.6)) drop-shadow(0 2px 4px rgba(0,0,0,0.4));
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

  /* ===== JAR THEMES ===== */

  /* THEME: CLEAN (default - no extra effects) */

  /* THEME: NEON */
  .theme-neon .jar-body {
    box-shadow: inset 0 0 40px rgba(57,255,20,0.08), 0 0 30px rgba(57,255,20,0.3), 0 0 60px rgba(0,255,255,0.15), 0 10px 40px rgba(0,0,0,0.3);
    border-color: rgba(57,255,20,0.4);
  }
  .theme-neon .jar-rim { background: linear-gradient(180deg, #39ff14, #00e5ff, #39ff14); }
  .theme-neon .jar-rim-bottom { background: linear-gradient(180deg, #00e5ff, #39ff14); }
  .theme-neon .gift-item img { filter: drop-shadow(0 0 6px rgba(57,255,20,0.5)) drop-shadow(0 1px 3px rgba(0,0,0,0.3)); }
  .theme-neon .jar-body.pulse {
    box-shadow: inset 0 0 40px rgba(57,255,20,0.1), 0 0 60px rgba(57,255,20,0.5), 0 0 100px rgba(0,255,255,0.3), 0 10px 40px rgba(0,0,0,0.3) !important;
  }

  /* THEME: MEDIEVAL */
  .theme-medieval .jar-body {
    box-shadow: inset 0 0 30px rgba(139,90,43,0.1), 0 0 20px rgba(139,90,43,0.3), 0 10px 40px rgba(0,0,0,0.4);
    border-color: rgba(184,134,11,0.5);
  }
  .theme-medieval .jar-rim { background: linear-gradient(180deg, #b8860b, #8b5a2b, #b8860b); border-color: rgba(184,134,11,0.6); }
  .theme-medieval .jar-rim-bottom { background: linear-gradient(180deg, #8b5a2b, #654321); border-color: rgba(184,134,11,0.5); }
  .theme-medieval .gift-item img { filter: drop-shadow(0 0 4px rgba(184,134,11,0.4)) drop-shadow(0 1px 3px rgba(0,0,0,0.4)); }

  /* THEME: RETRO */
  .theme-retro .jar-body {
    box-shadow: inset 0 0 20px rgba(57,255,20,0.05), 0 0 20px rgba(57,255,20,0.2), 0 10px 40px rgba(0,0,0,0.3);
    border-color: rgba(57,255,20,0.3);
    image-rendering: pixelated;
  }
  .theme-retro .jar-rim { background: linear-gradient(180deg, #39ff14, #006400); border-color: #39ff14; }
  .theme-retro .jar-rim-bottom { background: linear-gradient(180deg, #006400, #003300); border-color: #39ff14; }

  /* THEME: FIRE */
  @keyframes fireJarGlow {
    0%, 100% { box-shadow: inset 0 0 40px rgba(255,69,0,0.05), 0 0 30px rgba(255,107,53,0.3), 0 0 60px rgba(255,69,0,0.15), 0 10px 40px rgba(0,0,0,0.3); }
    50% { box-shadow: inset 0 0 40px rgba(255,69,0,0.1), 0 0 50px rgba(255,107,53,0.5), 0 0 80px rgba(255,69,0,0.3), 0 10px 40px rgba(0,0,0,0.3); }
  }
  .theme-fire .jar-body {
    border-color: rgba(255,107,53,0.4);
    animation: fireJarGlow 3s ease-in-out infinite;
  }
  .theme-fire .jar-rim { background: linear-gradient(180deg, #ff6b35, #ff4500, #ff6b35); }
  .theme-fire .jar-rim-bottom { background: linear-gradient(180deg, #ff4500, #cc3700); }
  .theme-fire .gift-item img { filter: drop-shadow(0 0 5px rgba(255,107,53,0.5)) drop-shadow(0 1px 3px rgba(0,0,0,0.3)); }
  .theme-fire .jar-body.pulse {
    box-shadow: inset 0 0 40px rgba(255,69,0,0.1), 0 0 70px rgba(255,107,53,0.6), 0 0 120px rgba(255,69,0,0.3), 0 10px 40px rgba(0,0,0,0.3) !important;
  }

  /* THEME: ICE */
  .theme-ice .jar-body {
    box-shadow: inset 0 0 40px rgba(135,206,235,0.08), 0 0 30px rgba(135,206,235,0.3), 0 0 60px rgba(100,200,255,0.15), 0 10px 40px rgba(0,0,0,0.3);
    border-color: rgba(135,206,235,0.4);
  }
  .theme-ice .jar-rim { background: linear-gradient(180deg, #87ceeb, #b0e0e6, #87ceeb); }
  .theme-ice .jar-rim-bottom { background: linear-gradient(180deg, #b0e0e6, #87ceeb); }
  .theme-ice .gift-item img { filter: drop-shadow(0 0 5px rgba(135,206,235,0.5)) drop-shadow(0 1px 3px rgba(0,0,0,0.3)); }

  /* THEME: ROYALTY */
  @keyframes royalJarGlow {
    0%, 100% { box-shadow: inset 0 0 40px rgba(186,133,255,0.05), 0 0 30px rgba(255,215,0,0.2), 0 0 60px rgba(186,133,255,0.15), 0 10px 40px rgba(0,0,0,0.3); }
    50% { box-shadow: inset 0 0 40px rgba(186,133,255,0.1), 0 0 50px rgba(255,215,0,0.5), 0 0 80px rgba(186,133,255,0.3), 0 10px 40px rgba(0,0,0,0.3); }
  }
  .theme-royalty .jar-body {
    border-color: rgba(255,215,0,0.4);
    animation: royalJarGlow 4s ease-in-out infinite;
  }
  .theme-royalty .jar-rim { background: linear-gradient(180deg, #ffd700, #ba85ff, #ffd700); border-color: rgba(255,215,0,0.6); }
  .theme-royalty .jar-rim-bottom { background: linear-gradient(180deg, #ba85ff, #6a0dad); border-color: rgba(255,215,0,0.5); }
  .theme-royalty .gift-item img { filter: drop-shadow(0 0 6px rgba(255,215,0,0.5)) drop-shadow(0 0 4px rgba(186,133,255,0.3)); }
  .theme-royalty .jar-body.pulse {
    box-shadow: inset 0 0 40px rgba(186,133,255,0.1), 0 0 60px rgba(255,215,0,0.6), 0 0 100px rgba(186,133,255,0.3), 0 10px 40px rgba(0,0,0,0.3) !important;
  }

  /* THEME: CUSTOM */
  .theme-custom .jar-body {
    border-color: rgba(255,255,255,0.2);
  }
</style>
</head>
<body>

<div id="theme-wrapper" class="theme-clean">
<div class="jar-scene">
  <div class="physics-container" id="physics"></div>
  <div class="jar">
    <div class="jar-neck">
      <div class="jar-rim"></div>
      <div class="jar-rim-bottom"></div>
      <div class="jar-neck-body"></div>
    </div>
    <div class="jar-body" id="jar-body"></div>
  </div>
</div>
</div>

<script src="https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js"></script>
<script>
  const { Engine, World, Bodies, Body, Events } = Matter;

  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.y = 1;
  const world = engine.world;

  const physicsContainer = document.getElementById('physics');
  const jarBody = document.getElementById('jar-body');

  // Static walls matching the visual jar
  // Scene 600x600. Jar centered at x=300. Body inner edges: x=180 to x=420.
  // Jar body bottom at y=580, top of body at y=240, neck opening ~y=200.
  // Walls extend UP to y=100 as a funnel so every gift enters the jar.
  // Above the jar rim (y<240), no walls → overflow spills to sides.
  const wallOpts = { isStatic: true, friction: 0.6, restitution: 0.1, render: { visible: false } };
  World.add(world, [
    // Jar body walls (y=240 to y=580)
    Bodies.rectangle(178, 410, 6, 340, wallOpts),  // jar left wall
    Bodies.rectangle(422, 410, 6, 340, wallOpts),  // jar right wall
    Bodies.rectangle(300, 583, 244, 8, wallOpts),   // jar floor
    // Funnel guides above jar (y=60 to y=240) — angled inward to direct gifts into jar
    Bodies.fromVertices(155, 150, [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 28, y: 180 }, { x: 22, y: 180 }], wallOpts) || Bodies.rectangle(165, 150, 6, 180, wallOpts),
    Bodies.fromVertices(445, 150, [{ x: 6, y: 0 }, { x: 0, y: 0 }, { x: -22, y: 180 }, { x: -16, y: 180 }], wallOpts) || Bodies.rectangle(435, 150, 6, 180, wallOpts),
    // Ground outside jar (overflow landing)
    Bodies.rectangle(90, 595, 180, 10, wallOpts),   // ground left
    Bodies.rectangle(510, 595, 180, 10, wallOpts),  // ground right
    // Scene bounds
    Bodies.rectangle(-5, 300, 10, 700, wallOpts),   // left wall
    Bodies.rectangle(605, 300, 10, 700, wallOpts),  // right wall
  ]);

  let activeGifts = [];  // bodies still simulating
  let pinnedGifts = [];  // bodies converted to static (settled forever)
  let totalGifts = 0;
  let maxCapacity = 1000; // updated via config SSE message

  // Map coin value -> physics radius (px). Logarithmic so cheap gifts stay small
  // and expensive gifts (Lion 30k, Universe 45k) get visibly large without taking
  // over the jar. Range: ~11px (1 coin) to ~46px (50k+ coins).
  function radiusForCoins(coins) {
    const c = Math.max(1, coins || 1);
    const r = 10 + Math.log10(c + 1) * 8.5;
    return Math.max(11, Math.min(46, r));
  }

  function spawnOne(giftImage, coins) {
    if (totalGifts >= maxCapacity) return;
    totalGifts++;
    const radius = radiusForCoins(coins) * (0.9 + Math.random() * 0.2);
    const isBig = coins >= 1000;
    // Always spawn centered above jar mouth so funnel guides them in
    const x = 270 + Math.random() * 60;  // x 270-330 (jar center)
    const y = -10 - Math.random() * 30;
    const body = Bodies.circle(x, y, radius, {
      friction: 0.3 + Math.random() * 0.3,
      frictionStatic: 0.2 + Math.random() * 0.3,
      restitution: 0.15 + Math.random() * 0.2,    // 0.15-0.35: moderate bounce
      density: 0.001 + Math.random() * 0.003,
      sleepThreshold: 60,
    });
    // Gentle horizontal throw — walls and other gifts create the spread
    const vx = (Math.random() - 0.5) * 3;
    const vy = 1 + Math.random() * 1.5;
    Body.setVelocity(body, { x: vx, y: vy });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
    World.add(world, body);

    const el = document.createElement('div');
    el.className = 'gift-item' + (isBig ? ' gift-big' : '');
    el.style.width = (radius * 2) + 'px';
    el.style.height = (radius * 2) + 'px';
    el.innerHTML = '<img src="' + giftImage + '" alt="" onerror="this.src=\\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 36 36%22><text y=%2228%22 font-size=%2228%22>🎁</text></svg>\\'">';
    physicsContainer.appendChild(el);

    body.giftEl = el;
    body.giftRadius = radius;
    body.sleepFrames = 0;
    activeGifts.push(body);
  }

  function addGift(giftImage, giftName, count, coins) {
    const safeCount = Math.min(count, 5);
    jarBody.classList.add('pulse');
    setTimeout(() => jarBody.classList.remove('pulse'), 400);
    for (let c = 0; c < safeCount; c++) {
      setTimeout(() => spawnOne(giftImage, coins), c * 130);
    }
  }

  function updateGiftTransform(b) {
    const el = b.giftEl;
    if (!el) return;
    const r = b.giftRadius;
    el.style.transform = 'translate(' + (b.position.x - r) + 'px, ' + (b.position.y - r) + 'px) rotate(' + b.angle + 'rad)';
  }

  // After a body has been sleeping for ~90 frames, convert it to a static body.
  // This keeps it visible forever as a collision surface for new gifts,
  // while removing it from active dynamic simulation. Gifts are NEVER removed.
  Events.on(engine, 'beforeUpdate', () => {
    for (let i = activeGifts.length - 1; i >= 0; i--) {
      const b = activeGifts[i];
      // Safety: if a gift somehow falls below the scene, teleport it back into jar
      if (b.position.y > 650) {
        Body.setPosition(b, { x: 300, y: 400 });
        Body.setVelocity(b, { x: 0, y: 0 });
      }
      if (b.isSleeping) {
        b.sleepFrames++;
        if (b.sleepFrames > 90) {
          Body.setStatic(b, true);
          updateGiftTransform(b); // freeze final visual position
          pinnedGifts.push(b);
          activeGifts.splice(i, 1);
        }
      } else {
        b.sleepFrames = 0;
      }
    }
  });

  function loop() {
    Engine.update(engine, 1000 / 60);
    for (const b of activeGifts) updateGiftTransform(b);
    requestAnimationFrame(loop);
  }
  loop();

  function resetJar() {
    for (const b of activeGifts) {
      World.remove(world, b);
      if (b.giftEl) b.giftEl.remove();
    }
    for (const b of pinnedGifts) {
      World.remove(world, b);
      if (b.giftEl) b.giftEl.remove();
    }
    activeGifts = [];
    pinnedGifts = [];
    totalGifts = 0;
  }

  const themeWrapper = document.getElementById('theme-wrapper');

  function applyTheme(theme, customColor) {
    themeWrapper.className = 'theme-' + (theme || 'clean');
    document.body.style.background = (theme === 'custom' && customColor) ? customColor : 'transparent';
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
    if (msg.type === 'config') {
      applyTheme(msg.theme, msg.customColor);
      if (typeof msg.capacity === 'number' && msg.capacity > 0) {
        maxCapacity = msg.capacity;
      }
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
  @keyframes royalTimerGlow {
    0%, 100% { border-color: rgba(255,215,0,0.5); box-shadow: 0 0 30px rgba(255,215,0,0.2), 0 0 60px rgba(186,133,255,0.15); }
    50% { border-color: rgba(255,215,0,0.9); box-shadow: 0 0 50px rgba(255,215,0,0.5), 0 0 80px rgba(186,133,255,0.3); }
  }
  .theme-royalty .timer-container {
    background: linear-gradient(135deg, rgba(60,20,100,0.92), rgba(40,10,70,0.95), rgba(60,20,100,0.92));
    border: 3px solid #ffd700;
    box-shadow: 0 0 40px rgba(255,215,0,0.3), 0 0 80px rgba(186,133,255,0.2);
    animation: royalTimerGlow 4s ease-in-out infinite;
    position: relative;
  }
  .theme-royalty .timer-container::before {
    content: '\\1F451';
    position: absolute;
    top: -22px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 32px;
    filter: drop-shadow(0 0 10px rgba(255,215,0,0.8));
  }
  .theme-royalty .timer-time {
    font-family: 'Orbitron', monospace;
    background: linear-gradient(180deg, #fff8dc, #ffd700, #daa520, #ffd700, #fff8dc);
    background-size: 100% 200%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 20px rgba(255,215,0,0.6));
    animation: royalTextShimmer 3s ease-in-out infinite;
  }
  @keyframes royalTextShimmer {
    0%, 100% { background-position: 0% 0%; }
    50% { background-position: 0% 100%; }
  }
  .theme-royalty .timer-label {
    font-family: 'Orbitron', monospace;
    color: #ffd700;
    text-shadow: 0 0 12px rgba(255,215,0,0.5);
    letter-spacing: 6px;
  }

  /* CUSTOM THEME */
  .theme-custom .timer-container {
    background: rgba(0,0,0,0.6);
    border: 2px solid rgba(255,255,255,0.3);
    box-shadow: 0 0 20px rgba(255,255,255,0.1);
  }
  .theme-custom .timer-time {
    font-family: 'Orbitron', monospace;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(255,255,255,0.3);
  }
  .theme-custom .timer-label { font-family: 'Orbitron', monospace; color: rgba(255,255,255,0.7); }

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
      if (msg.theme) {
        wrapper.className = 'theme-' + msg.theme;
        if (msg.theme === 'custom' && msg.customColor) {
          document.body.style.background = msg.customColor;
        } else {
          document.body.style.background = 'transparent';
        }
      }
    }
  };
</script>
</body></html>`;
}

// ============================================
// GOAL OVERLAY
// ============================================
function getGoalHTML(roomId, goalType) {
  const sseUrl = `/sse/${roomId}/goal/${goalType}`;
  const isLikes = goalType === 'likes';
  const isPix = goalType === 'pix';
  const icon = isPix ? '💰' : (isLikes ? '❤️' : '🪙');
  const valuePrefix = isPix ? 'R$ ' : '';
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=MedievalSharp&family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-family: 'Orbitron', sans-serif;
  }

  /* ===================================================
     ESTILO PADRAO (default)
     =================================================== */
  .style-default .goal-container {
    width: 450px;
    padding: 18px 24px;
    background: rgba(10, 10, 30, 0.85);
    border: 2px solid #00d4ff;
    border-radius: 16px;
    box-shadow: 0 0 30px rgba(0,212,255,0.3), inset 0 0 20px rgba(0,212,255,0.05);
    text-align: center;
  }
  .style-default .goal-title {
    font-size: 14px; font-weight: 700; color: #00d4ff;
    letter-spacing: 2px; margin-bottom: 10px;
    text-shadow: 0 0 10px rgba(0,212,255,0.5); word-wrap: break-word;
  }
  .style-default .goal-numbers {
    font-size: 28px; font-weight: 900; color: #fff;
    margin-bottom: 12px; text-shadow: 0 0 15px rgba(255,255,255,0.3);
  }
  .style-default .goal-numbers .current { color: #00d4ff; }
  .style-default .goal-bar-bg {
    width: 100%; height: 24px; background: rgba(255,255,255,0.1);
    border-radius: 12px; overflow: hidden; position: relative;
    border: 1px solid rgba(255,255,255,0.15);
  }
  .style-default .goal-bar-fill {
    height: 100%; border-radius: 12px;
    background: linear-gradient(90deg, #0088cc, #00d4ff);
    transition: width 0.6s ease-out; width: 0%;
    box-shadow: 0 0 15px rgba(0,212,255,0.5); position: relative;
  }
  .style-default .goal-bar-fill::after {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 50%;
    background: linear-gradient(180deg, rgba(255,255,255,0.25), transparent);
    border-radius: 12px 12px 0 0;
  }
  .style-default .goal-percent {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    font-size: 11px; font-weight: 700; color: #fff;
    text-shadow: 0 1px 3px rgba(0,0,0,0.7); z-index: 2;
  }

  /* ===================================================
     ESTILO PREMIUM (cyberpunk angular HUD)
     =================================================== */
  .style-premium .goal-container {
    width: 520px; position: relative; padding: 0;
    background: transparent; border: none; border-radius: 0;
    box-shadow: none; text-align: center;
  }
  .style-premium .goal-title { display: none; }
  .style-premium .goal-numbers { display: none; }
  .style-premium .goal-bar-bg { display: none; }
  .style-premium .goal-percent { display: none; }

  /* Premium custom bar */
  .premium-frame {
    display: none; position: relative; width: 520px; height: 52px;
  }
  .style-premium .premium-frame { display: block; }

  /* Main bar background */
  .pf-bar {
    position: absolute; top: 6px; left: 40px; right: 40px; height: 40px;
    background: rgba(10, 10, 30, 0.88);
    clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px);
    border: none;
  }
  .pf-bar-border {
    position: absolute; top: 5px; left: 39px; right: 39px; height: 42px;
    clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px);
    background: #00d4ff;
    z-index: 0;
  }
  .pf-bar { z-index: 1; }

  /* Fill bar inside */
  .pf-fill-track {
    position: absolute; top: 10px; left: 46px; right: 46px; height: 32px;
    overflow: hidden; z-index: 2;
    clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px);
  }
  .pf-fill {
    height: 100%; width: 0%; transition: width 0.6s ease-out;
    background: linear-gradient(90deg, #0088cc, #00d4ff);
    box-shadow: 0 0 20px rgba(0,212,255,0.5);
    position: relative;
  }
  .pf-fill::after {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 40%;
    background: linear-gradient(180deg, rgba(255,255,255,0.3), transparent);
  }

  /* Corner accents - left */
  .pf-corner-l {
    position: absolute; top: 0; left: 0; width: 44px; height: 52px; z-index: 3;
  }
  .pf-corner-l::before {
    content: ''; position: absolute; top: 0; left: 8px; width: 3px; height: 20px;
    background: #00d4ff; box-shadow: 0 0 8px rgba(0,212,255,0.8);
  }
  .pf-corner-l::after {
    content: ''; position: absolute; top: 0; left: 8px; width: 20px; height: 3px;
    background: #00d4ff; box-shadow: 0 0 8px rgba(0,212,255,0.8);
  }
  .pf-corner-lb {
    position: absolute; bottom: 0; left: 0; width: 44px; height: 20px; z-index: 3;
  }
  .pf-corner-lb::before {
    content: ''; position: absolute; bottom: 0; left: 8px; width: 3px; height: 20px;
    background: #00d4ff; box-shadow: 0 0 8px rgba(0,212,255,0.8);
  }
  .pf-corner-lb::after {
    content: ''; position: absolute; bottom: 0; left: 8px; width: 20px; height: 3px;
    background: #00d4ff; box-shadow: 0 0 8px rgba(0,212,255,0.8);
  }
  /* Corner accents - right */
  .pf-corner-r {
    position: absolute; top: 0; right: 0; width: 44px; height: 52px; z-index: 3;
  }
  .pf-corner-r::before {
    content: ''; position: absolute; top: 0; right: 8px; width: 3px; height: 20px;
    background: #00d4ff; box-shadow: 0 0 8px rgba(0,212,255,0.8);
  }
  .pf-corner-r::after {
    content: ''; position: absolute; top: 0; right: 8px; width: 20px; height: 3px;
    background: #00d4ff; box-shadow: 0 0 8px rgba(0,212,255,0.8);
  }
  .pf-corner-rb {
    position: absolute; bottom: 0; right: 0; width: 44px; height: 20px; z-index: 3;
  }
  .pf-corner-rb::before {
    content: ''; position: absolute; bottom: 0; right: 8px; width: 3px; height: 20px;
    background: #00d4ff; box-shadow: 0 0 8px rgba(0,212,255,0.8);
  }
  .pf-corner-rb::after {
    content: ''; position: absolute; bottom: 0; right: 8px; width: 20px; height: 3px;
    background: #00d4ff; box-shadow: 0 0 8px rgba(0,212,255,0.8);
  }

  /* Side line accents */
  .pf-line-l, .pf-line-r {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 4px; height: 30px; z-index: 3;
    background: #00d4ff; box-shadow: 0 0 12px rgba(0,212,255,0.9);
  }
  .pf-line-l { left: 2px; }
  .pf-line-r { right: 2px; }

  /* Text overlay */
  .pf-text {
    position: absolute; top: 0; left: 0; right: 0; height: 52px;
    display: flex; align-items: center; justify-content: center;
    z-index: 4; font-family: 'Orbitron', sans-serif;
    font-size: 15px; font-weight: 900; color: #fff;
    letter-spacing: 3px; text-transform: uppercase;
    text-shadow: 0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,212,255,0.3);
  }

  /* ===== PREMIUM THEME OVERRIDES ===== */
  /* Neon */
  .style-premium.theme-neon .pf-bar-border,
  .style-premium.theme-neon .pf-corner-l::before, .style-premium.theme-neon .pf-corner-l::after,
  .style-premium.theme-neon .pf-corner-lb::before, .style-premium.theme-neon .pf-corner-lb::after,
  .style-premium.theme-neon .pf-corner-r::before, .style-premium.theme-neon .pf-corner-r::after,
  .style-premium.theme-neon .pf-corner-rb::before, .style-premium.theme-neon .pf-corner-rb::after,
  .style-premium.theme-neon .pf-line-l, .style-premium.theme-neon .pf-line-r { background: #00d4ff; }
  .style-premium.theme-neon .pf-fill { background: linear-gradient(90deg, #0088cc, #00d4ff); box-shadow: 0 0 20px rgba(0,212,255,0.5); }

  /* Fire */
  .style-premium.theme-fire .pf-bar { background: linear-gradient(180deg, rgba(40,10,0,0.92), rgba(80,20,0,0.92)); }
  .style-premium.theme-fire .pf-bar-border,
  .style-premium.theme-fire .pf-corner-l::before, .style-premium.theme-fire .pf-corner-l::after,
  .style-premium.theme-fire .pf-corner-lb::before, .style-premium.theme-fire .pf-corner-lb::after,
  .style-premium.theme-fire .pf-corner-r::before, .style-premium.theme-fire .pf-corner-r::after,
  .style-premium.theme-fire .pf-corner-rb::before, .style-premium.theme-fire .pf-corner-rb::after,
  .style-premium.theme-fire .pf-line-l, .style-premium.theme-fire .pf-line-r { background: #ff6b35; box-shadow: 0 0 12px rgba(255,107,53,0.8); }
  .style-premium.theme-fire .pf-fill { background: linear-gradient(90deg, #ff4500, #ff6b35, #ffaa00); box-shadow: 0 0 20px rgba(255,107,53,0.5); }

  /* Ice */
  .style-premium.theme-ice .pf-bar { background: linear-gradient(180deg, rgba(10,20,40,0.92), rgba(20,40,80,0.92)); }
  .style-premium.theme-ice .pf-bar-border,
  .style-premium.theme-ice .pf-corner-l::before, .style-premium.theme-ice .pf-corner-l::after,
  .style-premium.theme-ice .pf-corner-lb::before, .style-premium.theme-ice .pf-corner-lb::after,
  .style-premium.theme-ice .pf-corner-r::before, .style-premium.theme-ice .pf-corner-r::after,
  .style-premium.theme-ice .pf-corner-rb::before, .style-premium.theme-ice .pf-corner-rb::after,
  .style-premium.theme-ice .pf-line-l, .style-premium.theme-ice .pf-line-r { background: #87ceeb; box-shadow: 0 0 12px rgba(135,206,235,0.8); }
  .style-premium.theme-ice .pf-fill { background: linear-gradient(90deg, #4fc3f7, #87ceeb, #b0e0e6); box-shadow: 0 0 20px rgba(135,206,235,0.5); }

  /* Medieval */
  .style-premium.theme-medieval .pf-bar { background: linear-gradient(180deg, rgba(30,20,10,0.92), rgba(50,35,15,0.92)); }
  .style-premium.theme-medieval .pf-bar-border,
  .style-premium.theme-medieval .pf-corner-l::before, .style-premium.theme-medieval .pf-corner-l::after,
  .style-premium.theme-medieval .pf-corner-lb::before, .style-premium.theme-medieval .pf-corner-lb::after,
  .style-premium.theme-medieval .pf-corner-r::before, .style-premium.theme-medieval .pf-corner-r::after,
  .style-premium.theme-medieval .pf-corner-rb::before, .style-premium.theme-medieval .pf-corner-rb::after,
  .style-premium.theme-medieval .pf-line-l, .style-premium.theme-medieval .pf-line-r { background: #c9a44a; box-shadow: 0 0 12px rgba(201,164,74,0.8); }
  .style-premium.theme-medieval .pf-fill { background: linear-gradient(90deg, #8b6914, #c9a44a, #ffd700); box-shadow: 0 0 20px rgba(201,164,74,0.5); }
  .style-premium.theme-medieval .pf-text { font-family: 'MedievalSharp', cursive; letter-spacing: 2px; }

  /* Retro */
  .style-premium.theme-retro .pf-bar { background: rgba(0,0,0,0.95); }
  .style-premium.theme-retro .pf-bar-border,
  .style-premium.theme-retro .pf-corner-l::before, .style-premium.theme-retro .pf-corner-l::after,
  .style-premium.theme-retro .pf-corner-lb::before, .style-premium.theme-retro .pf-corner-lb::after,
  .style-premium.theme-retro .pf-corner-r::before, .style-premium.theme-retro .pf-corner-r::after,
  .style-premium.theme-retro .pf-corner-rb::before, .style-premium.theme-retro .pf-corner-rb::after,
  .style-premium.theme-retro .pf-line-l, .style-premium.theme-retro .pf-line-r { background: #39ff14; box-shadow: 0 0 12px rgba(57,255,20,0.8); }
  .style-premium.theme-retro .pf-fill { background: #39ff14; box-shadow: 0 0 20px rgba(57,255,20,0.5); }
  .style-premium.theme-retro .pf-text { font-family: 'Press Start 2P', monospace; font-size: 10px; letter-spacing: 1px; }

  /* Royalty */
  .style-premium.theme-royalty .pf-bar { background: linear-gradient(180deg, rgba(60,20,100,0.92), rgba(40,10,70,0.95)); }
  .style-premium.theme-royalty .pf-bar-border,
  .style-premium.theme-royalty .pf-corner-l::before, .style-premium.theme-royalty .pf-corner-l::after,
  .style-premium.theme-royalty .pf-corner-lb::before, .style-premium.theme-royalty .pf-corner-lb::after,
  .style-premium.theme-royalty .pf-corner-r::before, .style-premium.theme-royalty .pf-corner-r::after,
  .style-premium.theme-royalty .pf-corner-rb::before, .style-premium.theme-royalty .pf-corner-rb::after,
  .style-premium.theme-royalty .pf-line-l, .style-premium.theme-royalty .pf-line-r { background: #ffd700; box-shadow: 0 0 12px rgba(255,215,0,0.8); }
  .style-premium.theme-royalty .pf-fill { background: linear-gradient(90deg, #6a0dad, #ba85ff, #ffd700); box-shadow: 0 0 20px rgba(186,133,255,0.5); }

  /* Custom */
  .style-premium.theme-custom .pf-bar-border,
  .style-premium.theme-custom .pf-corner-l::before, .style-premium.theme-custom .pf-corner-l::after,
  .style-premium.theme-custom .pf-corner-lb::before, .style-premium.theme-custom .pf-corner-lb::after,
  .style-premium.theme-custom .pf-corner-r::before, .style-premium.theme-custom .pf-corner-r::after,
  .style-premium.theme-custom .pf-corner-rb::before, .style-premium.theme-custom .pf-corner-rb::after,
  .style-premium.theme-custom .pf-line-l, .style-premium.theme-custom .pf-line-r { background: rgba(255,255,255,0.5); box-shadow: 0 0 8px rgba(255,255,255,0.3); }
  .style-premium.theme-custom .pf-fill { background: linear-gradient(90deg, rgba(255,255,255,0.4), rgba(255,255,255,0.7)); }

  /* ===== DEFAULT THEME OVERRIDES (unchanged) ===== */
  .style-default.theme-neon .goal-container { border-color: #00d4ff; box-shadow: 0 0 30px rgba(0,212,255,0.3), inset 0 0 20px rgba(0,212,255,0.05); }
  .style-default.theme-neon .goal-title { color: #00d4ff; text-shadow: 0 0 10px rgba(0,212,255,0.5); }
  .style-default.theme-neon .goal-numbers .current { color: #00d4ff; }
  .style-default.theme-neon .goal-bar-fill { background: linear-gradient(90deg, #0088cc, #00d4ff); box-shadow: 0 0 15px rgba(0,212,255,0.5); }

  .style-default.theme-fire .goal-container { background: linear-gradient(180deg, rgba(40,10,0,0.9), rgba(80,20,0,0.9)); border-color: #ff6b35; box-shadow: 0 0 30px rgba(255,107,53,0.4), 0 0 60px rgba(255,69,0,0.2); }
  .style-default.theme-fire .goal-title { color: #ff6b35; text-shadow: 0 0 10px rgba(255,107,53,0.6); }
  .style-default.theme-fire .goal-numbers .current { color: #ff6b35; }
  .style-default.theme-fire .goal-bar-fill { background: linear-gradient(90deg, #ff4500, #ff6b35, #ffaa00); box-shadow: 0 0 15px rgba(255,107,53,0.5); }

  .style-default.theme-ice .goal-container { background: linear-gradient(180deg, rgba(10,20,40,0.9), rgba(20,40,80,0.9)); border-color: #87ceeb; box-shadow: 0 0 30px rgba(135,206,235,0.3); }
  .style-default.theme-ice .goal-title { color: #87ceeb; text-shadow: 0 0 10px rgba(135,206,235,0.5); }
  .style-default.theme-ice .goal-numbers .current { color: #87ceeb; }
  .style-default.theme-ice .goal-bar-fill { background: linear-gradient(90deg, #4fc3f7, #87ceeb, #b0e0e6); box-shadow: 0 0 15px rgba(135,206,235,0.5); }

  .style-default.theme-medieval .goal-container { background: linear-gradient(135deg, rgba(30,20,10,0.9), rgba(50,35,15,0.9)); border: 3px solid #c9a44a; box-shadow: 0 0 20px rgba(201,164,74,0.3); font-family: 'MedievalSharp', cursive; }
  .style-default.theme-medieval .goal-title { color: #ffd700; font-family: 'MedievalSharp', cursive; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
  .style-default.theme-medieval .goal-numbers { font-family: 'MedievalSharp', cursive; }
  .style-default.theme-medieval .goal-numbers .current { color: #ffd700; }
  .style-default.theme-medieval .goal-bar-bg { border-color: rgba(201,164,74,0.4); }
  .style-default.theme-medieval .goal-bar-fill { background: linear-gradient(90deg, #8b6914, #c9a44a, #ffd700); box-shadow: 0 0 10px rgba(201,164,74,0.4); }

  .style-default.theme-retro .goal-container { background: rgba(0,0,0,0.9); border: 3px solid #39ff14; box-shadow: 0 0 20px rgba(57,255,20,0.3); border-radius: 4px; font-family: 'Press Start 2P', monospace; }
  .style-default.theme-retro .goal-title { color: #39ff14; font-family: 'Press Start 2P', monospace; font-size: 10px; text-shadow: 0 0 10px rgba(57,255,20,0.8); }
  .style-default.theme-retro .goal-numbers { font-family: 'Press Start 2P', monospace; font-size: 18px; }
  .style-default.theme-retro .goal-numbers .current { color: #39ff14; }
  .style-default.theme-retro .goal-bar-bg { border-radius: 2px; border-color: #39ff14; }
  .style-default.theme-retro .goal-bar-fill { border-radius: 2px; background: #39ff14; box-shadow: 0 0 10px rgba(57,255,20,0.5); }
  .style-default.theme-retro .goal-percent { font-family: 'Press Start 2P', monospace; font-size: 8px; }

  @keyframes royalGoalGlow {
    0%,100% { border-color: rgba(255,215,0,0.5); box-shadow: 0 0 30px rgba(255,215,0,0.2), 0 0 60px rgba(186,133,255,0.15); }
    50% { border-color: rgba(255,215,0,0.9); box-shadow: 0 0 50px rgba(255,215,0,0.5), 0 0 80px rgba(186,133,255,0.3); }
  }
  .style-default.theme-royalty .goal-container { background: linear-gradient(135deg, rgba(60,20,100,0.92), rgba(40,10,70,0.95)); border: 3px solid #ffd700; animation: royalGoalGlow 4s ease-in-out infinite; }
  .style-default.theme-royalty .goal-title { color: #ffd700; text-shadow: 0 0 12px rgba(255,215,0,0.5); }
  .style-default.theme-royalty .goal-numbers .current { color: #ffd700; }
  .style-default.theme-royalty .goal-bar-bg { border-color: rgba(255,215,0,0.3); }
  .style-default.theme-royalty .goal-bar-fill { background: linear-gradient(90deg, #6a0dad, #ba85ff, #ffd700); box-shadow: 0 0 15px rgba(186,133,255,0.5); }

  .style-default.theme-custom .goal-container { background: rgba(0,0,0,0.6); border: 2px solid rgba(255,255,255,0.3); box-shadow: 0 0 20px rgba(255,255,255,0.1); }
  .style-default.theme-custom .goal-title { color: #fff; }
  .style-default.theme-custom .goal-numbers .current { color: #fff; }
  .style-default.theme-custom .goal-bar-fill { background: linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.8)); }

  /* ===== ANIMATIONS ===== */
  @keyframes goalPulse { 0% { transform: scale(1); } 50% { transform: scale(1.03); } 100% { transform: scale(1); } }
  .pulse { animation: goalPulse 0.4s ease-out; }
  @keyframes goalComplete {
    0%,100% { box-shadow: 0 0 30px rgba(255,215,0,0.3), 0 0 60px rgba(255,215,0,0.1); border-color: #ffd700; }
    50% { box-shadow: 0 0 50px rgba(255,215,0,0.6), 0 0 100px rgba(255,215,0,0.3); border-color: #ffed4a; }
  }
  .style-default .goal-complete { animation: goalComplete 2s ease-in-out infinite; }
  .style-default .goal-complete .goal-bar-fill { background: linear-gradient(90deg, #ffd700, #ffed4a, #ffd700) !important; }

  @keyframes premiumComplete {
    0%,100% { filter: brightness(1); }
    50% { filter: brightness(1.3); }
  }
  .style-premium .goal-complete .premium-frame { animation: premiumComplete 2s ease-in-out infinite; }
  .style-premium .goal-complete .pf-fill { background: linear-gradient(90deg, #ffd700, #ffed4a, #ffd700) !important; }
  .style-premium .goal-complete .pf-bar-border,
  .style-premium .goal-complete .pf-corner-l::before, .style-premium .goal-complete .pf-corner-l::after,
  .style-premium .goal-complete .pf-corner-lb::before, .style-premium .goal-complete .pf-corner-lb::after,
  .style-premium .goal-complete .pf-corner-r::before, .style-premium .goal-complete .pf-corner-r::after,
  .style-premium .goal-complete .pf-corner-rb::before, .style-premium .goal-complete .pf-corner-rb::after,
  .style-premium .goal-complete .pf-line-l, .style-premium .goal-complete .pf-line-r { background: #ffd700 !important; box-shadow: 0 0 15px rgba(255,215,0,0.8) !important; }

  @keyframes premiumPulseGlow {
    0% { filter: brightness(1); }
    50% { filter: brightness(1.4); }
    100% { filter: brightness(1); }
  }
  .style-premium .pulse .premium-frame { animation: premiumPulseGlow 0.4s ease-out; }
</style>
</head>
<body>
<div id="theme-wrapper" class="style-default theme-neon">
<div class="goal-container" id="goal-container">
  <div class="goal-title" id="goal-title">${icon} Meta</div>
  <div class="goal-numbers"><span class="current" id="goal-current">0</span> / <span id="goal-target">0</span></div>
  <div class="goal-bar-bg">
    <div class="goal-bar-fill" id="goal-fill"></div>
    <div class="goal-percent" id="goal-percent">0%</div>
  </div>
  <!-- Premium frame (hidden by default, shown when style=premium) -->
  <div class="premium-frame" id="premium-frame">
    <div class="pf-corner-l"></div>
    <div class="pf-corner-lb"></div>
    <div class="pf-corner-r"></div>
    <div class="pf-corner-rb"></div>
    <div class="pf-line-l"></div>
    <div class="pf-line-r"></div>
    <div class="pf-bar-border"></div>
    <div class="pf-bar"></div>
    <div class="pf-fill-track"><div class="pf-fill" id="pf-fill"></div></div>
    <div class="pf-text" id="pf-text">GOAL : 0 / 0 (0%)</div>
  </div>
</div>
</div>
<script>
  const wrapper = document.getElementById('theme-wrapper');
  const container = document.getElementById('goal-container');
  const titleEl = document.getElementById('goal-title');
  const currentEl = document.getElementById('goal-current');
  const targetEl = document.getElementById('goal-target');
  const fillEl = document.getElementById('goal-fill');
  const percentEl = document.getElementById('goal-percent');
  const pfFill = document.getElementById('pf-fill');
  const pfText = document.getElementById('pf-text');
  const icon = '${icon}';
  const prefix = '${valuePrefix}';
  let prevCurrent = 0;
  let currentStyle = 'default';

  function applyStyle(style, theme, customColor) {
    currentStyle = style || 'default';
    const t = theme || 'neon';
    wrapper.className = 'style-' + currentStyle + ' theme-' + t;
    document.body.style.background = (t === 'custom' && customColor) ? customColor : 'transparent';
  }

  function updateGoal(data) {
    const text = data.text || '';
    const target = data.target || 1;
    const current = data.current || 0;
    const pct = Math.min(100, Math.round((current / target) * 100));

    // Default style elements
    titleEl.textContent = text ? icon + ' ' + text : icon + ' Meta';
    currentEl.textContent = prefix + current.toLocaleString('pt-BR');
    targetEl.textContent = prefix + target.toLocaleString('pt-BR');
    fillEl.style.width = pct + '%';
    percentEl.textContent = pct + '%';

    // Premium style elements
    const label = text ? text.toUpperCase() : (icon === '❤️' ? 'LIKE GOAL' : 'GOAL');
    pfText.textContent = label + ' : ' + prefix + current.toLocaleString('pt-BR') + ' / ' + prefix + target.toLocaleString('pt-BR') + ' (' + pct + '%)';
    pfFill.style.width = pct + '%';

    if (current > prevCurrent) {
      container.classList.remove('pulse');
      void container.offsetWidth;
      container.classList.add('pulse');
    }

    if (current >= target) {
      container.classList.add('goal-complete');
    } else {
      container.classList.remove('goal-complete');
    }

    if (data.style || data.theme) {
      applyStyle(data.style, data.theme, data.customColor);
    }

    prevCurrent = current;
  }

  const evtSource = new EventSource('${sseUrl}');
  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'goal') {
      updateGoal(msg);
    }
  };
</script>
</body></html>`;
}

// ============================================
// TOP SCORE OVERLAY HTML (Velho Oeste)
// ============================================
function getTopScoreHTML(roomId) {
  const sseUrl = `/sse/${roomId}/top-score`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Rye&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:transparent; display:flex; justify-content:center; align-items:flex-start; padding:10px; font-family:'Rye',cursive; }

  .card {
    width: 270px;
    background: linear-gradient(160deg, #1c0e04 0%, #2a1506 40%, #1c0e04 100%);
    border: 3px solid #c9a44a;
    border-radius: 6px;
    outline: 2px solid rgba(201,164,74,0.25);
    outline-offset: 5px;
    box-shadow: 0 0 0 1px #3d2008, 0 12px 50px rgba(0,0,0,0.95), inset 0 0 80px rgba(80,40,5,0.08);
    overflow: hidden;
    position: relative;
  }

  /* Inner wood grain lines */
  .card::before {
    content:''; position:absolute; inset:0; pointer-events:none;
    background: repeating-linear-gradient(
      175deg,
      transparent 0px, transparent 18px,
      rgba(201,164,74,0.025) 18px, rgba(201,164,74,0.025) 19px
    );
  }

  /* ── TOP BAR ── */
  .top-bar {
    background: linear-gradient(90deg, #120800, #3a1c05 25%, #4a2408 50%, #3a1c05 75%, #120800);
    border-bottom: 2px solid #c9a44a;
    padding: 12px 14px 9px;
    text-align: center; position: relative;
  }
  .top-bar::before { content:'✦ ✦'; position:absolute; left:10px; top:50%; transform:translateY(-50%); color:rgba(201,164,74,0.6); font-size:9px; letter-spacing:4px; }
  .top-bar::after  { content:'✦ ✦'; position:absolute; right:10px; top:50%; transform:translateY(-50%); color:rgba(201,164,74,0.6); font-size:9px; letter-spacing:4px; }

  .title-txt {
    font-size:22px; color:#ffd966; letter-spacing:4px; text-transform:uppercase;
    text-shadow: 0 0 16px rgba(255,180,0,0.5), 1px 1px 3px #000;
  }
  .desc-txt {
    font-size:8px; letter-spacing:3px; color:rgba(201,164,74,0.65);
    text-transform:uppercase; margin-top:3px;
  }

  /* ── CORNER ORNAMENTS ── */
  .corner { position:absolute; color:rgba(201,164,74,0.4); font-size:13px; line-height:1; }
  .corner.tl { top:6px; left:8px; }
  .corner.tr { top:6px; right:8px; }
  .corner.bl { bottom:6px; left:8px; }
  .corner.br { bottom:6px; right:8px; }

  /* ── AVATAR ── */
  .avatar-wrap {
    display:flex; flex-direction:column; align-items:center;
    padding: 22px 20px 10px; position:relative;
  }
  .avatar-crown {
    font-size:32px; margin-bottom:-14px; z-index:2; position:relative;
    filter:
      drop-shadow(0 0 6px rgba(255,200,0,0.9))
      drop-shadow(0 0 16px rgba(255,150,0,0.55))
      drop-shadow(0 5px 14px rgba(0,0,0,0.95));
    animation: float 3s ease-in-out infinite;
  }
  .avatar-crown-DISABLED { display:none; }
  @keyframes float { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-6px) scale(1.03)} }

  .avatar-ring {
    width:116px; height:116px; border-radius:50%; overflow:hidden;
    border: 4px solid #c9a44a;
    box-shadow: 0 0 0 2px rgba(201,164,74,0.3), 0 0 0 7px rgba(201,164,74,0.07), 0 0 24px rgba(201,164,74,0.35), inset 0 0 24px rgba(0,0,0,0.4);
    background:rgba(255,255,255,0.04);
    display:flex; align-items:center; justify-content:center; font-size:50px;
  }
  .avatar-ring img { width:100%; height:100%; object-fit:cover; }

  /* Sheriff star removida */

  .name-txt {
    margin-top:12px; font-size:15px; color:#ffd966; letter-spacing:1px;
    text-transform:uppercase; text-align:center; max-width:230px;
    overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
    text-shadow:1px 1px 4px #000, 0 0 12px rgba(255,200,0,0.25);
  }

  /* ── DIVIDER ── */
  .divider { display:flex; align-items:center; gap:6px; padding:0 18px; margin:6px 0 10px; }
  .div-line { flex:1; height:1px; background:linear-gradient(90deg,transparent,#c9a44a,transparent); }
  .div-star { color:#c9a44a; font-size:11px; }

  /* ── VALUE BOX ── */
  .value-box {
    text-align:center; margin:0 14px 14px;
    padding: 10px 14px 14px;
    background: linear-gradient(180deg, rgba(201,164,74,0.05), rgba(201,164,74,0.1));
    border:1px solid rgba(201,164,74,0.25); border-radius:4px;
    position:relative;
  }
  .value-box::before { display:none; }

  .subtitle-txt {
    font-size:8px; letter-spacing:3px; color:rgba(201,164,74,0.6);
    text-transform:uppercase; margin-bottom:6px;
  }
  .value-txt {
    font-size:38px; color:#e8571a;
    text-shadow: 0 0 24px rgba(220,80,0,0.6), 1px 1px 0 #000, 2px 2px 0 rgba(0,0,0,0.5);
    letter-spacing:2px; line-height:1;
  }

  /* ── BOTTOM DECO ── */
  .bottom-deco { text-align:center; padding:2px 12px 12px; color:#c9a44a; font-size:16px; letter-spacing:10px; }
</style>
</head>
<body>
<div class="card">
  <span class="corner tl">✦</span>
  <span class="corner tr">✦</span>
  <span class="corner bl">✦</span>
  <span class="corner br">✦</span>

  <div class="top-bar">
    <div class="title-txt" id="title-el">TOP</div>
    <div class="desc-txt"  id="desc-el"> </div>
  </div>

  <div class="avatar-wrap">
    <div class="avatar-crown">👑</div>
    <div class="avatar-crown-DISABLED"><svg xmlns="http://www.w3.org/2000/svg" width="162" height="88" viewBox="0 0 200 108">
  <defs>
    <!-- Gradiente dourado para pontas (diagonal metalico) -->
    <linearGradient id="gSpk" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%"   stop-color="#fff8b0"/>
      <stop offset="18%"  stop-color="#fdd84a"/>
      <stop offset="50%"  stop-color="#c07810"/>
      <stop offset="75%"  stop-color="#e8a818"/>
      <stop offset="100%" stop-color="#7a4400"/>
    </linearGradient>
    <!-- Gradiente para pontas laterais -->
    <linearGradient id="gSpkS" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#ffe878"/>
      <stop offset="40%"  stop-color="#d09018"/>
      <stop offset="100%" stop-color="#7a4400"/>
    </linearGradient>
    <!-- Gradiente da banda (cilindro) -->
    <linearGradient id="gBnd" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#f8e050"/>
      <stop offset="22%"  stop-color="#d4a018"/>
      <stop offset="52%"  stop-color="#c08010"/>
      <stop offset="78%"  stop-color="#dca028"/>
      <stop offset="100%" stop-color="#8a4e00"/>
    </linearGradient>
    <!-- Elipse superior da banda -->
    <linearGradient id="gEllT" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#f8e060"/>
      <stop offset="100%" stop-color="#b07c10"/>
    </linearGradient>
    <!-- Esfera dourada (orb) - efeito 3D -->
    <radialGradient id="gOrb" cx="32%" cy="27%" r="68%">
      <stop offset="0%"   stop-color="#fffce0"/>
      <stop offset="22%"  stop-color="#ffe050"/>
      <stop offset="62%"  stop-color="#b07010"/>
      <stop offset="100%" stop-color="#5a3000"/>
    </radialGradient>
    <!-- Rubi vermelho -->
    <radialGradient id="gRub" cx="33%" cy="28%" r="68%">
      <stop offset="0%"   stop-color="#ffb0b0"/>
      <stop offset="32%"  stop-color="#e01818"/>
      <stop offset="100%" stop-color="#6a0000"/>
    </radialGradient>
    <!-- Esmeralda verde -->
    <radialGradient id="gEmd" cx="33%" cy="28%" r="68%">
      <stop offset="0%"   stop-color="#b0ffb8"/>
      <stop offset="32%"  stop-color="#18a030"/>
      <stop offset="100%" stop-color="#004010"/>
    </radialGradient>
    <!-- Interior inferior da banda (reflexo avermelhado) -->
    <linearGradient id="gInn" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#b85a00"/>
      <stop offset="100%" stop-color="#2a0c00"/>
    </linearGradient>
    <!-- Sombra geral -->
    <filter id="drp" x="-8%" y="-5%" width="120%" height="125%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.85)"/>
    </filter>
  </defs>

  <g filter="url(#drp)">

    <!-- ══ PONTAS (desenhadas antes da banda) ══ -->

    <!-- Ponta far-esquerda -->
    <path d="M 4,68 C 6,58 12,52 18,42 C 24,52 29,58 33,68 Z" fill="url(#gSpkS)"/>
    <path d="M 4,68 C 6,58 12,52 18,42 C 14,52 10,58 9,68 Z"  fill="rgba(255,255,160,0.28)"/>

    <!-- Ponta meio-esquerda -->
    <path d="M 36,68 C 40,52 47,34 55,18 C 63,34 70,52 74,68 Z" fill="url(#gSpk)"/>
    <path d="M 36,68 C 40,52 47,34 55,18 C 50,34 45,52 42,68 Z" fill="rgba(255,255,160,0.30)"/>
    <path d="M 74,68 C 70,52 63,34 55,18 C 59,34 65,52 68,68 Z" fill="rgba(0,0,0,0.16)"/>

    <!-- Ponta central (mais alta) -->
    <path d="M 76,68 C 80,46 88,24 100,9 C 112,24 120,46 124,68 Z" fill="url(#gSpk)"/>
    <path d="M 76,68 C 80,46 88,24 100,9 C 94,24 87,46 84,68 Z"    fill="rgba(255,255,160,0.35)"/>
    <path d="M 124,68 C 120,46 112,24 100,9 C 106,24 113,46 116,68 Z" fill="rgba(0,0,0,0.18)"/>

    <!-- Ponta meio-direita -->
    <path d="M 126,68 C 130,52 137,34 145,18 C 153,34 160,52 164,68 Z" fill="url(#gSpk)"/>
    <path d="M 126,68 C 130,52 137,34 145,18 C 140,34 135,52 132,68 Z" fill="rgba(255,255,160,0.20)"/>
    <path d="M 164,68 C 160,52 153,34 145,18 C 149,34 155,52 159,68 Z" fill="rgba(0,0,0,0.16)"/>

    <!-- Ponta far-direita -->
    <path d="M 167,68 C 171,58 177,52 182,42 C 188,52 193,58 196,68 Z" fill="url(#gSpkS)"/>
    <path d="M 196,68 C 193,58 188,52 182,42 C 186,52 190,58 191,68 Z" fill="rgba(0,0,0,0.14)"/>

    <!-- ══ BANDA CILÍNDRICA ══ -->
    <!-- Interior inferior (reflexo avermelhado) -->
    <rect x="4" y="94" width="192" height="10" rx="3" fill="url(#gInn)"/>
    <!-- Corpo principal da banda -->
    <rect x="4" y="66" width="192" height="34" fill="url(#gBnd)"/>
    <!-- Brilho superior da banda -->
    <rect x="4" y="66" width="192" height="15" fill="rgba(255,255,255,0.11)"/>
    <!-- Linha divisória horizontal -->
    <rect x="4" y="80" width="192" height="1.8" fill="rgba(255,220,60,0.32)"/>
    <!-- Elipse superior (perspectiva 3D) -->
    <ellipse cx="100" cy="66" rx="96" ry="8"   fill="url(#gEllT)"/>
    <ellipse cx="100" cy="66" rx="96" ry="8"   fill="rgba(255,255,255,0.20)"/>
    <ellipse cx="100" cy="66" rx="96" ry="8"   fill="none" stroke="#ffe050" stroke-width="1.4"/>
    <!-- Elipse inferior -->
    <ellipse cx="100" cy="100" rx="96" ry="6.5" fill="#9a5a08"/>
    <ellipse cx="100" cy="100" rx="96" ry="6.5" fill="none" stroke="#dda018" stroke-width="1" opacity="0.7"/>

    <!-- ══ PÉROLAS — borda superior ══ -->
    <circle cx="16"  cy="59" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="31"  cy="56" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="47"  cy="55" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="63"  cy="54" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="82"  cy="57" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="100" cy="57" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="118" cy="57" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="137" cy="54" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="153" cy="55" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="169" cy="56" r="2.4" fill="white" opacity="0.88"/>
    <circle cx="184" cy="59" r="2.4" fill="white" opacity="0.88"/>

    <!-- ══ PÉROLAS — borda inferior ══ -->
    <circle cx="16"  cy="97"  r="2.2" fill="white" opacity="0.72"/>
    <circle cx="34"  cy="99"  r="2.2" fill="white" opacity="0.72"/>
    <circle cx="52"  cy="100" r="2.2" fill="white" opacity="0.72"/>
    <circle cx="70"  cy="101" r="2.2" fill="white" opacity="0.72"/>
    <circle cx="88"  cy="102" r="2.2" fill="white" opacity="0.72"/>
    <circle cx="100" cy="102" r="2.2" fill="white" opacity="0.72"/>
    <circle cx="112" cy="102" r="2.2" fill="white" opacity="0.72"/>
    <circle cx="130" cy="101" r="2.2" fill="white" opacity="0.72"/>
    <circle cx="148" cy="100" r="2.2" fill="white" opacity="0.72"/>
    <circle cx="166" cy="99"  r="2.2" fill="white" opacity="0.72"/>
    <circle cx="184" cy="97"  r="2.2" fill="white" opacity="0.72"/>

    <!-- ══ PEDRAS NA BANDA ══ -->
    <!-- Rubi central -->
    <circle cx="100" cy="82" r="8"   fill="#a06010" stroke="#ffe050" stroke-width="1.2"/>
    <circle cx="100" cy="82" r="6"   fill="url(#gRub)"/>
    <circle cx="98"  cy="80" r="2.2" fill="rgba(255,255,255,0.62)"/>
    <!-- Esmeralda esquerda -->
    <circle cx="66"  cy="83" r="6.5" fill="#a06010" stroke="#ffe050" stroke-width="1"/>
    <circle cx="66"  cy="83" r="4.8" fill="url(#gEmd)"/>
    <circle cx="64.5" cy="81.5" r="1.8" fill="rgba(255,255,255,0.60)"/>
    <!-- Rubi direito -->
    <circle cx="134" cy="83" r="6.5" fill="#a06010" stroke="#ffe050" stroke-width="1"/>
    <circle cx="134" cy="83" r="4.8" fill="url(#gRub)"/>
    <circle cx="132.5" cy="81.5" r="1.8" fill="rgba(255,255,255,0.60)"/>
    <!-- Esmeralda far-esquerda -->
    <circle cx="30"  cy="79" r="5.2" fill="#a06010" stroke="#ffe050" stroke-width="0.8"/>
    <circle cx="30"  cy="79" r="3.8" fill="url(#gEmd)"/>
    <circle cx="28.8" cy="77.8" r="1.4" fill="rgba(255,255,255,0.60)"/>
    <!-- Rubi far-direito -->
    <circle cx="170" cy="79" r="5.2" fill="#a06010" stroke="#ffe050" stroke-width="0.8"/>
    <circle cx="170" cy="79" r="3.8" fill="url(#gRub)"/>
    <circle cx="168.8" cy="77.8" r="1.4" fill="rgba(255,255,255,0.60)"/>

    <!-- ══ PEDRAS NAS PONTAS ══ -->
    <!-- Rubi — ponta central -->
    <circle cx="100" cy="34" r="7"   fill="#a06010" stroke="#ffe050" stroke-width="0.8"/>
    <circle cx="100" cy="34" r="5.2" fill="url(#gRub)"/>
    <circle cx="98.2" cy="32.2" r="2"  fill="rgba(255,255,255,0.62)"/>
    <!-- Rubi — ponta meio-esquerda -->
    <circle cx="55"  cy="46" r="5.5" fill="#a06010" stroke="#ffe050" stroke-width="0.8"/>
    <circle cx="55"  cy="46" r="4"   fill="url(#gRub)"/>
    <circle cx="53.5" cy="44.5" r="1.5" fill="rgba(255,255,255,0.60)"/>
    <!-- Rubi — ponta meio-direita -->
    <circle cx="145" cy="46" r="5.5" fill="#a06010" stroke="#ffe050" stroke-width="0.8"/>
    <circle cx="145" cy="46" r="4"   fill="url(#gRub)"/>
    <circle cx="143.5" cy="44.5" r="1.5" fill="rgba(255,255,255,0.60)"/>

    <!-- ══ ESFERAS DOURADAS no topo das pontas ══ -->
    <circle cx="18"  cy="42" r="6"   fill="url(#gOrb)" stroke="#c07808" stroke-width="0.6"/>
    <circle cx="55"  cy="17" r="7.5" fill="url(#gOrb)" stroke="#c07808" stroke-width="0.6"/>
    <circle cx="100" cy="8"  r="9"   fill="url(#gOrb)" stroke="#c07808" stroke-width="0.6"/>
    <circle cx="145" cy="17" r="7.5" fill="url(#gOrb)" stroke="#c07808" stroke-width="0.6"/>
    <circle cx="182" cy="42" r="6"   fill="url(#gOrb)" stroke="#c07808" stroke-width="0.6"/>

  </g>
</svg></div>
    <div class="avatar-ring" id="avatar-el">${String.fromCodePoint(128100)}</div>
    <div class="name-txt" id="name-el">—</div>
  </div>

  <div class="divider">
    <div class="div-line"></div>
    <span class="div-star">✦</span>
    <div class="div-line"></div>
  </div>

  <div class="value-box">
    <div class="subtitle-txt" id="subtitle-el">PONTUAÇÃO</div>
    <div class="value-txt"    id="value-el">0</div>
  </div>

  <div class="bottom-deco">⭐ ⭐ ⭐</div>
</div>
<script>
  const titleEl    = document.getElementById('title-el');
  const descEl     = document.getElementById('desc-el');
  const subtitleEl = document.getElementById('subtitle-el');
  const avatarEl   = document.getElementById('avatar-el');
  const nameEl     = document.getElementById('name-el');
  const valueEl    = document.getElementById('value-el');

  new EventSource('${sseUrl}').onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') render(msg.data);
  };

  function render(d) {
    titleEl.textContent    = d.title    || 'TOP';
    descEl.textContent     = d.desc     || '';
    subtitleEl.textContent = d.subtitle || 'PONTUAÇÃO';
    nameEl.textContent     = d.name     || '—';
    valueEl.textContent    = Number(d.valor || 0).toLocaleString('pt-BR');
    avatarEl.innerHTML     = d.avatar
      ? '<img src="' + esc(d.avatar) + '" onerror="this.parentElement.innerHTML=String.fromCodePoint(128100)">'
      : String.fromCodePoint(128100);
  }

  function esc(s) { const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }
</script>
</body>
</html>`;
}

// ============================================
// MEMBROS OVERLAY HTML
// ============================================
function getMembrosHTML(roomId) {
  const sseUrl = `/sse/${roomId}/membros`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; overflow: hidden; font-family: 'Segoe UI', sans-serif; }

  #container { display: flex; flex-direction: column; align-items: center; padding: 10px 0 8px; width: 100%; }

  #title-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }

  #heart-icon {
    width: 42px; height: 42px; object-fit: contain;
    animation: heartbeat 1.6s ease-in-out infinite;
    filter: drop-shadow(0 0 6px rgba(255,80,80,0.7)); flex-shrink: 0;
  }
  @keyframes heartbeat {
    0%   { transform: scale(1)    rotate(-3deg); }
    20%  { transform: scale(1.18) rotate(3deg);  }
    40%  { transform: scale(1)    rotate(-2deg); }
    60%  { transform: scale(1.08) rotate(2deg);  }
    80%  { transform: scale(1)    rotate(0deg);  }
    100% { transform: scale(1)    rotate(-3deg); }
  }

  #title {
    font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 900;
    color: #fff; text-shadow: 0 0 14px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.9);
    text-transform: uppercase; letter-spacing: 2px;
    padding: 5px 22px; background: rgba(0,0,0,0.45);
    border-radius: 20px; border: 1px solid rgba(255,255,255,0.18); white-space: nowrap;
  }

  #stage {
    width: 100%; height: 88px; overflow: hidden; position: relative;
  }

  .mc {
    position: absolute; top: 4px;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    width: 76px; will-change: transform;
  }
  .ma {
    width: 58px; height: 58px; border-radius: 50%; overflow: hidden;
    border: 2px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center; font-size: 26px;
    box-shadow: 0 0 10px rgba(0,0,0,0.5);
  }
  .ma img { width: 100%; height: 100%; object-fit: cover; }
  .mn {
    font-size: 10px; font-weight: 700; color: #fff;
    text-shadow: 0 1px 3px rgba(0,0,0,0.95);
    max-width: 76px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: center;
  }
  .empty-msg { color: rgba(255,255,255,0.35); font-size: 13px; padding: 20px 16px; text-align: center; width: 100%; }
</style>
</head>
<body>
<div id="container">
  <div id="title-row">
    <img id="heart-icon" src="https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/d56945782445b0b8c8658ed44f894c7b~tplv-obj.webp" alt="">
    <div id="title">Membros</div>
  </div>
  <div id="stage">
    <div class="empty-msg" id="empty-msg">Aguardando heartmes...</div>
  </div>
</div>
<script>
  const titleEl = document.getElementById('title');
  const stage   = document.getElementById('stage');
  const emptyEl = document.getElementById('empty-msg');

  const CARD_W  = 76;
  const GAP     = 22;
  const STEP    = CARD_W + GAP; // 98px per slot
  const SPEED   = 80;           // px per second

  let cards      = [];       // [{el, x, userId}]
  let renderedIds = new Set(); // userId already on stage
  let animId     = null;
  let lastTs     = null;
  let vw         = 800;

  window.addEventListener('load', () => { vw = stage.offsetWidth || window.innerWidth || 800; });
  setTimeout(() => { vw = stage.offsetWidth || window.innerWidth || 800; }, 200);

  new EventSource('${sseUrl}').onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') render(msg.data);
  };

  function render(data) {
    titleEl.textContent = data.title || 'Membros';
    const members = data.members || [];

    // RESET: if members list is empty, clear everything
    if (members.length === 0) {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      cards.forEach(c => c.el.remove());
      cards = [];
      renderedIds.clear();
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';
    vw = stage.offsetWidth || window.innerWidth || 800;

    // Only add members that aren't already on stage
    const newMembers = members.filter(m => !renderedIds.has(m.userId));

    newMembers.forEach(m => {
      renderedIds.add(m.userId);

      const el = document.createElement('div');
      el.className = 'mc';
      const av = m.profilePictureUrl
        ? '<img src="' + esc(m.profilePictureUrl) + '" onerror="this.parentElement.innerHTML=String.fromCodePoint(128100)">'
        : String.fromCodePoint(128100);
      el.innerHTML = '<div class="ma">' + av + '</div><div class="mn">' + esc(m.nickname) + '</div>';
      stage.appendChild(el);

      // Place at end of queue, always past the right edge
      const maxX = cards.length > 0
        ? Math.max(...cards.map(c => c.x), vw - STEP) + STEP
        : vw;
      el.style.transform = 'translateX(' + maxX + 'px)';
      cards.push({ el, x: maxX, userId: m.userId });
    });

    // Start animation if not already running
    if (!animId && cards.length > 0) {
      lastTs = null;
      animId = requestAnimationFrame(tick);
    }
  }

  function tick(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    cards.forEach(card => {
      card.x -= SPEED * dt;

      // When card fully exits left, place it after the rightmost card
      // but always at least off-screen right (>= vw), so it travels the full width
      if (card.x + CARD_W < 0) {
        const maxX = Math.max(...cards.map(c => c.x), vw - STEP);
        card.x = maxX + STEP;
      }

      card.el.style.transform = 'translateX(' + card.x + 'px)';
    });

    animId = requestAnimationFrame(tick);
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
</script>
</body>
</html>`;
}

function getMembrosAcaoHTML(roomId) {
  const sseUrl = `/sse/${roomId}/membros-acao`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:transparent; overflow:hidden; font-family:'Segoe UI',sans-serif; }
  #container { display:flex; flex-direction:column; align-items:center; padding:10px 0 8px; width:100%; }
  #title-row { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
  #gift-icon {
    width:42px; height:42px; object-fit:contain; flex-shrink:0;
    animation:giftPulse 2s ease-in-out infinite;
    filter:drop-shadow(0 0 8px rgba(255,200,0,0.8));
  }
  @keyframes giftPulse {
    0%,100% { transform:scale(1) rotate(-5deg); }
    50%     { transform:scale(1.2) rotate(5deg); }
  }
  #title {
    font-family:'Orbitron',sans-serif; font-size:16px; font-weight:900;
    color:#fff; text-shadow:0 0 14px rgba(255,255,255,0.5),0 2px 4px rgba(0,0,0,0.9);
    text-transform:uppercase; letter-spacing:2px;
    padding:5px 22px; background:rgba(0,0,0,0.45);
    border-radius:20px; border:1px solid rgba(255,255,255,0.18); white-space:nowrap;
  }
  #stage { width:100%; height:130px; overflow:visible; position:relative; }
  .mc {
    position:absolute; top:4px;
    display:flex; flex-direction:column; align-items:center; gap:3px;
    width:86px; will-change:transform;
  }
  .ma {
    width:58px; height:58px; border-radius:50%; overflow:hidden;
    border:2px solid rgba(255,255,255,0.5); background:rgba(255,255,255,0.08);
    display:flex; align-items:center; justify-content:center; font-size:26px;
    box-shadow:0 0 10px rgba(0,0,0,0.5); flex-shrink:0;
  }
  .ma img { width:100%; height:100%; object-fit:cover; }
  .mn {
    font-size:10px; font-weight:700; color:#fff;
    text-shadow:0 1px 3px rgba(0,0,0,0.95);
    max-width:86px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; text-align:center;
    line-height:1.2;
  }
  .msub {
    font-size:9px; font-weight:600;
    text-shadow:0 1px 3px rgba(0,0,0,0.95);
    max-width:86px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; text-align:center;
    line-height:1.2;
  }
  .empty-msg { color:rgba(255,255,255,0.35); font-size:13px; padding:20px 16px; text-align:center; width:100%; }
</style>
</head>
<body>
<div id="container">
  <div id="title-row">
    <img id="gift-icon" src="" alt="" onerror="this.style.display='none'">
    <div id="title">Membros Ação</div>
  </div>
  <div id="stage">
    <div class="empty-msg" id="empty-msg">Aguardando presentes...</div>
  </div>
</div>
<script>
  const titleEl  = document.getElementById('title');
  const giftIcon = document.getElementById('gift-icon');
  const stage    = document.getElementById('stage');
  const emptyEl  = document.getElementById('empty-msg');

  const CARD_W = 86;
  const GAP    = 20;
  const STEP   = CARD_W + GAP;
  const SPEED  = 80;

  let subText       = '';
  let subTextSize   = 9;
  let subValueSize  = 9;
  let subTextColor  = '#ffdc50';
  let subValueColor = '#ffdc50';
  let animId        = null;

  const evtSource = new EventSource('${sseUrl}');
  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') applyFull(msg.data);
  };

  let cards      = [];
  let renderedIds = new Set();
  let lastTs     = null;
  let vw         = 800;

  window.addEventListener('load', () => { vw = stage.offsetWidth || window.innerWidth || 800; });
  setTimeout(() => { vw = stage.offsetWidth || window.innerWidth || 800; }, 200);

  function buildSubEl(member) {
    const val = member && member.value ? member.value : 0;
    if (!subText && !val) return null;
    const sub = document.createElement('div');
    sub.className = 'msub';
    if (subText) {
      const st = document.createElement('span');
      st.style.fontSize = subTextSize + 'px';
      st.style.color = subTextColor;
      st.textContent = subText;
      sub.appendChild(st);
    }
    if (subText && val) sub.appendChild(document.createTextNode(' '));
    if (val) {
      const sv = document.createElement('span');
      sv.style.fontSize = subValueSize + 'px';
      sv.style.color = subValueColor;
      sv.textContent = val;
      sub.appendChild(sv);
    }
    return sub;
  }

  function applyFull(data) {
    if (data.title)     titleEl.textContent = data.title;
    if (data.giftImage) { giftIcon.src = data.giftImage; giftIcon.style.display = ''; }
    else giftIcon.style.display = 'none';
    subText       = data.subText       || '';
    subTextSize   = data.subTextSize   || 9;
    subValueSize  = data.subValueSize  || 9;
    subTextColor  = data.subTextColor  || '#ffdc50';
    subValueColor = data.subValueColor || '#ffdc50';

    const incoming = data.members || [];

    // If list was reset (empty), clear everything
    if (incoming.length === 0) {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      cards.forEach(c => c.el.remove());
      cards = [];
      renderedIds.clear();
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';
    vw = stage.offsetWidth || window.innerWidth || 800;

    // Update sub text/value on ALL existing cards (config or value may have changed)
    cards.forEach(card => {
      const member = incoming.find(m => m.userId === card.userId);
      let old = card.el.querySelector('.msub');
      if (old) old.remove();
      const fresh = buildSubEl(member);
      if (fresh) card.el.appendChild(fresh);
    });

    // Add only members not yet on stage
    const newMembers = incoming.filter(m => !renderedIds.has(m.userId));
    newMembers.forEach(m => {
      renderedIds.add(m.userId);

      const el = document.createElement('div');
      el.className = 'mc';

      const av = document.createElement('div');
      av.className = 'ma';
      if (m.profilePictureUrl) {
        const img = document.createElement('img');
        img.src = m.profilePictureUrl;
        img.onerror = () => { av.innerHTML = ''; av.textContent = String.fromCodePoint(128100); };
        av.appendChild(img);
      } else { av.textContent = String.fromCodePoint(128100); }

      const nm = document.createElement('div');
      nm.className = 'mn';
      nm.textContent = m.nickname || m.userId;

      el.appendChild(av);
      el.appendChild(nm);

      const sub = buildSubEl(m);
      if (sub) el.appendChild(sub);

      stage.appendChild(el);

      // Place at end of queue, always past the right edge
      const maxX = cards.length > 0
        ? Math.max(...cards.map(c => c.x), vw - STEP) + STEP
        : vw;
      el.style.transform = 'translateX(' + maxX + 'px)';
      cards.push({ el, x: maxX, userId: m.userId });
    });

    // Start animation if not already running
    if (!animId && cards.length > 0) {
      lastTs = null;
      animId = requestAnimationFrame(tick);
    }
  }

  function tick(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    cards.forEach(card => {
      card.x -= SPEED * dt;

      // When card fully exits left, place it after the rightmost card
      if (card.x + CARD_W < 0) {
        const maxX = Math.max(...cards.map(c => c.x), vw - STEP);
        card.x = maxX + STEP;
      }

      card.el.style.transform = 'translateX(' + card.x + 'px)';
    });

    animId = requestAnimationFrame(tick);
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
</script>
</body>
</html>`;
}

// ============================================
// ============================================
// TOP GIFT & TOP COMBO OVERLAYS
// ============================================
function getTopGiftHTML(roomId) {
  const sseUrl = `/sse/${roomId}/top-gift`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:transparent; overflow:hidden; display:flex; justify-content:center; align-items:center; min-height:100vh; }

  @keyframes floatGift {
    0%,100% { transform: translateY(0px) rotate(-3deg); }
    50%      { transform: translateY(-12px) rotate(3deg); }
  }
  @keyframes glowPulse {
    0%,100% { filter: drop-shadow(0 0 8px rgba(255,215,0,0.6)); }
    50%      { filter: drop-shadow(0 0 20px rgba(255,215,0,1)); }
  }
  @keyframes slideIn {
    from { opacity:0; transform:translateY(30px) scale(0.85); }
    to   { opacity:1; transform:translateY(0)    scale(1); }
  }
  @keyframes namePulse {
    0%,100% { text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
    50%      { text-shadow: 0 2px 16px rgba(0,0,0,0.9), 0 0 30px currentColor; }
  }
  @keyframes sparkle {
    0%   { opacity:0; transform:scale(0) rotate(0deg); }
    50%  { opacity:1; transform:scale(1.2) rotate(180deg); }
    100% { opacity:0; transform:scale(0) rotate(360deg); }
  }

  #card {
    display:none;
    flex-direction:column;
    align-items:center;
    gap:6px;
    animation: slideIn 0.5s cubic-bezier(.22,1,.36,1);
  }
  #card.visible { display:flex; }

  .gift-wrap {
    position:relative;
    width:120px; height:120px;
    display:flex; align-items:center; justify-content:center;
  }
  #gift-img {
    width:110px; height:110px;
    object-fit:contain;
    animation: floatGift 2.8s ease-in-out infinite, glowPulse 2.8s ease-in-out infinite;
    filter: drop-shadow(0 0 8px rgba(255,215,0,0.6));
  }
  .sparkle {
    position:absolute;
    font-size:14px;
    animation: sparkle 2s ease-in-out infinite;
    pointer-events:none;
  }
  .sp1 { top:5px;  left:5px;  animation-delay:0s;    }
  .sp2 { top:5px;  right:5px; animation-delay:0.7s;  }
  .sp3 { bottom:5px; left:10px; animation-delay:1.4s; }
  .sp4 { bottom:5px; right:10px; animation-delay:0.35s; }

  #name {
    font-family:'Poppins',sans-serif;
    font-size:22px;
    font-weight:900;
    color: #FFD700;
    text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(255,215,0,0.4);
    text-align:center;
    max-width:260px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    letter-spacing:0.5px;
    animation: namePulse 3s ease-in-out infinite;
  }
  #value {
    font-family:'Poppins',sans-serif;
    font-size:16px;
    font-weight:700;
    color:#fff;
    text-shadow:0 2px 6px rgba(0,0,0,0.8);
    display:flex;
    align-items:center;
    gap:5px;
  }
  .coin-icon { font-size:18px; }
  #label {
    font-family:'Poppins',sans-serif;
    font-size:11px;
    font-weight:700;
    color:rgba(255,255,255,0.6);
    text-transform:uppercase;
    letter-spacing:2px;
  }
</style>
</head>
<body>
<div id="card">
  <div id="label">🏆 MAIOR PRESENTE</div>
  <div class="gift-wrap">
    <img id="gift-img" src="" alt="">
    <span class="sparkle sp1">✦</span>
    <span class="sparkle sp2">✦</span>
    <span class="sparkle sp3">✦</span>
    <span class="sparkle sp4">✦</span>
  </div>
  <div id="name">User Name</div>
  <div id="value"><span class="coin-icon">🪙</span><span id="val-num">0</span></div>
</div>
<script>
  const card = document.getElementById('card');
  const giftImg = document.getElementById('gift-img');
  const labelEl = document.getElementById('label');
  const nameEl = document.getElementById('name');
  const valNum = document.getElementById('val-num');
  const sse = new EventSource('${sseUrl}');

  sse.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') {
      if (msg.config) {
        const cfg = msg.config;
        labelEl.textContent = cfg.label || 'Maior Presente';
        labelEl.style.color = cfg.labelColor || '#ffffff';
        nameEl.style.color = cfg.nameColor || '#FFD700';
        nameEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.8), 0 0 20px ' + (cfg.nameColor || '#FFD700') + '44';
        valNum.parentElement.style.color = cfg.valueColor || '#ffffff';
      }
      if (!msg.data) { card.classList.remove('visible'); return; }
      const d = msg.data;
      giftImg.src = d.giftPictureUrl || '';
      nameEl.textContent = d.nickname || '';
      valNum.textContent = (d.diamonds || 0).toLocaleString('pt-BR');
      card.classList.remove('visible');
      void card.offsetWidth;
      card.classList.add('visible');
    }
  };
</script>
</body>
</html>`;
}

function getTopComboHTML(roomId) {
  const sseUrl = `/sse/${roomId}/top-combo`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:transparent; overflow:hidden; display:flex; justify-content:center; align-items:center; min-height:100vh; }

  @keyframes floatGift {
    0%,100% { transform: translateY(0px) rotate(-3deg); }
    50%      { transform: translateY(-12px) rotate(3deg); }
  }
  @keyframes glowPulse {
    0%,100% { filter: drop-shadow(0 0 8px rgba(255,100,100,0.6)); }
    50%      { filter: drop-shadow(0 0 22px rgba(255,100,100,1)); }
  }
  @keyframes slideIn {
    from { opacity:0; transform:translateY(30px) scale(0.85); }
    to   { opacity:1; transform:translateY(0)    scale(1); }
  }
  @keyframes comboScale {
    0%   { transform: scale(1); }
    50%  { transform: scale(1.15); }
    100% { transform: scale(1); }
  }
  @keyframes sparkle {
    0%   { opacity:0; transform:scale(0) rotate(0deg); }
    50%  { opacity:1; transform:scale(1.2) rotate(180deg); }
    100% { opacity:0; transform:scale(0) rotate(360deg); }
  }
  @keyframes namePulse {
    0%,100% { text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
    50%      { text-shadow: 0 2px 16px rgba(0,0,0,0.9), 0 0 30px currentColor; }
  }

  #card {
    display:none;
    flex-direction:column;
    align-items:center;
    gap:6px;
    animation: slideIn 0.5s cubic-bezier(.22,1,.36,1);
  }
  #card.visible { display:flex; }

  .gift-wrap {
    position:relative;
    width:120px; height:120px;
    display:flex; align-items:center; justify-content:center;
  }
  #gift-img {
    width:110px; height:110px;
    object-fit:contain;
    animation: floatGift 2.8s ease-in-out infinite, glowPulse 2.8s ease-in-out infinite;
    filter: drop-shadow(0 0 8px rgba(255,100,100,0.6));
  }
  .sparkle {
    position:absolute;
    font-size:14px;
    animation: sparkle 2s ease-in-out infinite;
    pointer-events:none;
    color:#ff6464;
  }
  .sp1 { top:5px;  left:5px;  animation-delay:0s;    }
  .sp2 { top:5px;  right:5px; animation-delay:0.7s;  }
  .sp3 { bottom:5px; left:10px; animation-delay:1.4s; }
  .sp4 { bottom:5px; right:10px; animation-delay:0.35s; }

  #name {
    font-family:'Poppins',sans-serif;
    font-size:22px;
    font-weight:900;
    color: #FFD700;
    text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(255,215,0,0.4);
    text-align:center;
    max-width:260px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    letter-spacing:0.5px;
    animation: namePulse 3s ease-in-out infinite;
  }
  #combo {
    font-family:'Poppins',sans-serif;
    font-size:20px;
    font-weight:900;
    color:#ff6464;
    text-shadow:0 2px 8px rgba(0,0,0,0.8), 0 0 16px rgba(255,100,100,0.5);
    animation: comboScale 1s ease-in-out infinite;
  }
  #label {
    font-family:'Poppins',sans-serif;
    font-size:11px;
    font-weight:700;
    color:rgba(255,255,255,0.6);
    text-transform:uppercase;
    letter-spacing:2px;
  }
</style>
</head>
<body>
<div id="card">
  <div id="label">🔥 MAIOR COMBO</div>
  <div class="gift-wrap">
    <img id="gift-img" src="" alt="">
    <span class="sparkle sp1">✦</span>
    <span class="sparkle sp2">✦</span>
    <span class="sparkle sp3">✦</span>
    <span class="sparkle sp4">✦</span>
  </div>
  <div id="name">User Name</div>
  <div id="combo">x0</div>
</div>
<script>
  const card = document.getElementById('card');
  const giftImg = document.getElementById('gift-img');
  const labelEl = document.getElementById('label');
  const nameEl = document.getElementById('name');
  const comboEl = document.getElementById('combo');
  const sse = new EventSource('${sseUrl}');

  sse.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'full') {
      if (msg.config) {
        const cfg = msg.config;
        labelEl.textContent = cfg.label || 'Maior Combo';
        labelEl.style.color = cfg.labelColor || '#ffffff';
        nameEl.style.color = cfg.nameColor || '#FFD700';
        nameEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.8), 0 0 20px ' + (cfg.nameColor || '#FFD700') + '44';
        comboEl.style.color = cfg.comboColor || '#ff6464';
        comboEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.8), 0 0 16px ' + (cfg.comboColor || '#ff6464') + '88';
      }
      if (!msg.data) { card.classList.remove('visible'); return; }
      const d = msg.data;
      giftImg.src = d.giftPictureUrl || '';
      nameEl.textContent = d.nickname || '';
      comboEl.textContent = 'x' + (d.comboCount || 0).toLocaleString('pt-BR');
      card.classList.remove('visible');
      void card.offsetWidth;
      card.classList.add('visible');
    }
  };
</script>
</body>
</html>`;
}

// START SERVER
// ============================================
server.listen(PORT, () => {
  console.log(`TikTok Live Relay running on port ${PORT}`);
});
