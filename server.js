const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // Allow larger file uploads (100MB)
});

app.use(express.static('public'));

const rooms = {};

// Predefined images for Default Mode (using high-quality abstract colorful images)
const DEFAULT_IMAGES = [
    'nannu.jpg', // Gradient 1
    'pixnova-f39cd205dbe9068f23d172fc302eef7e.png', // Gradient 2
    'nannu3.png', // Gradient 3
    'image.png', // Gradient 4
    'gumaaro.jpg'  // Gradient 5
];

// Helper to sanitize room names
const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('createRoom', ({ roomId, playerName, gameMode }, callback) => {
        roomId = sanitize(roomId);
        if (rooms[roomId]) {
            callback({ success: false, message: 'Room already exists' });
            return;
        }

        rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, name: playerName, isHost: true, score: 0 }],
            gameStarted: false,
            gameMode: gameMode || 'default',
            board: [],
            flippedCards: [], // indices of currently flipped cards
            lockBoard: false, // prevent flipping when resolving a turn
            turnIndex: 0,
            images: [], // To store custom tile imagery
            state: 'waiting',
            totalMatches: 0
        };

        // Auto-assign images if default mode
        if (rooms[roomId].gameMode === 'default') {
            rooms[roomId].images = DEFAULT_IMAGES;
        }

        socket.join(roomId);
        callback({ success: true });
        io.to(roomId).emit('updateRoom', rooms[roomId]);
    });

    socket.on('joinRoom', ({ roomId, playerName }, callback) => {
        roomId = sanitize(roomId);
        const room = rooms[roomId];

        if (!room) {
            callback({ success: false, message: 'Room not found' });
            return;
        }

        if (room.players.length >= 4) {
            callback({ success: false, message: 'Room is full' });
            return;
        }

        if (room.gameStarted) {
            callback({ success: false, message: 'Game already started' });
            return;
        }

        room.players.push({ id: socket.id, name: playerName, isHost: false, score: 0 });
        socket.join(roomId);
        callback({ success: true });
        io.to(roomId).emit('updateRoom', room);
    });

    socket.on('uploadTiles', ({ roomId, tileDataArray }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.players[0].id !== socket.id) return;

        // store base64 string, max 5
        room.images = tileDataArray.slice(0, 5);
        io.to(roomId).emit('updateRoom', room);
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.players[0].id !== socket.id) return;

        // Final check: if custom mode, must have images. If default, they are already there.
        if (room.images.length === 0) {
            socket.emit('error', 'Must upload tiles first');
            return;
        }

        room.gameStarted = true;

        // Match the tile logic: 2 copies of each image (or multiples of 2 to ensure enough cards)
        // Let's ensure a decent sized board (e.g., at least 16 or 24 cards if few images are uploaded)
        room.board = [];
        let copiesNeeded = 2;
        if (room.images.length < 8) {
            copiesNeeded = Math.ceil(16 / room.images.length);
            if (copiesNeeded % 2 !== 0) copiesNeeded += 1; // keep it even for matching pairs
        }

        room.images.forEach((imgData, index) => {
            for (let i = 0; i < copiesNeeded; i++) {
                room.board.push({ id: `${index}-${i}`, imageIndex: index, matched: false });
            }
        });

        // Shuffle Board
        room.board.sort(() => Math.random() - 0.5);

        room.state = 'playing';
        room.turnIndex = 0;
        room.totalMatches = 0;
        room.flippedCards = [];
        room.lockBoard = false;

        room.players.forEach(p => p.score = 0);

        io.to(roomId).emit('gameStarted');
        emitState(roomId, room);
    });

    // Helper function to emit state without heavy base64 strings
    function emitState(roomId, room) {
        const payload = { ...room };
        delete payload.images; // Omit massive base64 payload
        io.to(roomId).emit('updateState', payload);
    }

    socket.on('flipCard', ({ roomId, cardIndex }) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'playing' || room.lockBoard) return;

        const currentPlayer = room.players[room.turnIndex];
        if (currentPlayer.id !== socket.id) return;

        const card = room.board[cardIndex];
        // If card already matched or already flipped, ignore
        if (card.matched || room.flippedCards.includes(cardIndex)) return;

        room.flippedCards.push(cardIndex);

        // Broadcast the flip immediately
        emitState(roomId, room);

        // Check for match if 2 cards are flipped
        if (room.flippedCards.length === 2) {
            room.lockBoard = true;

            const [index1, index2] = room.flippedCards;
            const card1 = room.board[index1];
            const card2 = room.board[index2];

            if (card1.imageIndex === card2.imageIndex) {
                // Match!
                setTimeout(() => {
                    card1.matched = true;
                    card2.matched = true;
                    room.flippedCards = [];
                    room.totalMatches += 1;
                    currentPlayer.score += 1;
                    room.lockBoard = false;

                    // Check Game Over
                    if (room.totalMatches * 2 >= room.board.length) {
                        room.state = 'game_over';
                        // Find winner
                        let maxScore = -1;
                        let winners = [];
                        room.players.forEach(p => {
                            if (p.score > maxScore) {
                                maxScore = p.score;
                                winners = [p.name];
                            } else if (p.score === maxScore) {
                                winners.push(p.name);
                            }
                        });
                        io.to(roomId).emit('gameOver', { winner: winners.join(' & '), score: maxScore });
                    }

                    // You keep your turn if you score!
                    emitState(roomId, room);
                }, 1000); // 1s delay so players see the match

            } else {
                // No Match
                setTimeout(() => {
                    room.flippedCards = [];
                    room.turnIndex = (room.turnIndex + 1) % room.players.length;
                    room.lockBoard = false;
                    emitState(roomId, room);
                }, 1500); // 1.5s delay so players see what they missed
            }
        }
    });

    const handlePlayerLeave = (socketId) => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socketId);
            if (playerIndex !== -1) {
                // If they leave, remove from players array
                room.players.splice(playerIndex, 1);

                // Have the socket physically leave the socket.io room
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) {
                    targetSocket.leave(roomId);
                }

                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    if (playerIndex === 0) {
                        room.players[0].isHost = true;
                    }
                    if (room.turnIndex >= room.players.length) {
                        room.turnIndex = 0;
                    }
                    io.to(roomId).emit('updateRoom', room);
                }
                break;
            }
        }
    };

    socket.on('leaveRoom', () => {
        handlePlayerLeave(socket.id);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        handlePlayerLeave(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
