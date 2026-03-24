import type { Server, Socket } from 'socket.io';
import type { RPSChoice, PlayerAction } from '@cei-ding-ke/shared';
import { GameRoom } from '../../game/GameRoom.js';

// Room management
const rooms: Map<string, GameRoom> = new Map();

export function setupGameHandlers(io: Server, socket: Socket): void {
  // Create a new room
  socket.on('room:create', (data: { name: string; mode?: '1v1' | '2v2' }, callback) => {
    const mode = data.mode ?? '1v1';
    const room = new GameRoom(io, mode);
    rooms.set(room.id, room);
    room.addPlayer(socket, data.name);

    callback({ roomId: room.id, mode });
    console.log(`Room ${room.id} created by ${data.name} (${socket.id}), mode=${mode}`);
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
    callback({ roomId: room.id, mode: room.gameMode });
    console.log(`${data.name} (${socket.id}) joined room ${room.id} (mode=${room.gameMode})`);
  });

  // Quick match: find or create a room
  socket.on('room:quickmatch', (data: { name: string; heroId: string; mode?: '1v1' | '2v2' }, callback) => {
    const mode = data.mode ?? '1v1';

    // Find a waiting room of the same mode with at least one player already in it.
    // >= 1 (not === 1) so that partially-filled 2v2 rooms (2 or 3 players) can still be joined.
    let room: GameRoom | undefined;
    for (const [, r] of rooms) {
      if (!r.isFull && r.playerCount >= 1 && r.gameMode === mode) {
        room = r;
        break;
      }
    }

    if (!room) {
      room = new GameRoom(io, mode);
      rooms.set(room.id, room);
    }

    room.addPlayer(socket, data.name);
    room.selectHero(socket.id, data.heroId);
    callback({ roomId: room.id, mode });
    console.log(`${data.name} quick-matched into room ${room.id} (mode=${mode})`);
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
