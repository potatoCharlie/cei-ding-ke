# cei-ding-ke

A turn-based online multiplayer game based on rock-paper-scissors mechanics. Hearthstone-inspired UI with AI-generated pixel art style.

## Project Structure

Monorepo with npm workspaces + Turborepo:

- `packages/shared/` — Shared game logic (runs on both client & server). Source of truth for all game rules.
- `packages/server/` — Node.js + Fastify + Socket.IO game server (port 3001)
- `packages/client/` — React + Vite frontend (port 5173)

## Development

```bash
npm install              # Install dependencies
npm run build:shared     # Build shared package (REQUIRED before server/client)
npm run dev:server       # Start server (port 3001)
npm run dev:client       # Start client (port 5173, separate terminal)
npm run build            # Build all packages (turbo)
```

**Gotcha**: After changing `packages/shared/`, you MUST run `npm run build:shared` before the server or client will pick up changes. The client hot-reloads its own code but not shared imports.

Client proxies `/api` and `/socket.io` to `localhost:3001` via Vite config.

## Deployment

Deployed as a single Railway service. The Fastify server serves both the Socket.IO game server and the Vite-built static client.

- **Platform**: Railway (free tier, Nixpacks builder)
- **Config**: `railway.json` at repo root
- **Build**: `npm run build` (Turborepo builds shared → client → server)
- **Start**: `node packages/server/dist/app.js`
- **Health check**: `GET /api/health`
- **Static serving**: `@fastify/static` serves `packages/client/dist/` with SPA fallback
- **CORS**: Configurable via `CORS_ORIGIN` env var (comma-separated), defaults to localhost

Deploys automatically on push to `main` via Railway's GitHub integration.

## Key Files

| Area | File | Purpose |
|------|------|---------|
| Game engine | `shared/src/game-engine/GameState.ts` | Core state machine, action execution, effect resolution |
| Combat | `shared/src/game-engine/combat.ts` | Punch, skill damage, wind walk punch |
| Movement | `shared/src/game-engine/movement.ts` | Hero movement with enemy-relative direction |
| Positions | `shared/src/game-engine/position.ts` | Distance calc, `isMoveLegal()`, max distance constraint |
| RPS | `shared/src/game-engine/rps.ts` | Rock-paper-scissors resolution |
| Status effects | `shared/src/game-engine/status-effects.ts` | Stun, trap, slow, invisibility tick/expiry |
| Heroes | `shared/src/heroes/{nan,shan,gao,jin}.ts` | Hero definitions (skills, stats, passives) |
| Types | `shared/src/types/game.ts` | All game state types |
| Protocol | `shared/src/types/protocol.ts` | Socket.IO event types |
| Server rooms | `server/src/game/GameRoom.ts` | Room lifecycle, phase management, timeouts |
| Socket handlers | `server/src/socket/handlers/game.ts` | Socket.IO event handlers |
| Battle UI | `client/src/scenes/BattleScene.tsx` | Main battle rendering, grid, animations |
| Actions UI | `client/src/components/ActionPanel.tsx` | Action selection panel |
| Game store | `client/src/stores/gameStore.ts` | Zustand client state |

## Game Design

Source of truth: `game-plan.docx` (gitignored, the `.txt` export is missing hero tables).

- 1v1 and 2v2 modes (engine supports both; 3v3 structurally supported but disabled until 6+ heroes exist)
- Each turn: players do rock-paper-scissors, winner gets 1 action
- Actions: move forward/backward, punch, cast skill, summon minion, stay
- Infinite 1D map (unbounded positions), max distance between any 2 entities = 3
- 4 heroes: Nan (mage/DoT), Shan (fighter), Gao (summoner), Jin (assassin)

## Key Architectural Decisions

- **Shared game logic**: The `shared` package contains ALL game rules. Server is authoritative (prevents cheating). Client uses same logic for validation.
- **Status effects tick at start of turn** (in `startTurn()`), not end of turn. This ensures effects like stun last through the next round's RPS phase.
- **Server auto-skips RPS** when a player is stunned (`beginRPSPhase()` in GameRoom).
- **Game state machine**: `rps_submit → rps_resolve → action_phase → effect_resolve → turn_end → loop`
- **Movement is enemy-relative**: "forward" = toward nearest opponent, "backward" = away. Not team-index based.
- **Stun-break on active damage only**: `applyEffects(state, effects, breakStun)` — only hero/minion active attacks pass `breakStun=true`. Passive damage (stink aura, frozen DoT) does NOT wake stunned heroes.
- **Consecutive 3-punch stun (target-based)**: Tracked per target — `consecutivePunchesReceived` increments when punched by anyone, resets when the target takes ANY action. 3 punches without acting = stun. Hellfire minion punches are excluded from this mechanism.
- **Max distance constraint**: `isMoveLegal()` in `position.ts` checks all pairwise entity distances before allowing movement.
- **2v2 multi-player RPS**: Elimination-style — if all 3 choices present → tie, if 2 choices → standard RPS winners/losers. Winners act in sequence via `actionOrder`. Uses `resolveRPSMulti` from `rps.ts`.
- **2v2 game creation**: `createGameState(gameId, '2v2', players[])` with backward-compatible `(gameId, player1, player2)` overload. No duplicate heroes in 2v2. 3v3 throws until 6+ heroes.
- **Kuang teammate heal**: 40 HP heal (same as self-cast), no self-damage. Only Kuang allows teammate targeting.

## Code Conventions

- TypeScript strict mode, ESM modules (`"type": "module"`)
- Shared package exports via `packages/shared/src/index.ts` — add new exports there
- Hero definitions follow the pattern in `packages/shared/src/heroes/` — each hero is one file exporting a `HeroDefinition`
- UI uses CSS custom properties defined in `index.html` (`--bg-deep`, `--gold`, `--team-blue`, etc.)
- Fonts: `Silkscreen` (pixel display font for headings/badges), `Chakra Petch` (body text) via Google Fonts
- Component styles use `<style>` tags with class-based CSS; BattleScene uses a separate `.css` file
- Test framework: Vitest (in `packages/shared`). Run `npm test` or `cd packages/shared && npx vitest run`
- Test helpers in `packages/shared/src/__tests__/helpers.ts` (`makeGame`, `winRPSForPlayer`, `setPositions`, `getHero`, `getPlayer`)
- No linter configured yet

## Common Workflows

**Adding a new hero:**
1. Create `packages/shared/src/heroes/<name>.ts` following existing hero file pattern
2. Export from `packages/shared/src/index.ts`
3. Add sprite config in `packages/client/src/game/SpriteConfig.ts`
4. Rebuild shared: `npm run build:shared`

**Adding a new action type:**
1. Add to `ActionType` union in `packages/shared/src/types/game.ts`
2. Handle in `executeAction()` in `packages/shared/src/game-engine/GameState.ts`
3. Add UI in `packages/client/src/components/ActionPanel.tsx`
4. Rebuild shared

**Adding a new status effect:**
1. Add to `StatusEffectType` in `packages/shared/src/types/game.ts`
2. Handle tick/expiry in `packages/shared/src/game-engine/status-effects.ts`
3. Add icon in `packages/client/src/scenes/BattleScene.tsx`

## What's Implemented (Phase 1, 2 & 3)

- **All 4 heroes** with full skill sets (Nan, Shan, Gao, Jin)
- **1v1 multiplayer** with RPS turn system, all actions, status effects, minions
- **2v2 game engine** — multi-player RPS (elimination-style), sequential action execution, target-based punch counter, Kuang teammate heal, Nan multi-target stink aura, mid-round death handling
- **Client**: Menu → Hero Select → Lobby → Battle → Result, retro pixel-art arena UI, team colors
- **Server**: Socket.IO rooms (create/join/quick match), authoritative state, phase timeouts
- **Deployment**: Railway (single service, Fastify + static client)

## Testing

280 tests in `packages/shared` covering all game logic (zero server/client needed):

| Test file | Coverage area |
|-----------|---------------|
| `rps.test.ts` | All 9 RPS combos, resolution, random choice |
| `position.test.ts` | Distance, direction, entity positions, MAX_DISTANCE |
| `movement.test.ts` | Speed modifiers, trapped/invisible, forward/backward |
| `combat.test.ts` | Punch, Wind Walk punch, all skills, invisible interactions |
| `status-effects.test.ts` | Apply/tick/expire, Frozen DoT, stink aura |
| `GameState.test.ts` | Full state machine: RPS → action → effects → death → game over |
| `nan/shan/gao/jin.test.ts` | Per-hero skill behavior and edge cases |
| `scenarios.test.ts` | Multi-turn combos (3-punch stun, stealth approach, summon+minion) |
| `edge-cases.test.ts` | 1 HP death, heal cap, negative positions, multiple effects |
| `suspected-bugs.test.ts` | Magic immunity, minion stun-break, punch counter resets, stun interactions |
| `available-actions.test.ts` | getAvailableActions for all action types and constraints |
| `advanced-scenarios.test.ts` | Skill interactions, multi-turn combat, game over conditions, position mechanics |
| `rps-multi.test.ts` | N-player elimination-style RPS resolution |
| `2v2-game.test.ts` | 2v2 game creation, RPS resolution, sequential action execution |
| `2v2-combat.test.ts` | Target-based punch counter, Kuang teammate heal |
| `2v2-passives.test.ts` | Nan stink aura on multiple enemies |
| `e2e/scripted-battles.test.ts` | 16 full-match scenarios (1v1 + 2v2) loaded from `.txt` DSL files (see below) |
| `e2e/invariant-fuzzer.test.ts` | 800+ random 1v1 matches + 60 random 2v2 matches checking invariants |

### E2E Battle Simulator

The `e2e/` directory contains a battle simulation framework:

- **`battle-simulator.ts`** — Drives full matches through the game engine. Supports scripted scenarios (`simulateBattle`), random 1v1 fuzzing (`simulateRandomMatch`), and random 2v2 fuzzing (`simulateRandomMatch2v2`).
- **`script-parser.ts`** — Parses human-readable `.txt` scenario files into `BattleScript` objects.
- **`scenarios/*.txt`** — Test scenarios in a custom text DSL. To add a new test, just add lines to a `.txt` file:
  ```
  === My new scenario
  heroes: jin vs shan
  pos: 5 5

  turn 1: p1 wins
    p1 skill small_dart p2
    > p2: hp=95 stunned=true
  ```
  DSL reference: `heroes:` (2 or 4 heroes), `pos:` (2 or 4 positions), `setup p1|p2|p3|p4: key=val`, `turn N: pX wins` or `turn N: p1 p2 win` (multi-winner), action lines (`punch`, `skill`, `move_forward`, `move_backward`, `summon`, `stay`), `minion` lines, `> pX: key=val` assertions, `> phase=X winner=X` assertions.
- **`invariant-fuzzer.test.ts`** — Runs random matches and checks invariants (HP bounds, death consistency, distance limits, phase/winner consistency, etc.).

## Known Design Gaps

- **Hellfire magic immunity**: `immuneTo: ['magic']` is defined on the minion but not enforced — minions can't be targeted by skills yet, so it's moot. Must be implemented when minion targeting is added.

## What's Next

- **2v2 server & client** — server room management for 2v2 matches, client UI for 4-player battles, hero draft select
- **Accounts & persistence** — database, auth, player profiles, match history
- **Audio & visual polish** — sound effects, animations, pixel art assets
- **Social features** — chat, friends, leaderboards
