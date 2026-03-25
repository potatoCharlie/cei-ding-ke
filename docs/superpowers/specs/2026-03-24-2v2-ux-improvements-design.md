# 2v2 UX Improvements Design

## Summary

Three improvements to the 2v2 multiplayer experience:

1. **Bug fix** — Stunned player in 2v2 incorrectly gives all non-stunned players free actions; they should still RPS.
2. **Team selection lobby** — MOBA-style pre-game lobby where players pick teams, click Ready, then all go to hero select together.
3. **Action order bar** — Hero avatar cards shown at the top of the battle screen indicating who acts in what order.

Scope: server (`GameRoom.ts`), shared protocol types (`protocol.ts`), client (`App.tsx`, `BattleScene.tsx`). Engine (`shared/`) unchanged. 1v1 flow unchanged.

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
2v2: menu → team_select → [all ready] → hero_select → lobby (waiting) → battle
1v1: menu → hero_select → lobby (waiting) → battle  ← unchanged
```

### Lobby Screen (team_select)

Three-column layout: **Blue Team | Waiting Area | Red Team**

- Players entering the room land in the **Waiting Area** (`teamIndex = -1`).
- Clicking an empty team slot joins that team. Clicking a full slot does nothing.
- Clicking "Leave" on your current team returns you to the Waiting Area, opening your slot for others to take. This is the swap mechanism — no direct team-to-team swap.
- The "Ready" button is only enabled once you are on a team (`teamIndex >= 0`).
- Player state (name, hero if selected, ready status) is visible in all slots to all players via `lobby:update`.

### Ready → Hero Select

When all `maxPlayers` players are on teams (no one in Waiting Area) **and** all have clicked Ready, the server emits `game:hero_select`. All clients transition to the hero select screen simultaneously. After all players have selected heroes, `startGame()` is called as normal.

### Server Changes (`GameRoom.ts`)

- **2v2 `addPlayer`**: assign `teamIndex = -1` instead of alternating. (1v1 keeps alternating.)
- **New event `team:join { teamIndex: 0 | 1 }`**: validate team has space (< `maxPlayers / 2`), validate player is in waiting area (`teamIndex === -1`), update `teamIndex`, emit `lobby:update`.
- **New event `team:leave`**: set `teamIndex = -1`, set `ready = false`, emit `lobby:update`.
- **New event `lobby:ready`**: mark player ready (`ready = true`). Check if all players are on teams and all are ready → emit `game:hero_select` to room.
- **`selectHero` in 2v2**: record the hero choice but do **not** auto-start. Start game only when all heroes are selected **after** `game:hero_select` has been emitted (gate on a `heroSelectPhaseStarted` flag).
- **`selectHero` in 1v1**: unchanged — auto-starts when both players select.
- **`emitLobbyUpdate`**: `teamIndex = -1` means waiting area; client renders accordingly.

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

### Client Changes (`App.tsx`)

- Add `'team_select'` to the `Screen` union type.
- **2v2 room:create / room:join callbacks**: navigate to `'team_select'` instead of `'hero_select'`.
- **1v1 room:create / room:join callbacks**: navigate to `'hero_select'` (unchanged).
- **`team_select` screen**: three-column layout (Blue | Waiting | Red). Renders from `lobbyPlayers` state (already tracked). Buttons:
  - Empty slot → emit `team:join { teamIndex }`
  - "Leave" → emit `team:leave`
  - "Ready" (enabled when on a team) → emit `lobby:ready`; button text changes to "Ready ✓" and is disabled after click.
- **`game:hero_select` socket event**: navigate to `'hero_select'`.
- Quick match (1v1 and 2v2): keep emitting `hero:select` directly; the server handles it. For 2v2 quick match the server assigns teams and triggers `game:hero_select` once all are ready — or simplify: quick match in 2v2 auto-readies all players and auto-assigns teams (the manual lobby flow only applies to manual room creation/join).

---

## 3. Action Order Bar

### Behavior

Shown at the top of the battle screen during `action_phase`. Visible to all 4 players. Three card states:

| State | Condition | Appearance |
|-------|-----------|------------|
| Already acted | `index < currentActionIndex` | Small, 35% opacity, name strikethrough |
| Currently acting | `index === currentActionIndex` | Large (+25%), team-color border glow, "acting" badge |
| Waiting | `index > currentActionIndex` | Medium, 70% opacity |

Each card shows:
- Hero emoji from `getHeroVisual(heroId).emoji` (SpriteConfig)
- Player name below the card

### Implementation

New component `ActionOrderBar` in `packages/client/src/scenes/BattleScene.tsx` (co-located with the battle scene, exported inline or as a sibling component in the same file).

Props: `gameState: GameState`, `myPlayerId: string`

Reads `gameState.actionOrder`, `gameState.currentActionIndex`, and looks up each player's hero via `gameState.teams.flatMap(t => t.players)`. Team color (blue/red) determined by player's team index.

Rendered inside `BattleScene` at the top of `.battle-arena`, above the grid. Only renders when `gameState.phase === 'action_phase'` and `gameState.actionOrder.length > 0`.

**CSS:** Added to `BattleScene.css`. The active card uses `var(--team-blue)` or `var(--team-red-light)` for its glow, matching the existing team color variables.

---

## Testing

No new shared engine tests needed (engine unchanged).

Manual smoke tests:
- **Bug fix**: 2v2 game, stun a player with Jin small dart → next turn verify the other 3 see an RPS picker, only 1-2 of them get to act based on RPS result.
- **Team select**: Create 2v2 room, 4 players join → all land in waiting area → pick teams → test swap via waiting area → all ready → hero select opens simultaneously.
- **Action order bar**: Play a 2v2 round → verify bar shows all acting players in correct order, highlights current actor, grays out already-acted players.
- **1v1 regression**: Create 1v1 room → flow unchanged (no team select screen).
