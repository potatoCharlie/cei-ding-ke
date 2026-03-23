# Railway Deployment Design

## Summary

Deploy cei-ding-ke as a single Railway service that serves both the Fastify+Socket.IO game server and the Vite-built static client. Railway's free tier ($5/month credit) is sufficient for ~10 DAU. Use Railway's auto-generated URL.

## Architecture

```
Railway Service (Node.js)
├── Fastify HTTP server (PORT from Railway env)
│   ├── GET /api/heroes — REST endpoint
│   ├── GET /api/health — health check
│   ├── /socket.io/* — Socket.IO WebSocket transport
│   └── /* — static files from client/dist (SPA fallback to index.html)
└── Socket.IO server (attached to same HTTP server)
```

In production, client and server share the same origin — no CORS needed, no WebSocket URL configuration.

## Changes Required

### 1. Server: serve static client files

Add `@fastify/static` to `packages/server`:

- Serve `packages/client/dist/` as static files
- SPA fallback: non-API, non-socket routes return `index.html`
- Only activate in production (when `dist/` exists) — dev workflow unchanged

### 2. Server: dynamic CORS origins

Update `packages/server/src/app.ts`:

- Read allowed origins from `CORS_ORIGIN` env var (comma-separated), falling back to localhost defaults
- In production on Railway, same-origin means CORS is a no-op, but keep it configurable for flexibility

### 3. Build pipeline

Railway needs a single build + start flow from the repo root.

**Build command:** `npm run build` (Turborepo builds shared → client → server in dependency order)

**Start command:** `node packages/server/dist/app.js`

The Turbo pipeline already handles the build order. The server's built output references `@cei-ding-ke/shared` which is resolved via workspace symlinks.

### 4. Railway configuration

Add `railway.json` at repo root:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node packages/server/dist/app.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 10
  }
}
```

Railway auto-detects the Node.js monorepo and runs `npm install` + `npm run build`. The `PORT` env var is set automatically by Railway.

### 5. Client: resolve static file path

The server needs to know the path to `packages/client/dist/`. Use `path.resolve()` relative to the server's location in the monorepo. In Railway's deployment, the full repo is present, so the relative path `../../client/dist` from the server's `dist/` directory works.

### 6. Client: Socket.IO connection

The client currently uses `socket.io-client` with default connection (connects to same origin). This already works in production since client and server share the same URL. No changes needed.

Verify by checking `packages/client/src/stores/gameStore.ts` or wherever `io()` is called — ensure it doesn't hardcode `localhost`.

## What Does NOT Change

- Game engine, shared package, all 248 tests
- Local dev workflow (`dev:server` on 3001, `dev:client` on 5173 with Vite proxy)
- No database, auth, or external services needed
- `invariant-fuzzer.test.ts` and `scripted-battles.test.ts` — untouched

## Verification

1. `npm run build` succeeds from repo root
2. `PORT=3001 node packages/server/dist/app.js` serves both API and client
3. Browser at `localhost:3001` loads the game UI
4. Two browser tabs can create/join a room and play a match
5. Railway deploy succeeds and the auto-generated URL is accessible
