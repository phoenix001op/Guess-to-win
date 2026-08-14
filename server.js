// ============================================================
// GuessToWin — Server (Node.js + Express + Socket.IO)
// All game logic, scoring, and state live here.
// The client is a "dumb terminal" that only renders.
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Ping every 25s, timeout after 60s — generous for spotty connections
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6 // 1 MB max message size
});

// ---------- serve static files ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- word bank (200+ words for variety) ----------
const WORD_BANK = [
  // Animals
  'cat', 'dog', 'elephant', 'giraffe', 'penguin', 'dolphin', 'butterfly',
  'octopus', 'kangaroo', 'parrot', 'turtle', 'snake', 'rabbit', 'whale',
  'eagle', 'spider', 'lion', 'tiger', 'monkey', 'frog', 'shark', 'bear',
  'horse', 'chicken', 'duck', 'owl', 'bat', 'crab', 'jellyfish', 'snail',
  // Objects
  'umbrella', 'guitar', 'piano', 'bicycle', 'rocket', 'telescope', 'diamond',
  'treasure', 'balloon', 'candle', 'camera', 'scissors', 'compass', 'anchor',
  'ladder', 'hammer', 'sword', 'shield', 'crown', 'throne', 'mirror',
  'lantern', 'trophy', 'helmet', 'backpack', 'envelope', 'microscope',
  'headphones', 'keyboard', 'parachute', 'suitcase', 'wheelchair',
  // Food
  'pizza', 'hamburger', 'sushi', 'taco', 'popcorn', 'pancake', 'cookie',
  'watermelon', 'pineapple', 'strawberry', 'broccoli', 'mushroom', 'sandwich',
  'cupcake', 'donut', 'avocado', 'banana', 'cherry', 'lemon', 'grapes',
  // Places / Nature
  'volcano', 'island', 'castle', 'lighthouse', 'rainbow', 'waterfall',
  'mountain', 'desert', 'jungle', 'ocean', 'glacier', 'tornado', 'sunset',
  'beach', 'forest', 'cave', 'bridge', 'pyramid', 'igloo', 'skyscraper',
  // Actions / Concepts
  'dancing', 'surfing', 'sleeping', 'fishing', 'camping', 'painting',
  'singing', 'running', 'swimming', 'flying', 'climbing', 'juggling',
  'reading', 'cooking', 'skating', 'skiing', 'diving', 'gardening',
  // Misc
  'astronaut', 'pirate', 'robot', 'wizard', 'vampire', 'mermaid', 'ghost',
  'zombie', 'ninja', 'dragon', 'unicorn', 'alien', 'scarecrow', 'snowman',
  'fireworks', 'spaceship', 'submarine', 'helicopter', 'ambulance', 'train',
  'sailboat', 'hot air balloon', 'roller coaster', 'ferris wheel', 'trampoline',
  'boomerang', 'kite', 'puzzle', 'hourglass', 'calendar', 'magnet',
  'stopwatch', 'thermometer', 'binoculars', 'stethoscope', 'megaphone',
  'football', 'basketball', 'baseball', 'volleyball', 'bowling',
  'tennis', 'golf', 'archery', 'boxing', 'wrestling',
  'cactus', 'sunflower', 'palm tree', 'acorn', 'leaf',
  'thunder', 'snowflake', 'cloud', 'moon', 'star',
  'campfire', 'tent', 'map', 'treasure chest', 'pirate ship',
  'traffic light', 'windmill', 'satellite', 'television', 'radio',
  'typewriter', 'newspaper', 'book', 'paintbrush', 'easel'
];

// ---------- game configuration ----------
const CONFIG = {
  ROUND_TIME: 80,             // seconds per round
  WORD_CHOICES: 3,            // how many words the drawer picks from
  CHOOSE_TIME: 15,            // seconds to pick a word
  RESULT_SCREEN_TIME: 5,      // seconds to show round results
  ROUNDS_PER_GAME: 3,         // each player draws once per "round", so total turns = rounds * players
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 12,
  MAX_POINTS_GUESSER: 500,    // points for first-instant guess
  MIN_POINTS_GUESSER: 50,     // points for last-second guess
  DRAWER_POINTS_PER_GUESS: 75,// drawer earns this per correct guesser
  DRAW_EVENT_RATE_LIMIT: 200, // max draw events per second per player
  ROOM_CODE_LENGTH: 5
};

// ---------- in-memory stores ----------
const rooms = {};  // roomCode -> Room object

// ============================================================
// Helper utilities
// ============================================================

/** Generate a unique room code */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous I/1/O/0
  let code;
  do {
    code = '';
    for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms[code]); // ensure unique
  return code;
}

/** Pick n random unique items from an array */
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/** Normalize a string for comparison (lowercase, trim extra spaces) */
function normalize(str) {
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Generate word hint (blanks) from a word — shows spaces & hyphens */
function makeHint(word) {
  return word.split('').map(ch => (ch === ' ' ? '  ' : '_')).join(' ');
}

/** Generate a partially-revealed hint based on elapsed fraction */
function makePartialHint(word, fraction) {
  // Reveal some letters as time passes (more revealed the more time has elapsed)
  const letters = word.split('');
  const totalLetters = letters.filter(ch => ch !== ' ').length;
  const revealCount = Math.floor(totalLetters * fraction * 0.5); // reveal up to 50% of letters
  // Deterministic reveal positions (seeded by word) for consistency across calls
  const letterIndices = [];
  letters.forEach((ch, i) => { if (ch !== ' ') letterIndices.push(i); });
  // Shuffle indices deterministically using the word as seed
  const seed = word.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const shuffled = letterIndices.slice().sort((a, b) => {
    const ha = ((a + 1) * seed * 9301 + 49297) % 233280;
    const hb = ((b + 1) * seed * 9301 + 49297) % 233280;
    return ha - hb;
  });
  const revealed = new Set(shuffled.slice(0, revealCount));
  return letters.map((ch, i) => {
    if (ch === ' ') return '  ';
    if (revealed.has(i)) return ch;
    return '_';
  }).join(' ');
}

/** Calculate score for a correct guess based on time remaining */
function calculateScore(timeRemaining, totalTime) {
  const fraction = timeRemaining / totalTime;
  return Math.round(
    CONFIG.MIN_POINTS_GUESSER +
    (CONFIG.MAX_POINTS_GUESSER - CONFIG.MIN_POINTS_GUESSER) * fraction
  );
}

// ============================================================
// Room class — encapsulates all state for one game room
// ============================================================

class Room {
  constructor(code, hostSocketId, hostName) {
    this.code = code;
    this.hostId = hostSocketId;
    this.players = {};           // socketId -> { id, name, score, connected }
    this.playerOrder = [];       // array of socketIds for turn order
    this.state = 'lobby';        // lobby | choosing | playing | roundResult | gameOver
    this.currentDrawerIndex = -1;
    this.currentWord = null;
    this.wordChoices = [];
    this.roundNumber = 0;        // which "full round" we're on (all players draw = 1 round)
    this.turnIndex = 0;          // absolute turn count
    this.correctGuessers = new Set(); // socketIds who guessed correctly this turn
    this.previousGuesses = {};   // socketId -> Set of normalized guesses (anti-spam)
    this.timer = null;
    this.timeRemaining = 0;
    this.drawHistory = [];       // array of drawing events for late-joiners / replay
    this.lastDrawEvent = {};     // socketId -> timestamp (rate limiting)
    this.drawEventCount = {};    // socketId -> count in current second
    this.totalTurns = 0;         // set when game starts

    // Add the host
    this.addPlayer(hostSocketId, hostName);
  }

  addPlayer(socketId, name) {
    this.players[socketId] = {
      id: socketId,
      name: name.substring(0, 20), // cap name length
      score: 0,
      connected: true
    };
    if (!this.playerOrder.includes(socketId)) {
      this.playerOrder.push(socketId);
    }
  }

  removePlayer(socketId) {
    if (this.players[socketId]) {
      this.players[socketId].connected = false;
    }
    // If all players disconnected, clean up
    const connectedCount = this.getConnectedPlayers().length;
    if (connectedCount === 0) {
      this.cleanup();
      delete rooms[this.code];
      return true; // room deleted
    }
    // If host left, transfer to next connected player
    if (socketId === this.hostId) {
      const connected = this.getConnectedPlayers();
      if (connected.length > 0) {
        this.hostId = connected[0].id;
      }
    }
    return false;
  }

  getConnectedPlayers() {
    return Object.values(this.players).filter(p => p.connected);
  }

  getPlayerList() {
    return this.playerOrder
      .filter(id => this.players[id] && this.players[id].connected)
      .map(id => ({
        id: id,
        name: this.players[id].name,
        score: this.players[id].score,
        isHost: id === this.hostId,
        isDrawing: this.state === 'playing' && id === this.getCurrentDrawerId()
      }));
  }

  getCurrentDrawerId() {
    if (this.currentDrawerIndex < 0 || this.currentDrawerIndex >= this.playerOrder.length) {
      return null;
    }
    return this.playerOrder[this.currentDrawerIndex];
  }

  cleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resetScores() {
    for (const id of Object.keys(this.players)) {
      this.players[id].score = 0;
    }
  }
}

// ============================================================
// Socket.IO connection handling
// ============================================================

io.on('connection', (socket) => {
  let currentRoom = null; // the Room object this socket belongs to

  // ---------- CREATE ROOM ----------
  socket.on('createRoom', ({ playerName }, callback) => {
    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return callback({ success: false, error: 'Please enter a valid name.' });
    }
    const name = playerName.trim().substring(0, 20);
    const code = generateRoomCode();
    const room = new Room(code, socket.id, name);
    rooms[code] = room;
    currentRoom = room;
    socket.join(code);
    callback({ success: true, roomCode: code, playerId: socket.id });
    broadcastRoomState(room);
  });

  // ---------- JOIN ROOM ----------
  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return callback({ success: false, error: 'Please enter a valid name.' });
    }
    if (!roomCode || typeof roomCode !== 'string') {
      return callback({ success: false, error: 'Please enter a room code.' });
    }
    const code = roomCode.toUpperCase().trim();
    const room = rooms[code];
    if (!room) {
      return callback({ success: false, error: 'Room not found. Check your code.' });
    }
    if (room.getConnectedPlayers().length >= CONFIG.MAX_PLAYERS) {
      return callback({ success: false, error: 'Room is full.' });
    }
    // Check for duplicate names
    const name = playerName.trim().substring(0, 20);
    const existingNames = room.getConnectedPlayers().map(p => p.name.toLowerCase());
    if (existingNames.includes(name.toLowerCase())) {
      return callback({ success: false, error: 'Name already taken in this room.' });
    }

    room.addPlayer(socket.id, name);
    currentRoom = room;
    socket.join(code);
    callback({ success: true, roomCode: code, playerId: socket.id });

    // System message
    broadcastChat(room, null, `${name} joined the room!`, 'system');
    broadcastRoomState(room);

    // If game is in progress, send current state to the joiner
    if (room.state === 'playing') {
      sendGameStateToPlayer(socket, room);
    }
  });

  // ---------- START GAME ----------
  socket.on('startGame', (_, callback) => {
    if (!currentRoom) return callback?.({ success: false, error: 'Not in a room.' });
    if (socket.id !== currentRoom.hostId) {
      return callback?.({ success: false, error: 'Only the host can start the game.' });
    }
    if (currentRoom.getConnectedPlayers().length < CONFIG.MIN_PLAYERS) {
      return callback?.({ success: false, error: `Need at least ${CONFIG.MIN_PLAYERS} players.` });
    }
    if (currentRoom.state !== 'lobby' && currentRoom.state !== 'gameOver') {
      return callback?.({ success: false, error: 'Game already in progress.' });
    }

    startGame(currentRoom);
    callback?.({ success: true });
  });

  // ---------- WORD CHOICE ----------
  socket.on('chooseWord', ({ word }) => {
    if (!currentRoom) return;
    if (currentRoom.state !== 'choosing') return;
    if (socket.id !== currentRoom.getCurrentDrawerId()) return;
    if (!currentRoom.wordChoices.includes(word)) return;

    // Clear choose timer
    if (currentRoom.timer) {
      clearInterval(currentRoom.timer);
      currentRoom.timer = null;
    }

    currentRoom.currentWord = word;
    currentRoom.wordChoices = [];
    startDrawingPhase(currentRoom);
  });

  // ---------- DRAWING EVENTS ----------
  socket.on('draw', (data) => {
    if (!currentRoom) return;
    if (currentRoom.state !== 'playing') return;
    if (socket.id !== currentRoom.getCurrentDrawerId()) return;

    // Rate limiting
    const now = Date.now();
    const lastSecond = Math.floor(now / 1000);
    const prevSecond = Math.floor((currentRoom.lastDrawEvent[socket.id] || 0) / 1000);
    if (lastSecond !== prevSecond) {
      currentRoom.drawEventCount[socket.id] = 0;
    }
    currentRoom.drawEventCount[socket.id] = (currentRoom.drawEventCount[socket.id] || 0) + 1;
    if (currentRoom.drawEventCount[socket.id] > CONFIG.DRAW_EVENT_RATE_LIMIT) {
      return; // drop the event
    }
    currentRoom.lastDrawEvent[socket.id] = now;

    // Validate data shape minimally
    if (!data || typeof data !== 'object') return;

    // Store in history for late joiners
    currentRoom.drawHistory.push(data);

    // Broadcast to all OTHER players in the room
    socket.to(currentRoom.code).emit('draw', data);
  });

  // ---------- CLEAR CANVAS ----------
  socket.on('clearCanvas', () => {
    if (!currentRoom) return;
    if (currentRoom.state !== 'playing') return;
    if (socket.id !== currentRoom.getCurrentDrawerId()) return;
    currentRoom.drawHistory = [];
    io.to(currentRoom.code).emit('clearCanvas');
  });

  // ---------- CHAT / GUESSES ----------
  socket.on('chatMessage', ({ message }) => {
    if (!currentRoom) return;
    if (!message || typeof message !== 'string') return;
    const text = message.trim().substring(0, 200); // cap length
    if (text.length === 0) return;

    const player = currentRoom.players[socket.id];
    if (!player || !player.connected) return;

    // If game is playing, treat messages as guesses
    if (currentRoom.state === 'playing' && currentRoom.currentWord) {
      const drawerId = currentRoom.getCurrentDrawerId();

      // Drawer cannot guess
      if (socket.id === drawerId) {
        // Just send as normal chat but don't check guess
        broadcastChat(currentRoom, socket.id, text, 'chat');
        return;
      }

      // Already guessed correctly? Don't reveal more info
      if (currentRoom.correctGuessers.has(socket.id)) {
        // Send message only to other correct guessers and the drawer
        sendToCorrectGuessers(currentRoom, socket.id, text);
        return;
      }

      // Check for duplicate guess (anti-spam)
      const normalized = normalize(text);
      if (!currentRoom.previousGuesses[socket.id]) {
        currentRoom.previousGuesses[socket.id] = new Set();
      }

      // Is this the correct answer?
      if (normalized === normalize(currentRoom.currentWord)) {
        // Correct guess!
        currentRoom.correctGuessers.add(socket.id);

        // Calculate score
        const score = calculateScore(currentRoom.timeRemaining, CONFIG.ROUND_TIME);
        player.score += score;

        // Give drawer points too
        const drawer = currentRoom.players[drawerId];
        if (drawer) {
          drawer.score += CONFIG.DRAWER_POINTS_PER_GUESS;
        }

        // Broadcast correct guess notification (don't show the word!)
        broadcastChat(currentRoom, null,
          `${player.name} guessed the word! (+${score} pts)`, 'correct');

        broadcastRoomState(currentRoom);

        // Check if everyone has guessed
        const connectedNonDrawers = currentRoom.getConnectedPlayers()
          .filter(p => p.id !== drawerId);
        if (connectedNonDrawers.length > 0 &&
            connectedNonDrawers.every(p => currentRoom.correctGuessers.has(p.id))) {
          // Everyone guessed — end turn early
          endTurn(currentRoom);
        }
        return;
      }

      // Check if guess is close (for hint)
      if (isCloseGuess(normalized, normalize(currentRoom.currentWord))) {
        // Send "close" feedback only to the guesser
        socket.emit('chatMessage', {
          sender: null,
          text: `"${text}" is very close!`,
          type: 'close'
        });
      }

      // If it contains the word, don't broadcast (prevent revealing)
      if (normalized.includes(normalize(currentRoom.currentWord)) ||
          normalize(currentRoom.currentWord).includes(normalized)) {
        if (normalized.length > 2) {
          socket.emit('chatMessage', {
            sender: null,
            text: 'Your guess is very close!',
            type: 'close'
          });
          return;
        }
      }

      // Track previous guesses
      if (currentRoom.previousGuesses[socket.id].has(normalized)) {
        socket.emit('chatMessage', {
          sender: null,
          text: 'You already guessed that!',
          type: 'system'
        });
        return;
      }
      currentRoom.previousGuesses[socket.id].add(normalized);
    }

    // Broadcast normal chat
    broadcastChat(currentRoom, socket.id, text, 'chat');
  });

  // ---------- PLAY AGAIN ----------
  socket.on('playAgain', () => {
    if (!currentRoom) return;
    if (currentRoom.state !== 'gameOver') return;
    if (socket.id !== currentRoom.hostId) return;
    if (currentRoom.getConnectedPlayers().length < CONFIG.MIN_PLAYERS) return;

    currentRoom.state = 'lobby';
    currentRoom.resetScores();
    broadcastRoomState(currentRoom);
    io.to(currentRoom.code).emit('returnToLobby');
  });

  // ---------- RETURN TO LOBBY ----------
  socket.on('returnToLobby', () => {
    if (!currentRoom) return;
    if (socket.id !== currentRoom.hostId) return;
    currentRoom.cleanup();
    currentRoom.state = 'lobby';
    currentRoom.resetScores();
    currentRoom.drawHistory = [];
    broadcastRoomState(currentRoom);
    io.to(currentRoom.code).emit('returnToLobby');
  });

  // ---------- DISCONNECT ----------
  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const player = currentRoom.players[socket.id];
    const name = player ? player.name : 'A player';
    const roomDeleted = currentRoom.removePlayer(socket.id);

    if (!roomDeleted) {
      broadcastChat(currentRoom, null, `${name} left the room.`, 'system');
      broadcastRoomState(currentRoom);

      // If the drawer disconnected during play, skip to next turn
      if ((currentRoom.state === 'playing' || currentRoom.state === 'choosing') &&
          socket.id === currentRoom.getCurrentDrawerId()) {
        if (currentRoom.getConnectedPlayers().length >= CONFIG.MIN_PLAYERS) {
          endTurn(currentRoom);
        } else {
          // Not enough players, end the game
          currentRoom.cleanup();
          currentRoom.state = 'gameOver';
          io.to(currentRoom.code).emit('gameOver', {
            players: currentRoom.getPlayerList(),
            reason: 'Not enough players to continue.'
          });
        }
      }
    }
    currentRoom = null;
  });
});

// ============================================================
// Game flow functions
// ============================================================

function startGame(room) {
  room.state = 'lobby'; // will transition
  room.resetScores();
  room.currentDrawerIndex = -1;
  room.roundNumber = 0;
  room.turnIndex = 0;
  // Re-build playerOrder from connected players only
  room.playerOrder = room.getConnectedPlayers().map(p => p.id);
  room.totalTurns = CONFIG.ROUNDS_PER_GAME * room.playerOrder.length;

  broadcastChat(room, null, 'Game is starting!', 'system');
  nextTurn(room);
}

function nextTurn(room) {
  // Move to next drawer
  room.turnIndex++;
  room.currentDrawerIndex++;
  // If we've gone through all players, new round
  if (room.currentDrawerIndex >= room.playerOrder.length) {
    room.currentDrawerIndex = 0;
    room.roundNumber++;
  }
  // Set round number on first pass too
  if (room.roundNumber === 0) room.roundNumber = 1;

  // Check if game is over
  if (room.turnIndex > room.totalTurns) {
    endGame(room);
    return;
  }

  // Skip disconnected drawers
  let drawerId = room.playerOrder[room.currentDrawerIndex];
  let attempts = 0;
  while ((!room.players[drawerId] || !room.players[drawerId].connected) &&
         attempts < room.playerOrder.length) {
    room.currentDrawerIndex = (room.currentDrawerIndex + 1) % room.playerOrder.length;
    drawerId = room.playerOrder[room.currentDrawerIndex];
    attempts++;
  }
  if (attempts >= room.playerOrder.length) {
    endGame(room);
    return;
  }

  // Reset turn state
  room.correctGuessers = new Set();
  room.previousGuesses = {};
  room.drawHistory = [];
  room.currentWord = null;

  // Give drawer word choices
  room.wordChoices = pickRandom(WORD_BANK, CONFIG.WORD_CHOICES);
  room.state = 'choosing';

  const drawer = room.players[drawerId];
  broadcastChat(room, null,
    `Round ${room.roundNumber} — ${drawer.name} is choosing a word...`, 'system');

  // Send word choices to the drawer only
  const drawerSocket = io.sockets.sockets.get(drawerId);
  if (drawerSocket) {
    drawerSocket.emit('wordChoices', { words: room.wordChoices });
  }

  // Broadcast game state (shows who is drawing, hide word)
  broadcastRoomState(room);
  io.to(room.code).emit('newTurn', {
    drawerId: drawerId,
    drawerName: drawer.name,
    round: room.roundNumber,
    totalRounds: CONFIG.ROUNDS_PER_GAME,
    turnIndex: room.turnIndex,
    totalTurns: room.totalTurns
  });

  // Timer for choosing
  room.timeRemaining = CONFIG.CHOOSE_TIME;
  broadcastTimer(room);

  room.timer = setInterval(() => {
    room.timeRemaining--;
    broadcastTimer(room);
    if (room.timeRemaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      // Auto-pick the first word
      if (room.state === 'choosing') {
        room.currentWord = room.wordChoices[0];
        room.wordChoices = [];
        startDrawingPhase(room);
      }
    }
  }, 1000);
}

function startDrawingPhase(room) {
  room.state = 'playing';
  room.timeRemaining = CONFIG.ROUND_TIME;

  const hint = makeHint(room.currentWord);

  // Send word to drawer, hint to everyone else
  const drawerId = room.getCurrentDrawerId();
  room.getConnectedPlayers().forEach(p => {
    const s = io.sockets.sockets.get(p.id);
    if (s) {
      if (p.id === drawerId) {
        s.emit('roundStart', { word: room.currentWord, hint: hint, isDrawer: true });
      } else {
        s.emit('roundStart', { word: null, hint: hint, isDrawer: false });
      }
    }
  });

  broadcastRoomState(room);
  broadcastTimer(room);

  // Start countdown
  room.timer = setInterval(() => {
    room.timeRemaining--;
    broadcastTimer(room);

    // Progressive hint reveal at 50% and 25% time
    if (room.timeRemaining === Math.floor(CONFIG.ROUND_TIME * 0.5) ||
        room.timeRemaining === Math.floor(CONFIG.ROUND_TIME * 0.25)) {
      const elapsed = CONFIG.ROUND_TIME - room.timeRemaining;
      const fraction = elapsed / CONFIG.ROUND_TIME;
      const partialHint = makePartialHint(room.currentWord, fraction);
      // Send to non-drawers who haven't guessed
      room.getConnectedPlayers().forEach(p => {
        if (p.id !== drawerId && !room.correctGuessers.has(p.id)) {
          const s = io.sockets.sockets.get(p.id);
          if (s) {
            s.emit('hintUpdate', { hint: partialHint });
          }
        }
      });
    }

    if (room.timeRemaining <= 0) {
      endTurn(room);
    }
  }, 1000);
}

function endTurn(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  room.state = 'roundResult';
  const word = room.currentWord || '(no word)';

  // Broadcast round result
  io.to(room.code).emit('turnResult', {
    word: word,
    players: room.getPlayerList(),
    correctGuessers: Array.from(room.correctGuessers)
  });

  broadcastChat(room, null, `The word was: "${word}"`, 'reveal');
  broadcastRoomState(room);

  // Wait, then next turn
  setTimeout(() => {
    if (room.state !== 'roundResult') return; // in case of interruption
    if (room.getConnectedPlayers().length < CONFIG.MIN_PLAYERS) {
      endGame(room);
      return;
    }
    nextTurn(room);
  }, CONFIG.RESULT_SCREEN_TIME * 1000);
}

function endGame(room) {
  room.cleanup();
  room.state = 'gameOver';

  const players = room.getPlayerList().sort((a, b) => b.score - a.score);
  io.to(room.code).emit('gameOver', { players: players, reason: null });
  broadcastRoomState(room);
}

// ============================================================
// Broadcast helpers
// ============================================================

function broadcastRoomState(room) {
  io.to(room.code).emit('roomState', {
    code: room.code,
    state: room.state,
    hostId: room.hostId,
    players: room.getPlayerList(),
    roundNumber: room.roundNumber,
    totalRounds: CONFIG.ROUNDS_PER_GAME,
    turnIndex: room.turnIndex,
    totalTurns: room.totalTurns,
    drawerId: room.getCurrentDrawerId()
  });
}

function broadcastTimer(room) {
  io.to(room.code).emit('timer', { timeRemaining: room.timeRemaining });
}

function broadcastChat(room, senderId, text, type) {
  const senderName = senderId && room.players[senderId]
    ? room.players[senderId].name : null;
  io.to(room.code).emit('chatMessage', {
    sender: senderName,
    senderId: senderId,
    text: text,
    type: type // 'chat', 'system', 'correct', 'close', 'reveal'
  });
}

/** Send message only to correct guessers and the drawer */
function sendToCorrectGuessers(room, senderId, text) {
  const senderName = room.players[senderId]?.name;
  const drawerId = room.getCurrentDrawerId();
  const targets = [...room.correctGuessers, drawerId];
  targets.forEach(pid => {
    const s = io.sockets.sockets.get(pid);
    if (s) {
      s.emit('chatMessage', {
        sender: senderName,
        senderId: senderId,
        text: text,
        type: 'chat'
      });
    }
  });
}

/** Send current game state to a player who joined mid-game */
function sendGameStateToPlayer(socket, room) {
  const drawerId = room.getCurrentDrawerId();
  const drawer = room.players[drawerId];
  // Send draw history so they see current drawing
  socket.emit('drawHistory', room.drawHistory);
  // Send round info
  const hint = room.currentWord ? makeHint(room.currentWord) : '';
  socket.emit('roundStart', { word: null, hint: hint, isDrawer: false });
  socket.emit('timer', { timeRemaining: room.timeRemaining });
  if (drawer) {
    socket.emit('newTurn', {
      drawerId: drawerId,
      drawerName: drawer.name,
      round: room.roundNumber,
      totalRounds: CONFIG.ROUNDS_PER_GAME,
      turnIndex: room.turnIndex,
      totalTurns: room.totalTurns
    });
  }
}

/** Check if a guess is "close" to the answer (edit distance ≤ 2) */
function isCloseGuess(guess, answer) {
  if (guess.length < 3 || answer.length < 3) return false;
  if (Math.abs(guess.length - answer.length) > 2) return false;

  // Simple Levenshtein distance
  const m = guess.length, n = answer.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (guess[i-1] !== answer[j-1] ? 1 : 0)
      );
    }
  }
  return dp[m][n] <= 2 && dp[m][n] > 0;
}

// ============================================================
// Periodic cleanup — remove stale empty rooms every 5 minutes
// ============================================================
setInterval(() => {
  for (const code of Object.keys(rooms)) {
    if (rooms[code].getConnectedPlayers().length === 0) {
      rooms[code].cleanup();
      delete rooms[code];
    }
  }
}, 5 * 60 * 1000);

// ============================================================
// Start the server
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  ✏️  GuessToWin server running at http://localhost:${PORT}\n`);
});
