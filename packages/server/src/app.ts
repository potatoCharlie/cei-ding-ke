import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { setupGameHandlers } from './socket/handlers/game.js';
import { getAllHeroes } from '@cei-ding-ke/shared';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

const PORT = parseInt(process.env.PORT || '3001', 10);

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: corsOrigins,
});

// REST API: list heroes
fastify.get('/api/heroes', async () => {
  return getAllHeroes();
});

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok' };
});

// Serve static client files in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDistPath = join(__dirname, '../../client/dist');

if (existsSync(clientDistPath)) {
  await fastify.register(fastifyStatic, {
    root: clientDistPath,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: serve index.html for non-API routes
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/socket.io/')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    return reply.sendFile('index.html');
  });
}

// Start HTTP server
await fastify.listen({ port: PORT, host: '0.0.0.0' });

// Attach Socket.IO to the same HTTP server
const io = new Server(fastify.server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  setupGameHandlers(io, socket);
});

console.log(`🎮 cei-ding-ke server running on port ${PORT}`);
