(() => {
  "use strict";

  const socket = io({
    transports: ["websocket", "polling"],
    reconnection: true
  });

  const $ = id => document.getElementById(id);

  let myId = null;
  let roomCode = "";
  let isHost = false;
  let isDrawer = false;

  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  let color = "#111111";
  let size = 5;
  let tool = "pencil";

  const pages = {
    landing: $("landingPage"),
    lobby: $("lobbyPage"),
    game: $("gamePage"),
    gameOver: $("gameOverPage")
  };

  const canvas = $("drawCanvas");
  const ctx = canvas.getContext("2d");


  /* ================= NAVIGATION ================= */

  function page(name) {
    Object.values(pages).forEach(p => p.classList.remove("active"));
    pages[name].classList.add("active");

    if (name === "game") {
      setTimeout(resizeCanvas, 50);
    }
  }


  /* ================= CONNECTION ================= */

  socket.on("connect", () => {
    $("connectionStatus").classList.add("hidden");
  });

  socket.on("disconnect", () => {
    $("connectionStatus").textContent =
      "Connection lost — reconnecting...";
    $("connectionStatus").classList.remove("hidden");
  });


  /* ================= HOME ================= */

  function error(element, message) {
    element.textContent = message;
    element.classList.remove("hidden");

    setTimeout(() => {
      element.classList.add("hidden");
    }, 4000);
  }

  $("showJoinBtn").onclick = () => {
    $("joinBox").classList.toggle("hidden");
    $("roomCodeInput").focus();
  };


  $("createRoomBtn").onclick = () => {

    const name = $("playerNameInput").value.trim();

    if (!name) {
      error($("landingError"), "Enter your name first.");
      return;
    }

    const button = $("createRoomBtn");
    button.disabled = true;
    button.textContent = "Creating...";

    socket.emit(
      "createRoom",
      { playerName: name },
      response => {

        button.disabled = false;
        button.textContent = "Create Room";

        if (!response || !response.success) {
          error(
            $("landingError"),
            response?.error || "Could not create room."
          );
          return;
        }

        myId = response.playerId;
        roomCode = response.roomCode;
        isHost = true;

        showLobby();
      }
    );
  };


  $("joinRoomBtn").onclick = joinRoom;

  $("roomCodeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") joinRoom();
  });

  function joinRoom() {

    const name = $("playerNameInput").value.trim();
    const code = $("roomCodeInput").value.trim().toUpperCase();

    if (!name) {
      error($("landingError"), "Enter your name first.");
      return;
    }

    if (!code) {
      error($("landingError"), "Enter the room code.");
      return;
    }

    socket.emit(
      "joinRoom",
      {
        roomCode: code,
        playerName: name
      },
      response => {

        if (!response || !response.success) {
          error(
            $("landingError"),
            response?.error || "Could not join room."
          );
          return;
        }

        myId = response.playerId;
        roomCode = response.roomCode;
        isHost = false;

        showLobby();
      }
    );
  }


  /* ================= LOBBY ================= */

  function showLobby() {

    $("lobbyRoomCode").textContent = roomCode;

    $("settingsPanel").classList.add("hidden");
    $("playersCard").classList.remove("hidden");

    page("lobby");
  }


  socket.on("roomState", data => {

    roomCode = data.code;
    isHost = data.hostId === myId;

    renderPlayers(data.players);

    if (pages.lobby.classList.contains("active")) {

      $("lobbyPlayerCount").textContent = data.players.length;

      if (isHost) {
        $("hostControls").classList.remove("hidden");
        $("guestWait").classList.add("hidden");
      } else {
        $("hostControls").classList.add("hidden");
        $("guestWait").classList.remove("hidden");
      }

    }

    if (pages.game.classList.contains("active")) {
      renderGamePlayers(data.players, data.drawerId);
    }
  });


  function renderPlayers(players) {

    $("lobbyPlayerList").innerHTML = "";

    players.forEach(player => {

      const li = document.createElement("li");

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent =
        player.name.charAt(0).toUpperCase();

      const name = document.createElement("span");
      name.textContent = player.name;

      li.appendChild(avatar);
      li.appendChild(name);

      if (player.isHost) {

        const host = document.createElement("span");
        host.className = "host";
        host.textContent = "HOST";

        li.appendChild(host);
      }

      $("lobbyPlayerList").appendChild(li);
    });
  }


  /* ================= SETTINGS ================= */

  $("settingsBtn").onclick = () => {

    if (!isHost) return;

    $("settingsPanel").classList.remove("hidden");
    $("playersCard").classList.add("hidden");
    $("hostControls").classList.add("hidden");
    $("guestWait").classList.add("hidden");
  };


  $("closeSettingsBtn").onclick = () => {

    $("settingsPanel").classList.add("hidden");
    $("playersCard").classList.remove("hidden");

    if (isHost) {
      $("hostControls").classList.remove("hidden");
    } else {
      $("guestWait").classList.remove("hidden");
    }
  };


  $("saveSettingsBtn").onclick = () => {

    const settings = {
      maxPlayers:
        Number($("maxPlayersSetting").value),

      rounds:
        Number($("roundsSetting").value),

      roundTime:
        Number($("timeSetting").value)
    };

    socket.emit("updateRoomSettings", settings, response => {

      if (!response?.success) {

        $("settingsMessage").textContent =
          response?.error || "Could not save settings.";

        return;
      }

      $("settingsMessage").textContent =
        "Settings saved ✓";

      setTimeout(() => {
        $("settingsMessage").textContent = "";
      }, 2000);
    });
  };


  socket.on("roomSettings", settings => {

    if (settings.maxPlayers)
      $("maxPlayersSetting").value = settings.maxPlayers;

    if (settings.rounds)
      $("roundsSetting").value = settings.rounds;

    if (settings.roundTime)
      $("timeSetting").value = settings.roundTime;
  });


  /* ================= COPY ================= */

  $("copyCodeBtn").onclick = async () => {

    try {
      await navigator.clipboard.writeText(roomCode);
      $("copyCodeBtn").textContent = "Copied!";

      setTimeout(() => {
        $("copyCodeBtn").textContent = "Copy";
      }, 1500);

    } catch {
      alert("Room code: " + roomCode);
    }
  };


  /* ================= START ================= */

  $("startGameBtn").onclick = () => {

    const btn = $("startGameBtn");

    btn.disabled = true;
    btn.textContent = "Starting...";

    socket.emit("startGame", {}, response => {

      btn.disabled = false;
      btn.textContent = "Start Game";

      if (!response?.success) {
        error(
          $("lobbyError"),
          response?.error || "Could not start game."
        );
      }
    });
  };


  /* ================= LEAVE ================= */

  $("leaveLobbyBtn").onclick = () => {
    leaveRoom();
  };

  $("leaveGameBtn").onclick = () => {
    if (confirm("Leave this room?")) {
      leaveRoom();
    }
  };

  function leaveRoom() {

    socket.emit("leaveRoom", {}, response => {

      myId = null;
      roomCode = "";
      isHost = false;
      isDrawer = false;

      $("chatMessages").innerHTML = "";
      $("playerNameInput").focus();

      page("landing");

      if (!response?.success) {
        console.warn(response?.error);
      }
    });
  }


  /* ================= GAME ================= */

  socket.on("newTurn", data => {

    page("game");

    isDrawer = data.drawerId === myId;

    $("roundDisplay").textContent =
      `${data.round} / ${data.totalRounds}`;

    $("wordHint").textContent = "";

    hideResult();

    clearLocalCanvas();

    if (isDrawer) {
      $("drawingTools").classList.remove("hidden");
      $("chatInput").placeholder = "You are drawing...";
    } else {
      $("drawingTools").classList.add("hidden");
      $("chatInput").placeholder = "Type your guess...";
    }

    setTimeout(resizeCanvas, 30);
  });


  /* ================= WORD CHOICE ================= */

  socket.on("wordChoices", data => {

    if (!isDrawer) return;

    const words = Array.isArray(data.words)
      ? data.words
      : [];

    if (words.length === 0) return;

    const container = $("wordChoiceButtons");

    container.innerHTML = "";

    words.slice(0, 3).forEach(word => {

      const button = document.createElement("button");

      button.className = "word-choice";
      button.textContent = word;

      button.onclick = () => {

        button.disabled = true;

        socket.emit(
          "chooseWord",
          { word },
          response => {

            if (response && !response.success) {
              button.disabled = false;
              alert(response.error);
            }
          }
        );
      };

      container.appendChild(button);
    });

    $("wordChoiceOverlay").classList.remove("hidden");
  });


  socket.on("roundStart", data => {

    $("wordChoiceOverlay").classList.add("hidden");

    if (data.isDrawer) {

      isDrawer = true;

      $("wordHint").textContent =
        "DRAW: " + data.word;

      $("wordHint").style.color =
        "#35d07f";

      $("drawingTools").classList.remove("hidden");

    } else {

      isDrawer = false;

      $("wordHint").textContent =
        data.hint || "";

      $("wordHint").style.color =
        "#7c5cff";

      $("drawingTools").classList.add("hidden");
    }

    setTimeout(resizeCanvas, 30);
  });


  socket.on("hintUpdate", data => {

    if (!isDrawer) {
      $("wordHint").textContent =
        data.hint || "";
    }
  });


  /* ================= TIMER ================= */

  socket.on("timer", data => {

    $("timer").textContent =
      Math.max(0, data.timeRemaining);
  });


  /* ================= RESULT ================= */

  socket.on("turnResult", data => {

    isDrawer = false;

    $("drawingTools").classList.add("hidden");

    $("revealedWord").textContent =
      data.word || "";

    $("turnResultOverlay").classList.remove("hidden");
  });


  function hideResult() {
    $("turnResultOverlay").classList.add("hidden");
  }


  /* ================= GAME PLAYERS ================= */

  function renderGamePlayers(players, drawerId) {

    $("gamePlayerList").innerHTML = "";

    [...players]
      .sort((a, b) => b.score - a.score)
      .forEach(player => {

        const li = document.createElement("li");

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent =
          player.name.charAt(0).toUpperCase();

        const name = document.createElement("span");
        name.textContent =
          player.name +
          (player.id === drawerId ? " ✎" : "");

        const score = document.createElement("span");
        score.className = "score";
        score.textContent = player.score;

        li.appendChild(avatar);
        li.appendChild(name);
        li.appendChild(score);

        $("gamePlayerList").appendChild(li);
      });
  }


  /* ================= CHAT ================= */

  function sendChat() {

    const input = $("chatInput");
    const message = input.value.trim();

    if (!message) return;

    socket.emit("chatMessage", { message });

    input.value = "";
    input.focus();
  }

  $("chatSendBtn").onclick = sendChat;

  $("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChat();
    }
  });


  socket.on("chatMessage", data => {

    const div = document.createElement("div");

    div.className =
      "chat-msg " + (data.type || "chat");

    if (data.sender) {

      const sender = document.createElement("span");
      sender.className = "msg-sender";
      sender.textContent = data.sender + ":";

      div.appendChild(sender);

      div.appendChild(
        document.createTextNode(" " + data.text)
      );

    } else {
      div.textContent = data.text || "";
    }

    $("chatMessages").appendChild(div);

    $("chatMessages").scrollTop =
      $("chatMessages").scrollHeight;
  });


  /* ================= CANVAS ================= */

  function resizeCanvas() {

    const rect =
      canvas.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) return;

    const dpr =
      Math.max(1, window.devicePixelRatio || 1);

    const oldWidth = canvas.width;
    const oldHeight = canvas.height;

    const oldImage =
      oldWidth && oldHeight
        ? ctx.getImageData(
            0,
            0,
            oldWidth,
            oldHeight
          )
        : null;

    canvas.width =
      Math.round(rect.width * dpr);

    canvas.height =
      Math.round(rect.height * dpr);

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (oldImage && oldWidth && oldHeight) {

      const temp =
        document.createElement("canvas");

      temp.width = oldWidth;
      temp.height = oldHeight;

      temp.getContext("2d")
        .putImageData(oldImage, 0, 0);

      ctx.drawImage(
        temp,
        0,
        0,
        oldWidth / dpr,
        oldHeight / dpr,
        0,
        0,
        rect.width,
        rect.height
      );
    }

    ctx.fillStyle = "white";

    if (!oldImage) {
      ctx.fillRect(
        0,
        0,
        rect.width,
        rect.height
      );
    }
  }


  function coordinates(event) {

    const rect =
      canvas.getBoundingClientRect();

    const point =
      event.touches
        ? event.touches[0]
        : event;

    return {
      x:
        (point.clientX - rect.left) /
        rect.width,

      y:
        (point.clientY - rect.top) /
        rect.height
    };
  }


  function draw(
    x1,
    y1,
    x2,
    y2,
    drawColor,
    drawSize,
    eraser
  ) {

    const rect =
      canvas.getBoundingClientRect();

    const a = {
      x: x1 * rect.width,
      y: y1 * rect.height
    };

    const b = {
      x: x2 * rect.width,
      y: y2 * rect.height
    };

    ctx.save();

    ctx.lineWidth = drawSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (eraser) {
      ctx.globalCompositeOperation =
        "destination-out";
    } else {
      ctx.globalCompositeOperation =
        "source-over";
      ctx.strokeStyle = drawColor;
    }

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.restore();
  }


  function clearLocalCanvas() {

    const rect =
      canvas.getBoundingClientRect();

    ctx.save();

    ctx.setTransform(
      1, 0, 0, 1, 0, 0
    );

    ctx.fillStyle = "white";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.restore();

    ctx.setTransform(
      window.devicePixelRatio || 1,
      0,
      0,
      window.devicePixelRatio || 1,
      0,
      0
    );
  }


  function startDrawing(e) {

    if (!isDrawer) return;

    e.preventDefault();

    const p = coordinates(e);

    drawing = true;

    lastX = p.x;
    lastY = p.y;

    draw(
      p.x,
      p.y,
      p.x,
      p.y,
      color,
      size,
      tool === "eraser"
    );

    socket.emit("draw", {
      type: "start",
      x: p.x,
      y: p.y,
      color,
      size,
      eraser: tool === "eraser"
    });
  }


  function moveDrawing(e) {

    if (!isDrawer || !drawing) return;

    e.preventDefault();

    const p = coordinates(e);

    draw(
      lastX,
      lastY,
      p.x,
      p.y,
      color,
      size,
      tool === "eraser"
    );

    socket.emit("draw", {
      type: "move",
      x1: lastX,
      y1: lastY,
      x2: p.x,
      y2: p.y,
      color,
      size,
      eraser: tool === "eraser"
    });

    lastX = p.x;
    lastY = p.y;
  }


  function stopDrawing() {

    if (!drawing) return;

    drawing = false;

    socket.emit("draw", {
      type: "end"
    });
  }


  canvas.addEventListener(
    "pointerdown",
    startDrawing
  );

  canvas.addEventListener(
    "pointermove",
    moveDrawing
  );

  window.addEventListener(
    "pointerup",
    stopDrawing
  );


  /* ================= REMOTE DRAW ================= */

  socket.on("draw", data => {

    if (data.type === "start") {

      draw(
        data.x,
        data.y,
        data.x,
        data.y,
        data.color,
        data.size,
        data.eraser
      );

    } else if (data.type === "move") {

      draw(
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


  socket.on("drawHistory", events => {

    clearLocalCanvas();

    events.forEach(data => {

      if (data.type === "start") {

        draw(
          data.x,
          data.y,
          data.x,
          data.y,
          data.color,
          data.size,
          data.eraser
        );

      } else if (data.type === "move") {

        draw(
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


  socket.on("clearCanvas", clearLocalCanvas);


  /* ================= TOOLS ================= */

  document.querySelectorAll(".color-btn")
    .forEach(button => {

      button.onclick = () => {

        document
          .querySelectorAll(".color-btn")
          .forEach(b =>
            b.classList.remove("active")
          );

        button.classList.add("active");

        color =
          button.dataset.color;

        tool = "pencil";

        $("pencilTool")
          .classList.add("active");

        $("eraserTool")
          .classList.remove("active");
      };
    });


  $("pencilTool").onclick = () => {

    tool = "pencil";

    $("pencilTool")
      .classList.add("active");

    $("eraserTool")
      .classList.remove("active");
  };


  $("eraserTool").onclick = () => {

    tool = "eraser";

    $("eraserTool")
      .classList.add("active");

    $("pencilTool")
      .classList.remove("active");
  };


  $("brushSize").oninput = e => {

    size = Number(e.target.value);

    $("brushSizeLabel").textContent =
      size;
  };


  $("clearBtn").onclick = () => {

    if (!isDrawer) return;

    clearLocalCanvas();

    socket.emit("clearCanvas");
  };


  window.addEventListener(
    "resize",
    () => {
      if (pages.game.classList.contains("active")) {
        resizeCanvas();
      }
    }
  );


  /* ================= GAME OVER ================= */

  socket.on("gameOver", data => {

    page("gameOver");

    $("podium").innerHTML = "";

    data.players.forEach((player, index) => {

      const div =
        document.createElement("div");

      div.textContent =
        `${index + 1}. ${player.name} — ${player.score} pts`;

      div.style.padding = "12px";

      $("podium").appendChild(div);
    });

    $("finalRankings").innerHTML = "";

    data.players.forEach(player => {

      const li =
        document.createElement("li");

      li.textContent =
        `${player.name} — ${player.score} pts`;

      $("finalRankings").appendChild(li);
    });
  });


  $("playAgainBtn").onclick = () => {
    socket.emit("playAgain");
  };


  $("backToLobbyBtn").onclick = () => {
    socket.emit("returnToLobby");
  };


  socket.on("returnToLobby", () => {
    showLobby();
  });


  function showLobby() {

    $("lobbyRoomCode").textContent =
      roomCode;

    page("lobby");
  }


  $("playerNameInput").focus();

})();
