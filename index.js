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
    origin: "https://cd-front-xi.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
}));

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://cd-front-xi.vercel.app",
        methods: ["GET", "POST"],
        credentials: true,
    }
});

connectDb();

io.on('connection', (socket) => {
    console.log("User connected: ", socket.id);

    socket.on('join', async ({ roomId, name }) => {
        socket.join(roomId);
        console.log("User joined room: ", roomId);

        try {
            let room = await Room.findOne({ roomId });

            if (!room) {
                console.log("making new room in Db")
                room = new Room({
                    roomId,
                    users: [{ id: socket.id, name }],
                });
            } else {
                room.users.push({ id: socket.id, name });
                console.log("pushing to exist room in Db")
            }

            await room.save();

            console.log(name);
            socket.to(roomId).emit('otherJoined', { name });

            // Emit the list of all users in the room
            io.to(roomId).emit('allUsersInRoom', room.users);

        } catch (err) {
            console.error(err);
        }
    });

    socket.on('giveUsers', async ({ roomId }) => {
        try {
            const room = await Room.findOne({ roomId });

            if (room) {
                io.to(roomId).emit('allUsersInRoom', room.users);
                console.log(room.users)
            }
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('requestInitialCode', async (roomId) => {
        try {
            const room = await Room.findOne({ roomId });
            if (room) {
                const initialCode = room.initialCode || "// Initial code";
                socket.emit('initialCode', { value: initialCode });
            }
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('codeChange', async ({ roomId, value }) => {
        io.to(roomId).emit('codeChange', { value });
        // Update the initial code in the room
        try {
            const room = await Room.findOne({ roomId });
            if (room) {
                room.initialCode = value;
                await room.save();
            }
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const rooms = await Room.find();

            for (const room of rooms) {
                const userIndex = room.users.findIndex(user => user.id === socket.id);
                if (userIndex !== -1) {
                    const disconnectedUser = room.users.splice(userIndex, 1)[0];
                    io.to(room.roomId).emit('user-disconnected', { name: disconnectedUser.name });

                    if (room.users.length === 0) {
                        await Room.deleteOne({ roomId: room.roomId });
                    } else {
                        await room.save();
                    }
                    break;
                }
            }
        } catch (err) {
            console.error(err);
        }
    });

});

app.get('/', function (req, res) {
    res.send("Server is running");
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
