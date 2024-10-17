const express = require('express');
const http = require('https');
const socketIO = require('socket.io');
const cors = require('cors');
const {v4: uuidv4} = require('uuid');
const fs = require('fs');

const privateKey = fs.readFileSync('./localhost-key.pem', 'utf8');
const certificate = fs.readFileSync('./localhost-cert.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const app = express();

app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://192.168.1.58:5173',
      'https://192.168.1.58:5173',
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({extended: true}));

const server = http.createServer(credentials, app);
const io = socketIO(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://192.168.1.58:5173',
      'https://192.168.1.58:5173',
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Access-Control-Allow-Origin'],
    credentials: true,
  },
});
const rooms = {};

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.post('/create-room', (req, res) => {
  const {password} = req.body;
  const roomId = uuidv4();
  rooms[roomId] = {
    password,
    users: [],
  };
  res.json({roomId});
});

app.post('/join-room', (req, res) => {
  const {roomId, password} = req.body;
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({message: 'Room not found'});
  }

  if (room.password && room.password !== password) {
    return res.status(401).json({message: 'Incorrect password'});
  }

  res.json({message: 'Joined room'});
});

// WebRTC sinyalleşmesi ve gerçek zamanlı veri transferi için Socket.IO
io.on('connection', (socket) => {
  socket.on('joinRoom', ({roomId, username}) => {
    if (!rooms[roomId]) {
      return socket.emit('error', {message: 'Room not found'});
    }

    socket.join(roomId);
    console.log('A user joined room: ' + roomId);

    rooms[roomId].users.push({
      id: socket.id,
      username,
    });

    io.to(roomId).emit('roomData', rooms[roomId]);
  });

  // WebRTC offer/answer
  socket.on('offer', ({offer, roomId}) => {
    socket.to(roomId).emit('offer', offer); // Teklifi odadaki diğer kullanıcılara gönder
  });

  socket.on('answer', ({answer, roomId}) => {
    socket.to(roomId).emit('answer', answer); // Cevabı karşı tarafa ilet
  });

  // ICE Candidate'leri paylaşma
  socket.on('ice-candidate', ({candidate, roomId}) => {
    socket.to(roomId).emit('ice-candidate', candidate); // ICE candidate bilgilerini gönder
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const userIndex = room.users.findIndex((user) => user.id === socket.id);

      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        io.to(roomId).emit('roomData', room);
      }
    }
  });
});

server.listen(3001, '0.0.0.0', () => {
  console.log('Server running on port 3001');
});
