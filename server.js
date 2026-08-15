// ============================================================
// GuessToWin — Server (Node.js + Express + Socket.IO)
// All game logic, scoring, and state live here.
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6
});

// ============================================================
// SERVE WEBSITE
// ============================================================

// Your index.html, script.js and style.css are in the
// ROOT of the GitHub repository, not inside /public.

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

// ============================================================
// WORD BANK
// ============================================================

const WORD_BANK = [
  // Animals
  'cat', 'dog', 'elephant', 'giraffe', 'penguin', 'dolphin',
  'butterfly', 'octopus', 'kangaroo', 'parrot', 'turtle',
  'snake', 'rabbit', 'whale', 'eagle', 'spider', 'lion',
  'tiger', 'monkey', 'frog', 'shark', 'bear', 'horse',
  'chicken', 'duck', 'owl', 'bat', 'crab', 'jellyfish', 'snail',

  // Objects
  'umbrella', 'guitar', 'piano', 'bicycle', 'rocket',
  'telescope', 'diamond', 'treasure', 'balloon', 'candle',
  'camera', 'scissors', 'compass', 'anchor', 'ladder',
  'hammer', 'sword', 'shield', 'crown', 'throne', 'mirror',
  'lantern', 'trophy', 'helmet', 'backpack', 'envelope',
  'microscope', 'headphones', 'keyboard', 'parachute',
  'suitcase', 'wheelchair',

  // Food
  'pizza', 'hamburger', 'sushi', 'taco', 'popcorn', 'pancake',
  'cookie', 'watermelon', 'pineapple', 'strawberry',
  'broccoli', 'mushroom', 'sandwich', 'cupcake', 'donut',
  'avocado', 'banana', 'cherry', 'lemon', 'grapes',

  // Places / Nature
  'volcano', 'island', 'castle', 'lighthouse', 'rainbow',
  'waterfall', 'mountain', 'desert', 'jungle', 'ocean',
  'glacier', 'tornado', 'sunset', 'beach', 'forest', 'cave',
  'bridge', 'pyramid', 'igloo', 'skyscraper',

  // Actions / Concepts
  'dancing', 'surfing', 'sleeping', 'fishing', 'camping',
  'painting', 'singing', 'running', 'swimming', 'flying',
  'climbing', 'juggling', 'reading', 'cooking', 'skating',
  'skiing', 'diving', 'gardening',

  // Misc
  'astronaut', 'pirate', 'robot', 'wizard', 'vampire',
  'mermaid', 'ghost', 'zombie', 'ninja', 'dragon', 'unicorn',
  'alien', 'scarecrow', 'snowman', 'fireworks', 'spaceship',
  'submarine', 'helicopter', 'ambulance', 'train',
  'sailboat', 'hot air balloon', 'roller coaster',
  'ferris wheel', 'trampoline', 'boomerang', 'kite', 'puzzle',
  'hourglass', 'calendar', 'magnet', 'stopwatch',
  'thermometer', 'binoculars', 'stethoscope', 'megaphone',
  'football', 'basketball', 'baseball', 'volleyball',
  'bowling', 'tennis', 'golf', 'archery', 'boxing',
  'wrestling', 'cactus', 'sunflower', 'palm tree', 'acorn',
  'leaf', 'thunder', 'snowflake', 'cloud', 'moon', 'star',
  'campfire', 'tent', 'map', 'treasure chest', 'pirate ship',
  'traffic light', 'windmill', 'satellite', 'television',
  'radio', 'typewriter', 'newspaper', 'book', 'paintbrush',
  'easel'
];

// ============================================================
// GAME CONFIGURATION
// ============================================================

const CONFIG = {
  ROUND_TIME: 80,
  WORD_CHOICES: 3,
  CHOOSE_TIME: 15,
  RESULT_SCREEN_TIME: 5,
  ROUNDS_PER_GAME: 3,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 12,

  MAX_POINTS_GUESSER: 500,
  MIN_POINTS_GUESSER: 50,
  DRAWER_POINTS_PER_GUESS: 75,

  DRAW_EVENT_RATE_LIMIT: 200,
  ROOM_CODE_LENGTH: 5
};

// ============================================================
// ROOMS
// ============================================================

const rooms = {};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code;

  do {
    code = '';

    for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

  } while (rooms[code]);

  return code;
}

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function makeHint(word) {
  return word
    .split('')
    .map(ch => ch === ' ' ? '  ' : '_')
    .join(' ');
}

function makePartialHint(word, fraction) {

  const letters = word.split('');

  const totalLetters = letters.filter(
    ch => ch !== ' '
  ).length;

  const revealCount = Math.floor(
    totalLetters * fraction * 0.5
  );

  const letterIndices = [];

  letters.forEach((ch, i) => {
    if (ch !== ' ') {
      letterIndices.push(i);
    }
  });

  const seed = word
    .split('')
    .reduce(
      (s, c) => s + c.charCodeAt(0),
      0
    );

  const shuffled = letterIndices
    .slice()
    .sort((a, b) => {

      const ha =
        ((a + 1) * seed * 9301 + 49297) % 233280;

      const hb =
        ((b + 1) * seed * 9301 + 49297) % 233280;

      return ha - hb;
    });

  const revealed = new Set(
    shuffled.slice(0, revealCount)
  );

  return letters
    .map((ch, i) => {

      if (ch === ' ') {
        return '  ';
      }

      if (revealed.has(i)) {
        return ch;
      }

      return '_';
    })
    .join(' ');
}

function calculateScore(timeRemaining, totalTime) {

  const fraction =
    timeRemaining / totalTime;

  return Math.round(
    CONFIG.MIN_POINTS_GUESSER +
    (
      CONFIG.MAX_POINTS_GUESSER -
      CONFIG.MIN_POINTS_GUESSER
    ) * fraction
  );
}

// ============================================================
// ROOM CLASS
// ============================================================

class Room {

  constructor(code, hostSocketId, hostName) {

    this.code = code;

    this.hostId = hostSocketId;

    this.players = {};

    this.playerOrder = [];

    this.state = 'lobby';

    this.currentDrawerIndex = -1;

    this.currentWord = null;

    this.wordChoices = [];

    this.roundNumber = 0;

    this.turnIndex = 0;

    this.correctGuessers = new Set();

    this.previousGuesses = {};

    this.timer = null;

    this.timeRemaining = 0;

    this.drawHistory = [];

    this.lastDrawEvent = {};

    this.drawEventCount = {};

    this.totalTurns = 0;

    this.addPlayer(
      hostSocketId,
      hostName
    );
  }

  addPlayer(socketId, name) {

    this.players[socketId] = {
      id: socketId,
      name: name.substring(0, 20),
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

    const connectedCount =
      this.getConnectedPlayers().length;

    if (connectedCount === 0) {

      this.cleanup();

      delete rooms[this.code];

      return true;
    }

    if (socketId === this.hostId) {

      const connected =
        this.getConnectedPlayers();

      if (connected.length > 0) {
        this.hostId = connected[0].id;
      }
    }

    return false;
  }

  getConnectedPlayers() {

    return Object
      .values(this.players)
      .filter(p => p.connected);
  }

  getPlayerList() {

    return this.playerOrder

      .filter(
        id =>
          this.players[id] &&
          this.players[id].connected
      )

      .map(id => ({

        id: id,

        name: this.players[id].name,

        score: this.players[id].score,

        isHost:
          id === this.hostId,

        isDrawing:
          this.state === 'playing' &&
          id === this.getCurrentDrawerId()

      }));
  }

  getCurrentDrawerId() {

    if (
      this.currentDrawerIndex < 0 ||
      this.currentDrawerIndex >=
      this.playerOrder.length
    ) {
      return null;
    }

    return this.playerOrder[
      this.currentDrawerIndex
    ];
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
// SOCKET.IO
// ============================================================

io.on('connection', (socket) => {

  let currentRoom = null;

  // ==========================================================
  // CREATE ROOM
  // ==========================================================

  socket.on(
    'createRoom',
    ({ playerName }, callback) => {

      if (
        !playerName ||
        typeof playerName !== 'string' ||
        playerName.trim().length === 0
      ) {

        return callback({
          success: false,
          error: 'Please enter a valid name.'
        });
      }

      const name =
        playerName
          .trim()
          .substring(0, 20);

      const code =
        generateRoomCode();

      const room =
        new Room(
          code,
          socket.id,
          name
        );

      rooms[code] = room;

      currentRoom = room;

      socket.join(code);

      callback({
        success: true,
        roomCode: code,
        playerId: socket.id
      });

      broadcastRoomState(room);
    }
  );

  // ==========================================================
  // JOIN ROOM
  // ==========================================================

  socket.on(
    'joinRoom',
    ({ roomCode, playerName }, callback) => {

      if (
        !playerName ||
        typeof playerName !== 'string' ||
        playerName.trim().length === 0
      ) {

        return callback({
          success: false,
          error: 'Please enter a valid name.'
        });
      }

      if (
        !roomCode ||
        typeof roomCode !== 'string'
      ) {

        return callback({
          success: false,
          error: 'Please enter a room code.'
        });
      }

      const code =
        roomCode
          .toUpperCase()
          .trim();

      const room = rooms[code];

      if (!room) {

        return callback({
          success: false,
          error:
            'Room not found. Check your code.'
        });
      }

      if (
        room.getConnectedPlayers().length >=
        CONFIG.MAX_PLAYERS
      ) {

        return callback({
          success: false,
          error: 'Room is full.'
        });
      }

      const name =
        playerName
          .trim()
          .substring(0, 20);

      const existingNames =
        room
          .getConnectedPlayers()
          .map(p => p.name.toLowerCase());

      if (
        existingNames.includes(
          name.toLowerCase()
        )
      ) {

        return callback({
          success: false,
          error:
            'Name already taken in this room.'
        });
      }

      room.addPlayer(
        socket.id,
        name
      );

      currentRoom = room;

      socket.join(code);

      callback({
        success: true,
        roomCode: code,
        playerId: socket.id
      });

      broadcastChat(
        room,
        null,
        `${name} joined the room!`,
        'system'
      );

      broadcastRoomState(room);

      if (room.state === 'playing') {
        sendGameStateToPlayer(
          socket,
          room
        );
      }
    }
  );

  // ==========================================================
  // START GAME
  // ==========================================================

  socket.on(
    'startGame',
    (_, callback) => {

      if (!currentRoom) {

        return callback?.({
          success: false,
          error: 'Not in a room.'
        });
      }

      if (
        socket.id !== currentRoom.hostId
      ) {

        return callback?.({
          success: false,
          error:
            'Only the host can start the game.'
        });
      }

      if (
        currentRoom.getConnectedPlayers()
          .length < CONFIG.MIN_PLAYERS
      ) {

        return callback?.({
          success: false,
          error:
            `Need at least ${CONFIG.MIN_PLAYERS} players.`
        });
      }

      if (
        currentRoom.state !== 'lobby' &&
        currentRoom.state !== 'gameOver'
      ) {

        return callback?.({
          success: false,
          error:
            'Game already in progress.'
        });
      }

      startGame(currentRoom);

      callback?.({
        success: true
      });
    }
  );

  // ==========================================================
  // WORD CHOICE
  // ==========================================================

  socket.on(
    'chooseWord',
    ({ word }) => {

      if (!currentRoom) {
        return;
      }

      if (
        currentRoom.state !== 'choosing'
      ) {
        return;
      }

      if (
        socket.id !==
        currentRoom.getCurrentDrawerId()
      ) {
        return;
      }

      if (
        !currentRoom.wordChoices.includes(word)
      ) {
        return;
      }

      if (currentRoom.timer) {

        clearInterval(
          currentRoom.timer
        );

        currentRoom.timer = null;
      }

      currentRoom.currentWord = word;

      currentRoom.wordChoices = [];

      startDrawingPhase(
        currentRoom
      );
    }
  );

  // ==========================================================
  // DRAWING
  // ==========================================================

  socket.on(
    'draw',
    (data) => {

      if (!currentRoom) {
        return;
      }

      if (
        currentRoom.state !== 'playing'
      ) {
        return;
      }

      if (
        socket.id !==
        currentRoom.getCurrentDrawerId()
      ) {
        return;
      }

      const now = Date.now();

      const lastSecond =
        Math.floor(now / 1000);

      const prevSecond =
        Math.floor(
          (
            currentRoom.lastDrawEvent[
              socket.id
            ] || 0
          ) / 1000
        );

      if (lastSecond !== prevSecond) {

        currentRoom.drawEventCount[
          socket.id
        ] = 0;
      }

      currentRoom.drawEventCount[
        socket.id
      ] =
        (
          currentRoom.drawEventCount[
            socket.id
          ] || 0
        ) + 1;

      if (
        currentRoom.drawEventCount[
          socket.id
        ] >
        CONFIG.DRAW_EVENT_RATE_LIMIT
      ) {
        return;
      }

      currentRoom.lastDrawEvent[
        socket.id
      ] = now;

      if (
        !data ||
        typeof data !== 'object'
      ) {
        return;
      }

      currentRoom.drawHistory.push(
        data
      );

      socket
        .to(currentRoom.code)
        .emit(
          'draw',
          data
        );
    }
  );

  // ==========================================================
  // CLEAR CANVAS
  // ==========================================================

  socket.on(
    'clearCanvas',
    () => {

      if (!currentRoom) {
        return;
      }

      if (
        currentRoom.state !== 'playing'
      ) {
        return;
      }

      if (
        socket.id !==
        currentRoom.getCurrentDrawerId()
      ) {
        return;
      }

      currentRoom.drawHistory = [];

      io
        .to(currentRoom.code)
        .emit(
          'clearCanvas'
        );
    }
  );

  // ==========================================================
  // CHAT / GUESSES
  // ==========================================================

  socket.on(
    'chatMessage',
    ({ message }) => {

      if (!currentRoom) {
        return;
      }

      if (
        !message ||
        typeof message !== 'string'
      ) {
        return;
      }

      const text =
        message
          .trim()
          .substring(0, 200);

      if (text.length === 0) {
        return;
      }

      const player =
        currentRoom.players[
          socket.id
        ];

      if (
        !player ||
        !player.connected
      ) {
        return;
      }

      if (
        currentRoom.state === 'playing' &&
        currentRoom.currentWord
      ) {

        const drawerId =
          currentRoom.getCurrentDrawerId();

        if (socket.id === drawerId) {

          broadcastChat(
            currentRoom,
            socket.id,
            text,
            'chat'
          );

          return;
        }

        if (
          currentRoom.correctGuessers.has(
            socket.id
          )
        ) {

          sendToCorrectGuessers(
            currentRoom,
            socket.id,
            text
          );

          return;
        }

        const normalized =
          normalize(text);

        if (
          !currentRoom.previousGuesses[
            socket.id
          ]
        ) {

          currentRoom.previousGuesses[
            socket.id
          ] = new Set();
        }

        if (
          normalized ===
          normalize(
            currentRoom.currentWord
          )
        ) {

          currentRoom.correctGuessers.add(
            socket.id
          );

          const score =
            calculateScore(
              currentRoom.timeRemaining,
              CONFIG.ROUND_TIME
            );

          player.score += score;

          const drawer =
            currentRoom.players[
              drawerId
            ];

          if (drawer) {
            drawer.score +=
              CONFIG.DRAWER_POINTS_PER_GUESS;
          }

          broadcastChat(
            currentRoom,
            null,
            `${player.name} guessed the word! (+${score} pts)`,
            'correct'
          );

          broadcastRoomState(
            currentRoom
          );

          const connectedNonDrawers =
            currentRoom
              .getConnectedPlayers()
              .filter(
                p => p.id !== drawerId
              );

          if (
            connectedNonDrawers.length > 0 &&
            connectedNonDrawers.every(
              p =>
                currentRoom.correctGuessers
                  .has(p.id)
            )
          ) {

            endTurn(currentRoom);
          }

          return;
        }

        if (
          isCloseGuess(
            normalized,
            normalize(
              currentRoom.currentWord
            )
          )
        ) {

          socket.emit(
            'chatMessage',
            {
              sender: null,
              text:
                `"${text}" is very close!`,
              type: 'close'
            }
          );
        }

        if (
          normalized.includes(
            normalize(
              currentRoom.currentWord
            )
          ) ||
          normalize(
            currentRoom.currentWord
          ).includes(normalized)
        ) {

          if (normalized.length > 2) {

            socket.emit(
              'chatMessage',
              {
                sender: null,
                text:
                  'Your guess is very close!',
                type: 'close'
              }
            );

            return;
          }
        }

        if (
          currentRoom.previousGuesses[
            socket.id
          ].has(normalized)
        ) {

          socket.emit(
            'chatMessage',
            {
              sender: null,
              text:
                'You already guessed that!',
              type: 'system'
            }
          );

          return;
        }

        currentRoom.previousGuesses[
          socket.id
        ].add(normalized);
      }

      broadcastChat(
        currentRoom,
        socket.id,
        text,
        'chat'
      );
    }
  );

  // ==========================================================
  // PLAY AGAIN
  // ==========================================================

  socket.on(
    'playAgain',
    () => {

      if (!currentRoom) {
        return;
      }

      if (
        currentRoom.state !== 'gameOver'
      ) {
        return;
      }

      if (
        socket.id !==
        currentRoom.hostId
      ) {
        return;
      }

      if (
        currentRoom.getConnectedPlayers()
          .length < CONFIG.MIN_PLAYERS
      ) {
        return;
      }

      currentRoom.state = 'lobby';

      currentRoom.resetScores();

      broadcastRoomState(
        currentRoom
      );

      io
        .to(currentRoom.code)
        .emit(
          'returnToLobby'
        );
    }
  );

  // ==========================================================
  // RETURN TO LOBBY
  // ==========================================================

  socket.on(
    'returnToLobby',
    () => {

      if (!currentRoom) {
        return;
      }

      if (
        socket.id !==
        currentRoom.hostId
      ) {
        return;
      }

      currentRoom.cleanup();

      currentRoom.state = 'lobby';

      currentRoom.resetScores();

      currentRoom.drawHistory = [];

      broadcastRoomState(
        currentRoom
      );

      io
        .to(currentRoom.code)
        .emit(
          'returnToLobby'
        );
    }
  );

  // ==========================================================
  // DISCONNECT
  // ==========================================================

  socket.on(
    'disconnect',
    () => {

      if (!currentRoom) {
        return;
      }

      const player =
        currentRoom.players[
          socket.id
        ];

      const name =
        player
          ? player.name
          : 'A player';

      const roomDeleted =
        currentRoom.removePlayer(
          socket.id
        );

      if (!roomDeleted) {

        broadcastChat(
          currentRoom,
          null,
          `${name} left the room.`,
          'system'
        );

        broadcastRoomState(
          currentRoom
        );

        if (
          (
            currentRoom.state === 'playing' ||
            currentRoom.state === 'choosing'
          ) &&
          socket.id ===
            currentRoom.getCurrentDrawerId()
        ) {

          if (
            currentRoom
              .getConnectedPlayers()
              .length >=
            CONFIG.MIN_PLAYERS
          ) {

            endTurn(
              currentRoom
            );

          } else {

            currentRoom.cleanup();

            currentRoom.state =
              'gameOver';

            io
              .to(currentRoom.code)
              .emit(
                'gameOver',
                {
                  players:
                    currentRoom.getPlayerList(),

                  reason:
                    'Not enough players to continue.'
                }
              );
          }
        }
      }

      currentRoom = null;
    }
  );
});

// ============================================================
// GAME FLOW
// ============================================================

function startGame(room) {

  room.state = 'lobby';

  room.resetScores();

  room.currentDrawerIndex = -1;

  room.roundNumber = 0;

  room.turnIndex = 0;

  room.playerOrder =
    room
      .getConnectedPlayers()
      .map(p => p.id);

  room.totalTurns =
    CONFIG.ROUNDS_PER_GAME *
    room.playerOrder.length;

  broadcastChat(
    room,
    null,
    'Game is starting!',
    'system'
  );

  nextTurn(room);
}

function nextTurn(room) {

  room.turnIndex++;

  room.currentDrawerIndex++;

  if (
    room.currentDrawerIndex >=
    room.playerOrder.length
  ) {

    room.currentDrawerIndex = 0;

    room.roundNumber++;
  }

  if (room.roundNumber === 0) {
    room.roundNumber = 1;
  }

  if (
    room.turnIndex >
    room.totalTurns
  ) {

    endGame(room);

    return;
  }

  let drawerId =
    room.playerOrder[
      room.currentDrawerIndex
    ];

  let attempts = 0;

  while (
    (
      !room.players[drawerId] ||
      !room.players[drawerId].connected
    ) &&
    attempts <
      room.playerOrder.length
  ) {

    room.currentDrawerIndex =
      (
        room.currentDrawerIndex + 1
      ) %
      room.playerOrder.length;

    drawerId =
      room.playerOrder[
        room.currentDrawerIndex
      ];

    attempts++;
  }

  if (
    attempts >=
    room.playerOrder.length
  ) {

    endGame(room);

    return;
  }

  room.correctGuessers =
    new Set();

  room.previousGuesses = {};

  room.drawHistory = [];

  room.currentWord = null;

  room.wordChoices =
    pickRandom(
      WORD_BANK,
      CONFIG.WORD_CHOICES
    );

  room.state = 'choosing';

  const drawer =
    room.players[drawerId];

  broadcastChat(
    room,
    null,
    `Round ${room.roundNumber} — ${drawer.name} is choosing a word...`,
    'system'
  );

  const drawerSocket =
    io.sockets.sockets.get(
      drawerId
    );

  if (drawerSocket) {

    drawerSocket.emit(
      'wordChoices',
      {
        words:
          room.wordChoices
      }
    );
  }

  broadcastRoomState(
    room
  );

  io
    .to(room.code)
    .emit(
      'newTurn',
      {
        drawerId: drawerId,

        drawerName: drawer.name,

        round: room.roundNumber,

        totalRounds:
          CONFIG.ROUNDS_PER_GAME,

        turnIndex:
          room.turnIndex,

        totalTurns:
          room.totalTurns
      }
    );

  room.timeRemaining =
    CONFIG.CHOOSE_TIME;

  broadcastTimer(room);

  room.timer =
    setInterval(() => {

      room.timeRemaining--;

      broadcastTimer(room);

      if (
        room.timeRemaining <= 0
      ) {

        clearInterval(
          room.timer
        );

        room.timer = null;

        if (
          room.state === 'choosing'
        ) {

          room.currentWord =
            room.wordChoices[0];

          room.wordChoices = [];

          startDrawingPhase(
            room
          );
        }
      }

    }, 1000);
}

function startDrawingPhase(room) {

  room.state = 'playing';

  room.timeRemaining =
    CONFIG.ROUND_TIME;

  const hint =
    makeHint(
      room.currentWord
    );

  const drawerId =
    room.getCurrentDrawerId();

  room
    .getConnectedPlayers()
    .forEach(p => {

      const s =
        io.sockets.sockets.get(
          p.id
        );

      if (!s) {
        return;
      }

      if (p.id === drawerId) {

        s.emit(
          'roundStart',
          {
            word:
              room.currentWord,

            hint: hint,

            isDrawer: true
          }
        );

      } else {

        s.emit(
          'roundStart',
          {
            word: null,

            hint: hint,

            isDrawer: false
          }
        );
      }
    });

  broadcastRoomState(room);

  broadcastTimer(room);

  room.timer =
    setInterval(() => {

      room.timeRemaining--;

      broadcastTimer(room);

      if (
        room.timeRemaining ===
        Math.floor(
          CONFIG.ROUND_TIME * 0.5
        ) ||
        room.timeRemaining ===
        Math.floor(
          CONFIG.ROUND_TIME * 0.25
        )
      ) {

        const elapsed =
          CONFIG.ROUND_TIME -
          room.timeRemaining;

        const fraction =
          elapsed /
          CONFIG.ROUND_TIME;

        const partialHint =
          makePartialHint(
            room.currentWord,
            fraction
          );

        room
          .getConnectedPlayers()
          .forEach(p => {

            if (
              p.id !== drawerId &&
              !room.correctGuessers
                .has(p.id)
            ) {

              const s =
                io.sockets.sockets.get(
                  p.id
                );

              if (s) {

                s.emit(
                  'hintUpdate',
                  {
                    hint:
                      partialHint
                  }
                );
              }
            }
          });
      }

      if (
        room.timeRemaining <= 0
      ) {

        endTurn(room);
      }

    }, 1000);
}

function endTurn(room) {

  if (room.timer) {

    clearInterval(
      room.timer
    );

    room.timer = null;
  }

  room.state =
    'roundResult';

  const word =
    room.currentWord ||
    '(no word)';

  io
    .to(room.code)
    .emit(
      'turnResult',
      {
        word: word,

        players:
          room.getPlayerList(),

        correctGuessers:
          Array.from(
            room.correctGuessers
          )
      }
    );

  broadcastChat(
    room,
    null,
    `The word was: "${word}"`,
    'reveal'
  );

  broadcastRoomState(
    room
  );

  setTimeout(() => {

    if (
      room.state !== 'roundResult'
    ) {
      return;
    }

    if (
      room
        .getConnectedPlayers()
        .length <
      CONFIG.MIN_PLAYERS
    ) {

      endGame(room);

      return;
    }

    nextTurn(room);

  }, CONFIG.RESULT_SCREEN_TIME * 1000);
}

function endGame(room) {

  room.cleanup();

  room.state =
    'gameOver';

  const players =
    room
      .getPlayerList()
      .sort(
        (a, b) =>
          b.score - a.score
      );

  io
    .to(room.code)
    .emit(
      'gameOver',
      {
        players: players,
        reason: null
      }
    );

  broadcastRoomState(
    room
  );
}

// ============================================================
// BROADCAST HELPERS
// ============================================================

function broadcastRoomState(room) {

  io
    .to(room.code)
    .emit(
      'roomState',
      {
        code: room.code,

        state: room.state,

        hostId: room.hostId,

        players:
          room.getPlayerList(),

        roundNumber:
          room.roundNumber,

        totalRounds:
          CONFIG.ROUNDS_PER_GAME,

        turnIndex:
          room.turnIndex,

        totalTurns:
          room.totalTurns,

        drawerId:
          room.getCurrentDrawerId()
      }
    );
}

function broadcastTimer(room) {

  io
    .to(room.code)
    .emit(
      'timer',
      {
        timeRemaining:
          room.timeRemaining
      }
    );
}

function broadcastChat(
  room,
  senderId,
  text,
  type
) {

  const senderName =
    senderId &&
    room.players[senderId]
      ? room.players[senderId].name
      : null;

  io
    .to(room.code)
    .emit(
      'chatMessage',
      {
        sender:
          senderName,

        senderId:
          senderId,

        text:
          text,

        type:
          type
      }
    );
}

function sendToCorrectGuessers(
  room,
  senderId,
  text
) {

  const senderName =
    room.players[
      senderId
    ]?.name;

  const drawerId =
    room.getCurrentDrawerId();

  const targets = [
    ...room.correctGuessers,
    drawerId
  ];

  targets.forEach(pid => {

    const s =
      io.sockets.sockets.get(
        pid
      );

    if (s) {

      s.emit(
        'chatMessage',
        {
          sender:
            senderName,

          senderId:
            senderId,

          text:
            text,

          type:
            'chat'
        }
      );
    }
  });
}

function sendGameStateToPlayer(
  socket,
  room
) {

  const drawerId =
    room.getCurrentDrawerId();

  const drawer =
    room.players[
      drawerId
    ];

  socket.emit(
    'drawHistory',
    room.drawHistory
  );

  const hint =
    room.currentWord
      ? makeHint(room.currentWord)
      : '';

  socket.emit(
    'roundStart',
    {
      word: null,

      hint: hint,

      isDrawer: false
    }
  );

  socket.emit(
    'timer',
    {
      timeRemaining:
        room.timeRemaining
    }
  );

  if (drawer) {

    socket.emit(
      'newTurn',
      {
        drawerId:
          drawerId,

        drawerName:
          drawer.name,

        round:
          room.roundNumber,

        totalRounds:
          CONFIG.ROUNDS_PER_GAME,

        turnIndex:
          room.turnIndex,

        totalTurns:
          room.totalTurns
      }
    );
  }
}

// ============================================================
// CLOSE GUESS CHECK
// ============================================================

function isCloseGuess(
  guess,
  answer
) {

  if (
    guess.length < 3 ||
    answer.length < 3
  ) {
    return false;
  }

  if (
    Math.abs(
      guess.length -
      answer.length
    ) > 2
  ) {
    return false;
  }

  const m = guess.length;

  const n = answer.length;

  const dp =
    Array.from(
      {
        length: m + 1
      },
      () =>
        Array(
          n + 1
        ).fill(0)
    );

  for (
    let i = 0;
    i <= m;
    i++
  ) {

    dp[i][0] = i;
  }

  for (
    let j = 0;
    j <= n;
    j++
  ) {

    dp[0][j] = j;
  }

  for (
    let i = 1;
    i <= m;
    i++
  ) {

    for (
      let j = 1;
      j <= n;
      j++
    ) {

      dp[i][j] =
        Math.min(

          dp[i - 1][j] + 1,

          dp[i][j - 1] + 1,

          dp[i - 1][j - 1] +
          (
            guess[i - 1] !==
            answer[j - 1]
              ? 1
              : 0
          )
        );
    }
  }

  return (
    dp[m][n] <= 2 &&
    dp[m][n] > 0
  );
}

// ============================================================
// CLEANUP EMPTY ROOMS
// ============================================================

setInterval(() => {

  for (
    const code of Object.keys(rooms)
  ) {

    if (
      rooms[code]
        .getConnectedPlayers()
        .length === 0
    ) {

      rooms[code].cleanup();

      delete rooms[code];
    }
  }

}, 5 * 60 * 1000);

// ============================================================
// START SERVER
// ============================================================

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      `\n  ✏️ GuessToWin server running on port ${PORT}\n`
    );
  }
);
