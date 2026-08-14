// ============================================================
// GuessToWin CLIENT
// ============================================================

(() => {

"use strict";


/* ========================================================= */
/* SOCKET */
/* ========================================================= */

const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
});


/* ========================================================= */
/* STATE */
/* ========================================================= */

let myPlayerId = null;
let myPlayerName = "";
let roomCode = null;

let isHost = false;
let isDrawer = false;

let currentGameState = "landing";

let currentRoundTime = 80;

let drawing = false;

let lastX = 0;
let lastY = 0;

let currentColor = "#000000";
let currentBrushSize = 5;
let currentTool = "pencil";


/* ========================================================= */
/* HELPERS */
/* ========================================================= */

const $ = id =>
    document.getElementById(id);


function showPage(name) {

    document
        .querySelectorAll(".page")
        .forEach(page => {
            page.classList.remove("active");
        });

    const page = $(name + "Page");

    if (page) {
        page.classList.add("active");
    }

    currentGameState = name;

    if (name === "game") {
        setTimeout(resizeCanvas, 50);
    }

}


function showError(element, message) {

    if (!element) return;

    element.textContent = message;
    element.classList.remove("hidden");

    setTimeout(() => {
        element.classList.add("hidden");
    }, 5000);

}


function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent = text;

    return div.innerHTML;

}


/* ========================================================= */
/* DOM */
/* ========================================================= */

const playerNameInput =
    $("playerNameInput");

const roomCodeInput =
    $("roomCodeInput");

const createRoomBtn =
    $("createRoomBtn");

const joinRoomBtn =
    $("joinRoomBtn");

const landingError =
    $("landingError");


const lobbyRoomCode =
    $("lobbyRoomCode");

const copyCodeBtn =
    $("copyCodeBtn");

const lobbyPlayerList =
    $("lobbyPlayerList");

const lobbyPlayerCount =
    $("lobbyPlayerCount");

const hostControls =
    $("hostControls");

const waitMessage =
    $("waitMessage");

const startGameBtn =
    $("startGameBtn");

const settingsBtn =
    $("settingsBtn");

const roomSettings =
    $("roomSettings");

const saveSettingsBtn =
    $("saveSettingsBtn");

const maxPlayersSelect =
    $("maxPlayersSelect");

const roundsSelect =
    $("roundsSelect");

const roundTimeSelect =
    $("roundTimeSelect");

const settingsError =
    $("settingsError");

const lobbyError =
    $("lobbyError");

const leaveLobbyBtn =
    $("leaveLobbyBtn");


const roundDisplay =
    $("roundDisplay");

const timerText =
    $("timerText");

const wordHint =
    $("wordHint");

const leaveGameBtn =
    $("leaveGameBtn");

const wordChoiceOverlay =
    $("wordChoiceOverlay");

const wordChoiceButtons =
    $("wordChoiceButtons");

const turnResultOverlay =
    $("turnResultOverlay");

const revealedWord =
    $("revealedWord");

const gamePlayerList =
    $("gamePlayerList");

const chatMessages =
    $("chatMessages");

const chatInput =
    $("chatInput");

const chatSendBtn =
    $("chatSendBtn");

const drawingTools =
    $("drawingTools");

const canvas =
    $("drawCanvas");

const ctx =
    canvas.getContext("2d");


const colorBtns =
    document.querySelectorAll(
        ".color-btn"
    );

const pencilTool =
    $("pencilTool");

const eraserTool =
    $("eraserTool");

const clearBtn =
    $("clearBtn");

const brushSize =
    $("brushSize");

const brushSizeLabel =
    $("brushSizeLabel");


const podium =
    $("podium");

const finalRankings =
    $("finalRankings");

const playAgainBtn =
    $("playAgainBtn");

const backToLobbyBtn =
    $("backToLobbyBtn");

const leaveGameOverBtn =
    $("leaveGameOverBtn");

const gameOverHostNote =
    $("gameOverHostNote");


const connectionStatus =
    $("connectionStatus");

const connectionText =
    $("connectionText");


/* ========================================================= */
/* SOCKET CONNECTION */
/* ========================================================= */

socket.on("connect", () => {

    console.log(
        "GuessToWin connected:",
        socket.id
    );

    connectionStatus.classList.add(
        "hidden"
    );

});


socket.on("connect_error", error => {

    console.error(
        "Socket connection error:",
        error
    );

    connectionStatus.classList.remove(
        "hidden"
    );

    connectionText.textContent =
        "Cannot connect to server.";

});


socket.on("disconnect", () => {

    connectionStatus.classList.remove(
        "hidden"
    );

    connectionText.textContent =
        "Disconnected — reconnecting...";

});


/* ========================================================= */
/* CREATE ROOM */
/* ========================================================= */

createRoomBtn.addEventListener(
    "click",
    createRoom
);


function createRoom() {

    const name =
        playerNameInput.value.trim();

    landingError.classList.add(
        "hidden"
    );

    if (!name) {

        showError(
            landingError,
            "Please enter your name."
        );

        playerNameInput.focus();

        return;
    }


    if (!socket.connected) {

        showError(
            landingError,
            "Server is not connected. Start server.js first."
        );

        return;
    }


    myPlayerName =
        name.substring(0, 20);


    createRoomBtn.disabled =
        true;

    createRoomBtn.textContent =
        "Creating...";


    console.log(
        "Sending createRoom:",
        myPlayerName
    );


    socket.emit(
        "createRoom",
        {
            playerName:
                myPlayerName
        },
        response => {

            console.log(
                "CREATE RESPONSE:",
                response
            );


            createRoomBtn.disabled =
                false;

            createRoomBtn.textContent =
                "+ Create Room";


            if (!response) {

                showError(
                    landingError,
                    "No response from server."
                );

                return;
            }


            if (!response.success) {

                showError(
                    landingError,
                    response.error ||
                    "Could not create room."
                );

                return;
            }


            myPlayerId =
                response.playerId;

            roomCode =
                response.roomCode;

            isHost =
                true;


            console.log(
                "ROOM CREATED:",
                roomCode
            );


            lobbyRoomCode.textContent =
                roomCode;


            showPage("lobby");

        }
    );

}


/* ========================================================= */
/* JOIN ROOM */
/* ========================================================= */

joinRoomBtn.addEventListener(
    "click",
    joinRoom
);


function joinRoom() {

    const name =
        playerNameInput.value.trim();

    const code =
        roomCodeInput.value
            .trim()
            .toUpperCase();


    if (!name) {

        showError(
            landingError,
            "Please enter your name."
        );

        return;
    }


    if (!code) {

        showError(
            landingError,
            "Please enter a room code."
        );

        return;
    }


    if (!socket.connected) {

        showError(
            landingError,
            "Server is not connected."
        );

        return;
    }


    myPlayerName =
        name.substring(0, 20);


    joinRoomBtn.disabled =
        true;

    joinRoomBtn.textContent =
        "Joining...";


    socket.emit(
        "joinRoom",
        {
            playerName:
                myPlayerName,

            roomCode:
                code
        },
        response => {

            joinRoomBtn.disabled =
                false;

            joinRoomBtn.textContent =
                "Join Room";


            console.log(
                "JOIN RESPONSE:",
                response
            );


            if (!response) {

                showError(
                    landingError,
                    "No response from server."
                );

                return;
            }


            if (!response.success) {

                showError(
                    landingError,
                    response.error ||
                    "Could not join room."
                );

                return;
            }


            myPlayerId =
                response.playerId;

            roomCode =
                response.roomCode;

            isHost =
                false;


            lobbyRoomCode.textContent =
                roomCode;


            showPage("lobby");

        }
    );

}


/* ========================================================= */
/* ENTER KEY */
/* ========================================================= */

playerNameInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            createRoom();

        }

    }
);


roomCodeInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            joinRoom();

        }

    }
);


/* ========================================================= */
/* ROOM STATE */
/* ========================================================= */

socket.on(
    "roomState",
    data => {

        console.log(
            "ROOM STATE:",
            data
        );


        if (!data) return;


        roomCode =
            data.code;

        isHost =
            data.hostId ===
            myPlayerId;


        lobbyRoomCode.textContent =
            data.code;


        const players =
            data.players || [];


        lobbyPlayerCount.textContent =
            `(${players.length})`;


        lobbyPlayerList.innerHTML =
            "";


        players.forEach(
            (player, index) => {

                const li =
                    document.createElement(
                        "li"
                    );

                li.innerHTML = `
                    <span>
                        ${index + 1}.
                        ${escapeHtml(player.name)}
                    </span>

                    ${
                        player.isHost
                        ? `<span class="host-badge">HOST</span>`
                        : ""
                    }
                `;

                lobbyPlayerList.appendChild(
                    li
                );

            }
        );


        /* HOST */

        if (
            data.state === "lobby"
        ) {

            showPage("lobby");


            if (isHost) {

                hostControls.classList.remove(
                    "hidden"
                );

                waitMessage.classList.add(
                    "hidden"
                );

                settingsBtn.classList.remove(
                    "hidden"
                );

            } else {

                hostControls.classList.remove(
                    "hidden"
                );

                startGameBtn.classList.add(
                    "hidden"
                );

                settingsBtn.classList.add(
                    "hidden"
                );

                waitMessage.classList.remove(
                    "hidden"
                );

            }


            if (
                data.settings
            ) {

                maxPlayersSelect.value =
                    data.settings.maxPlayers;

                roundsSelect.value =
                    data.settings.rounds;

                roundTimeSelect.value =
                    data.settings.roundTime;

            }

        }


        /* GAME */

        if (
            data.state === "choosing" ||
            data.state === "playing" ||
            data.state === "roundResult"
        ) {

            if (
                currentGameState !==
                "game"
            ) {

                showPage("game");

            }


            if (
                data.totalRounds
            ) {

                roundDisplay.textContent =
                    `Round ${data.roundNumber} / ${data.totalRounds}`;

            }


            updateGamePlayers(
                players,
                data.drawerId
            );

        }

    }
);


/* ========================================================= */
/* SETTINGS */
/* ========================================================= */

settingsBtn.addEventListener(
    "click",
    () => {

        roomSettings.classList.toggle(
            "hidden"
        );

    }
);


saveSettingsBtn.addEventListener(
    "click",
    () => {

        const settings = {

            maxPlayers:
                Number(
                    maxPlayersSelect.value
                ),

            rounds:
                Number(
                    roundsSelect.value
                ),

            roundTime:
                Number(
                    roundTimeSelect.value
                )

        };


        socket.emit(
            "setRoomSettings",
            settings,
            response => {

                console.log(
                    "SETTINGS RESPONSE:",
                    response
                );


                if (
                    !response ||
                    !response.success
                ) {

                    showError(
                        settingsError,
                        response?.error ||
                        "Could not save settings."
                    );

                    return;
                }


                roomSettings.classList.add(
                    "hidden"
                );

            }
        );

    }
);


/* ========================================================= */
/* START GAME */
/* ========================================================= */

startGameBtn.addEventListener(
    "click",
    () => {

        startGameBtn.disabled =
            true;

        socket.emit(
            "startGame",
            {},
            response => {

                startGameBtn.disabled =
                    false;


                if (
                    !response ||
                    !response.success
                ) {

                    showError(
                        lobbyError,
                        response?.error ||
                        "Could not start game."
                    );

                }

            }
        );

    }
);


/* ========================================================= */
/* COPY ROOM */
/* ========================================================= */

copyCodeBtn.addEventListener(
    "click",
    async () => {

        if (!roomCode) return;


        try {

            await navigator.clipboard.writeText(
                roomCode
            );

            copyCodeBtn.textContent =
                "Copied!";

        } catch {

            const temp =
                document.createElement(
                    "textarea"
                );

            temp.value =
                roomCode;

            document.body.appendChild(
                temp
            );

            temp.select();

            document.execCommand(
                "copy"
            );

            temp.remove();

            copyCodeBtn.textContent =
                "Copied!";

        }


        setTimeout(
            () => {

                copyCodeBtn.textContent =
                    "Copy";

            },
            1500
        );

    }
);


/* ========================================================= */
/* LEAVE ROOM */
/* ========================================================= */

function leaveRoom() {

    socket.emit(
        "leaveRoom"
    );

}


leaveLobbyBtn.addEventListener(
    "click",
    leaveRoom
);


leaveGameBtn.addEventListener(
    "click",
    leaveRoom
);


leaveGameOverBtn.addEventListener(
    "click",
    leaveRoom
);


socket.on(
    "leftRoom",
    () => {

        myPlayerId = null;

        roomCode = null;

        isHost = false;

        isDrawer = false;

        currentGameState =
            "landing";


        wordChoiceOverlay.classList.add(
            "hidden"
        );

        turnResultOverlay.classList.add(
            "hidden"
        );


        playerNameInput.value =
            myPlayerName;


        roomCodeInput.value =
            "";


        showPage(
            "landing"
        );

    }
);


/* ========================================================= */
/* NEW TURN */
/* ========================================================= */

socket.on(
    "newTurn",
    data => {

        console.log(
            "NEW TURN:",
            data
        );


        showPage("game");


        isDrawer =
            data.drawerId ===
            myPlayerId;


        roundDisplay.textContent =
            `Round ${data.round} / ${data.totalRounds}`;


        wordHint.textContent =
            "";


        wordHint.style.color =
            "";


        turnResultOverlay.classList.add(
            "hidden"
        );


        wordChoiceOverlay.classList.add(
            "hidden"
        );


        clearLocalCanvas();


        if (isDrawer) {

            drawingTools.classList.remove(
                "hidden"
            );

            chatInput.placeholder =
                "You are drawing...";

        } else {

            drawingTools.classList.add(
                "hidden"
            );

            chatInput.placeholder =
                "Type your guess...";

        }


        resizeCanvas();

    }
);


/* ========================================================= */
/* 3 WORD CHOICES */
/* ========================================================= */

socket.on(
    "wordChoices",
    data => {

        console.log(
            "WORD CHOICES:",
            data
        );


        if (
            !data ||
            !Array.isArray(
                data.words
            )
        ) {

            return;

        }


        wordChoiceButtons.innerHTML =
            "";


        data.words
            .slice(0, 3)
            .forEach(
                word => {

                    const button =
                        document.createElement(
                            "button"
                        );

                    button.className =
                        "word-choice-btn";

                    button.textContent =
                        word;


                    button.addEventListener(
                        "click",
                        () => {

                            socket.emit(
                                "chooseWord",
                                {
                                    word:
                                        word
                                }
                            );


                            wordChoiceOverlay.classList.add(
                                "hidden"
                            );

                        }
                    );


                    wordChoiceButtons.appendChild(
                        button
                    );

                }
            );


        wordChoiceOverlay.classList.remove(
            "hidden"
        );

    }
);


/* ========================================================= */
/* ROUND START */
/* ========================================================= */

socket.on(
    "roundStart",
    data => {

        wordChoiceOverlay.classList.add(
            "hidden"
        );


        if (data.isDrawer) {

            isDrawer =
                true;

            drawingTools.classList.remove(
                "hidden"
            );

            wordHint.textContent =
                data.word;

            wordHint.style.color =
                "#6bcb77";

        } else {

            isDrawer =
                false;

            drawingTools.classList.add(
                "hidden"
            );

            wordHint.textContent =
                data.hint;

            wordHint.style.color =
                "";

        }


        resizeCanvas();

    }
);


/* ========================================================= */
/* HINT */
/* ========================================================= */

socket.on(
    "hintUpdate",
    data => {

        if (!isDrawer) {

            wordHint.textContent =
                data.hint;

        }

    }
);


/* ========================================================= */
/* TIMER */
/* ========================================================= */

socket.on(
    "timer",
    data => {

        const time =
            Number(
                data.timeRemaining
            );


        timerText.textContent =
            time;


        if (
            time <= 10
        ) {

            timerText.style.color =
                "#ff5252";

        } else if (
            time <= 20
        ) {

            timerText.style.color =
                "#ffd93d";

        } else {

            timerText.style.color =
                "#ffffff";

        }

    }
);


/* ========================================================= */
/* ROUND RESULT */
/* ========================================================= */

socket.on(
    "turnResult",
    data => {

        isDrawer =
            false;


        drawingTools.classList.add(
            "hidden"
        );


        revealedWord.textContent =
            data.word;


        wordHint.textContent =
            data.word;


        turnResultOverlay.classList.remove(
            "hidden"
        );

    }
);


/* ========================================================= */
/* GAME OVER */
/* ========================================================= */

socket.on(
    "gameOver",
    data => {

        showPage(
            "gameOver"
        );


        renderGameOver(
            data.players || []
        );

    }
);


/* ========================================================= */
/* GAME PLAYERS */
/* ========================================================= */

function updateGamePlayers(
    players,
    drawerId
) {

    gamePlayerList.innerHTML =
        "";


    const sorted =
        [...players]
            .sort(
                (a, b) =>
                    b.score - a.score
            );


    sorted.forEach(
        player => {

            const li =
                document.createElement(
                    "li"
                );


            if (
                player.id ===
                drawerId
            ) {

                li.classList.add(
                    "drawing"
                );

            }


            li.innerHTML = `

                <span>
                    ${escapeHtml(
                        player.name
                    )}
                </span>

                ${
                    player.id === drawerId
                    ? "<span>✏️</span>"
                    : ""
                }

                <span class="gp-score">
                    ${player.score}
                </span>

            `;


            gamePlayerList.appendChild(
                li
            );

        }
    );

}


/* ========================================================= */
/* CHAT */
/* ========================================================= */

function sendChat() {

    const message =
        chatInput.value.trim();


    if (!message) return;


    socket.emit(
        "chatMessage",
        {
            message
        }
    );


    chatInput.value =
        "";

}


chatSendBtn.addEventListener(
    "click",
    sendChat
);


chatInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            event.preventDefault();

            sendChat();

        }

    }
);


socket.on(
    "chatMessage",
    data => {

        const div =
            document.createElement(
                "div"
            );


        div.className =
            `chat-msg ${data.type || ""}`;


        if (
            data.type === "chat" &&
            data.sender
        ) {

            div.innerHTML =
                `<span class="msg-sender">
                    ${escapeHtml(data.sender)}:
                </span>
                ${escapeHtml(data.text)}`;

        } else {

            div.textContent =
                data.text || "";

        }


        chatMessages.appendChild(
            div
        );


        chatMessages.scrollTop =
            chatMessages.scrollHeight;

    }
);


/* ========================================================= */
/* CANVAS SIZE */
/* ========================================================= */

function resizeCanvas() {

    if (!canvas) return;


    const container =
        canvas.parentElement;


    if (!container) return;


    const rect =
        container.getBoundingClientRect();


    if (
        rect.width <= 0 ||
        rect.height <= 0
    ) {

        return;

    }


    const oldWidth =
        canvas.width;

    const oldHeight =
        canvas.height;


    if (
        Math.abs(
            oldWidth -
            rect.width
        ) < 2 &&
        Math.abs(
            oldHeight -
            rect.height
        ) < 2
    ) {

        return;

    }


    let image = null;


    if (
        oldWidth > 0 &&
        oldHeight > 0
    ) {

        try {

            image =
                ctx.getImageData(
                    0,
                    0,
                    oldWidth,
                    oldHeight
                );

        } catch {}

    }


    canvas.width =
        Math.floor(
            rect.width
        );

    canvas.height =
        Math.floor(
            rect.height
        );


    ctx.lineCap =
        "round";

    ctx.lineJoin =
        "round";


    if (image) {

        try {

            ctx.putImageData(
                image,
                0,
                0
            );

        } catch {}

    }

}


/* ========================================================= */
/* CANVAS CLEAR */
/* ========================================================= */

function clearLocalCanvas() {

    if (
        !canvas.width ||
        !canvas.height
    ) {

        resizeCanvas();

    }


    ctx.save();

    ctx.globalCompositeOperation =
        "source-over";

    ctx.fillStyle =
        "#ffffff";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.restore();

}


/* ========================================================= */
/* COORDINATES */
/* ========================================================= */

function getCoordinates(event) {

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
            (clientX -
            rect.left) /
            rect.width,

        y:
            (clientY -
            rect.top) /
            rect.height

    };

}


/* ========================================================= */
/* DRAW LINE */
/* ========================================================= */

function drawLine(
    x1,
    y1,
    x2,
    y2,
    color,
    size,
    eraser
) {

    const px1 =
        x1 * canvas.width;

    const py1 =
        y1 * canvas.height;

    const px2 =
        x2 * canvas.width;

    const py2 =
        y2 * canvas.height;


    ctx.save();


    if (eraser) {

        ctx.globalCompositeOperation =
            "destination-out";

        ctx.strokeStyle =
            "rgba(0,0,0,1)";

    } else {

        ctx.globalCompositeOperation =
            "source-over";

        ctx.strokeStyle =
            color;

    }


    ctx.lineWidth =
        size;

    ctx.lineCap =
        "round";

    ctx.lineJoin =
        "round";


    ctx.beginPath();

    ctx.moveTo(
        px1,
        py1
    );

    ctx.lineTo(
        px2,
        py2
    );

    ctx.stroke();


    ctx.restore();

}


/* ========================================================= */
/* START DRAW */
/* ========================================================= */

function startDrawing(event) {

    if (!isDrawer) return;


    event.preventDefault();


    drawing =
        true;


    const point =
        getCoordinates(
            event
        );


    lastX =
        point.x;

    lastY =
        point.y;


    drawLine(
        point.x,
        point.y,
        point.x,
        point.y,
        currentColor,
        currentBrushSize,
        currentTool === "eraser"
    );


    socket.emit(
        "draw",
        {

            type:
                "start",

            x:
                point.x,

            y:
                point.y,

            color:
                currentColor,

            size:
                currentBrushSize,

            eraser:
                currentTool === "eraser"

        }
    );

}


/* ========================================================= */
/* MOVE DRAW */
/* ========================================================= */

function moveDrawing(event) {

    if (
        !isDrawer ||
        !drawing
    ) {

        return;

    }


    event.preventDefault();


    const point =
        getCoordinates(
            event
        );


    drawLine(
        lastX,
        lastY,
        point.x,
        point.y,
        currentColor,
        currentBrushSize,
        currentTool === "eraser"
    );


    socket.emit(
        "draw",
        {

            type:
                "move",

            x1:
                lastX,

            y1:
                lastY,

            x2:
                point.x,

            y2:
                point.y,

            color:
                currentColor,

            size:
                currentBrushSize,

            eraser:
                currentTool === "eraser"

        }
    );


    lastX =
        point.x;

    lastY =
        point.y;

}


/* ========================================================= */
/* END DRAW */
/* ========================================================= */

function endDrawing() {

    if (!isDrawer) return;


    drawing =
        false;


    socket.emit(
        "draw",
        {
            type:
                "end"
        }
    );

}


/* ========================================================= */
/* CANVAS EVENTS */
/* ========================================================= */

canvas.addEventListener(
    "mousedown",
    startDrawing
);

canvas.addEventListener(
    "mousemove",
    moveDrawing
);

canvas.addEventListener(
    "mouseup",
    endDrawing
);

canvas.addEventListener(
    "mouseleave",
    endDrawing
);


canvas.addEventListener(
    "touchstart",
    startDrawing,
    {
        passive: false
    }
);

canvas.addEventListener(
    "touchmove",
    moveDrawing,
    {
        passive: false
    }
);

canvas.addEventListener(
    "touchend",
    endDrawing
);

canvas.addEventListener(
    "touchcancel",
    endDrawing
);


/* ========================================================= */
/* RECEIVE DRAW */
/* ========================================================= */

socket.on(
    "draw",
    data => {

        if (
            data.type ===
            "start"
        ) {

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


        if (
            data.type ===
            "move"
        ) {

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

    }
);


/* ========================================================= */
/* DRAW HISTORY */
/* ========================================================= */

socket.on(
    "drawHistory",
    events => {

        clearLocalCanvas();


        if (
            !Array.isArray(events)
        ) {

            return;

        }


        events.forEach(
            data => {

                if (
                    data.type ===
                    "start"
                ) {

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


                if (
                    data.type ===
                    "move"
                ) {

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

            }
        );

    }
);


/* ========================================================= */
/* CLEAR CANVAS */
/* ========================================================= */

clearBtn.addEventListener(
    "click",
    () => {

        if (!isDrawer) return;


        clearLocalCanvas();


        socket.emit(
            "clearCanvas"
        );

    }
);


socket.on(
    "clearCanvas",
    () => {

        clearLocalCanvas();

    }
);


/* ========================================================= */
/* COLORS */
/* ========================================================= */

colorBtns.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                colorBtns.forEach(
                    b =>
                        b.classList.remove(
                            "active"
                        )
                );


                button.classList.add(
                    "active"
                );


                currentColor =
                    button.dataset.color;


                currentTool =
                    "pencil";


                pencilTool.classList.add(
                    "active"
                );

                eraserTool.classList.remove(
                    "active"
                );

            }
        );

    }
);


/* ========================================================= */
/* PENCIL */
/* ========================================================= */

pencilTool.addEventListener(
    "click",
    () => {

        currentTool =
            "pencil";

        pencilTool.classList.add(
            "active"
        );

        eraserTool.classList.remove(
            "active"
        );

    }
);


/* ========================================================= */
/* ERASER */
/* ========================================================= */

eraserTool.addEventListener(
    "click",
    () => {

        currentTool =
            "eraser";

        eraserTool.classList.add(
            "active"
        );

        pencilTool.classList.remove(
            "active"
        );

    }
);


/* ========================================================= */
/* BRUSH SIZE */
/* ========================================================= */

brushSize.addEventListener(
    "input",
    () => {

        currentBrushSize =
            Number(
                brushSize.value
            );

        brushSizeLabel.textContent =
            currentBrushSize;

    }
);


/* ========================================================= */
/* GAME OVER */
/* ========================================================= */

function renderGameOver(players) {

    podium.innerHTML =
        "";


    finalRankings.innerHTML =
        "";


    players.forEach(
        (player, index) => {

            const li =
                document.createElement(
                    "li"
                );


            li.innerHTML = `
                <strong>
                    ${escapeHtml(player.name)}
                </strong>

                <span style="float:right">
                    ${player.score} pts
                </span>
            `;


            finalRankings.appendChild(
                li
            );


            if (index < 3) {

                const div =
                    document.createElement(
                        "div"
                    );

                div.style.margin =
                    "8px";

                div.innerHTML = `
                    #${index + 1}
                    ${escapeHtml(player.name)}
                    —
                    ${player.score} pts
                `;

                podium.appendChild(
                    div
                );

            }

        }
    );


    if (isHost) {

        playAgainBtn.classList.remove(
            "hidden"
        );

        backToLobbyBtn.classList.remove(
            "hidden"
        );

        gameOverHostNote.classList.add(
            "hidden"
        );

    } else {

        playAgainBtn.classList.add(
            "hidden"
        );

        backToLobbyBtn.classList.add(
            "hidden"
        );

        gameOverHostNote.classList.remove(
            "hidden"
        );

    }

}


playAgainBtn.addEventListener(
    "click",
    () => {

        socket.emit(
            "playAgain"
        );

    }
);


backToLobbyBtn.addEventListener(
    "click",
    () => {

        socket.emit(
            "returnToLobby"
        );

    }
);


socket.on(
    "returnToLobby",
    () => {

        chatMessages.innerHTML =
            "";

        showPage(
            "lobby"
        );

    }
);


/* ========================================================= */
/* RESIZE */
/* ========================================================= */

window.addEventListener(
    "resize",
    () => {

        if (
            currentGameState ===
            "game"
        ) {

            resizeCanvas();

        }

    }
);


/* ========================================================= */
/* INITIAL */
/* ========================================================= */

ctx.lineCap =
    "round";

ctx.lineJoin =
    "round";


setTimeout(
    () => {

        playerNameInput.focus();

    },
    100
);


})();