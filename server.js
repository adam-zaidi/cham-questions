// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const standardData = require('./Standard.json');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// 1) Serve static from /public
app.use(express.static(path.join(__dirname, 'public')));

// 2) Fallback: serve index.html on any other route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// In‑memory store
const games = {};

function chooseNumChameleons(n, alpha = 1) {
  const r     = 1 - 1/Math.sqrt(n);
  const q     = Math.pow(r, alpha);
  const denom = 1 - Math.pow(q, n);
  const rand  = Math.random();
  let cum     = 0;
  for (let k = 1; k <= n; k++) {
    cum += (Math.pow(q, k - 1) * (1 - q)) / denom;
    if (rand <= cum) return k;
  }
  return n;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

io.on('connection', socket => {
  socket.on('createGame', ({ name }) => {
    if (!name?.trim()) return socket.emit('error', 'Name required');
    const gameId = makeCode();
    games[gameId] = {
      host: socket.id,
      phase: 'lobby',
      players: {},
      secretQ: '',
      fakeQ: '',
      fakePlayers: []
    };
    socket.join(gameId);
    games[gameId].players[socket.id] = { name: name.trim(), answered: false, answer: '' };
    socket.emit('gameCreated', { gameId });
    io.to(gameId).emit('updateLobby', { players: games[gameId].players, host: socket.id });
  });

  socket.on('joinGame', ({ gameId, name }) => {
    const g = games[gameId];
    if (!g) return socket.emit('error', 'Game not found');
    if (!name?.trim()) return socket.emit('error', 'Name required');
    socket.join(gameId);
    g.players[socket.id] = { name: name.trim(), answered: false, answer: '' };
    socket.emit('gameJoined', { gameId });
    io.to(gameId).emit('updateLobby', { players: g.players, host: g.host });
  });

  socket.on('kickPlayer', ({ gameId, playerId }) => {
    const g = games[gameId];
    if (!g || socket.id !== g.host) return;
    const s = io.sockets.sockets.get(playerId);
    if (s) { s.emit('kicked'); s.leave(gameId); }
    delete g.players[playerId];
    io.to(gameId).emit('updateLobby', { players: g.players, host: g.host });
  });

  socket.on('startRound', ({ gameId }) => {
    const g = games[gameId];
    if (!g || socket.id !== g.host) return;
    g.phase = 'answering';
    const pair = standardData.allQuestions[
      Math.floor(Math.random() * standardData.allQuestions.length)
    ];
    g.secretQ = pair.realQuestion;
    g.fakeQ   = pair.fakeQuestion;
    Object.values(g.players).forEach(p => (p.answered = false, p.answer = ''));
    const ids = Object.keys(g.players);
    const K   = chooseNumChameleons(ids.length);
    g.fakePlayers = shuffle(ids).slice(0, K);
    ids.forEach(pid => {
      const q = g.fakePlayers.includes(pid) ? g.fakeQ : g.secretQ;
      io.to(pid).emit('roundStarted', { question: q });
    });
    io.to(g.host).emit('roundInProgress');
  });

  socket.on('submitAnswer', ({ gameId, answer }) => {
    const g = games[gameId];
    if (!g || g.phase !== 'answering') return;
    const p = g.players[socket.id];
    if (!p) return;
    p.answered = true; p.answer = answer;
    io.to(gameId).emit('updateStatus', { players: g.players, host: g.host });
    if (Object.values(g.players).every(pl => pl.answered)) {
      g.phase = 'answered';
      Object.entries(g.players).forEach(([pid, ply]) => {
        const payload = { answer: ply.answer };
        if (g.fakePlayers.includes(pid)) payload.fakeQuestion = g.fakeQ;
        io.to(pid).emit('allSubmitted', payload);
      });
    }
  });

  socket.on('revealQuestion', ({ gameId }) => {
    const g = games[gameId];
    if (!g || socket.id !== g.host || g.phase !== 'answered') return;
    g.phase = 'revealed';
    Object.keys(g.players).forEach(pid => {
      io.to(pid).emit('questionRevealed', { realQuestion: g.secretQ });
    });
  });

  // New: End round for everyone
  socket.on('endRound', ({ gameId }) => {
    const g = games[gameId];
    if (!g || socket.id !== g.host) return;
    g.phase = 'lobby';
    io.to(gameId).emit('updateLobby', { players: g.players, host: g.host });
    io.to(gameId).emit('roundEnded');
  });

  socket.on('kicked', () => socket.leaveAll());
  socket.on('disconnect', () => {
    Object.entries(games).forEach(([gid, g]) => {
      if (g.players[socket.id]) {
        delete g.players[socket.id];
        io.to(gid).emit('updateLobby', { players: g.players, host: g.host });
      }
    });
  });
  
  // End game (host only)
  socket.on('endGame', ({ gameId }) => {
    const g = games[gameId];
    if (!g || socket.id !== g.host) return;
    // notify everyone
    io.to(gameId).emit('gameEnded');
    // clean up
    delete games[gameId];
  });
});

function makeCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
  } while (games[code]);
  return code;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));