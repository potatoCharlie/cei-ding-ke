import type { Server, Socket } from 'socket.io';
import type { RPSChoice, PlayerAction } from '@cei-ding-ke/shared';
import { GameRoom } from '../../game/GameRoom.js';

// Room management
const rooms: Map<string, GameRoom> = new Map();

export function setupGameHandlers(io: Server, socket: Socket): void {
  // Create a new room
  socket.on('room:create', (data: { name: string }, callback) => {
    const room = new GameRoom(io);
    rooms.set(room.id, room);
    room.addPlayer(socket, data.name);

    callback({ roomId: room.id });
    console.log(`Room ${room.id} created by ${data.name} (${socket.id})`);
  });

  // Join an existing room
  socket.on('room:join', (data: { roomId: string; name: string }, callback) => {
    const room = rooms.get(data.roomId);
    if (!room) {
      callback({ error: 'Room not found' });
      return;
    }

    if (room.isFull) {
      callback({ error: 'Room is full' });
      return;
    }

    room.addPlayer(socket, data.name);
    callback({ roomId: room.id });
    console.log(`${data.name} (${socket.id}) joined room ${room.id}`);
  });

  // Quick match: find or create a room
  socket.on('room:quickmatch', (data: { name: string; heroId: string }, callback) => {
    // Find a room that's waiting for a player
    let room: GameRoom | undefined;
    for (const [, r] of rooms) {
      if (!r.isFull && r.playerCount === 1) {
        room = r;
        break;
      }
    }

    if (!room) {
      room = new GameRoom(io);
      rooms.set(room.id, room);
    }

    room.addPlayer(socket, data.name);
    room.selectHero(socket.id, data.heroId);
    callback({ roomId: room.id });
    console.log(`${data.name} quick-matched into room ${room.id}`);
  });

  // Select a hero
  socket.on('hero:select', (data: { heroId: string }) => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    room.selectHero(socket.id, data.heroId);
  });

  // Submit RPS choice
  socket.on('rps:submit', (data: { choice: RPSChoice }) => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    room.handleRPSSubmit(socket.id, data.choice);
  });

  // Submit action
  socket.on('action:submit', (data: PlayerAction) => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    room.handleActionSubmit(socket.id, data);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const room = findPlayerRoom(socket.id);
    if (room) {
      room.removePlayer(socket.id);
      if (room.playerCount === 0) {
        room.destroy();
        rooms.delete(room.id);
        console.log(`Room ${room.id} destroyed (empty)`);
      }
    }
    console.log(`Player disconnected: ${socket.id}`);
  });
}

function findPlayerRoom(socketId: string): GameRoom | undefined {
  for (const [, room] of rooms) {
    if (room.hasPlayer(socketId)) return room;
  }
  return undefined;
}
