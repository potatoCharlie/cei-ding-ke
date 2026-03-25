# 2v2 Server & Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2v2 mode to the server (4-player rooms, team assignment, lobby sync) and client (mode selection, team roster lobby, 2v2-aware battle UI).

**Architecture:** The game engine already supports 2v2 (`createGameState(id, '2v2', players[])`). This plan wires it into the server (GameRoom.ts handles 4 players) and client (App.tsx gains mode selection and a team-roster lobby). The battle screen (BattleScene.tsx, ActionPanel.tsx) already iterates all teams/players and requires no structural changes — only the informational overlays (RPS waiting counts, action-turn messages) need minor updates.

**Tech Stack:** TypeScript, Node.js/Fastify/Socket.IO (server), React/Vite (client). No new libraries.

**Spec:** `docs/superpowers/specs/2026-03-23-2v2-engine-design.md` (engine is done; server/client are new).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/src/types/protocol.ts` | Modify | Add `lobby:update` event and `LobbyUpdateData` type; add `total` to `rps:waiting` |
| `packages/server/src/game/GameRoom.ts` | Modify | Support `mode` ('1v1'/'2v2'), dynamic `maxPlayers`, alternating team assignment, emit `lobby:update`, 2v2 hero duplicate check, 4-player forfeit on disconnect |
| `packages/server/src/socket/handlers/game.ts` | Modify | Accept `mode` in `room:create` and `room:join`; filter `room:quickmatch` by mode |
| `packages/client/src/App.tsx` | Modify | Add `mode` state + toggle; pass mode to socket events; listen to `lobby:update`; show team roster in lobby; update RPS waiting/action messages |

BattleScene.tsx, ActionPanel.tsx, and other client components require no changes. **HeroSelect.tsx** requires no structural changes, but see Task 3 for a known UX gap around taken-hero display.

---

### Task 1: Protocol Types — `lobby:update` and `rps:waiting` total

**Files:**
- Modify: `packages/shared/src/types/protocol.ts`

This must be done first; server and client tasks both depend on these types.

- [ ] **Step 1: Add `LobbyPlayerData` and `LobbyUpdateData` types, update `rps:waiting`, update `ServerEvents`**

```typescript
// In protocol.ts, after PlayerStats:

export interface LobbyPlayerData {
  id: string;
  name: string;
  heroId: string;   // empty string if not yet selected
  teamIndex: number;
  ready: boolean;
}

export interface LobbyUpdateData {
  mode: '1v1' | '2v2';
  players: LobbyPlayerData[];
}
```

Update the `rps:waiting` line in `ServerEvents`:
```typescript
'rps:waiting': (data: { submitted: string[]; total: number }) => void;
```

Add `lobby:update` to `ServerEvents`:
```typescript
'lobby:update': (data: LobbyUpdateData) => void;
```

- [ ] **Step 2: Build shared to verify types compile**

```bash
npm run build:shared
```
Expected: builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/protocol.ts
git commit -m "feat: add lobby:update and rps:waiting total to protocol types"
```

---

### Task 2: Server — GameRoom 2v2 Support

**Files:**
- Modify: `packages/server/src/game/GameRoom.ts`

Key design:
- Team assignment: alternating by join order (1st join = team 0, 2nd = team 1, 3rd = team 0, 4th = team 1)
- `isFull` uses `maxPlayers` (2 for 1v1, 4 for 2v2)
- After any player joins or selects a hero → emit `lobby:update` to the room
- Before starting the game → validate no duplicate heroes; emit an error if violated
- On disconnect mid-game → the disconnected player's team forfeits

- [ ] **Step 1: Update `RoomPlayer` interface and constructor**

> **Import note:** Keep `isStunned` in the import from `@cei-ding-ke/shared` — it is used in `handleRPSSubmit` (Step 6) and in `beginRPSPhase`. Add `type GameMode` to the import if not already present.

Replace the `RoomPlayer` interface and constructor area:

```typescript
interface RoomPlayer {
  id: string;
  name: string;
  heroId: string;
  socket: Socket;
  ready: boolean;
  teamIndex: number;   // NEW: assigned when player joins
}

export class GameRoom {
  readonly id: string;
  private mode: '1v1' | '2v2';
  private maxPlayers: number;
  private players: Map<string, RoomPlayer> = new Map();
  private state: GameState | null = null;
  private io: Server;
  private rpsTimer: ReturnType<typeof setTimeout> | null = null;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(io: Server, mode: '1v1' | '2v2' = '1v1') {
    this.id = uuid().slice(0, 8);
    this.io = io;
    this.mode = mode;
    this.maxPlayers = mode === '2v2' ? 4 : 2;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  get gameMode(): '1v1' | '2v2' {
    return this.mode;
  }
```

- [ ] **Step 2: Update `addPlayer` to assign teamIndex and emit `lobby:update`**

Replace the `addPlayer` method:

```typescript
addPlayer(socket: Socket, name: string): boolean {
  if (this.isFull) return false;

  // Alternating team assignment by join order
  const joinIndex = this.players.size;
  const teamIndex = joinIndex % 2;  // 0→team0, 1→team1, 2→team0, 3→team1

  const player: RoomPlayer = {
    id: socket.id,
    name,
    heroId: '',
    socket,
    ready: false,
    teamIndex,
  };

  this.players.set(socket.id, player);
  socket.join(this.id);

  this.io.to(this.id).emit('player:joined', { playerId: socket.id, name });
  this.emitLobbyUpdate();

  return true;
}
```

- [ ] **Step 3: Add `emitLobbyUpdate` helper**

Add this private method to the class:

```typescript
private emitLobbyUpdate(): void {
  const players = Array.from(this.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    heroId: p.heroId,
    teamIndex: p.teamIndex,
    ready: p.ready,
  }));
  this.io.to(this.id).emit('lobby:update', { mode: this.mode, players });
}
```

- [ ] **Step 4: Update `selectHero` for dynamic player count and hero uniqueness**

Replace the `selectHero` method:

```typescript
selectHero(socketId: string, heroId: string): void {
  const player = this.players.get(socketId);
  if (!player) return;

  // Check for duplicate hero across all current selections
  for (const [id, p] of this.players) {
    if (id !== socketId && p.heroId === heroId) {
      player.socket.emit('error', { message: `${heroId} is already taken by another player` });
      return;
    }
  }

  player.heroId = heroId;
  player.ready = true;
  this.emitLobbyUpdate();

  // Start game when all slots filled and all players ready
  const allReady = Array.from(this.players.values()).every(p => p.ready && p.heroId);
  if (allReady && this.players.size === this.maxPlayers) {
    this.startGame();
  }
}
```

- [ ] **Step 5: Update `startGame` to use the new multi-player signature**

Replace the `startGame` method:

```typescript
private startGame(): void {
  const playerInputs = Array.from(this.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    heroId: p.heroId,
    teamIndex: p.teamIndex,
  }));

  this.state = createGameState(this.id, this.mode, playerInputs);

  this.io.to(this.id).emit('game:state', this.state);
  this.beginRPSPhase();
}
```

- [ ] **Step 6: Add all-players-stunned guard to `beginRPSPhase`**

In `beginRPSPhase`, the existing logic handles the case where *some* players are stunned. Add a guard for the 2v2 edge case where **all** alive players are stunned simultaneously (can't happen in 1v1, possible in 2v2 if both teams have stunned players). Find the stun check block and update it:

```typescript
if (stunnedPlayers.length > 0 && nonStunnedPlayers.length === 0) {
  // All alive players are stunned — skip the entire round
  // Tick was already applied above; just begin the next RPS phase
  this.io.to(this.id).emit('game:phase', {
    phase: 'rps_submit',
    turn: this.state.turn,
  });
  this.startRPSTimer();
  return;
}
```

Place this block *before* the existing `if (stunnedPlayers.length > 0 && nonStunnedPlayers.length > 0)` check.

- [ ] **Step 7: Update `handleRPSSubmit` — `rps:waiting` now includes `total`**

In `handleRPSSubmit`, add `total` to the `rps:waiting` emit:

```typescript
handleRPSSubmit(socketId: string, choice: RPSChoice): void {
  if (!this.state || this.state.phase !== 'rps_submit') return;

  const allSubmitted = submitRPS(this.state, socketId, choice);

  const submitted = Object.keys(this.state.pendingRPS).filter(
    id => this.state!.pendingRPS[id] != null,
  );
  // Count non-stunned alive players (those expected to submit)
  const total = this.state.teams
    .flatMap(t => t.players)
    .filter(p => p.hero.alive && !isStunned(p.hero))
    .length;

  this.io.to(this.id).emit('rps:waiting', { submitted, total });

  if (allSubmitted) {
    this.clearTimers();
    this.resolveRPS();
  }
}
```

- [ ] **Step 8: Update `removePlayer` for 4-player forfeit**

Replace the `removePlayer` method. Keep the guard that checks remaining players exist before forfeiting (prevents spurious `game:end` if all players disconnect simultaneously):

```typescript
removePlayer(socketId: string): void {
  const leavingPlayer = this.players.get(socketId);
  this.players.delete(socketId);
  this.io.to(this.id).emit('player:left', { playerId: socketId });

  const remainingPlayers = Array.from(this.players.keys());
  if (this.state && this.state.winner === null && leavingPlayer !== undefined && remainingPlayers.length > 0) {
    // The leaving player's team forfeits — the other team wins
    const winningTeam = leavingPlayer.teamIndex === 0 ? 1 : 0;
    this.state.winner = winningTeam;
    this.state.phase = 'game_over';
    this.io.to(this.id).emit('game:end', {
      winnerTeam: winningTeam,
      stats: {},
    });
  }
}
```

- [ ] **Step 9: Build shared + server to verify no type errors**

```bash
npm run build:shared && cd packages/server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/game/GameRoom.ts
git commit -m "feat: add 2v2 room support (mode, team assignment, lobby sync, duplicate hero check)"
```

---

### Task 3: Server — Room Creation Handler Updates

**Files:**
- Modify: `packages/server/src/socket/handlers/game.ts`

- [ ] **Step 1: Update `room:create` to accept `mode`**

Replace the `room:create` handler:

```typescript
socket.on('room:create', (data: { name: string; mode?: '1v1' | '2v2' }, callback) => {
  const mode = data.mode ?? '1v1';
  const room = new GameRoom(io, mode);
  rooms.set(room.id, room);
  room.addPlayer(socket, data.name);

  callback({ roomId: room.id, mode });
  console.log(`Room ${room.id} created by ${data.name} (${socket.id}), mode=${mode}`);
});
```

- [ ] **Step 2: Update `room:join` to validate mode**

Replace the `room:join` handler to reject mismatched modes:

```typescript
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
```

> Note: `room:join` does not accept a `mode` parameter — the room's mode is set by the creator and the joiner simply inherits it. The client receives `mode` in the callback so it can show the correct lobby.

- [ ] **Step 3: Update `room:quickmatch` to accept and filter by `mode`**

Replace the `room:quickmatch` handler. Use `>= 1` instead of `=== 1` so partially-filled 2v2 rooms (2 or 3 players) can still be joined via quick match:

```typescript
socket.on('room:quickmatch', (data: { name: string; heroId: string; mode?: '1v1' | '2v2' }, callback) => {
  const mode = data.mode ?? '1v1';

  // Find a waiting room of the same mode with at least one player
  // (>= 1 instead of === 1 supports 2v2 rooms waiting for 2nd/3rd/4th player)
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
```

- [ ] **Step 4: Build server to verify**

```bash
npm run build:shared && cd packages/server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/handlers/game.ts
git commit -m "feat: room:create/join/quickmatch accept and propagate mode parameter"
```

---

### Task 4: Client — Mode Selection

**Files:**
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Add `mode` state and toggle to the App**

At the top of the `App` component, after the existing state declarations, add:

```typescript
const [mode, setMode] = useState<'1v1' | '2v2'>('1v1');
```

- [ ] **Step 2: Update `handleCreateRoom` to pass mode**

```typescript
const handleCreateRoom = async () => {
  if (!playerName.trim()) { setError('Enter your name'); return; }
  try {
    await connectSocket();
    socket.emit('room:create', { name: playerName, mode }, (res: { roomId: string; mode: '1v1' | '2v2' }) => {
      setRoomId(res.roomId);
      setScreen('hero_select');
      addLog(`Room created: ${res.roomId} (${mode})`);
    });
  } catch {
    setError('Failed to connect to server');
  }
};
```

- [ ] **Step 3: Update `handleQuickMatch` to pass mode**

```typescript
const handleQuickMatch = async () => {
  if (!playerName.trim() || !selectedHero) { setError('Enter name and select a hero'); return; }
  try {
    await connectSocket();
    socket.emit('room:quickmatch', { name: playerName, heroId: selectedHero, mode }, (res: { roomId: string }) => {
      setRoomId(res.roomId);
      setScreen('battle');
      addLog(`Quick match! Room: ${res.roomId}`);
    });
  } catch {
    setError('Failed to connect to server');
  }
};
```

- [ ] **Step 4: Add mode toggle to the menu UI**

In the menu card where "Create Room" lives, add a mode selector just above the Create Room button. Find this block:

```tsx
<button className="game-btn game-btn-primary" onClick={handleCreateRoom}>
  Create Room
</button>
```

Replace with:

```tsx
<div className="mode-toggle">
  <button
    className={`mode-btn ${mode === '1v1' ? 'active' : ''}`}
    onClick={() => setMode('1v1')}
  >
    1v1
  </button>
  <button
    className={`mode-btn ${mode === '2v2' ? 'active' : ''}`}
    onClick={() => setMode('2v2')}
  >
    2v2
  </button>
</div>
<button className="game-btn game-btn-primary" onClick={handleCreateRoom}>
  Create Room ({mode})
</button>
```

Also update the Quick Match button to show the mode:

Find `Find Match` and change to `Find Match ({mode})`.

- [ ] **Step 5: Add mode toggle CSS to `menuStyles`**

Append to the `menuStyles` string:

```css
/* ─── Mode Toggle ─── */
.mode-toggle {
  display: flex;
  gap: 8px;
}

.mode-btn {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 2px solid var(--border-dim);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  border-color: var(--border-bright);
}

.mode-btn.active {
  border-color: var(--gold);
  background: linear-gradient(180deg, #f59e0b15, #f59e0b05);
  color: var(--gold);
}
```

- [ ] **Step 6: Verify client builds**

```bash
cd packages/client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "feat: add mode selection (1v1/2v2) to menu UI"
```

---

### Task 5: Client — 2v2 Lobby with Team Roster

**Files:**
- Modify: `packages/client/src/App.tsx`

Currently the lobby just shows the room code and a spinner. For 2v2 we need to show 4 player slots with team assignments. The `lobby:update` event (added in Task 1) carries this data.

> **`mode` vs `lobbyMode`:** The `mode` state from Task 4 is the *menu selection intent* (what mode you want when creating a room). The `lobbyMode` state here is the *confirmed mode* received from the server via `lobby:update`. Once you've joined a room, use `lobbyMode` as the source of truth (it reflects what the server actually created). For joiners who didn't create the room, `mode` is irrelevant — `lobbyMode` is populated from the server's first `lobby:update`.

> **HeroSelect UX gap (known):** This plan does not gray out taken heroes in HeroSelect.tsx. A player who picks a taken hero will receive a server-side `error` event (shown in the error banner). Full taken-hero display requires passing `lobbyPlayers` down to `HeroSelect` as a prop — deferred to a follow-up.

- [ ] **Step 1: Add `lobbyPlayers` state**

In the App state declarations, add:

```typescript
const [lobbyPlayers, setLobbyPlayers] = useState<Array<{
  id: string;
  name: string;
  heroId: string;
  teamIndex: number;
  ready: boolean;
}>>([]);
const [lobbyMode, setLobbyMode] = useState<'1v1' | '2v2'>('1v1');
```

- [ ] **Step 2: Listen to `lobby:update` in the socket useEffect**

Inside the `useEffect` that sets up socket listeners, add:

```typescript
socket.on('lobby:update', (data) => {
  setLobbyPlayers(data.players);
  setLobbyMode(data.mode);
});
```

And in the cleanup return:

```typescript
socket.off('lobby:update');
```

- [ ] **Step 3: Replace the lobby screen JSX**

Replace the current lobby screen (`if (screen === 'lobby')`) with:

```tsx
if (screen === 'lobby') {
  const maxSlots = lobbyMode === '2v2' ? 4 : 2;
  const team0 = lobbyPlayers.filter(p => p.teamIndex === 0);
  const team1 = lobbyPlayers.filter(p => p.teamIndex === 1);

  return (
    <div className="app-container">
      <div className="lobby-screen">
        <h2 className="screen-title">Waiting for Players</h2>
        <div className="room-display">
          <span className="room-label">Room Code</span>
          <span className="room-code">{roomId}</span>
        </div>
        <p className="lobby-hint">Share this code with {maxSlots === 4 ? 'your teammates and opponents' : 'your opponent'}</p>

        <div className="lobby-teams">
          <div className="lobby-team team-blue">
            <div className="lobby-team-label">Team Blue</div>
            {Array.from({ length: maxSlots / 2 }).map((_, i) => {
              const p = team0[i];
              return (
                <div key={i} className={`lobby-slot ${p ? 'filled' : 'empty'}`}>
                  {p ? (
                    <>
                      <span className="lobby-slot-name">{p.name}</span>
                      {p.heroId
                        ? <span className="lobby-slot-hero">{p.heroId}</span>
                        : <span className="lobby-slot-picking">picking...</span>
                      }
                    </>
                  ) : (
                    <span className="lobby-slot-empty">Waiting...</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="lobby-vs">VS</div>

          <div className="lobby-team team-red">
            <div className="lobby-team-label">Team Red</div>
            {Array.from({ length: maxSlots / 2 }).map((_, i) => {
              const p = team1[i];
              return (
                <div key={i} className={`lobby-slot ${p ? 'filled' : 'empty'}`}>
                  {p ? (
                    <>
                      <span className="lobby-slot-name">{p.name}</span>
                      {p.heroId
                        ? <span className="lobby-slot-hero">{p.heroId}</span>
                        : <span className="lobby-slot-picking">picking...</span>
                      }
                    </>
                  ) : (
                    <span className="lobby-slot-empty">Waiting...</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lobby-progress">
          {lobbyPlayers.filter(p => p.ready).length} / {maxSlots} ready
        </div>
      </div>
      <GameLog logs={logs} />
      <style>{menuStyles}</style>
    </div>
  );
}
```

- [ ] **Step 4: Add lobby team CSS to `menuStyles`**

Append to `menuStyles`:

```css
/* ─── Lobby Teams ─── */
.lobby-teams {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  margin-top: 8px;
}

.lobby-team {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lobby-team-label {
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 1px;
  text-align: center;
  padding: 4px 8px;
  border-radius: 6px;
  margin-bottom: 4px;
}

.team-blue .lobby-team-label {
  color: var(--team-blue);
  background: #3b82f610;
  border: 1px solid #3b82f630;
}

.team-red .lobby-team-label {
  color: var(--team-red-light);
  background: #ef444410;
  border: 1px solid #ef444430;
}

.lobby-slot {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-dim);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 52px;
  justify-content: center;
}

.lobby-slot.filled {
  border-color: var(--border-base);
}

.lobby-slot-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.lobby-slot-hero {
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--gold-light);
  letter-spacing: 0.5px;
}

.lobby-slot-picking {
  font-size: 11px;
  color: var(--text-dim);
  font-style: italic;
}

.lobby-slot-empty {
  font-size: 12px;
  color: var(--text-dim);
  font-style: italic;
  text-align: center;
}

.lobby-vs {
  font-family: var(--font-display);
  font-size: 13px;
  color: var(--text-dim);
  align-self: center;
  padding-top: 28px;
}

.lobby-progress {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}
```

- [ ] **Step 5: Verify no type errors**

```bash
cd packages/client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "feat: show team roster in lobby screen with lobby:update"
```

---

### Task 6: Client — Battle UI Improvements for 2v2

**Files:**
- Modify: `packages/client/src/App.tsx`

Three small improvements: dynamic RPS waiting count, named action-turn messages, multi-player RPS draw banner.

- [ ] **Step 1: Update `rps:waiting` handler to use total count**

In the socket `useEffect`, replace the `rps:waiting` handler:

```typescript
socket.on('rps:waiting', (data: { submitted: string[]; total: number }) => {
  addLog(`Waiting for RPS... (${data.submitted.length}/${data.total} submitted)`);
});
```

- [ ] **Step 2: Add player name lookup helper and update `action:request` handler**

Near the top of the component, after the state declarations, add:

```typescript
const getPlayerName = (playerId: string): string => {
  if (!gameState) return 'Opponent';
  const allPlayers = gameState.teams.flatMap(t => t.players);
  return allPlayers.find(p => p.id === playerId)?.name ?? 'Opponent';
};
```

Update the `action:request` handler in the socket useEffect:

```typescript
socket.on('action:request', (data: { playerId: string; timeLimit: number }) => {
  if (data.playerId === socket.id) {
    setIsMyTurn(true);
    setTimerTotal(ACTION_TIMER);
    setTimerStart(Date.now());
    addLog('Your turn to act!');
  } else {
    setIsMyTurn(false);
    // Use gameState from ref to get player name
    const playerName = gameStateRef.current
      ? (gameStateRef.current.teams.flatMap(t => t.players).find(p => p.id === data.playerId)?.name ?? 'Opponent')
      : 'Opponent';
    addLog(`${playerName} is choosing their action...`);
  }
});
```

Note: Since `action:request` fires in a socket event listener that closes over the initial state, we need a ref. Add this ref near the other refs in the component:

```typescript
const gameStateRef = useRef<GameState | null>(null);
```

And keep it in sync in the `game:state` handler:

```typescript
socket.on('game:state', (state: GameState) => {
  gameStateRef.current = state;
  setGameState(state);
  setScreen('battle');
});
```

- [ ] **Step 3: Update the "waiting for opponent" text in the battle UI**

Find this JSX block:

```tsx
{phase === 'action_phase' && !isMyTurn && (
  <div className="waiting-banner">
    Waiting for opponent's action...
  </div>
)}
```

Replace with:

```tsx
{phase === 'action_phase' && !isMyTurn && gameState && (() => {
  const actorId = gameState.actionOrder[gameState.currentActionIndex];
  const actorName = actorId
    ? (gameState.teams.flatMap(t => t.players).find(p => p.id === actorId)?.name ?? 'Opponent')
    : 'Opponent';
  return (
    <div className="waiting-banner">
      Waiting for {actorName}'s action...
    </div>
  );
})()}
```

- [ ] **Step 4: Update `RPSDrawBanner` to show all choices in 2v2**

Replace the `RPSDrawBanner` component:

```tsx
function RPSDrawBanner({ choices, myId }: { choices: Record<string, RPSChoice>; myId: string }) {
  const myChoice = choices[myId];
  const otherChoices = Object.entries(choices)
    .filter(([id]) => id !== myId)
    .map(([, choice]) => choice);

  return (
    <div className="rps-draw-banner">
      <div className="rps-draw-emojis">
        {myChoice && RPS_EMOJI[myChoice]}
        {otherChoices.length > 0 && ' vs '}
        {otherChoices.map((c, i) => (
          <span key={i}>{RPS_EMOJI[c]}</span>
        ))}
      </div>
      <div className="rps-draw-text">Draw! Pick again</div>
    </div>
  );
}
```

- [ ] **Step 5: Build and verify**

```bash
npm run build:shared && cd packages/client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "feat: update battle UI for 2v2 (dynamic counts, player names, multi-choice RPS draw)"
```

---

### Task 7: Integration Smoke Test

No automated tests exist for server/client. Manual smoke test:

- [ ] **Step 1: Start server and client**

In two terminals:
```bash
npm run build:shared && npm run dev:server
# second terminal:
npm run dev:client
```

- [ ] **Step 2: Test 1v1 flow still works**

1. Open two browser tabs at `localhost:5173`
2. Enter names, keep mode at 1v1, Create Room / Join Room
3. Select heroes → lobby shows 2 slots → game starts
4. Play 2-3 turns: RPS, action, verify no console errors

- [ ] **Step 3: Test 2v2 flow**

1. Open four browser tabs (or two browsers)
2. Tab 1: enter name, switch mode to 2v2, Create Room
3. Tabs 2-4: enter names, Join Room with the same room code
4. Verify lobby shows team Blue (players 1+3) and team Red (players 2+4) with correct hero selections
5. All 4 select heroes → game starts
6. Play 2-3 turns: RPS waiting shows "X/4", action requests show player names
7. Kill a tab mid-game → verify the disconnected player's team forfeits

- [ ] **Step 4: Commit if any fixes were needed**

If any bugs were found and fixed in the above steps, commit them:
```bash
git add -p
git commit -m "fix: address integration issues found in smoke test"
```

---

## Summary

| Task | Files | Est. changes |
|------|-------|--------------|
| 1: Protocol types | `shared/types/protocol.ts` | +15 lines |
| 2: GameRoom 2v2 | `server/game/GameRoom.ts` | ~80 lines modified |
| 3: Handler updates | `server/socket/handlers/game.ts` | ~20 lines modified |
| 4: Mode selection | `client/App.tsx` | +30 lines |
| 5: Lobby roster | `client/App.tsx` | +100 lines |
| 6: Battle UI | `client/App.tsx` | +20 lines modified |
| 7: Smoke test | — | manual only |

All existing 1v1 behavior is preserved. The engine already supports 2v2 — this plan only wires it up.
