// ============================================================
// GuessToWin CLIENT
// ============================================================

const socket = io();

let roomCode = '';
let playerId = '';
let isHost = false;
let isDrawer = false;

let currentSettings = {
  maxPlayers: 8,
  rounds: 3,
  timer: 80
};

let canvas;
let ctx;

let drawing = false;
let lastX = 0;
let lastY = 0;

let currentColor = '#000000';
let currentTool = 'pencil';
let brushSize = 5;


// ============================================================
// HELPERS
// ============================================================

function $(id) {
  return document.getElementById(id);
}

function showPage(id) {

  document
    .querySelectorAll('.page')
    .forEach(page => {
      page.classList.remove('active');
    });

  $(id).classList.add('active');
}

function showError(id, message) {

  const el = $(id);

  el.textContent = message;

  el.classList.remove('hidden');
}

function hideError(id) {
  $(id).classList.add('hidden');
}


// ============================================================
// HOME
// ============================================================

$('roomBtn').addEventListener('click', () => {

  $('joinPanel').classList.remove('hidden');

  $('roomCodeInput').focus();
});


$('closeJoinBtn').addEventListener('click', () => {

  $('joinPanel').classList.add('hidden');

});


$('createRoomBtn').addEventListener(
  'click',
  () => {

    hideError('homeError');

    const name =
      $('playerNameInput')
        .value
        .trim();

    if (!name) {

      showError(
        'homeError',
        'Enter your name first.'
      );

      return;
    }

    socket.emit(
      'createRoom',
      {
        playerName: name
      },
      response => {

        if (!response || !response.success) {

          showError(
            'homeError',
            response?.error ||
            'Could not create room.'
          );

          return;
        }

        roomCode =
          response.roomCode;

        playerId =
          response.playerId;

        showLobby();

      }
    );
  }
);


$('joinRoomBtn').addEventListener(
  'click',
  joinRoom
);


$('roomCodeInput').addEventListener(
  'keydown',
  event => {

    if (event.key === 'Enter') {
      joinRoom();
    }

  }
);


function joinRoom() {

  hideError('homeError');

  const name =
    $('playerNameInput')
      .value
      .trim();

  const code =
    $('roomCodeInput')
      .value
      .trim()
      .toUpperCase();

  if (!name) {

    showError(
      'homeError',
      'Enter your name first.'
    );

    return;
  }

  if (!code) {

    showError(
      'homeError',
      'Enter a room code.'
    );

    return;
  }

  socket.emit(
    'joinRoom',
    {
      playerName: name,
      roomCode: code
    },
    response => {

      if (!response || !response.success) {

        showError(
          'homeError',
          response?.error ||
          'Could not join room.'
        );

        return;
      }

      roomCode =
        response.roomCode;

      playerId =
        response.playerId;

      showLobby();

    }
  );
}


// ============================================================
// LOBBY
// ============================================================

function showLobby() {

  $('lobbyRoomCode')
    .textContent = roomCode;

  showPage('lobbyPage');
}


$('copyCodeBtn').addEventListener(
  'click',
  async () => {

    try {

      await navigator.clipboard.writeText(
        roomCode
      );

      $('copyCodeBtn')
        .textContent = 'Copied!';

      setTimeout(() => {

        $('copyCodeBtn')
          .textContent = 'Copy';

      }, 1200);

    } catch {

      alert(
        `Room code: ${roomCode}`
      );

    }

  }
);


// ============================================================
// SETTINGS
// ============================================================

$('settingsBtn').addEventListener(
  'click',
  () => {

    updateSettingsInputs();

    $('settingsOverlay')
      .classList.remove('hidden');

  }
);


$('closeSettingsBtn').addEventListener(
  'click',
  () => {

    $('settingsOverlay')
      .classList.add('hidden');

  }
);


$('saveSettingsBtn').addEventListener(
  'click',
  () => {

    const maxPlayers =
      Number(
        $('maxPlayersSetting').value
      );

    const rounds =
      Number(
        $('roundsSetting').value
      );

    const timer =
      Number(
        $('timerSetting').value
      );

    socket.emit(
      'updateSettings',
      {
        maxPlayers,
        rounds,
        timer
      },
      response => {

        if (
          !response ||
          !response.success
        ) {

          $('settingsMessage')
            .textContent =
              response?.error ||
              'Could not save settings.';

          return;
        }

        currentSettings = {
          maxPlayers,
          rounds,
          timer
        };

        $('settingsMessage')
          .textContent =
            'Settings saved.';

        setTimeout(() => {

          $('settingsOverlay')
            .classList.add('hidden');

          $('settingsMessage')
            .textContent = '';

        }, 500);

      }
    );

  }
);


function updateSettingsInputs() {

  $('maxPlayersSetting').value =
    currentSettings.maxPlayers;

  $('roundsSetting').value =
    currentSettings.rounds;

  $('timerSetting').value =
    currentSettings.timer;
}


// ============================================================
// START GAME
// ============================================================

$('startGameBtn').addEventListener(
  'click',
  () => {

    socket.emit(
      'startGame',
      {},
      response => {

        if (
          response &&
          !response.success
        ) {

          $('lobbyHint')
            .textContent =
              response.error;

        }

      }
    );

  }
);


// ============================================================
// LEAVE ROOM
// ============================================================

$('leaveRoomFromSettings')
  .addEventListener(
    'click',
    () => {

      socket.emit(
        'leaveRoom'
      );

      roomCode = '';
      playerId = '';

      $('settingsOverlay')
        .classList.add('hidden');

      showPage('homePage');

    }
  );


$('leaveGameBtn').addEventListener(
  'click',
  () => {

    const okay =
      confirm(
        'Leave this game?'
      );

    if (!okay) {
      return;
    }

    socket.emit(
      'leaveRoom'
    );

    roomCode = '';
    playerId = '';

    showPage('homePage');

  }
);


// ============================================================
// ROOM STATE
// ============================================================

socket.on(
  'roomState',
  data => {

    if (!data) {
      return;
    }

    roomCode =
      data.code || roomCode;

    isHost =
      data.hostId === socket.id;

    $('lobbyRoomCode')
      .textContent = roomCode;

    currentSettings =
      data.settings ||
      currentSettings;

    updateLobbyPlayers(
      data.players || []
    );

    updateGamePlayers(
      data.players || []
    );

    if (data.state === 'lobby') {

      if (
        !$('lobbyPage')
          .classList
          .contains('active')
      ) {

        showLobby();

      }

      $('startGameBtn')
        .classList.toggle(
          'hidden',
          !isHost
        );

      $('settingsBtn')
        .classList.toggle(
          'hidden',
          !isHost
        );

      if (isHost) {

        $('lobbyHint')
          .textContent =
            `Up to ${currentSettings.maxPlayers} players • ${currentSettings.rounds} rounds • ${currentSettings.timer}s`;

      } else {

        $('lobbyHint')
          .textContent =
            'Waiting for the host to start the game...';

      }
    }

  }
);


// ============================================================
// LOBBY PLAYERS
// ============================================================

function updateLobbyPlayers(players) {

  $('playerCount')
    .textContent =
      players.length;

  $('lobbyPlayerList')
    .innerHTML = '';

  players.forEach(player => {

    const row =
      document.createElement('div');

    row.className =
      'player-row';

    const left =
      document.createElement('span');

    left.textContent =
      player.name;

    const right =
      document.createElement('span');

    if (player.isHost) {

      right.textContent =
        'HOST';

      right.className =
        'host-tag';

    }

    row.appendChild(left);
    row.appendChild(right);

    $('lobbyPlayerList')
      .appendChild(row);

  });
}


// ============================================================
// GAME START
// ============================================================

socket.on(
  'gameStarted',
  data => {

    currentSettings =
      data.settings ||
      currentSettings;

    showPage('gamePage');

    setupCanvas();

  }
);


// ============================================================
// NEW TURN
// ============================================================

socket.on(
  'newTurn',
  data => {

    if (!data) {
      return;
    }

    isDrawer =
      data.drawerId === socket.id;

    $('roundDisplay')
      .textContent =
        `Round ${data.round} / ${data.totalRounds}`;

    clearCanvasLocal();

    $('wordHint')
      .textContent =
        '';

    $('drawingTools')
      .classList.toggle(
        'hidden',
        !isDrawer
      );

  }
);


// ============================================================
// WORD CHOICES
// ============================================================

socket.on(
  'wordChoices',
  data => {

    if (
      !data ||
      !Array.isArray(data.words)
    ) {
      return;
    }

    if (!isDrawer) {
      return;
    }

    showWordChoices(
      data.words
    );

  }
);


function showWordChoices(words) {

  const container =
    $('wordChoiceButtons');

  container.innerHTML = '';

  words.forEach(word => {

    const button =
      document.createElement('button');

    button.className =
      'word-choice-btn';

    button.textContent =
      word;

    button.addEventListener(
      'click',
      () => {

        socket.emit(
          'chooseWord',
          {
            word
          }
        );

        hideWordChoices();

      }
    );

    container.appendChild(
      button
    );

  });

  $('wordChoiceOverlay')
    .classList.remove('hidden');
}


function hideWordChoices() {

  $('wordChoiceOverlay')
    .classList.add('hidden');

}


// ============================================================
// ROUND START
// ============================================================

socket.on(
  'roundStart',
  data => {

    if (!data) {
      return;
    }

    isDrawer =
      !!data.isDrawer;

    $('drawingTools')
      .classList.toggle(
        'hidden',
        !isDrawer
      );

    if (data.hint) {

      $('wordHint')
        .textContent =
          data.hint;

    }

    if (isDrawer && data.word) {

      $('wordHint')
        .textContent =
          data.word;

    }

    hideWordChoices();

  }
);


// ============================================================
// HINT UPDATE
// ============================================================

socket.on(
  'hintUpdate',
  data => {

    if (
      data &&
      data.hint
    ) {

      $('wordHint')
        .textContent =
          data.hint;

    }

  }
);


// ============================================================
// TIMER
// ============================================================

socket.on(
  'timer',
  data => {

    if (!data) {
      return;
    }

    $('timerText')
      .textContent =
        Math.max(
          0,
          data.timeRemaining
        );

  }
);


// ============================================================
// CANVAS
// ============================================================

function setupCanvas() {

  canvas =
    $('drawCanvas');

  ctx =
    canvas.getContext(
      '2d'
    );

  resizeCanvas();

}


function resizeCanvas() {

  if (!canvas) {
    return;
  }

  const rect =
    canvas.getBoundingClientRect();

  const oldImage =
    canvas.width &&
    canvas.height
      ? canvas.toDataURL()
      : null;

  const dpr =
    window.devicePixelRatio || 1;

  canvas.width =
    Math.round(
      rect.width * dpr
    );

  canvas.height =
    Math.round(
      rect.height * dpr
    );

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.lineCap =
    'round';

  ctx.lineJoin =
    'round';

  ctx.fillStyle =
    '#ffffff';

  ctx.fillRect(
    0,
    0,
    rect.width,
    rect.height
  );

  if (oldImage) {

    const image =
      new Image();

    image.onload = () => {

      ctx.drawImage(
        image,
        0,
        0,
        rect.width,
        rect.height
      );

    };

    image.src =
      oldImage;

  }

}


window.addEventListener(
  'resize',
  () => {

    if (
      $('gamePage')
        .classList
        .contains('active')
    ) {

      resizeCanvas();

    }

  }
);


// ============================================================
// DRAWING EVENTS
// ============================================================

function getCanvasPosition(event) {

  const rect =
    canvas.getBoundingClientRect();

  let clientX;
  let clientY;

  if (
    event.touches &&
    event.touches.length
  ) {

    clientX =
      event.touches[0].clientX;

    clientY =
      event.touches[0].clientY;

  } else {

    clientX =
      event.clientX;

    clientY =
      event.clientY;

  }

  return {
    x:
      clientX - rect.left,

    y:
      clientY - rect.top
  };

}


function startDrawing(event) {

  if (!isDrawer) {
    return;
  }

  event.preventDefault();

  drawing = true;

  const pos =
    getCanvasPosition(
      event
    );

  lastX =
    pos.x;

  lastY =
    pos.y;

  drawPoint(
    pos.x,
    pos.y
  );

}


function drawMove(event) {

  if (
    !drawing ||
    !isDrawer
  ) {
    return;
  }

  event.preventDefault();

  const pos =
    getCanvasPosition(
      event
    );

  drawLine(
    lastX,
    lastY,
    pos.x,
    pos.y
  );

  socket.emit(
    'draw',
    {
      type: 'line',

      x1: lastX,
      y1: lastY,

      x2: pos.x,
      y2: pos.y,

      color:
        currentTool === 'eraser'
          ? '#ffffff'
          : currentColor,

      size:
        brushSize
    }
  );

  lastX =
    pos.x;

  lastY =
    pos.y;

}


function stopDrawing() {

  drawing = false;

}


function drawPoint(
  x,
  y
) {

  ctx.beginPath();

  ctx.fillStyle =
    currentTool === 'eraser'
      ? '#ffffff'
      : currentColor;

  ctx.arc(
    x,
    y,
    brushSize / 2,
    0,
    Math.PI * 2
  );

  ctx.fill();

}


function drawLine(
  x1,
  y1,
  x2,
  y2
) {

  ctx.beginPath();

  ctx.moveTo(
    x1,
    y1
  );

  ctx.lineTo(
    x2,
    y2
  );

  ctx.strokeStyle =
    currentTool === 'eraser'
      ? '#ffffff'
      : currentColor;

  ctx.lineWidth =
    brushSize;

  ctx.lineCap =
    'round';

  ctx.lineJoin =
    'round';

  ctx.stroke();

}


canvas =
  $('drawCanvas');

canvas.addEventListener(
  'mousedown',
  startDrawing
);

canvas.addEventListener(
  'mousemove',
  drawMove
);

canvas.addEventListener(
  'mouseup',
  stopDrawing
);

canvas.addEventListener(
  'mouseleave',
  stopDrawing
);

canvas.addEventListener(
  'touchstart',
  startDrawing,
  { passive: false }
);

canvas.addEventListener(
  'touchmove',
  drawMove,
  { passive: false }
);

canvas.addEventListener(
  'touchend',
  stopDrawing
);


// ============================================================
// RECEIVE DRAWING
// ============================================================

socket.on(
  'draw',
  data => {

    if (!data) {
      return;
    }

    if (
      data.type === 'line'
    ) {

      ctx.beginPath();

      ctx.moveTo(
        data.x1,
        data.y1
      );

      ctx.lineTo(
        data.x2,
        data.y2
      );

      ctx.strokeStyle =
        data.color;

      ctx.lineWidth =
        data.size;

      ctx.lineCap =
        'round';

      ctx.lineJoin =
        'round';

      ctx.stroke();

    }

  }
);


// ============================================================
// CLEAR
// ============================================================

function clearCanvasLocal() {

  if (!canvas || !ctx) {
    return;
  }

  const rect =
    canvas.getBoundingClientRect();

  ctx.clearRect(
    0,
    0,
    rect.width,
    rect.height
  );

  ctx.fillStyle =
    '#ffffff';

  ctx.fillRect(
    0,
    0,
    rect.width,
    rect.height
  );

}


$('clearBtn').addEventListener(
  'click',
  () => {

    if (!isDrawer) {
      return;
    }

    clearCanvasLocal();

    socket.emit(
      'clearCanvas'
    );

  }
);


socket.on(
  'clearCanvas',
  () => {

    clearCanvasLocal();

  }
);


// ============================================================
// DRAWING TOOLS
// ============================================================

document
  .querySelectorAll('.color-btn')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => {

        document
          .querySelectorAll(
            '.color-btn'
          )
          .forEach(b =>
            b.classList.remove(
              'active'
            )
          );

        button.classList.add(
          'active'
        );

        currentColor =
          button.dataset.color;

        currentTool =
          'pencil';

        $('pencilTool')
          .classList.add(
            'active'
          );

        $('eraserTool')
          .classList.remove(
            'active'
          );

      }
    );

  });


$('pencilTool')
  .addEventListener(
    'click',
    () => {

      currentTool =
        'pencil';

      $('pencilTool')
        .classList.add(
          'active'
        );

      $('eraserTool')
        .classList.remove(
          'active'
        );

    }
  );


$('eraserTool')
  .addEventListener(
    'click',
    () => {

      currentTool =
        'eraser';

      $('eraserTool')
        .classList.add(
          'active'
        );

      $('pencilTool')
        .classList.remove(
          'active'
        );

    }
  );


$('brushSize')
  .addEventListener(
    'input',
    event => {

      brushSize =
        Number(
          event.target.value
        );

      $('brushSizeLabel')
        .textContent =
          brushSize;

    }
  );


// ============================================================
// CHAT
// ============================================================

$('chatSendBtn')
  .addEventListener(
    'click',
    sendChat
  );


$('chatInput')
  .addEventListener(
    'keydown',
    event => {

      if (event.key === 'Enter') {

        sendChat();

      }

    }
  );


function sendChat() {

  const input =
    $('chatInput');

  const message =
    input.value.trim();

  if (!message) {
    return;
  }

  socket.emit(
    'chatMessage',
    {
      message
    }
  );

  input.value = '';

}


socket.on(
  'chatMessage',
  data => {

    if (!data) {
      return;
    }

    const message =
      document.createElement(
        'div'
      );

    message.className =
      `chat-message ${data.type || ''}`;

    if (data.sender) {

      const sender =
        document.createElement(
          'span'
        );

      sender.className =
        'sender';

      sender.textContent =
        `${data.sender}: `;

      message.appendChild(
        sender
      );

    }

    const text =
      document.createElement(
        'span'
      );

    text.textContent =
      data.text || '';

    message.appendChild(
      text
    );

    $('chatMessages')
      .appendChild(
        message
      );

    $('chatMessages')
      .scrollTop =
        $('chatMessages')
          .scrollHeight;

  }
);


// ============================================================
// GAME PLAYERS
// ============================================================

function updateGamePlayers(players) {

  const container =
    $('gamePlayerList');

  if (!container) {
    return;
  }

  container.innerHTML = '';

  players.forEach(player => {

    const row =
      document.createElement(
        'div'
      );

    row.className =
      'game-player';

    if (player.isDrawing) {

      row.classList.add(
        'drawing'
      );

    }

    row.textContent =
      `${player.name}  ${player.score}`;

    container.appendChild(
      row
    );

  });

}


// ============================================================
// TURN RESULT
// ============================================================

socket.on(
  'turnResult',
  data => {

    if (!data) {
      return;
    }

    $('revealedWord')
      .textContent =
        data.word || '';

    $('resultOverlay')
      .classList.remove(
        'hidden'
      );

    setTimeout(() => {

      $('resultOverlay')
        .classList.add(
          'hidden'
        );

    }, 3500);

  }
);


// ============================================================
// GAME OVER
// ============================================================

socket.on(
  'gameOver',
  data => {

    $('gameOverOverlay')
      .classList.remove(
        'hidden'
      );

    const players =
      data.players || [];

    const container =
      $('finalRankings');

    container.innerHTML = '';

    players.forEach(
      (player, index) => {

        const row =
          document.createElement(
            'div'
          );

        row.className =
          'rank-row';

        row.innerHTML =
          `<span>${index + 1}. ${escapeHtml(player.name)}</span>
           <strong>${player.score}</strong>`;

        container.appendChild(
          row
        );

      }
    );

  }
);


// ============================================================
// PLAY AGAIN
// ============================================================

$('playAgainBtn')
  .addEventListener(
    'click',
    () => {

      socket.emit(
        'playAgain'
      );

      $('gameOverOverlay')
        .classList.add(
          'hidden'
        );

    }
  );


$('backLobbyBtn')
  .addEventListener(
    'click',
    () => {

      socket.emit(
        'returnToLobby'
      );

      $('gameOverOverlay')
        .classList.add(
          'hidden'
        );

      showLobby();

    }
  );


socket.on(
  'returnToLobby',
  () => {

    $('gameOverOverlay')
      .classList.add(
        'hidden'
      );

    showLobby();

  }
);


// ============================================================
// DRAW HISTORY
// ============================================================

socket.on(
  'drawHistory',
  history => {

    if (
      !Array.isArray(history)
    ) {
      return;
    }

    history.forEach(
      data => {

        if (
          data.type === 'line'
        ) {

          drawLine(
            data.x1,
            data.y1,
            data.x2,
            data.y2
          );

        }

      }
    );

  }
);


// ============================================================
// DISCONNECTED
// ============================================================

socket.on(
  'disconnect',
  () => {

    console.log(
      'Disconnected from server'
    );

  }
);


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(text) {

  const div =
    document.createElement(
      'div'
    );

  div.textContent =
    text;

  return div.innerHTML;

}
