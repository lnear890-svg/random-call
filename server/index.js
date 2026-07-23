// Simple Express + Socket.io matchmaking/signaling server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 4000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

app.get('/', (req, res) => {
  res.send('Random Call signaling server is running.');
});

const queue = [];
const pairs = new Map(); // socketId => partnerId

function removeFromQueue(socketId) {
  const idx = queue.indexOf(socketId);
  if (idx !== -1) queue.splice(idx, 1);
}

function tryMatch() {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    // Save pair
    pairs.set(a, b);
    pairs.set(b, a);
    // One side is initiator (a)
    io.to(a).emit('matched', { peerId: b, initiator: true });
    io.to(b).emit('matched', { peerId: a, initiator: false });
  }
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('join-queue', () => {
    // Avoid duplicates
    if (!queue.includes(socket.id) && !pairs.has(socket.id)) {
      queue.push(socket.id);
      tryMatch();
    }
  });

  socket.on('leave-queue', () => {
    removeFromQueue(socket.id);
  });

  // Forward signaling messages to the intended recipient
  // payload: { to, data }
  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // When one wants to immediately find next partner
  socket.on('next', () => {
    const partner = pairs.get(socket.id);
    if (partner) {
      // notify partner that this user left
      io.to(partner).emit('partner-left');
      // remove pairing
      pairs.delete(partner);
      pairs.delete(socket.id);
    }
    // requeue the requester if not already queued
    removeFromQueue(socket.id);
    queue.push(socket.id);
    tryMatch();
  });

  // Client can explicitly request requeue after partner left
  socket.on('requeue', () => {
    if (!queue.includes(socket.id) && !pairs.has(socket.id)) {
      queue.push(socket.id);
      tryMatch();
    }
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    removeFromQueue(socket.id);

    const partner = pairs.get(socket.id);
    if (partner) {
      // Inform partner and clean pairing
      io.to(partner).emit('partner-left');
      pairs.delete(partner);
      pairs.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server listening on ${PORT}`);
});
