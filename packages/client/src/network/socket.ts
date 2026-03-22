import { io, Socket } from 'socket.io-client';

const URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

export const socket: Socket = io(URL, {
  autoConnect: false,
});

export function connectSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.connect();
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
}
