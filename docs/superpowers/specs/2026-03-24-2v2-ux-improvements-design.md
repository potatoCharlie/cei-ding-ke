# 2v2 UX Improvements Design

## Summary

Three improvements to the 2v2 multiplayer experience:

1. **Bug fix** — Stunned player in 2v2 incorrectly gives all non-stunned players free actions; they should still RPS.
2. **Team selection lobby** — MOBA-style pre-game lobby where players pick teams, click Ready, then all go to hero select together.
3. **Action order bar** — Hero avatar cards shown at the top of the battle screen indicating who acts in what order.

Scope: server (`GameRoom.ts`, `handlers/game.ts`), shared protocol types (`protocol.ts`), client (`App.tsx`, `BattleScene.tsx`). Engine (`shared/`) unchanged. 1v1 flow unchanged.

---

## 1. Bug Fix — Stun RPS Handling in 2v2

### Problem

`GameRoom.beginRPSPhase` has an auto-skip condition designed for 1v1: when any player is stunned and at least one is not, it skips RPS entirely and gives all non-stunned players an action. In 2v2 with one stunned player and three non-stunned players (B, C, D), this incorrectly makes all three winners — they should RPS among themselves.

### Fix

Change the auto-skip condition to only fire when **exactly one** non-stunned player remains (the 1v1 case). With two or more non-stunned players, the normal RPS phase runs — the engine's `submitRPS` completion check already excludes stunned players, so they are simply skipped without any other changes.

```
Before: if (stunned.length > 0 && nonStunned.length > 0)  → auto-skip
After:  if (stunned.length > 0 && nonStunned.length === 1) → auto-skip (1v1 only)
        else: fall through to normal RPS phase
```

**File:** `packages/server/src/game/GameRoom.ts` — `beginRPSPhase()` method only.

---

## 2. Team Selection Lobby (2v2 Only)

### Flow

```
2v2 manual: menu → team_select → [all ready] → hero_select → lobby (waiting) → battle
2v2 quick:  menu → [server auto-assigns + auto-readies] → hero_select → lobby (waiting) → battle
1v1:        menu → hero_select → lobby (waiting) → battle  ← unchanged
```

### Lobby Screen (team_select)

Three-column layout: **Blue Team | Waiting Area | Red Team**

- Players entering the room land in the **Waiting Area** (`teamIndex = -1`).
- Clicking an empty team slot joins that team. Clicking a full slot does nothing.
- Clicking "Leave" on your current team returns you to the Waiting Area, opening your slot for others to take. This is the swap mechanism — no direct team-to-team swap.
- The "Ready" button is only enabled once you are on a team (`teamIndex >= 0`).
- Player state (name, ready status) is visible in all slots to all players via `lobby:update`.

### Ready → Hero Select

When all `maxPlayers` players are on teams (no one in Waiting Area) **and** all have clicked Ready, the server emits `game:hero_select`. All clients transition to the hero select screen simultaneously. After all players have selected heroes, `startGame()` is called as normal.

### Server Changes (`GameRoom.ts`)

#### `addPlayer`
- **2v2 manual**: assign `teamIndex = -1` (waiting area). (1v1 keeps alternating.)
- **2v2 quick match**: assign `teamIndex` alternating (0,1,0,1) as before, and after adding the player if the room is full, set all players' `ready = true` and emit `game:hero_select` to the room. This bypasses the manual lobby entirely.

#### `heroSelectPhaseStarted` flag
A boolean field on `GameRoom` (default `false`). Set to `true` when `game:hero_select` is emitted. Reset to `false` only if the room is fully reset (e.g., for a rematch). This flag gates whether `selectHero` in 2v2 is allowed to start the game.

#### New event `team:join { teamIndex: 0 | 1 }`
Validate player is in waiting area (`teamIndex === -1`), validate team has space (< `maxPlayers / 2`), update `teamIndex`, emit `lobby:update`.

#### New event `team:leave`
Set `teamIndex = -1`, set `player.ready = false`, emit `lobby:update`.

#### New event `lobby:ready`
Set `player.ready = true`. Check if all players are on teams (`teamIndex >= 0`) and all are ready → emit `game:hero_select` to room, set `heroSelectPhaseStarted = true`.

#### `selectHero` in 2v2
- **Before `heroSelectPhaseStarted`**: ignore (or no-op) hero selections. Players have not been redirected to hero select yet.
- **After `heroSelectPhaseStarted`**: record the hero choice. When all players have selected heroes, reset `ready` on all players (clean up from the team-select phase) and call `startGame()`.
- **1v1**: unchanged — auto-starts when both players select.

#### `emitLobbyUpdate`
`teamIndex = -1` means waiting area; client renders accordingly. After `heroSelectPhaseStarted`, the `lobby` screen shows the post-hero-select waiting state where all players have `teamIndex >= 0` (no waiting area display needed).

### Protocol Additions (`protocol.ts`)

Client → Server (new):
```typescript
'team:join': (data: { teamIndex: 0 | 1 }) => void;
'team:leave': () => void;
'lobby:ready': () => void;
```

Server → Client (new):
```typescript
'game:hero_select': () => void;
```

`LobbyPlayerData.teamIndex` already supports `-1` (it's `number`). No type changes needed there.

Note: `available:actions` is also missing from `ServerEvents` in `protocol.ts` (pre-existing gap). Add it while touching this file: `'available:actions': (actions: PlayerAction[]) => void;` (`PlayerAction` is already imported in `protocol.ts`)

### Socket Handler Changes (`handlers/game.ts`)

Register the three new client→server events on the socket:

```typescript
socket.on('team:join', ({ teamIndex }) => room.handleTeamJoin(socket.id, teamIndex));
socket.on('team:leave', () => room.handleTeamLeave(socket.id));
socket.on('lobby:ready', () => room.handleLobbyReady(socket.id));
```

These handlers must be registered in the same block where `hero:select`, `rps:submit`, and other room events are registered.

### Client Changes (`App.tsx`)

- Add `'team_select'` to the `Screen` union type.
- **2v2 room:create callback**: navigate to `'team_select'`.
- **room:join callback**: branch on `res.mode` (the callback value, not the local `mode` state) — if `res.mode === '2v2'` navigate to `'team_select'`; if `'1v1'` navigate to `'hero_select'`.
- **1v1 room:create callback**: navigate to `'hero_select'` (unchanged).
- **Quick match callback** (both modes): navigate to `'hero_select'` directly (server handles team assignment; `game:hero_select` fires before quick-match players reach a screen that waits for it, so the client can navigate straight to hero select on the quick-match callback).
- **`team_select` screen**: three-column layout (Blue | Waiting | Red). Renders from `lobbyPlayers` state (already tracked). Buttons:
  - Empty slot → emit `team:join { teamIndex }`
  - "Leave" → emit `team:leave`
  - "Ready" (enabled when `myPlayer.teamIndex >= 0`) → emit `lobby:ready`; button text changes to "Ready ✓" and is disabled after click.
- **`game:hero_select` socket event**: navigate to `'hero_select'`. This is the trigger for 2v2 manual-room players.
- The existing `'lobby'` screen (post-hero-select waiting) is only shown after all players have selected heroes and `startGame()` is running. At that point all `teamIndex` values are `>= 0`, so no rendering change is needed for the existing lobby screen.

---

## 3. Action Order Bar

### Behavior

Shown at the top of the battle screen during `action_phase`. Visible to all players (1v1 and 2v2). Three card states:

| State | Condition | Appearance |
|-------|-----------|------------|
| Already acted | `index < currentActionIndex` | Small, 35% opacity, name strikethrough |
| Currently acting | `index === currentActionIndex` | Large (+25%), team-color border glow, "acting" badge |
| Waiting | `index > currentActionIndex` | Medium, 70% opacity |

Each card shows:
- Hero emoji from `getHeroVisual(heroId).emoji` (SpriteConfig)
- Player name below the card

In 1v1, `actionOrder` has length 1 (only the winner acts), so the bar shows a single card. This is a valid, harmless display. No mode-gating needed.

### Implementation

New component `ActionOrderBar` in `packages/client/src/scenes/BattleScene.tsx` (co-located with the battle scene, exported inline or as a sibling component in the same file).

Props: `gameState: GameState`, `myPlayerId: string`

Reads `gameState.actionOrder`, `gameState.currentActionIndex`, and looks up each player's hero via `gameState.teams.flatMap(t => t.players)`. Team color (blue/red) determined by the player's team index in `gameState.teams`.

Rendered inside `BattleScene` at the top of `.battle-arena`, above the grid. Only renders when `gameState.phase === 'action_phase'` and `gameState.actionOrder.length > 0`.

**CSS:** Added to `BattleScene.css`. The active card uses `var(--team-blue)` or `var(--team-red-light)` for its glow. Both variables are confirmed present in `index.html`.

---

## Testing

No new shared engine tests needed (engine unchanged).

Manual smoke tests:
- **Bug fix**: 2v2 game, stun a player with Jin small dart → next turn verify the other 3 see an RPS picker, only 1-2 of them get to act based on RPS result.
- **Team select (manual room)**: Create 2v2 room, 4 players join → all land in waiting area → pick teams → test swap via waiting area → all ready → hero select opens simultaneously.
- **Team select (quick match)**: Quick match 2v2 → skip directly to hero select, no team_select screen shown.
- **Action order bar**: Play a 2v2 round → verify bar shows all acting players in correct order, highlights current actor, grays out already-acted players.
- **1v1 regression**: Create 1v1 room → flow unchanged (no team select screen); action order bar shows single card for winner.
