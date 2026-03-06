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
    btnLeave: document.getElementById('btn-leave'),

    // Audio Controls
    btnMute: document.getElementById('btn-mute'),
    volumeSlider: document.getElementById('volume-slider'),
    bgMusic: document.getElementById('bg-music'),

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
let isMuted = false;

// Initialize Audio
els.bgMusic.volume = els.volumeSlider.value;

// --- Helper Functions ---

function showView(viewId) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewId].classList.remove('hidden');
}

function updatePlayersList(players, gameMode) {
    els.playersList.innerHTML = '';
    els.playerCount.innerText = players.length;

    players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = `${p.name} ${p.isHost ? '(Host)' : ''} ${p.id === socket.id ? '(You)' : ''}`;
        if (p.id === socket.id && p.isHost) {
            els.hostControls.classList.remove('hidden');
            els.guestMessage.classList.add('hidden');

            // Handle Mode Visibility
            const uploadSection = document.querySelector('.upload-section');
            if (gameMode === 'default') {
                uploadSection.classList.add('hidden');
                els.btnStart.disabled = false;
            } else {
                uploadSection.classList.remove('hidden');
                // If switching back to custom, check if we already have tiles
                els.btnStart.disabled = (customTiles.length === 0);
            }
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
        if (isMyTurn && !isMatched && !isFlipped && currentRoom.flippedCards.length < 2) {
            // Optimistic UI: flip immediately before round trip
            cardWrap.classList.add('flipped');
            isFlipped = true;
            currentRoom.flippedCards.push(index); // locally track it to prevent double clicking

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
    const modeEl = document.querySelector('input[name="game-mode"]:checked');
    const gameMode = modeEl ? modeEl.value : 'default';

    if (!name || !roomId) return alert('Name and Room ID required');

    socket.emit('createRoom', { roomId, playerName: name, gameMode }, (res) => {
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

els.btnLeave.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('leaveRoom', currentRoom.id);
        currentRoom = null;
        els.playerBanner.classList.add('hidden');
        showView('lobby');
    }
});

// Audio Controls
els.btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    els.bgMusic.muted = isMuted;
    els.btnMute.innerText = isMuted ? '🔇' : '🔊';
});

els.volumeSlider.addEventListener('input', (e) => {
    els.bgMusic.volume = e.target.value;
    if (isMuted && e.target.value > 0) {
        isMuted = false;
        els.bgMusic.muted = false;
        els.btnMute.innerText = '🔊';
    }
});

// Function to try autoplaying music (browsers often block this until interaction)
const tryPlayMusic = () => {
    if (els.bgMusic.paused) {
        els.bgMusic.play().catch(e => console.log("Waiting for user interaction to play audio.", e));
    }
};

// Add interaction listeners to start music on first click if blocked
document.body.addEventListener('click', tryPlayMusic, { once: true });

// Image Upload Handling (Host Only)
els.tileUpload.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const errorEl = document.getElementById('upload-error');
    els.previewContainer.innerHTML = '';
    customTiles = [];
    errorEl.classList.add('hidden');
    els.btnUpload.disabled = true;

    if (files.length === 0) {
        return;
    }

    if (files.length > 5) {
        errorEl.innerText = "Please select a maximum of 5 images.";
        errorEl.classList.remove('hidden');
        return;
    }

    let loadedCount = 0;

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 300; // Small size perfect for game tiles
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress as JPEG
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                customTiles.push(compressedBase64);

                // Show preview
                const previewImg = document.createElement('img');
                previewImg.src = compressedBase64;
                previewImg.className = 'preview-img';
                els.previewContainer.appendChild(previewImg);

                loadedCount++;
                if (loadedCount === files.length) {
                    els.btnUpload.disabled = false;
                }
            };
            img.src = event.target.result;
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
        updatePlayersList(room.players, room.gameMode);
    } else if (room.state !== 'game_over') {
        // Game is active
        showView('game');
        updateGameBoard(room);
    }
});

// Efficient state updates during gameplay (avoids resending images)
socket.on('updateState', (state) => {
    if (currentRoom) {
        Object.assign(currentRoom, state);
        if (currentRoom.state !== 'game_over') {
            updateGameBoard(currentRoom);
        }
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
