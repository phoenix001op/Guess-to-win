// ============================================================
// GuessToWin — Client
// Handles UI, canvas drawing, and Socket.IO communication.
// All game logic/scoring is SERVER-AUTHORITATIVE.
// ============================================================

(function () {
  'use strict';

  // ---------- Socket connection ----------
  const socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 20
  });

  // ---------- Local state ----------
  let myPlayerId = null;
  let myPlayerName = '';
  let roomCode = null;
  let isHost = false;
  let isDrawer = false;
  let gameState = 'landing';

  // ---------- DOM References ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Pages
  const pages = {
    landing: $('#landingPage'),
    lobby: $('#lobbyPage'),
    game: $('#gamePage'),
    gameOver: $('#gameOverPage')
  };

  // Landing
  const playerNameInput = $('#playerNameInput');
  const roomCodeInput = $('#roomCodeInput');
  const createRoomBtn = $('#createRoomBtn');
  const joinRoomBtn = $('#joinRoomBtn');
  const landingError = $('#landingError');

  // Lobby
  const lobbyRoomCode = $('#lobbyRoomCode');
  const copyCodeBtn = $('#copyCodeBtn');
  const lobbyPlayerList = $('#lobbyPlayerList');
  const lobbyPlayerCount = $('#lobbyPlayerCount');
  const lobbyHostControls = $('#lobbyHostControls');
  const lobbyWaitMessage = $('#lobbyWaitMessage');
  const startGameBtn = $('#startGameBtn');
  const lobbyError = $('#lobbyError');

  // Game
  const roundDisplay = $('#roundDisplay');
  const timerText = $('#timerText');
  const timerRing = $('#timerRing');
  const wordHint = $('#wordHint');
  const wordChoiceOverlay = $('#wordChoiceOverlay');
  const wordChoiceButtons = $('#wordChoiceButtons');
  const turnResultOverlay = $('#turnResultOverlay');
  const revealedWord = $('#revealedWord');
  const gamePlayerList = $('#gamePlayerList');
  const chatMessages = $('#chatMessages');
  const chatInput = $('#chatInput');
  const chatSendBtn = $('#chatSendBtn');
  const drawingTools = $('#drawingTools');
  const drawCanvas = $('#drawCanvas');

  // Drawing tools
  const colorBtns = $$('.color-btn');
  const pencilTool = $('#pencilTool');
  const eraserTool = $('#eraserTool');
  const clearBtn = $('#clearBtn');
  const brushSizeSlider = $('#brushSize');
  const brushSizeLabel = $('#brushSizeLabel');

  // Game Over
  const podium = $('#podium');
  const finalRankings = $('#finalRankings');
  const playAgainBtn = $('#playAgainBtn');
  const backToLobbyBtn = $('#backToLobbyBtn');
  const gameOverHostNote = $('#gameOverHostNote');

  // Connection
  const connectionStatus = $('#connectionStatus');
  const connectionText = $('#connectionText');

  // ---------- Canvas state ----------
  const ctx = drawCanvas.getContext('2d');

  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  let currentColor = '#000000';
  let currentBrushSize = 5;
  let currentTool = 'pencil';

  // ============================================================
  // PAGE NAVIGATION
  // ============================================================

  function showPage(pageName) {
    if (!pages[pageName]) return;

    gameState = pageName;

    Object.values(pages).forEach(page => {
      page.classList.remove('active');
    });

    requestAnimationFrame(() => {
      pages[pageName].classList.add('active');

      if (pageName === 'game') {
        setTimeout(() => {
          resizeCanvas();
        }, 50);
      }
    });
  }

  // ============================================================
  // CONNECTION STATUS
  // ============================================================

  socket.on('connect', () => {
    connectionStatus.classList.add('hidden');
  });

  socket.on('disconnect', () => {
    connectionStatus.classList.remove('hidden');
    connectionStatus.classList.remove('connected');

    connectionText.textContent =
      'Disconnected — attempting to reconnect...';
  });

  socket.on('reconnect', () => {
    connectionStatus.classList.remove('hidden');
    connectionStatus.classList.add('connected');

    connectionText.textContent = 'Reconnected!';

    setTimeout(() => {
      connectionStatus.classList.add('hidden');
    }, 2000);
  });

  socket.io.on('reconnect_failed', () => {
    connectionText.textContent =
      'Connection lost. Please refresh the page.';
  });

  // ============================================================
  // LANDING PAGE
  // ============================================================

  createRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();

    if (!name) {
      showError(landingError, 'Please enter your name.');
      return;
    }

    if (!socket.connected) {
      showError(
        landingError,
        'Not connected to server. Please wait a moment.'
      );
      return;
    }

    myPlayerName = name;

    createRoomBtn.disabled = true;
    createRoomBtn.classList.add('loading');

    socket.emit(
      'createRoom',
      { playerName: name },
      (res) => {
        createRoomBtn.disabled = false;
        createRoomBtn.classList.remove('loading');

        if (res && res.success) {
          myPlayerId = res.playerId;
          roomCode = res.roomCode;
          isHost = true;

          showLobby();
        } else {
          showError(
            landingError,
            res?.error || 'Could not create room.'
          );
        }
      }
    );
  });

  joinRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();

    if (!name) {
      showError(landingError, 'Please enter your name.');
      return;
    }

    if (!code) {
      showError(landingError, 'Please enter a room code.');
      return;
    }

    if (!socket.connected) {
      showError(
        landingError,
        'Not connected to server. Please wait a moment.'
      );
      return;
    }

    myPlayerName = name;

    joinRoomBtn.disabled = true;
    joinRoomBtn.classList.add('loading');

    socket.emit(
      'joinRoom',
      {
        roomCode: code,
        playerName: name
      },
      (res) => {
        joinRoomBtn.disabled = false;
        joinRoomBtn.classList.remove('loading');

        if (res && res.success) {
          myPlayerId = res.playerId;
          roomCode = res.roomCode;
          isHost = false;

          showLobby();
        } else {
          showError(
            landingError,
            res?.error || 'Could not join room.'
          );
        }
      }
    );
  });

  // Enter key
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      createRoomBtn.click();
    }
  });

  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      joinRoomBtn.click();
    }
  });

  function showError(el, msg) {
    if (!el) return;

    el.textContent = msg;
    el.classList.remove('hidden');

    setTimeout(() => {
      el.classList.add('hidden');
    }, 4000);
  }

  // ============================================================
  // LOBBY
  // ============================================================

  function showLobby() {
    lobbyRoomCode.textContent = roomCode;
    showPage('lobby');
  }

  copyCodeBtn.addEventListener('click', () => {
    if (!roomCode) return;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(roomCode)
        .then(() => {
          copyCodeBtn.textContent = 'Copied!';

          setTimeout(() => {
            copyCodeBtn.textContent = 'Copy Code';
          }, 1500);
        })
        .catch(() => {
          fallbackCopyCode();
        });
    } else {
      fallbackCopyCode();
    }
  });

  function fallbackCopyCode() {
    const ta = document.createElement('textarea');

    ta.value = roomCode;

    document.body.appendChild(ta);
    ta.select();

    try {
      document.execCommand('copy');
    } catch (err) {
      console.warn('Copy failed:', err);
    }

    document.body.removeChild(ta);

    copyCodeBtn.textContent = 'Copied!';

    setTimeout(() => {
      copyCodeBtn.textContent = 'Copy Code';
    }, 1500);
  }

  // ============================================================
  // START GAME
  // ============================================================

  startGameBtn.addEventListener('click', () => {
    if (!socket.connected) {
      showError(
        lobbyError,
        'Not connected to server.'
      );
      return;
    }

    startGameBtn.disabled = true;
    startGameBtn.classList.add('loading');

    const originalText = startGameBtn.textContent;

    startGameBtn.textContent = 'Starting...';

    socket.emit('startGame', {}, (res) => {
      startGameBtn.disabled = false;
      startGameBtn.classList.remove('loading');
      startGameBtn.textContent = originalText;

      if (!res || !res.success) {
        showError(
          lobbyError,
          res?.error || 'Could not start the game.'
        );
      }
    });
  });

  // ============================================================
  // ROOM STATE
  // ============================================================

  socket.on('roomState', (data) => {
    if (!data) return;

    roomCode = data.code;
    isHost = data.hostId === myPlayerId;

    const players = Array.isArray(data.players)
      ? data.players
      : [];

    // Lobby
    if (gameState === 'lobby') {
      lobbyPlayerCount.textContent =
        `(${players.length})`;

      lobbyPlayerList.innerHTML = '';

      players.forEach((p, i) => {
        const li = document.createElement('li');

        li.innerHTML = `
          <div class="player-avatar avatar-${i % 12}">
            ${escapeHtml(
              (p.name || '?').charAt(0).toUpperCase()
            )}
          </div>

          <span>${escapeHtml(p.name)}</span>

          ${
            p.isHost
              ? '<span class="host-badge">HOST</span>'
              : ''
          }
        `;

        lobbyPlayerList.appendChild(li);
      });

      if (isHost) {
        lobbyHostControls.classList.remove('hidden');
        lobbyWaitMessage.classList.add('hidden');
      } else {
        lobbyHostControls.classList.add('hidden');
        lobbyWaitMessage.classList.remove('hidden');
      }
    }

    // Game players
    if (gameState === 'game') {
      updateGamePlayerList(
        players,
        data.drawerId
      );
    }

    // Round
    if (
      data.state === 'playing' ||
      data.state === 'choosing'
    ) {
      roundDisplay.textContent =
        `Round ${data.roundNumber} / ${data.totalRounds}`;
    }
  });

  function updateGamePlayerList(players, drawerId) {
    gamePlayerList.innerHTML = '';

    const sorted = [...players].sort(
      (a, b) => b.score - a.score
    );

    sorted.forEach((p, i) => {
      const li = document.createElement('li');

      const isDrawing =
        p.id === drawerId;

      if (isDrawing) {
        li.classList.add('drawing');
      }

      li.innerHTML = `
        <div class="gp-avatar avatar-${i % 12}">
          ${escapeHtml(
            (p.name || '?').charAt(0).toUpperCase()
          )}
        </div>

        <span class="gp-name">
          ${escapeHtml(p.name)}
        </span>

        ${
          isDrawing
            ? '<span class="gp-drawing-icon">✏️</span>'
            : ''
        }

        <span class="gp-score">
          ${Number(p.score) || 0}
        </span>
      `;

      gamePlayerList.appendChild(li);
    });
  }

  // ============================================================
  // GAME FLOW
  // ============================================================

  socket.on('newTurn', (data) => {
    if (!data) return;

    // Always make sure the game page is visible.
    if (gameState !== 'game') {
      showPage('game');
    }

    isDrawer =
      data.drawerId === myPlayerId;

    turnResultOverlay.classList.add('hidden');

    /*
      IMPORTANT FIX:

      DO NOT hide wordChoiceOverlay here.

      Your server sends:

      wordChoices -> newTurn

      Therefore hiding it here makes the 3 choices disappear.

      Only hide it after the player selects a word.
    */

    wordHint.textContent = '';
    wordHint.style.color = '';

    // Clear canvas for new turn
    clearCanvasLocal();

    // Drawer
    if (isDrawer) {
      drawingTools.classList.remove('hidden');

      chatInput.placeholder =
        'You are drawing...';

      chatInput.disabled = false;

    } else {
      // Guessers
      drawingTools.classList.add('hidden');

      chatInput.placeholder =
        'Type your guess...';

      chatInput.disabled = false;
    }

    roundDisplay.textContent =
      `Round ${data.round} / ${data.totalRounds}`;

    setTimeout(() => {
      resizeCanvas();
    }, 30);
  });

  // ============================================================
  // WORD CHOICES
  // ============================================================

  socket.on('wordChoices', (data) => {
    if (!data || !Array.isArray(data.words)) {
      return;
    }

    if (!isDrawer) {
      return;
    }

    const words = data.words
      .filter(word => typeof word === 'string')
      .slice(0, 3);

    if (words.length === 0) {
      return;
    }

    wordChoiceButtons.innerHTML = '';

    words.forEach((word, index) => {
      const btn = document.createElement('button');

      btn.className = 'word-choice-btn';

      btn.textContent = word;

      btn.style.animationDelay =
        `${index * 0.08}s`;

      btn.addEventListener('click', () => {
        if (!isDrawer) return;

        // Prevent multiple clicks
        wordChoiceButtons
          .querySelectorAll('button')
          .forEach(button => {
            button.disabled = true;
          });

        btn.classList.add('selected');

        socket.emit(
          'chooseWord',
          { word },
          (res) => {
            if (res && res.success === false) {
              wordChoiceButtons
                .querySelectorAll('button')
                .forEach(button => {
                  button.disabled = false;
                });

              btn.classList.remove('selected');

              showError(
                lobbyError,
                res.error || 'Could not choose word.'
              );

              return;
            }

            // Hide only after selecting
            wordChoiceOverlay.classList.add('hidden');
          }
        );
      });

      wordChoiceButtons.appendChild(btn);
    });

    // Show the 3 choices
    wordChoiceOverlay.classList.remove('hidden');
  });

  // ============================================================
  // ROUND START
  // ============================================================

  socket.on('roundStart', (data) => {
    if (!data) return;

    // At this point a word has actually been selected.
    wordChoiceOverlay.classList.add('hidden');

    if (data.isDrawer) {
      wordHint.textContent =
        data.word || '';

      wordHint.style.color =
        'var(--green)';
    } else {
      wordHint.textContent =
        data.hint || '';

      wordHint.style.color = '';
    }

    setTimeout(() => {
      resizeCanvas();
    }, 30);
  });

  // ============================================================
  // HINT UPDATE
  // ============================================================

  socket.on('hintUpdate', (data) => {
    if (!isDrawer && data) {
      wordHint.textContent =
        data.hint || '';
    }
  });

  // ============================================================
  // TIMER
  // ============================================================

  socket.on('timer', (data) => {
    if (!data) return;

    const t =
      Number(data.timeRemaining) || 0;

    timerText.textContent = t;

    /*
      Choosing phase = 15 seconds
      Drawing phase = configured round time.

      We use the word hint as a simple indication
      of the drawing phase.
    */

    let maxTime = 80;

    if (
      wordChoiceOverlay &&
      !wordChoiceOverlay.classList.contains('hidden')
    ) {
      maxTime = 15;
    }

    const fraction =
      1 - (t / maxTime);

    const circumference = 106.8;

    timerRing.style.strokeDashoffset =
      Math.max(
        0,
        Math.min(1, fraction)
      ) * circumference;

    timerRing.classList.remove(
      'warning',
      'danger'
    );

    if (t <= 10) {
      timerRing.classList.add('danger');
    } else if (t <= 20) {
      timerRing.classList.add('warning');
    }
  });

  // ============================================================
  // TURN RESULT
  // ============================================================

  socket.on('turnResult', (data) => {
    if (!data) return;

    turnResultOverlay.classList.remove('hidden');

    revealedWord.textContent =
      data.word || '';

    wordHint.textContent =
      data.word || '';

    wordHint.style.color =
      'var(--pink)';

    isDrawer = false;

    drawingTools.classList.add('hidden');
  });

  // ============================================================
  // GAME OVER
  // ============================================================

  socket.on('gameOver', (data) => {
    if (!data) return;

    showPage('gameOver');

    renderGameOver(
      Array.isArray(data.players)
        ? data.players
        : []
    );
  });

  // ============================================================
  // RETURN TO LOBBY
  // ============================================================

  socket.on('returnToLobby', () => {
    chatMessages.innerHTML = '';

    wordChoiceOverlay.classList.add('hidden');
    turnResultOverlay.classList.add('hidden');

    drawingTools.classList.add('hidden');

    showPage('lobby');
  });

  // ============================================================
  // GAME OVER RENDERING
  // ============================================================

  function renderGameOver(players) {
    podium.innerHTML = '';

    const top3 =
      players.slice(0, 3);

    const podiumOrder = [];

    if (top3[1]) {
      podiumOrder.push({
        ...top3[1],
        rank: 2
      });
    }

    if (top3[0]) {
      podiumOrder.push({
        ...top3[0],
        rank: 1
      });
    }

    if (top3[2]) {
      podiumOrder.push({
        ...top3[2],
        rank: 3
      });
    }

    podiumOrder.forEach(p => {
      const barClass =
        p.rank === 1
          ? 'first'
          : p.rank === 2
            ? 'second'
            : 'third';

      const spot =
        document.createElement('div');

      spot.className =
        'podium-spot';

      spot.innerHTML = `
        <span class="podium-name">
          ${escapeHtml(p.name)}
        </span>

        <div class="podium-bar ${barClass}">
          <span class="podium-score">
            ${p.score}
          </span>

          <span class="podium-rank">
            #${p.rank}
          </span>
        </div>
      `;

      podium.appendChild(spot);
    });

    finalRankings.innerHTML = '';

    players.forEach(p => {
      const li =
        document.createElement('li');

      li.innerHTML = `
        <span class="rank-name">
          ${escapeHtml(p.name)}
        </span>

        <span class="rank-score">
          ${p.score} pts
        </span>
      `;

      finalRankings.appendChild(li);
    });

    if (isHost) {
      playAgainBtn.classList.remove('hidden');
      backToLobbyBtn.classList.remove('hidden');
      gameOverHostNote.classList.add('hidden');
    } else {
      playAgainBtn.classList.add('hidden');
      backToLobbyBtn.classList.add('hidden');
      gameOverHostNote.classList.remove('hidden');
    }
  }

  playAgainBtn.addEventListener('click', () => {
    socket.emit('playAgain');
  });

  backToLobbyBtn.addEventListener('click', () => {
    socket.emit('returnToLobby');
  });

  // ============================================================
  // CHAT
  // ============================================================

  function sendChat() {
    const msg =
      chatInput.value.trim();

    if (!msg) return;

    socket.emit(
      'chatMessage',
      { message: msg }
    );

    chatInput.value = '';
  }

  chatSendBtn.addEventListener(
    'click',
    sendChat
  );

  chatInput.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter') {
        sendChat();
      }
    }
  );

  socket.on('chatMessage', (data) => {
    if (!data) return;

    const div =
      document.createElement('div');

    div.className =
      `chat-msg ${data.type || ''}`;

    if (
      data.type === 'chat' &&
      data.sender
    ) {
      div.innerHTML =
        `<span class="msg-sender">${escapeHtml(data.sender)}:</span>${escapeHtml(data.text || '')}`;
    }

    else if (data.type === 'correct') {
      div.textContent =
        `✓ ${data.text || ''}`;
    }

    else if (data.type === 'reveal') {
      div.textContent =
        data.text || '';
    }

    else if (data.type === 'close') {
      div.textContent =
        data.text || '';
    }

    else {
      div.textContent =
        data.text || '';
    }

    chatMessages.appendChild(div);

    chatMessages.scrollTop =
      chatMessages.scrollHeight;
  });

  // ============================================================
  // CANVAS
  // ============================================================

  function resizeCanvas() {
    if (!drawCanvas.parentElement) {
      return;
    }

    const rect =
      drawCanvas.parentElement.getBoundingClientRect();

    const toolsVisible =
      !drawingTools.classList.contains('hidden');

    const toolsHeight =
      toolsVisible
        ? drawingTools.offsetHeight
        : 0;

    const w =
      Math.max(1, Math.floor(rect.width));

    const h =
      Math.max(
        1,
        Math.floor(rect.height - toolsHeight)
      );

    if (
      Math.abs(drawCanvas.width - w) <= 2 &&
      Math.abs(drawCanvas.height - h) <= 2
    ) {
      return;
    }

    let imageData = null;

    if (
      drawCanvas.width > 0 &&
      drawCanvas.height > 0
    ) {
      try {
        imageData =
          ctx.getImageData(
            0,
            0,
            drawCanvas.width,
            drawCanvas.height
          );
      } catch (err) {
        imageData = null;
      }
    }

    drawCanvas.width = w;
    drawCanvas.height = h;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (imageData) {
      try {
        ctx.putImageData(
          imageData,
          0,
          0
        );
      } catch (err) {
        clearCanvasLocal();
      }
    } else {
      clearCanvasLocal();
    }
  }

  function clearCanvasLocal() {
    ctx.globalCompositeOperation =
      'source-over';

    ctx.fillStyle =
      '#ffffff';

    ctx.fillRect(
      0,
      0,
      drawCanvas.width,
      drawCanvas.height
    );

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function initCanvas() {
    resizeCanvas();
    clearCanvasLocal();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  window.addEventListener(
    'resize',
    () => {
      if (gameState === 'game') {
        resizeCanvas();
      }
    }
  );

  // ============================================================
  // COORDINATES
  // ============================================================

  function getNormCoords(e) {
    const rect =
      drawCanvas.getBoundingClientRect();

    let x;
    let y;

    if (
      e.touches &&
      e.touches.length > 0
    ) {
      x =
        e.touches[0].clientX -
        rect.left;

      y =
        e.touches[0].clientY -
        rect.top;
    } else {
      x =
        e.clientX -
        rect.left;

      y =
        e.clientY -
        rect.top;
    }

    return {
      x: Math.max(
        0,
        Math.min(
          1,
          x / rect.width
        )
      ),

      y: Math.max(
        0,
        Math.min(
          1,
          y / rect.height
        )
      )
    };
  }

  function toCanvasCoords(nx, ny) {
    return {
      x: nx * drawCanvas.width,
      y: ny * drawCanvas.height
    };
  }

  // ============================================================
  // DRAWING
  // ============================================================

  function startDraw(e) {
    if (!isDrawer) return;

    e.preventDefault();

    drawing = true;

    const coords =
      getNormCoords(e);

    lastX = coords.x;
    lastY = coords.y;

    drawLine(
      coords.x,
      coords.y,
      coords.x,
      coords.y,
      currentColor,
      currentBrushSize,
      currentTool === 'eraser'
    );

    socket.emit('draw', {
      type: 'start',
      x: coords.x,
      y: coords.y,
      color: currentColor,
      size: currentBrushSize,
      eraser:
        currentTool === 'eraser'
    });
  }

  function moveDraw(e) {
    if (!isDrawer || !drawing) {
      return;
    }

    e.preventDefault();

    const coords =
      getNormCoords(e);

    drawLine(
      lastX,
      lastY,
      coords.x,
      coords.y,
      currentColor,
      currentBrushSize,
      currentTool === 'eraser'
    );

    socket.emit('draw', {
      type: 'move',

      x1: lastX,
      y1: lastY,

      x2: coords.x,
      y2: coords.y,

      color: currentColor,
      size: currentBrushSize,

      eraser:
        currentTool === 'eraser'
    });

    lastX = coords.x;
    lastY = coords.y;
  }

  function endDraw(e) {
    if (!isDrawer) return;

    drawing = false;

    socket.emit('draw', {
      type: 'end'
    });
  }

  function drawLine(
    x1,
    y1,
    x2,
    y2,
    color,
    size,
    eraser
  ) {
    const p1 =
      toCanvasCoords(x1, y1);

    const p2 =
      toCanvasCoords(x2, y2);

    ctx.beginPath();

    ctx.moveTo(
      p1.x,
      p1.y
    );

    ctx.lineTo(
      p2.x,
      p2.y
    );

    if (eraser) {
      ctx.globalCompositeOperation =
        'destination-out';

      ctx.strokeStyle =
        'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation =
        'source-over';

      ctx.strokeStyle =
        color;
    }

    ctx.lineWidth =
      Math.max(1, size);

    ctx.lineCap =
      'round';

    ctx.lineJoin =
      'round';

    ctx.stroke();

    ctx.globalCompositeOperation =
      'source-over';
  }

  // Mouse
  drawCanvas.addEventListener(
    'mousedown',
    startDraw
  );

  drawCanvas.addEventListener(
    'mousemove',
    moveDraw
  );

  drawCanvas.addEventListener(
    'mouseup',
    endDraw
  );

  drawCanvas.addEventListener(
    'mouseleave',
    endDraw
  );

  // Touch
  drawCanvas.addEventListener(
    'touchstart',
    startDraw,
    { passive: false }
  );

  drawCanvas.addEventListener(
    'touchmove',
    moveDraw,
    { passive: false }
  );

  drawCanvas.addEventListener(
    'touchend',
    endDraw,
    { passive: false }
  );

  drawCanvas.addEventListener(
    'touchcancel',
    endDraw,
    { passive: false }
  );

  // ============================================================
  // RECEIVE DRAWING
  // ============================================================

  socket.on('draw', (data) => {
    if (!data) return;

    if (data.type === 'start') {
      drawLine(
        data.x,
        data.y,
        data.x,
        data.y,
        data.color,
        data.size,
        data.eraser
      );
    }

    else if (data.type === 'move') {
      drawLine(
        data.x1,
        data.y1,
        data.x2,
        data.y2,
        data.color,
        data.size,
        data.eraser
      );
    }
  });

  // ============================================================
  // DRAW HISTORY
  // ============================================================

  socket.on('drawHistory', (events) => {
    clearCanvasLocal();

    if (!Array.isArray(events)) {
      return;
    }

    events.forEach(data => {
      if (data.type === 'start') {
        drawLine(
          data.x,
          data.y,
          data.x,
          data.y,
          data.color,
          data.size,
          data.eraser
        );
      }

      else if (data.type === 'move') {
        drawLine(
          data.x1,
          data.y1,
          data.x2,
          data.y2,
          data.color,
          data.size,
          data.eraser
        );
      }
    });
  });

  // ============================================================
  // CLEAR CANVAS
  // ============================================================

  socket.on('clearCanvas', () => {
    clearCanvasLocal();
  });

  // ============================================================
  // DRAWING TOOLS
  // ============================================================

  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => {
        b.classList.remove('active');
      });

      btn.classList.add('active');

      currentColor =
        btn.dataset.color;

      currentTool =
        'pencil';

      pencilTool.classList.add('active');
      eraserTool.classList.remove('active');
    });
  });

  pencilTool.addEventListener(
    'click',
    () => {
      currentTool =
        'pencil';

      pencilTool.classList.add('active');
      eraserTool.classList.remove('active');
    }
  );

  eraserTool.addEventListener(
    'click',
    () => {
      currentTool =
        'eraser';

      eraserTool.classList.add('active');
      pencilTool.classList.remove('active');
    }
  );

  clearBtn.addEventListener(
    'click',
    () => {
      if (!isDrawer) return;

      clearCanvasLocal();

      socket.emit('clearCanvas');
    }
  );

  brushSizeSlider.addEventListener(
    'input',
    () => {
      currentBrushSize =
        parseInt(
          brushSizeSlider.value,
          10
        );

      brushSizeLabel.textContent =
        currentBrushSize;
    }
  );

  // ============================================================
  // UTILITY
  // ============================================================

  function escapeHtml(text) {
    const div =
      document.createElement('div');

    div.textContent =
      text == null
        ? ''
        : String(text);

    return div.innerHTML;
  }

  // ============================================================
  // INIT
  // ============================================================

  const observer =
    new MutationObserver(() => {
      if (
        pages.game.classList.contains(
          'active'
        )
      ) {
        setTimeout(
          initCanvas,
          50
        );
      }
    });

  observer.observe(
    pages.game,
    {
      attributes: true,
      attributeFilter: ['class']
    }
  );

  window.addEventListener(
    'resize',
    () => {
      if (
        pages.game.classList.contains(
          'active'
        )
      ) {
        resizeCanvas();
      }
    }
  );

  playerNameInput.focus();

})();
