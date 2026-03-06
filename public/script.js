const socket = io();

// DOM Elements
const views = {
    lobby: document.getElementById('lobby'),
    waiting: document.getElementById('waiting-room'),
    game: document.getElementById('game-board'),
    gameOver: document.getElementById('game-over')
};

const els = {
    playerName: document.getElementById('player-name'),
    roomId: document.getElementById('room-id'),
    btnCreate: document.getElementById('btn-create'),
    btnJoin: document.getElementById('btn-join'),
    playerCount: document.getElementById('player-count'),
    playersList: document.getElementById('players-list'),
    hostControls: document.getElementById('host-controls'),
    guestMessage: document.getElementById('guest-message'),
    tileUpload: document.getElementById('tile-upload'),
    previewContainer: document.getElementById('preview-container'),
    btnUpload: document.getElementById('btn-upload'),
    btnStart: document.getElementById('btn-start'),
    playerBanner: document.getElementById('player-banner'),
    nameDisplay: document.getElementById('player-name-display'),
    roomDisplay: document.getElementById('room-id-display'),

    // Game elements
    matchBoard: document.getElementById('match-board'),
    turnIndicator: document.getElementById('turn-indicator'),
    winnerName: document.getElementById('winner-name'),
    winnerScore: document.getElementById('winner-score'),

    // Players and Scores
    oppTopArea: document.querySelector('.opp-top'),
    oppTopScore: document.getElementById('opp-top-score'),
    oppLeftArea: document.querySelector('.opp-left'),
    oppLeftScore: document.getElementById('opp-left-score'),
    oppRightArea: document.querySelector('.opp-right'),
    oppRightScore: document.getElementById('opp-right-score'),
    myScore: document.getElementById('my-score'),
    myStatBox: document.querySelector('.my-stat')
};

// State
let myId = null;
let currentRoom = null;
let customTiles = []; // Base64 strings of uploaded images
let isMyTurn = false;

// --- Helper Functions ---

function showView(viewId) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewId].classList.remove('hidden');
}

function updatePlayersList(players) {
    els.playersList.innerHTML = '';
    els.playerCount.innerText = players.length;

    players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = `${p.name} ${p.isHost ? '(Host)' : ''} ${p.id === socket.id ? '(You)' : ''}`;
        if (p.id === socket.id && p.isHost) {
            els.hostControls.classList.remove('hidden');
            els.guestMessage.classList.add('hidden');
        }
        els.playersList.appendChild(li);
    });
}

function renderCard(cardData, index, isFlipped, isMatched) {
    const cardWrap = document.createElement('div');
    cardWrap.className = 'card';
    if (isMatched) cardWrap.classList.add('matched');
    else if (isFlipped) cardWrap.classList.add('flipped');

    const cardInner = document.createElement('div');
    cardInner.className = 'card-inner';

    const cardBack = document.createElement('div');
    cardBack.className = 'card-back';

    const cardFront = document.createElement('div');
    cardFront.className = 'card-front';
    const img = document.createElement('img');
    img.src = currentRoom.images[cardData.imageIndex];
    cardFront.appendChild(img);

    cardInner.appendChild(cardBack);
    cardInner.appendChild(cardFront);
    cardWrap.appendChild(cardInner);

    // Click to flip
    cardWrap.addEventListener('click', () => {
        // Rely on server validation, but locally check if it's our turn to prevent spam
        if (isMyTurn && !isMatched && !isFlipped) {
            socket.emit('flipCard', { roomId: currentRoom.id, cardIndex: index });
        }
    });

    return cardWrap;
}

function updateGameBoard(room) {
    const myIndex = room.players.findIndex(p => p.id === socket.id);
    const me = room.players[myIndex];

    if (!me) return;

    // Board
    els.matchBoard.innerHTML = '';
    room.board.forEach((card, index) => {
        const isFlipped = room.flippedCards.includes(index);
        const isMatched = card.matched;
        els.matchBoard.appendChild(renderCard(card, index, isFlipped, isMatched));
    });

    // Turn Indicator
    isMyTurn = (room.turnIndex === myIndex);
    const activePlayer = room.players[room.turnIndex];

    if (isMyTurn) {
        els.turnIndicator.innerText = "YOUR TURN!";
        els.turnIndicator.classList.add('active');
    } else {
        els.turnIndicator.innerText = `${activePlayer.name}'s Turn`;
        els.turnIndicator.classList.remove('active');
    }

    // Update Scores
    els.myScore.innerText = me.score;

    const numPlayers = room.players.length;
    const rightPlayer = room.players[(myIndex + 1) % numPlayers];
    const topPlayer = room.players[(myIndex + 2) % numPlayers];
    const leftPlayer = room.players[(myIndex + 3) % numPlayers];

    if (rightPlayer && numPlayers > 1) {
        els.oppRightArea.classList.remove('hidden');
        els.oppRightArea.firstChild.textContent = rightPlayer.name;
        els.oppRightScore.innerText = rightPlayer.score;
    } else {
        els.oppRightArea.classList.add('hidden');
    }

    if (topPlayer && numPlayers > 2) {
        els.oppTopArea.classList.remove('hidden');
        els.oppTopArea.firstChild.textContent = topPlayer.name;
        els.oppTopScore.innerText = topPlayer.score;
    } else {
        els.oppTopArea.classList.add('hidden');
    }

    if (leftPlayer && numPlayers > 3) {
        els.oppLeftArea.classList.remove('hidden');
        els.oppLeftArea.firstChild.textContent = leftPlayer.name;
        els.oppLeftScore.innerText = leftPlayer.score;
    } else {
        els.oppLeftArea.classList.add('hidden');
    }
}

// --- Event Listeners ---

els.btnCreate.addEventListener('click', () => {
    const name = els.playerName.value.trim();
    const roomId = els.roomId.value.trim();
    if (!name || !roomId) return alert('Name and Room ID required');

    socket.emit('createRoom', { roomId, playerName: name }, (res) => {
        if (res.success) {
            els.nameDisplay.innerText = name;
            els.roomDisplay.innerText = roomId;
            els.playerBanner.classList.remove('hidden');
            showView('waiting');
        } else {
            alert(res.message);
        }
    });
});

els.btnJoin.addEventListener('click', () => {
    const name = els.playerName.value.trim();
    const roomId = els.roomId.value.trim();
    if (!name || !roomId) return alert('Name and Room ID required');

    socket.emit('joinRoom', { roomId, playerName: name }, (res) => {
        if (res.success) {
            els.nameDisplay.innerText = name;
            els.roomDisplay.innerText = roomId;
            els.playerBanner.classList.remove('hidden');
            showView('waiting');
        } else {
            alert(res.message);
        }
    });
});

// Image Upload Handling (Host Only)
els.tileUpload.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    els.previewContainer.innerHTML = '';
    customTiles = [];

    if (files.length === 0) {
        els.btnUpload.disabled = true;
        return;
    }

    let loadedCount = 0;

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            customTiles.push(base64);

            // Show preview
            const img = document.createElement('img');
            img.src = base64;
            img.className = 'preview-img';
            els.previewContainer.appendChild(img);

            loadedCount++;
            if (loadedCount === files.length) {
                els.btnUpload.disabled = false;
            }
        };
        reader.readAsDataURL(file);
    });
});

els.btnUpload.addEventListener('click', () => {
    if (customTiles.length > 0 && currentRoom) {
        socket.emit('uploadTiles', { roomId: currentRoom.id, tileDataArray: customTiles });
        els.btnUpload.innerText = "Tiles Ready!";
        els.btnUpload.classList.replace('primary', 'success');
        els.btnStart.disabled = false;
    }
});

els.btnStart.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('startGame', currentRoom.id);
    }
});

// --- Socket Events ---

socket.on('updateRoom', (room) => {
    currentRoom = room;

    if (room.state === 'waiting') {
        updatePlayersList(room.players);
    } else if (room.state !== 'game_over') {
        // Game is active
        showView('game');
        updateGameBoard(room);
    }
});

socket.on('gameStarted', () => {
    showView('game');
});

socket.on('gameOver', ({ winner, score }) => {
    els.winnerName.innerText = winner;
    els.winnerScore.innerText = score;
    showView('gameOver');
});

socket.on('error', (msg) => {
    alert(msg);
});
