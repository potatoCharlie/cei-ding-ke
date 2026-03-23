# Railway Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy cei-ding-ke as a single Railway service serving both the game server and static client.

**Architecture:** Fastify serves Socket.IO + REST API as before, plus static files from the Vite client build via `@fastify/static`. Railway runs `npm run build` (Turbo handles dependency order) then starts the Node.js server.

**Tech Stack:** Fastify, @fastify/static, Socket.IO, Vite, Railway (Nixpacks), Turborepo

**Spec:** `docs/superpowers/specs/2026-03-23-railway-deployment-design.md`

---

### Task 1: Install @fastify/static

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Install the dependency**

Run:
```bash
npm install @fastify/static --workspace=@cei-ding-ke/server
```

- [ ] **Step 2: Verify it installed**

Run:
```bash
cat packages/server/package.json | grep fastify/static
```
Expected: `"@fastify/static": "^X.X.X"` in dependencies

- [ ] **Step 3: Commit**

```bash
git add packages/server/package.json package-lock.json
git commit -m "feat: add @fastify/static dependency for serving client build"
```

---

### Task 2: Serve static client files in production

**Files:**
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Add static file serving after existing routes**

Add these imports at the top of `packages/server/src/app.ts`:

```typescript
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
```

Add this block after the health check route (`fastify.get('/api/health', ...)`) and before `fastify.listen()`:

```typescript
// Serve static client files in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDistPath = join(__dirname, '../../client/dist');

// Only serve static files if the client build exists
import { existsSync } from 'fs';
if (existsSync(clientDistPath)) {
  await fastify.register(fastifyStatic, {
    root: clientDistPath,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: serve index.html for non-API routes
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/socket.io/')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    return reply.sendFile('index.html');
  });
}
```

- [ ] **Step 2: Make CORS dynamic**

Replace the hardcoded CORS origins:

```typescript
// Before:
await fastify.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:3000'],
});

// After:
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

await fastify.register(cors, {
  origin: corsOrigins,
});
```

Also update the Socket.IO CORS:

```typescript
// Before:
const io = new Server(fastify.server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

// After:
const io = new Server(fastify.server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
});
```

Move the `corsOrigins` definition before both the Fastify CORS registration and the Socket.IO server creation so it's available to both.

- [ ] **Step 3: Build and test locally**

Run:
```bash
npm run build
```
Expected: All three packages build successfully.

Then test the production server locally:
```bash
PORT=3001 node packages/server/dist/app.js
```
Expected: Server starts, visit `http://localhost:3001` in browser — the game UI loads. Open two tabs, create and join a room to verify Socket.IO works.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/app.ts
git commit -m "feat: serve static client files and SPA fallback in production"
```

---

### Task 3: Add Railway configuration

**Files:**
- Create: `railway.json`

- [ ] **Step 1: Create railway.json**

Create `railway.json` at the repo root:

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

- [ ] **Step 2: Commit**

```bash
git add railway.json
git commit -m "feat: add Railway deployment configuration"
```

---

### Task 4: Fix server outDir for production path resolution

**Files:**
- Verify: `packages/server/tsconfig.json`

- [ ] **Step 1: Verify path resolution**

The server's `__dirname` in the compiled output will be `packages/server/dist/`. The static file path `join(__dirname, '../../client/dist')` resolves to `packages/client/dist/`. Verify this is correct:

```bash
node -e "
const { join } = require('path');
const serverDist = 'packages/server/dist';
console.log(join(serverDist, '../../client/dist'));
"
```
Expected: `packages/client/dist`

No changes needed if the path resolves correctly.

---

### Task 5: Deploy to Railway

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Create Railway project**

1. Go to https://railway.com and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select the `cei-ding-ke` repository
4. Railway auto-detects Node.js, runs `npm install` + `npm run build`, then uses `railway.json` for start command
5. Wait for deployment to complete (check build logs)

- [ ] **Step 3: Verify deployment**

1. Open the Railway-provided URL (e.g., `https://cei-ding-ke-production.up.railway.app`)
2. Verify the game UI loads
3. Open two browser tabs, create a room in one, join in the other
4. Play a match to verify WebSocket communication works end-to-end

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add deployment section to CLAUDE.md**

Add a `## Deployment` section after `## Development`:

```markdown
## Deployment

Deployed as a single Railway service. The Fastify server serves both the Socket.IO game server and the Vite-built static client.

- **Platform**: Railway (free tier, Nixpacks builder)
- **URL**: [Railway auto-generated URL — update after first deploy]
- **Config**: `railway.json` at repo root
- **Build**: `npm run build` (Turborepo builds shared → client → server)
- **Start**: `node packages/server/dist/app.js`
- **Health check**: `GET /api/health`

Deploys automatically on push to `main` via Railway's GitHub integration.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add deployment section to CLAUDE.md"
```
