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

- 1v1, 2v2, 3v3 modes (only 1v1 implemented so far)
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
- **Consecutive 3-punch stun**: Counter resets when attacker does a non-punch action. Hellfire minion punches are excluded from this mechanism.
- **Max distance constraint**: `isMoveLegal()` in `position.ts` checks all pairwise entity distances before allowing movement.

## Code Conventions

- TypeScript strict mode, ESM modules (`"type": "module"`)
- Shared package exports via `packages/shared/src/index.ts` — add new exports there
- Hero definitions follow the pattern in `packages/shared/src/heroes/` — each hero is one file exporting a `HeroDefinition`
- UI uses CSS custom properties defined in `index.html` (`--bg-deep`, `--gold`, `--team-blue`, etc.)
- Fonts: `Silkscreen` (pixel display font for headings/badges), `Chakra Petch` (body text) via Google Fonts
- Component styles use `<style>` tags with class-based CSS; BattleScene uses a separate `.css` file
- No test framework yet — manual playtesting only
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

## What's Implemented (Phase 1 & 2)

- **All 4 heroes** with full skill sets (Nan, Shan, Gao, Jin)
- **1v1 multiplayer** with RPS turn system, all actions, status effects, minions
- **Client**: Menu → Hero Select → Lobby → Battle → Result, retro pixel-art arena UI, team colors
- **Server**: Socket.IO rooms (create/join/quick match), authoritative state, phase timeouts

## What's Next

- **Playtesting & balance tuning** — all mechanics are in, needs real play sessions
- **2v2 / 3v3 modes** — types already defined, game engine needs multi-hero team support
- **Accounts & persistence** — database, auth, player profiles, match history
- **Audio & visual polish** — sound effects, animations, pixel art assets
- **Social features** — chat, friends, leaderboards
- **Infrastructure** — tests, deployment, error monitoring
