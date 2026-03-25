# 2v2 UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 2v2 stun-RPS bug, add a MOBA-style team selection lobby for 2v2 manual rooms, and add an action order bar to the battle screen.

**Architecture:** Three independent changes: (1) a one-line server bug fix, (2) a new pre-game team selection flow gated by `heroSelectPhaseStarted` on `GameRoom`, (3) a new `ActionOrderBar` React component in `BattleScene.tsx`. Engine (`shared/`) is untouched. 1v1 flow is untouched.

**Tech Stack:** TypeScript, Node.js + Socket.IO (`GameRoom.ts`, `handlers/game.ts`), React + Vite (`App.tsx`, `BattleScene.tsx`, `BattleScene.css`), shared protocol types (`protocol.ts`).

---

## File Map

| File | Change |
|------|--------|
| `packages/server/src/game/GameRoom.ts` | Fix stun bug; add `heroSelectPhaseStarted` flag; modify `addPlayer` and `selectHero` for 2v2; add `handleTeamJoin`, `handleTeamLeave`, `handleLobbyReady` methods |
| `packages/server/src/socket/handlers/game.ts` | Register `team:join`, `team:leave`, `lobby:ready` socket events; fix quick match 2v2 flow |
| `packages/shared/src/types/protocol.ts` | Add `team:join`, `team:leave`, `lobby:ready` to `ClientEvents`; add `game:hero_select`, `available:actions` to `ServerEvents` |
| `packages/client/src/App.tsx` | Add `'team_select'` to `Screen` type; add `game:hero_select` listener; update `handleCreateRoom`/`handleJoinRoom` navigation; add `team_select` screen JSX |
| `packages/client/src/scenes/BattleScene.tsx` | Add `ActionOrderBar` component |
| `packages/client/src/scenes/BattleScene.css` | Add `ActionOrderBar` styles |

---

## Task 1: Fix stun RPS bug in `beginRPSPhase`

**Files:**
- Modify: `packages/server/src/game/GameRoom.ts:184`

No automated test available (server-only logic), manual test described below.

- [ ] **Step 1: Change the auto-skip condition**

In `packages/server/src/game/GameRoom.ts`, find line 184:
```typescript
if (stunnedPlayers.length > 0 && nonStunnedPlayers.length > 0) {
```
Change to:
```typescript
if (stunnedPlayers.length > 0 && nonStunnedPlayers.length === 1) {
```

The rest of the block (lines 185-207) is unchanged — the auto-skip logic is correct for the 1v1 case.

- [ ] **Step 2: Build shared (required before server picks up any changes)**

```bash
npm run build:shared
```
Expected: exits 0.

- [ ] **Step 3: Manual smoke test**

Start server and client:
```bash
npm run dev:server   # terminal 1
npm run dev:client   # terminal 2
```
Open 4 tabs. Create a 2v2 room, all 4 join, pick heroes, start game.
Use Jin's small dart to stun a player. On the next turn, verify that the 3 non-stunned players see the RPS picker (not an automatic action). Verify only 1–2 of them get to act based on the RPS result.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/game/GameRoom.ts
git commit -m "fix: 2v2 stun RPS — only auto-skip when exactly 1 non-stunned player remains"
```

---

## Task 2: Protocol additions

**Files:**
- Modify: `packages/shared/src/types/protocol.ts`

- [ ] **Step 1: Add new client→server events to `ClientEvents`**

In `packages/shared/src/types/protocol.ts`, the current `ClientEvents` interface ends at line 11. Add three new events:

```typescript
export interface ClientEvents {
  'player:ready': () => void;
  'hero:select': (data: { heroId: string }) => void;
  'rps:submit': (data: { choice: RPSChoice }) => void;
  'action:submit': (data: PlayerAction) => void;
  'order:yield': (data: { toPlayerId: string }) => void;
  'team:join': (data: { teamIndex: 0 | 1 }) => void;
  'team:leave': () => void;
  'lobby:ready': () => void;
}
```

- [ ] **Step 2: Add new server→client events to `ServerEvents`**

In the `ServerEvents` interface (currently ends at line 74), add two new events:

```typescript
  'game:hero_select': () => void;
  'available:actions': (actions: PlayerAction[]) => void;
```

(`PlayerAction` is already imported at the top of the file.)

- [ ] **Step 3: Build shared to verify no type errors**

```bash
npm run build:shared
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/protocol.ts
git commit -m "feat: add team:join/leave/ready and game:hero_select to protocol"
```

---

## Task 3: Server — team selection logic in `GameRoom.ts`

**Files:**
- Modify: `packages/server/src/game/GameRoom.ts`

- [ ] **Step 1: Add `heroSelectPhaseStarted` field to the class**

After `private actionTimer` declaration (line 25), add:
```typescript
private heroSelectPhaseStarted = false;
```

- [ ] **Step 2: Modify `addPlayer` for 2v2 vs quick match**

Replace the `addPlayer` method (lines 56-79) with this version that assigns `teamIndex = -1` for 2v2 manual rooms (team is chosen in the lobby), while 1v1 keeps the current alternating assignment:

```typescript
addPlayer(socket: Socket, name: string): boolean {
  if (this.isFull) return false;

  // 1v1: alternating team assignment. 2v2: waiting area (-1), team chosen in lobby.
  const joinIndex = this.players.size;
  const teamIndex = this.mode === '1v1' ? joinIndex % 2 : -1;

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

- [ ] **Step 3: Modify `selectHero` to gate game start on `heroSelectPhaseStarted` in 2v2**

Replace the `selectHero` method (lines 99-119):

```typescript
selectHero(socketId: string, heroId: string): void {
  const player = this.players.get(socketId);
  if (!player) return;

  // In 2v2, hero selection is only meaningful after the team lobby has completed
  if (this.mode === '2v2' && !this.heroSelectPhaseStarted) return;

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

  const allReady = Array.from(this.players.values()).every(p => p.ready && p.heroId);
  if (allReady && this.players.size === this.maxPlayers) {
    this.startGame();
  }
}
```

- [ ] **Step 4: Add `handleTeamJoin` method**

Add after the `selectHero` method:

```typescript
handleTeamJoin(socketId: string, teamIndex: 0 | 1): void {
  const player = this.players.get(socketId);
  if (!player) return;
  if (player.teamIndex !== -1) return; // must be in waiting area

  const teamSize = this.mode === '2v2' ? this.maxPlayers / 2 : 1;
  const currentTeamCount = Array.from(this.players.values()).filter(
    p => p.teamIndex === teamIndex,
  ).length;
  if (currentTeamCount >= teamSize) return; // team full

  player.teamIndex = teamIndex;
  this.emitLobbyUpdate();
}
```

- [ ] **Step 5: Add `handleTeamLeave` method**

```typescript
handleTeamLeave(socketId: string): void {
  const player = this.players.get(socketId);
  if (!player) return;
  player.teamIndex = -1;
  player.ready = false;
  this.emitLobbyUpdate();
}
```

- [ ] **Step 6: Add `handleLobbyReady` method**

```typescript
handleLobbyReady(socketId: string): void {
  const player = this.players.get(socketId);
  if (!player) return;
  if (player.teamIndex === -1) return; // must be on a team to ready up

  player.ready = true;
  this.emitLobbyUpdate();

  // All players on a team and all ready → start hero select
  const allPlayers = Array.from(this.players.values());
  const allOnTeams = allPlayers.every(p => p.teamIndex >= 0);
  const allReady = allPlayers.every(p => p.ready);

  if (
    allOnTeams &&
    allReady &&
    allPlayers.length === this.maxPlayers
  ) {
    this.heroSelectPhaseStarted = true;
    // Reset ready flags so they can be reused for hero-select phase
    for (const p of allPlayers) p.ready = false;
    this.io.to(this.id).emit('game:hero_select');
    this.emitLobbyUpdate();
  }
}
```

- [ ] **Step 7: Add quick match 2v2 helper methods**

The quick match flow cannot use `selectHero` because `heroSelectPhaseStarted` is false when early players join. Instead, add two methods:

`setHeroForQuickMatch` — stores the hero without the `heroSelectPhaseStarted` guard:
```typescript
setHeroForQuickMatch(socketId: string, heroId: string): void {
  const player = this.players.get(socketId);
  if (!player) return;
  player.heroId = heroId;
}
```

`tryAutoStartHeroSelect` — called after every quick-match join; when the room is full, assigns teams, sets the flag, and starts the game immediately (all heroes already stored):
```typescript
tryAutoStartHeroSelect(): void {
  if (this.mode !== '2v2') return;
  if (!this.isFull) return;

  // Auto-assign teams by join order: players 0,2 → team 0; players 1,3 → team 1
  const players = Array.from(this.players.values());
  players.forEach((p, i) => { p.teamIndex = i % 2; });

  this.heroSelectPhaseStarted = true;
  this.emitLobbyUpdate();

  // All heroes already stored via setHeroForQuickMatch — start immediately
  const allHeroesSet = players.every(p => p.heroId);
  if (allHeroesSet) {
    this.startGame();
  }
  // (If somehow not all heroes set, game won't start — acceptable edge case for quick match)
}
```

- [ ] **Step 8: Build and verify**

```bash
npm run build:shared
```
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/game/GameRoom.ts
git commit -m "feat: add heroSelectPhaseStarted flag and team lobby handlers to GameRoom"
```

---

## Task 4: Server — register new socket events in `handlers/game.ts`

**Files:**
- Modify: `packages/server/src/socket/handlers/game.ts`

- [ ] **Step 1: Register the three new team lobby events**

After the `hero:select` handler (line 68), add:

```typescript
  // Team lobby (2v2 manual rooms only)
  socket.on('team:join', (data: { teamIndex: 0 | 1 }) => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    room.handleTeamJoin(socket.id, data.teamIndex);
  });

  socket.on('team:leave', () => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    room.handleTeamLeave(socket.id);
  });

  socket.on('lobby:ready', () => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    room.handleLobbyReady(socket.id);
  });
```

- [ ] **Step 2: Update `room:quickmatch` to call `tryAutoStartHeroSelect` for 2v2**

Find the `room:quickmatch` handler (lines 39-61). After `room.selectHero(socket.id, data.heroId)` (line 58), add:

```typescript
    room.tryAutoStartHeroSelect();
```

Replace `room.selectHero(socket.id, data.heroId)` with `room.setHeroForQuickMatch(socket.id, data.heroId)`. The full quickmatch handler body after this change:
```typescript
    room.addPlayer(socket, data.name);
    room.setHeroForQuickMatch(socket.id, data.heroId);
    room.tryAutoStartHeroSelect();
    callback({ roomId: room.id, mode });
```

- [ ] **Step 3: Build server to verify no type errors**

```bash
cd packages/server && npx tsc --noEmit && cd ../..
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/socket/handlers/game.ts
git commit -m "feat: register team:join/leave/ready socket handlers; wire quick match 2v2 auto-ready"
```

---

## Task 5: Client — `team_select` screen in `App.tsx`

**Files:**
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Add `'team_select'` to the `Screen` type and add `myReadyState` state**

Find line 14:
```typescript
type Screen = 'menu' | 'lobby' | 'hero_select' | 'battle' | 'result';
```
Change to:
```typescript
type Screen = 'menu' | 'lobby' | 'hero_select' | 'team_select' | 'battle' | 'result';
```

After the `lobbyMode` state (line 39), add:
```typescript
const [teamSelectReady, setTeamSelectReady] = useState(false);
```

- [ ] **Step 2: Add `game:hero_select` socket listener**

Inside the `useEffect` socket setup (after the `lobby:update` handler, before the `error` handler around line 160), add:

```typescript
    socket.on('game:hero_select', () => {
      setScreen('hero_select');
    });
```

Also add to the cleanup return at line 165:
```typescript
      socket.off('game:hero_select');
```

- [ ] **Step 3: Update `handleCreateRoom` to navigate to `team_select` for 2v2**

Find `handleCreateRoom` (lines 182-194). Change:
```typescript
        setRoomId(res.roomId);
        setScreen('hero_select');
```
To:
```typescript
        setRoomId(res.roomId);
        setScreen(res.mode === '2v2' ? 'team_select' : 'hero_select');
```

- [ ] **Step 4: Update `handleJoinRoom` to navigate based on `res.mode` from callback**

Find `handleJoinRoom` (lines 196-210). Change:
```typescript
        if (res.mode) setLobbyMode(res.mode);
        setRoomId(res.roomId!);
        setScreen('hero_select');
```
To:
```typescript
        if (res.mode) setLobbyMode(res.mode);
        setRoomId(res.roomId!);
        setScreen(res.mode === '2v2' ? 'team_select' : 'hero_select');
```

- [ ] **Step 5: Add the `team_select` screen JSX**

Add the following before the `// ─── HERO SELECT ───` comment (line 332):

```typescript
  // ─── TEAM SELECT (2v2 only) ───
  if (screen === 'team_select') {
    const slotsPerTeam = 2;
    const team0 = lobbyPlayers.filter(p => p.teamIndex === 0);
    const team1 = lobbyPlayers.filter(p => p.teamIndex === 1);
    const waiting = lobbyPlayers.filter(p => p.teamIndex === -1);
    const me = lobbyPlayers.find(p => p.id === socket.id);
    const myTeamIndex = me?.teamIndex ?? -1;
    const iAmOnTeam = myTeamIndex >= 0;

    const handleJoinTeam = (teamIndex: 0 | 1) => {
      socket.emit('team:join', { teamIndex });
    };
    const handleLeaveTeam = () => {
      socket.emit('team:leave');
      setTeamSelectReady(false);
    };
    const handleReady = () => {
      socket.emit('lobby:ready');
      setTeamSelectReady(true);
    };

    const renderTeamSlots = (teamPlayers: typeof lobbyPlayers, teamIndex: 0 | 1) => {
      const isMyTeam = myTeamIndex === teamIndex;
      const teamColor = teamIndex === 0 ? 'var(--team-blue)' : 'var(--team-red)';
      const teamBg = teamIndex === 0 ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)';
      const teamBorder = teamIndex === 0 ? 'rgba(59,130,246,0.4)' : 'rgba(239,68,68,0.4)';
      const label = teamIndex === 0 ? '🔵 Team Blue' : '🔴 Team Red';
      const isFull = teamPlayers.length >= slotsPerTeam;

      return (
        <div style={{ flex: 1, background: teamBg, border: `2px solid ${teamBorder}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: teamColor, marginBottom: 10, fontWeight: 700 }}>{label}</div>
          {Array.from({ length: slotsPerTeam }).map((_, i) => {
            const p = teamPlayers[i];
            return (
              <div key={i} style={{ background: p ? `${teamColor}15` : 'transparent', border: `1px solid ${p ? `${teamColor}40` : `${teamColor}20`}`, borderRadius: 6, padding: '8px 12px', marginBottom: 6, fontStyle: p ? 'normal' : 'italic', color: p ? '#e2e8f0' : '#64748b', fontSize: p ? 13 : 12 }}>
                {p ? (
                  <span>{p.name}{p.id === socket.id ? <span style={{ fontSize: 10, color: teamColor }}> (you)</span> : ''}{p.ready ? <span style={{ fontSize: 10, color: '#22c55e' }}> ✓</span> : ''}</span>
                ) : (
                  <span>Waiting for player...</span>
                )}
              </div>
            );
          })}
          {/* Join button (shown when not on this team and team not full) */}
          {myTeamIndex !== teamIndex && !isFull && (
            <button className="game-btn game-btn-secondary" style={{ width: '100%', fontSize: 12, padding: '6px 0', marginTop: 4 }} onClick={() => handleJoinTeam(teamIndex)}>
              → Join {teamIndex === 0 ? 'Blue' : 'Red'} Team
            </button>
          )}
          {/* Leave button (shown when I'm on this team) */}
          {isMyTeam && (
            <button className="game-btn" style={{ width: '100%', fontSize: 12, padding: '6px 0', marginTop: 4, background: '#1e293b', border: '1px solid #475569', color: '#94a3b8' }} onClick={handleLeaveTeam}>
              ↩ Leave to Waiting Area
            </button>
          )}
          {/* Full indicator */}
          {myTeamIndex !== teamIndex && isFull && (
            <div style={{ textAlign: 'center', fontSize: 11, color: '#475569', marginTop: 4 }}>Full</div>
          )}
        </div>
      );
    };

    return (
      <div className="app-container">
        <div className="lobby-screen">
          <h2 className="screen-title">Team Selection</h2>
          <div className="room-display">
            <span className="room-label">Room Code</span>
            <span className="room-code">{roomId}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 10, alignItems: 'start', margin: '16px 0' }}>
            {renderTeamSlots(team0, 0)}

            {/* Waiting area */}
            <div style={{ background: 'rgba(71,85,105,0.15)', border: '2px dashed rgba(71,85,105,0.4)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b', marginBottom: 8, fontWeight: 700, textAlign: 'center' }}>⏳ Waiting</div>
              {waiting.length === 0 ? (
                <div style={{ border: '1px dashed #37415150', borderRadius: 6, padding: '6px 8px', color: '#475569', fontSize: 11, textAlign: 'center', fontStyle: 'italic' }}>empty</div>
              ) : waiting.map(p => (
                <div key={p.id} style={{ border: '1px solid #47556940', borderRadius: 6, padding: '6px 8px', marginBottom: 4, color: '#94a3b8', fontSize: 11, textAlign: 'center' }}>
                  {p.name}{p.id === socket.id ? ' (you)' : ''}
                </div>
              ))}
            </div>

            {renderTeamSlots(team1, 1)}
          </div>

          <button
            className={`game-btn ${iAmOnTeam && !teamSelectReady ? 'game-btn-primary' : ''}`}
            disabled={!iAmOnTeam || teamSelectReady}
            onClick={handleReady}
            style={{ width: '100%', fontSize: 14, fontWeight: 700, padding: 12 }}
          >
            {teamSelectReady ? 'Ready ✓' : 'Ready'}
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 6 }}>
            {iAmOnTeam ? 'Click Ready when your team is set' : 'Join a team first'}
          </div>
        </div>
        <GameLog logs={logs} />
        <style>{menuStyles}</style>
      </div>
    );
  }
```

- [ ] **Step 6: Start client and manually verify the screen renders**

```bash
npm run dev:client
```
Navigate to `localhost:5173`, create a 2v2 room. Verify you land on the Team Selection screen with the three-column layout.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "feat: add team_select screen for 2v2 manual rooms"
```

---

## Task 6: Client — `ActionOrderBar` component in `BattleScene.tsx`

**Files:**
- Modify: `packages/client/src/scenes/BattleScene.tsx`
- Modify: `packages/client/src/scenes/BattleScene.css`

- [ ] **Step 1: Add `ActionOrderBar` component to `BattleScene.tsx`**

Add the following component definition before the `BattleScene` function (after the imports / type definitions around line 33):

```typescript
function ActionOrderBar({ gameState, myPlayerId }: { gameState: GameState; myPlayerId: string }) {
  if (gameState.phase !== 'action_phase' || gameState.actionOrder.length === 0) return null;

  const allPlayers = gameState.teams.flatMap(t => t.players);

  return (
    <div className="action-order-bar">
      {gameState.actionOrder.map((playerId, index) => {
        const player = allPlayers.find(p => p.id === playerId);
        if (!player) return null;

        const teamIndex = gameState.teams.findIndex(t => t.players.some(p => p.id === playerId));
        const visual = getHeroVisual(player.hero.heroId);
        const isActing = index === gameState.currentActionIndex;
        const hasActed = index < gameState.currentActionIndex;
        const isMe = playerId === myPlayerId;

        return (
          <div
            key={playerId}
            className={`action-order-card ${isActing ? 'acting' : ''} ${hasActed ? 'done' : ''}`}
            style={isActing ? { borderColor: teamIndex === 0 ? 'var(--team-blue)' : 'var(--team-red-light)', boxShadow: `0 0 12px ${teamIndex === 0 ? 'var(--team-blue)' : 'var(--team-red-light)'}40` } : {}}
          >
            <div className="action-order-emoji">{visual.emoji}</div>
            <div className="action-order-name" style={{ color: isActing ? (teamIndex === 0 ? 'var(--team-blue)' : 'var(--team-red-light)') : undefined }}>
              {player.name}{isMe ? ' ★' : ''}
            </div>
            {isActing && <div className="action-order-badge">acting</div>}
            {hasActed && <div className="action-order-badge done-badge">✓</div>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Render `ActionOrderBar` inside `BattleScene`**

In the `BattleScene` component's return JSX (around line 98), add `ActionOrderBar` at the top of `.battle-arena`, before the `turn-overlay` div:

```tsx
  return (
    <div className="battle-arena">
      <ActionOrderBar gameState={gameState} myPlayerId={myPlayerId} />

      {/* Turn info */}
      <div className="turn-overlay">
```

- [ ] **Step 3: Add CSS to `BattleScene.css`**

Append the following to `packages/client/src/scenes/BattleScene.css`:

```css
/* ─── Action Order Bar ─── */
.action-order-bar {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  justify-content: center;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.8);
  border-bottom: 1px solid #334155;
}

.action-order-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  background: #1e293b;
  border: 2px solid #334155;
  border-radius: 8px;
  opacity: 0.7;
  transition: all 0.2s;
  min-width: 52px;
}

.action-order-card.acting {
  opacity: 1;
  transform: scale(1.25);
  background: rgba(30, 41, 59, 0.9);
}

.action-order-card.done {
  opacity: 0.35;
}

.action-order-emoji {
  font-size: 18px;
  line-height: 1;
}

.action-order-card.acting .action-order-emoji {
  font-size: 22px;
}

.action-order-card.done .action-order-name {
  text-decoration: line-through;
}

.action-order-name {
  font-size: 10px;
  color: #94a3b8;
  font-family: 'Chakra Petch', sans-serif;
  white-space: nowrap;
}

.action-order-badge {
  font-size: 9px;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.15);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: 'Silkscreen', monospace;
}

.action-order-badge.done-badge {
  color: #64748b;
  background: transparent;
}
```

- [ ] **Step 4: Manual smoke test**

Open a 2v2 game and play a round. During `action_phase`, verify:
- The bar appears above the grid showing all acting players in order.
- The currently acting player's card is larger with a team-color border glow.
- Players who have already acted appear at 35% opacity with strikethrough names.
- Works in 1v1 too (single card, no regression).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/scenes/BattleScene.tsx packages/client/src/scenes/BattleScene.css
git commit -m "feat: add ActionOrderBar component showing action order during battle"
```

---

## Final Verification

- [ ] **Run all shared tests to confirm no regressions**

```bash
cd packages/shared && npx vitest run
```
Expected: all 280 tests pass.

- [ ] **Full 2v2 manual room smoke test**

1. Create a 2v2 room → land on Team Selection screen.
2. All 4 players join → land in waiting area (3-column layout visible).
3. Each player joins a team.
4. Test swap: one player leaves team → other swaps → first player joins vacated slot.
5. All click Ready → all simultaneously navigate to Hero Select.
6. All pick heroes → game starts.
7. Trigger stun → verify stunned player is skipped in next RPS.
8. Action order bar visible during action phase.

- [ ] **1v1 regression test**

Create a 1v1 room → goes directly to hero select (no team select screen). Game plays normally.
