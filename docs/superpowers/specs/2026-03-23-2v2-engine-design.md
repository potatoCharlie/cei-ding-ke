# 2v2 Game Engine Design

## Summary

Generalize the game engine to support 2v2 matches (and 3v3 structurally, disabled in UI until 6+ heroes exist). This spec covers engine changes only — server and client UI are a separate cycle.

The approach is to generalize existing 1v1 code in-place so that 1v1 becomes a special case. The 248 existing tests act as a regression safety net.

## Scope

- **In scope**: Game engine (shared package), tests
- **Out of scope**: Server room management, client UI, hero select flow, matchmaking

## Core Mechanics

### RPS Resolution

**Current**: `resolveRPS1v1(choice1, choice2)` — compares two choices, returns winner or tie.

**New**: `resolveRPSMulti(choices: Record<string, RPSChoice>)` — N-player elimination-style.

Rules:
1. All non-stunned, alive players throw simultaneously.
2. If all 3 choices (rock, paper, scissors) are present → tie, redo.
3. If only 2 choices present → standard RPS. Winners advance, losers sit out.
4. If only 1 choice present → tie, redo.
5. Winners then RPS among themselves recursively to determine strict action order (1st, 2nd, 3rd...).
6. Final output: `actionOrder: string[]` — ordered list of player IDs who act this round.

`resolveRPS1v1` becomes a thin wrapper around `resolveRPSMulti` for backward compatibility.

### Game State Creation

`createGameState` generalizes to accept variable player counts:

```typescript
createGameState(
  gameId: string,
  mode: '1v1' | '2v2' | '3v3',
  players: { id: string; name: string; heroId: string; teamIndex: number }[]
): GameState
```

- Starting positions: all team 0 heroes at `TEAM_0_START`, all team 1 heroes at `TEAM_1_START`.
- Unique hero constraint: no duplicate `heroId` across all players (enforced at creation).
- Existing `GameState` types (`teams`, `actionOrder`, `pendingRPS`) already support multiple players — no type changes needed.

### Turn Loop

1. **`startTurn()`** — tick status effects once per round (unchanged).
2. **RPS phase** — collect choices from all non-stunned, alive players → resolve to ordered `actionOrder`.
3. **Action execution** — for each player in `actionOrder`:
   - Check if player is still alive (may have died from earlier action this round).
   - If dead, skip.
   - Player submits action → `executeAction(state, action)`.
   - If player has a minion and `awaitingMinionAction`, execute minion action immediately.
   - Check for deaths → if a team is fully eliminated, set `winner` and `phase = 'game_over'` immediately. Remaining players in `actionOrder` don't act.
   - Reset `awaitingMinionAction` before next player's turn.
4. **`endTurn()`** — apply passives (Nan stink aura), advance turn counter.

Key: `awaitingMinionAction` is resolved per-player inline, not as a global flag waiting for a separate phase.

### Punch Counter (Redesigned)

**Current** (1v1): Tracked per attacker — `consecutivePunchCount` on attacker's `HeroState`. Resets when attacker does a non-punch action.

**New** (multi-hero): Tracked per target — `receivedConsecutivePunchCount` on target's `HeroState`.

- Increments when target is punched by anyone.
- Resets to 0 when the target takes ANY action (move, skill, punch, summon, stay) — checked at the start of `executeAction` before the action resolves.
- 3 consecutive received punches without the target acting → stun.
- Hellfire minion punches still excluded from this count (same as 1v1).

### Targeting

- **Punch**: Player chooses which enemy at distance 0 to punch (already uses `targetId`).
- **Offensive skills**: Target any enemy within cast distance. Validate target is alive and in range.
- **Kuang on teammate**: Heals 40 HP (same as self-cast). Only Kuang allows teammate targeting.
- **Kuang on self**: Heals 40 HP (unchanged).
- **Kuang on enemy**: 50 damage + 10 self-damage (unchanged).
- **Call Fly**: Enemy-only. Cannot target teammates.
- **All other skills**: Enemy-only.

### Nan Stink Aura

In `applyPassiveEffects`, iterate ALL enemies at distance 0 from Nan (not just one). Each takes 10 magic damage. Applied once per round in `endTurn`.

### Max Distance

`isMoveLegal` already checks all pairwise entity distances. Max distance 3 applies between ANY two entities (heroes and minions, regardless of team). No changes needed — the function already works for N entities.

### Death & Game Over

- After each action (hero or minion), check all heroes for death (HP <= 0).
- Dead heroes are marked `alive = false` immediately.
- Dead heroes are excluded from future RPS rounds and action execution.
- If all heroes on one team are dead, `winner = otherTeamIndex`, `phase = 'game_over'`. Stop processing remaining actions in the round.

### 3v3

The engine supports 3v3 structurally (N-player RPS, N-player teams). However, 3v3 requires 6 unique heroes and we only have 4. The mode is disabled at game creation (validation error) until 6+ heroes are registered. The UI will not offer 3v3 as an option.

## Testing Strategy

### Regression

All 248 existing tests must continue passing. 1v1 remains a special case of the generalized system.

### New Unit Tests

1. **RPS multi-resolution**: 3-player and 4-player scenarios — all-3-present ties, 2-choice winners, single winner, recursive ordering to determine strict order.
2. **2v2 game creation**: Correct starting positions per team, unique hero validation, team assignment.
3. **2v2 action sequencing**: Multiple winners act in order. Death mid-round cancels remaining actions for dead players.
4. **2v2 punch counter**: Target-based counting, resets on target's own action, cross-team punches accumulate, 3 punches from different attackers triggers stun.
5. **2v2 targeting**: Punch enemy at distance 0 by choice, Kuang heals teammate, Kuang heals self, skill range validation with multiple heroes on the map.
6. **2v2 Nan stink**: Hits all enemies at distance 0, once per round.
7. **2v2 max distance**: Movement constrained by all entities including teammates.
8. **2v2 game over**: Team fully eliminated mid-round sets correct winner. Remaining actions skipped.

### E2E Scripted Battles

Extend the `.txt` DSL to support 4 players:
- `heroes: jin shan vs nan gao` — 4 heroes, p1-p2 on team 0, p3-p4 on team 1
- `p3` and `p4` as valid player IDs in action lines and assertions
- `pos: 1 1 2 2` — 4 starting positions

Add 2v2 scenarios to `scenarios/` covering multi-player RPS, cross-team combat, death mid-round, and Nan stink on multiple targets.

### Invariant Fuzzer

Extend the fuzzer to run random 2v2 matches in addition to 1v1. Same 11 invariants apply, plus:
- All alive heroes must have taken actions or lost RPS each round.
- No dead hero should appear in `actionOrder`.
