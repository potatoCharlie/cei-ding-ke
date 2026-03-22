import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { setupGameHandlers } from './socket/handlers/game.js';
import { getAllHeroes } from '@cei-ding-ke/shared';

const PORT = parseInt(process.env.PORT || '3001', 10);

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:3000'],
});

// REST API: list heroes
fastify.get('/api/heroes', async () => {
  return getAllHeroes();
});

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok' };
});

// Start HTTP server
await fastify.listen({ port: PORT, host: '0.0.0.0' });

// Attach Socket.IO to the same HTTP server
const io = new Server(fastify.server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  setupGameHandlers(io, socket);
});

console.log(`🎮 cei-ding-ke server running on port ${PORT}`);
