import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

const port = process.env.PORT || 3000;
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ["GET", "POST"],
        credentials: true,
    }
});


const rooms = new Map();

io.on('connection', (socket) => {
    console.log("User connected: ", socket.id);

    socket.on('join', ({ roomId, name }) => {
        socket.join(roomId);
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                users: [{ id: socket.id, name }],
            });
        } else {
            const room = rooms.get(roomId);
            room.users.push({ id: socket.id, name });
        }
        console.log(name)
        socket.to(roomId).emit('otherJoinied', { name });

        socket.on('giveUsers', ({ roomId }) => {
            let allUsers = rooms.get(roomId).users;
            console.log(allUsers)
            io.to(roomId).emit('allusersInRoom', allUsers);
        })

    })

    socket.on("audio", ({ roomId, stream }) => {
        console.log(roomId)
        socket.to(roomId).emit('audio', { stream });
    })


    socket.on('codeChange', ({ roomId, value }) => {
        io.to(roomId).emit('codeChange', { value });
    });

    socket.on('langChange', ({ roomId, lang }) => {
        io.to(roomId).emit('langChange', { lang });
    });




    socket.on('disconnect', () => {
        for (const [roomId, room] of rooms.entries()) {
            const userIndex = room.users.findIndex(user => user.id === socket.id);
            if (userIndex !== -1) {
                const disconnectedUser = room.users.splice(userIndex, 1)[0];
                io.to(roomId).emit('user-disconnected', { name: disconnectedUser.name });

                if (room.users.length === 0) {
                    rooms.delete(roomId);
                }
                break;
            }
        }
    });

});



app.use(cors());

app.get('/', function (req, res) {
    res.send("Server is running");
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
