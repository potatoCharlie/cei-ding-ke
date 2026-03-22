# cei-ding-ke

A turn-based online multiplayer game based on rock-paper-scissors mechanics. Hearthstone-inspired UI with AI-generated pixel art style.

## Project Structure

Monorepo with npm workspaces + Turborepo:

- `packages/shared/` — Shared game logic (runs on both client & server). Source of truth for all game rules.
- `packages/server/` — Node.js + Fastify + Socket.IO game server (port 3001)
- `packages/client/` — React + Vite frontend (port 5173)

## Development

```bash
# Install dependencies
npm install

# Build shared package (required before running server)
npm run build:shared

# Run server
npm run dev:server

# Run client (in a separate terminal)
npm run dev:client
```

Client proxies `/api` and `/socket.io` to `localhost:3001` via Vite config.

## Game Design

Source of truth: `game-plan.docx` (the `.txt` export is missing hero tables).

- 1v1, 2v2, 3v3 modes (only 1v1 implemented so far)
- Each turn: players do rock-paper-scissors, winner gets 1 action
- Actions: move forward/backward, punch, cast skill, summon minion
- 1D map with distance 0-3
- 4 heroes: Nan (mage/DoT), Shan (fighter), Gao (summoner), Jin (assassin)

## Key Architectural Decisions

- **Shared game logic**: The `shared` package contains ALL game rules. Server is authoritative (prevents cheating). Client uses same logic for validation.
- **Status effects tick at start of turn** (in `startTurn()`), not end of turn. This ensures effects like stun last through the next round's RPS phase.
- **Server auto-skips RPS** when a player is stunned (`beginRPSPhase()` in GameRoom).
- **Game state machine**: `rps_submit → rps_resolve → action_phase → effect_resolve → turn_end → loop`
