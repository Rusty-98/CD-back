import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDb from './db/index.js';
import Room from './models/room.model.js';

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
}));

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true,
    }
});

connectDb();

// ─── IN-MEMORY CACHE ──────────────────────────────────────────────────────────
// Stores { name, roomId } for each connected socket
// Avoids a DB lookup on every single cursor move
const socketCache = new Map(); // socketId → { name, roomId }

io.on('connection', (socket) => {
    console.log("User connected: ", socket.id);

    // ─── JOIN ROOM ────────────────────────────────────────────────────────────
    socket.on('join', async ({ roomId, name }) => {

        if (!name || !roomId) {
            socket.emit('error', { message: 'Name and Room ID are required.' });
            return;
        }

        socket.join(roomId);
        console.log(`${name} joined room: ${roomId}`);

        // Cache immediately — available for cursor moves right away
        socketCache.set(socket.id, { name, roomId });

        try {
            let room = await Room.findOneAndUpdate(
                { roomId },
                {
                    $setOnInsert: {
                        roomId,
                        currentCode: '',
                        currentLang: 'java',
                    }
                },
                { upsert: true, new: true }
            );

            const alreadyIn = room.users.some(u => u.name === name);
            if (!alreadyIn) {
                room.users.push({ id: socket.id, name });
            } else {
                room.users = room.users.map(u =>
                    u.name === name ? { id: socket.id, name } : u
                );
            }

            await room.save();

            if (room.currentCode) {
                socket.emit('initialCode', {
                    value: room.currentCode,
                    lang: room.currentLang,
                });
            }

            socket.to(roomId).emit('otherJoined', { name });
            io.to(roomId).emit('allUsersInRoom', room.users);

        } catch (err) {
            console.error('join error:', err);
        }
    });

    // ─── CODE CHANGE (DIFF-BASED) ─────────────────────────────────────────────
    socket.on('codeChange', async ({ roomId, changes, fullCode }) => {
        socket.to(roomId).emit('codeChange', { changes });

        if (fullCode !== undefined) {
            try {
                await Room.findOneAndUpdate({ roomId }, { currentCode: fullCode });
            } catch (err) {
                console.error('codeChange persist error:', err);
            }
        }
    });

    // ─── CURSOR MOVE ──────────────────────────────────────────────────────────
    // Uses cache instead of DB — zero latency, no DB read
    socket.on('cursorMove', ({ roomId, cursor, selection }) => {
        const cached = socketCache.get(socket.id);
        if (!cached) return; // user not in cache yet, skip

        socket.to(roomId).emit('remoteCursor', {
            socketId: socket.id,
            name: cached.name,
            cursor,
            selection: selection || null,
        });
    });

    // ─── LANGUAGE CHANGE ──────────────────────────────────────────────────────
    socket.on('langChange', async ({ roomId, lang }) => {
        io.to(roomId).emit('langChange', lang);

        try {
            await Room.findOneAndUpdate({ roomId }, { currentLang: lang });
        } catch (err) {
            console.error('langChange persist error:', err);
        }
    });

    // ─── GET USERS ────────────────────────────────────────────────────────────
    socket.on('giveUsers', async ({ roomId }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (room) {
                io.to(roomId).emit('allUsersInRoom', room.users);
            }
        } catch (err) {
            console.error('giveUsers error:', err);
        }
    });

    // ─── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
        console.log("User disconnected: ", socket.id);

        // Clean up cache entry
        socketCache.delete(socket.id);

        try {
            const room = await Room.findOne({ 'users.id': socket.id });
            if (!room) return;

            const userIndex = room.users.findIndex(u => u.id === socket.id);
            if (userIndex === -1) return;

            const [disconnectedUser] = room.users.splice(userIndex, 1);

            io.to(room.roomId).emit('cursorDisconnected', { socketId: socket.id });
            io.to(room.roomId).emit('user-disconnected', { name: disconnectedUser.name });

            if (room.users.length === 0) {
                await Room.deleteOne({ roomId: room.roomId });
                console.log(`Room ${room.roomId} deleted (empty)`);
            } else {
                await room.save();
                io.to(room.roomId).emit('allUsersInRoom', room.users);
            }

        } catch (err) {
            console.error('disconnect error:', err);
        }
    });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.send("Server is running");
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});