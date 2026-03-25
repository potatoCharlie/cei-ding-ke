# Tiered Fuzzer & Hero Test Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 4-hero fuzzer with an auto-scaling tiered fuzzer, and add a `/generate-hero-tests` skill that writes and self-corrects per-hero `.txt` scenario files.

**Architecture:** Two independent deliverables. (1) `battle-simulator.ts` gets new invariant checks + a `assertWinnerListValid` helper; `invariant-fuzzer.test.ts` is fully rewritten to use `getHeroIds()`, generate all C(N,2) 1v1 pairs and C(N,4)×3 2v2 combos, and read `FUZZER_TIER` to control depth. (2) `.claude/skills/generate-hero-tests.md` is a new Claude Code skill file that drives hero-specific scenario generation. Neither change touches game engine code.

**Tech Stack:** TypeScript, Vitest, Node.js, Claude Code skills

---

## File Map

| Action | File |
|--------|------|
| Modify | `packages/shared/src/__tests__/e2e/battle-simulator.ts` |
| Rewrite | `packages/shared/src/__tests__/e2e/invariant-fuzzer.test.ts` |
| Modify | `package.json` (repo root) |
| Create | `.claude/skills/generate-hero-tests.md` (create `.claude/skills/` dir first) |

---

## Task 1: Add `test:deep` npm script

**Files:**
- Modify: `package.json` (repo root)

- [ ] **Step 1: Add `test:deep` to root `package.json` scripts**

Open `package.json`. The `"scripts"` block currently ends with `"test": "npm run test --workspace=@cei-ding-ke/shared"`. Add one line after it:

```json
"test:deep": "FUZZER_TIER=deep npm run test --workspace=@cei-ding-ke/shared"
```

The full scripts block after the edit:
```json
"scripts": {
  "dev": "turbo run dev",
  "build": "turbo run build",
  "dev:server": "npm run dev --workspace=@cei-ding-ke/server",
  "dev:client": "npm run dev --workspace=@cei-ding-ke/client",
  "build:shared": "npm run build --workspace=@cei-ding-ke/shared",
  "test": "npm run test --workspace=@cei-ding-ke/shared",
  "test:deep": "FUZZER_TIER=deep npm run test --workspace=@cei-ding-ke/shared"
}
```

- [ ] **Step 2: Verify both scripts are valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add test:deep npm script for pre-ship fuzzer tier"
```

---

## Task 2: Add new invariants and winner-list guard to `battle-simulator.ts`

**Files:**
- Modify: `packages/shared/src/__tests__/e2e/battle-simulator.ts`

Context: `battle-simulator.ts` exports `checkInvariants`, `simulateRandomMatch`, and `simulateRandomMatch2v2`. This task adds:
1. Three new checks inside `checkInvariants()` (dead-team, currentActionIndex bounds, no duplicate IDs).
2. A private `assertWinnerListValid()` function called after each `winRPS()` to catch fuzzer construction bugs.
3. Fix the 1v1 winner selection to exclude stunned players (it currently only checks `alive`).

- [ ] **Step 1: Add three invariants to `checkInvariants()` in `battle-simulator.ts`**

Find the section after the `// Phase/winner consistency` block (around line 245 of the current file). Add before the `return violations;` line:

```typescript
  // Dead team → game over
  for (let i = 0; i < state.teams.length; i++) {
    const team = state.teams[i];
    if (team.players.length > 0 && team.players.every(p => !p.hero.alive)) {
      if (state.winner === null || state.phase !== 'game_over') {
        violations.push(`Team ${i} all players dead but game not over (phase=${state.phase}, winner=${state.winner})`);
      }
    }
  }

  // currentActionIndex must not exceed actionOrder length
  if (state.currentActionIndex > state.actionOrder.length) {
    violations.push(`currentActionIndex ${state.currentActionIndex} exceeds actionOrder.length ${state.actionOrder.length}`);
  }

  // No duplicate IDs in actionOrder
  const seen = new Set<string>();
  for (const id of state.actionOrder) {
    if (seen.has(id)) {
      violations.push(`Duplicate ID '${id}' in actionOrder: [${state.actionOrder.join(', ')}]`);
      break;
    }
    seen.add(id);
  }
```

- [ ] **Step 2: Add `assertWinnerListValid` private helper function after the `winRPS` function**

The `winRPS` function is around line 114. Add right after it:

```typescript
/**
 * Asserts that the winner list passed to winRPS is valid (all alive and non-stunned).
 * Throws immediately — this is a fuzzer construction bug, not an engine violation.
 */
function assertWinnerListValid(state: GameState, winnerIds: string[]): void {
  for (const id of winnerIds) {
    let found = false;
    for (const team of state.teams) {
      for (const player of team.players) {
        if (player.id === id) {
          found = true;
          if (!player.hero.alive) {
            throw new Error(`FUZZER BUG: winner '${id}' is not alive`);
          }
          if (isStunned(player.hero)) {
            throw new Error(`FUZZER BUG: winner '${id}' is stunned`);
          }
        }
      }
    }
    if (!found) {
      throw new Error(`FUZZER BUG: winner '${id}' is not a valid player ID`);
    }
  }
}
```

- [ ] **Step 3: Fix 1v1 winner selection in `simulateRandomMatch` to exclude stunned players, and add `assertWinnerListValid` call**

Find the block in `simulateRandomMatch` that selects the winner (around line 270). Replace:

```typescript
    // Random RPS winner
    const winner = Math.random() < 0.5 ? 'p1' : 'p2';
    // Check if winner is alive; if not, pick the other
    const h1 = getHeroState(state, 'p1');
    const h2 = getHeroState(state, 'p2');
    let actualWinner = winner;
    if (winner === 'p1' && !h1.alive) actualWinner = 'p2';
    if (winner === 'p2' && !h2.alive) actualWinner = 'p1';

    winRPS(state, [actualWinner]);
```

With:

```typescript
    // Random RPS winner — must be alive and non-stunned
    const h1 = getHeroState(state, 'p1');
    const h2 = getHeroState(state, 'p2');
    const p1Eligible = h1.alive && !isStunned(h1);
    const p2Eligible = h2.alive && !isStunned(h2);

    let actualWinner: string;
    if (p1Eligible && p2Eligible) {
      actualWinner = Math.random() < 0.5 ? 'p1' : 'p2';
    } else if (p1Eligible) {
      actualWinner = 'p1';
    } else if (p2Eligible) {
      actualWinner = 'p2';
    } else {
      // Both stunned — advance turn with a no-op to avoid infinite loop
      const aliveId = ['p1', 'p2'].find(id => getHeroState(state, id).alive) ?? 'p1';
      winRPS(state, [aliveId]);
      executeAction(state, { type: 'stay', playerId: aliveId });
      continue;
    }

    winRPS(state, [actualWinner]);
    assertWinnerListValid(state, [actualWinner]);
```

- [ ] **Step 4: Add `assertWinnerListValid` call in `simulateRandomMatch2v2` after `winRPS`**

Find the two `winRPS` calls in `simulateRandomMatch2v2`. After each one, add:
```typescript
    assertWinnerListValid(state, winners);
```

There are two calls:
- The main `winRPS(state, winners)` call (inside the `eligible.length > 0` branch)
- The fallback `winRPS(state, [...])` call in the `eligible.length === 0` branch — skip this one (it's a forced advance, not a real winner)

So only add the assert after the main winners-selection `winRPS` call.

- [ ] **Step 5: Run existing tests to verify no regressions**

```bash
npm test
```

Expected: All existing tests pass. The new invariants should not fire on correct game states.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/__tests__/e2e/battle-simulator.ts
git commit -m "feat: add 3 new invariants and assertWinnerListValid to battle-simulator"
```

---

## Task 3: Rewrite `invariant-fuzzer.test.ts`

**Files:**
- Rewrite: `packages/shared/src/__tests__/e2e/invariant-fuzzer.test.ts`

Context: The existing file has three `describe` blocks: `Invariant Fuzzer` (1v1 cartesian, 50 matches), `2v2 Invariant Fuzzer` (3 hardcoded splits, 20 matches), `Termination Tests` (cartesian with 10 runs each). Replace entirely with the content below.

Key changes from the old file:
- Import `getHeroIds` from `../../index.js`
- Remove `const HEROES = [...]`
- Read `FUZZER_TIER` from `process.env` to set `MATCHES_1V1`, `COMBOS_2V2_CAP`, `MATCHES_2V2`
- Generate 1v1 pairs as C(N,2) unordered pairs (no same-hero)
- Generate 2v2 combos as all C(N,4)×3 splits, sorted by canonical key, capped by tier
- Termination Tests block: replace `HEROES` with `getHeroIds()` (keep cartesian product as before, including same-hero)

- [ ] **Step 1: Replace the entire content of `invariant-fuzzer.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { getHeroIds } from '../../index.js';
import {
  simulateRandomMatch,
  simulateRandomMatch2v2,
  formatLog,
  checkInvariants,
} from './battle-simulator.js';

// ─── Tier configuration ───────────────────────────────────────────────────────

const TIER = process.env.FUZZER_TIER ?? 'fast';

const MATCHES_1V1    = TIER === 'deep' ? 200 : 5;
const COMBOS_2V2_CAP = TIER === 'deep' ? 500 : 50;
const MATCHES_2V2    = TIER === 'deep' ? 100 : 3;
const MAX_TURNS      = 50;

// ─── Combination generation ───────────────────────────────────────────────────

const heroIds = getHeroIds();

// 1v1: all C(N,2) unique unordered pairs (same-hero matchups excluded)
const pairs1v1: [string, string][] = [];
for (let i = 0; i < heroIds.length; i++) {
  for (let j = i + 1; j < heroIds.length; j++) {
    pairs1v1.push([heroIds[i], heroIds[j]]);
  }
}

// 2v2: all C(N,4) groups of four heroes × 3 unique team splits
// Sorted lexicographically by canonical key for deterministic capping
interface Combo2v2 {
  team0: [string, string];
  team1: [string, string];
  key: string;
}

function make2v2Combos(ids: string[]): Combo2v2[] {
  const combos: Combo2v2[] = [];
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      for (let c = b + 1; c < ids.length; c++) {
        for (let d = c + 1; d < ids.length; d++) {
          const [h0, h1, h2, h3] = [ids[a], ids[b], ids[c], ids[d]];
          // 3 unique 2-vs-2 splits of [h0, h1, h2, h3]
          const splits: [[string, string], [string, string]][] = [
            [[h0, h1], [h2, h3]],
            [[h0, h2], [h1, h3]],
            [[h0, h3], [h1, h2]],
          ];
          for (const [t0, t1] of splits) {
            // key = sorted-4-tuple | sorted-team0  (deterministic, tiebreaks splits of same 4-tuple)
            const key = `${h0},${h1},${h2},${h3}|${[...t0].sort().join(',')}`;
            combos.push({ team0: t0, team1: t1, key });
          }
        }
      }
    }
  }
  combos.sort((a, b) => a.key.localeCompare(b.key));
  return combos;
}

const allCombos2v2    = make2v2Combos(heroIds);
const sampledCombos2v2 = allCombos2v2.slice(0, COMBOS_2V2_CAP);

// ─── 1v1 Invariant Fuzzer ─────────────────────────────────────────────────────

describe('1v1 Invariant Fuzzer', () => {
  for (const [hero1, hero2] of pairs1v1) {
    it(`${hero1} vs ${hero2}: ${MATCHES_1V1} random matches with no invariant violations`, () => {
      for (let i = 0; i < MATCHES_1V1; i++) {
        const { state, log, violations } = simulateRandomMatch(hero1, hero2, MAX_TURNS);

        if (violations.length > 0) {
          throw new Error(
            `Invariant violations in ${hero1} vs ${hero2} match #${i + 1}:\n` +
            violations.join('\n') +
            `\n\nFull battle log:\n${formatLog(log)}`
          );
        }

        if (state.phase !== 'game_over') {
          const finalViolations = checkInvariants(state);
          if (finalViolations.length > 0) {
            throw new Error(
              `Final state invariant violations in ${hero1} vs ${hero2} match #${i + 1}:\n` +
              finalViolations.join('\n') +
              `\n\nFull battle log:\n${formatLog(log)}`
            );
          }
        }
      }
    });
  }
});

// ─── 2v2 Invariant Fuzzer ─────────────────────────────────────────────────────

describe('2v2 Invariant Fuzzer', () => {
  for (const combo of sampledCombos2v2) {
    const label = `${combo.team0.join('+')} vs ${combo.team1.join('+')}`;
    it(`${label}: ${MATCHES_2V2} random matches with no invariant violations`, () => {
      for (let i = 0; i < MATCHES_2V2; i++) {
        const { state, log, violations } = simulateRandomMatch2v2(combo.team0, combo.team1, MAX_TURNS);

        if (violations.length > 0) {
          throw new Error(
            `Invariant violations in ${label} match #${i + 1}:\n` +
            violations.join('\n') +
            `\n\nFull battle log:\n${formatLog(log)}`
          );
        }

        if (state.phase !== 'game_over') {
          const finalViolations = checkInvariants(state);
          if (finalViolations.length > 0) {
            throw new Error(
              `Final state invariant violations in ${label} match #${i + 1}:\n` +
              finalViolations.join('\n') +
              `\n\nFull battle log:\n${formatLog(log)}`
            );
          }
        }
      }
    });
  }
});

// ─── Termination Tests ────────────────────────────────────────────────────────

describe('Termination Tests', () => {
  it('all hero combinations terminate within reasonable turns', () => {
    let totalGames = 0;
    let gamesOver = 0;
    const allHeroIds = getHeroIds();
    const MAX_TURNS_FOR_TERMINATION = 100;

    for (const hero1 of allHeroIds) {
      for (const hero2 of allHeroIds) {
        for (let i = 0; i < 10; i++) {
          const { state } = simulateRandomMatch(hero1, hero2, MAX_TURNS_FOR_TERMINATION);
          totalGames++;
          if (state.phase === 'game_over') gamesOver++;
        }
      }
    }

    // At least 30% of games should terminate
    const terminationRate = gamesOver / totalGames;
    expect(terminationRate).toBeGreaterThan(0.3);
  });
});
```

- [ ] **Step 2: Run tests (fast tier)**

```bash
npm test
```

Expected: All tests pass. The rewritten fuzzer in fast tier runs C(4,2)=6 pairs × 5 matches = 30 1v1 tests, and 3 2v2 combos × 3 matches = 9 2v2 tests (with 4 heroes there are only 3 total 2v2 combos, below the cap of 50).

- [ ] **Step 3: Verify test counts are plausible**

Run with verbose output to confirm the describe blocks have the right number of tests:
```bash
cd packages/shared && npx vitest run src/__tests__/e2e/invariant-fuzzer.test.ts --reporter=verbose
```

Expected output includes:
- `1v1 Invariant Fuzzer` with 6 test cases (nan vs shan, nan vs gao, nan vs jin, shan vs gao, shan vs jin, gao vs jin)
- `2v2 Invariant Fuzzer` with 3 test cases
- `Termination Tests` with 1 test case

- [ ] **Step 4: Smoke-test the deep tier (abort quickly if it starts)**

```bash
cd packages/shared && FUZZER_TIER=deep npx vitest run src/__tests__/e2e/invariant-fuzzer.test.ts --reporter=verbose 2>&1 | head -20
```

Expected: Test names show `200 random matches` for 1v1 and `100 random matches` for 2v2. You can Ctrl-C after seeing the labels — no need to run the full deep suite here.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/__tests__/e2e/invariant-fuzzer.test.ts
git commit -m "feat: rewrite invariant fuzzer with auto-discovery and FUZZER_TIER tiers"
```

---

## Task 4: Create hero test generator skill

**Files:**
- Create: `.claude/skills/` directory at repo root
- Create: `.claude/skills/generate-hero-tests.md`

Context: Claude Code loads skills from `.claude/skills/` in the project directory. The skill is invoked as `/generate-hero-tests <heroId>`. The directory `.claude/` exists but `.claude/skills/` does not.

- [ ] **Step 1: Create the `.claude/skills/` directory**

```bash
mkdir -p .claude/skills
```

- [ ] **Step 2: Write `.claude/skills/generate-hero-tests.md`**

```markdown
---
name: generate-hero-tests
description: Generate and self-correct a .txt scenario file for a hero. Usage: /generate-hero-tests <heroId>
---

# Generate Hero Tests

Generates a complete `.txt` scenario file for a hero, runs it, and self-corrects assertions up to 3 times.

**Announce at start:** "I'm using the generate-hero-tests skill for hero: `<heroId>`."

## Process

### Step 1 — Read the hero definition

Read `packages/shared/src/heroes/<heroId>.ts`.

Extract:
- Base HP and `maxHp`
- Each skill: `id`, damage value, damage type (physical/magic), valid distance range (`minDistance`/`maxDistance`), status effect applied (type + `remainingRounds`), `maxUses` (0 = unlimited)
- Passive: name, trigger condition, effect description

### Step 2 — Read DSL syntax from examples

Read `packages/shared/src/__tests__/e2e/scenarios/abilities.txt` and one other `.txt` file from the same directory.

DSL rules (derive from examples, never guess):
- `=== Scenario name` — starts a scenario
- `heroes: <hero1> vs <hero2>` (1v1) or `heroes: h1 h2 vs h3 h4` (2v2)
- `pos: <p1pos> <p2pos>` (1v1) or `pos: p1 p2 p3 p4` (2v2)
- `setup p1|p2|p3|p4: key=val` — mutate initial state (e.g., `hp=50`)
- `turn N: p1 wins` or `turn N: p1 p2 win` (2v2 multi-winner)
- Action lines: `p1 punch p2`, `p1 skill <skillId> [target]`, `p1 move_forward`, `p1 move_backward`, `p1 stay`, `p1 summon`
- Assertion lines: `> p1: hp=80 stunned=true`, `> phase=game_over winner=0`

### Step 3 — Generate the scenario file

Write `packages/shared/src/__tests__/e2e/scenarios/<heroId>.txt`.

Generate these scenarios for each hero:

| Scenario | What to verify |
|----------|----------------|
| Each skill — happy path | Use skill at valid range (`minDistance`), assert exact HP loss on target (`maxHp - damage`) |
| Each skill — status effect (if any) | Assert correct status field after use (e.g., `stunned=true`, `trapped=2`) |
| Each skill — use limit (if `maxUses > 0`) | Use skill `maxUses` times in separate turns — assert skill is unavailable on the next attempt (skip step if `maxUses === 0`) |
| Passive | Set up trigger condition from passive definition, verify effect fires (HP change, status, etc.) |

Use a simple opponent from the existing pool (`nan` or `shan`) for all scenarios to isolate the new hero's behaviour. Set positions so the skill's range condition is satisfied without extra movement turns.

**IMPORTANT: Every `=== ` scenario title MUST include the hero ID** (e.g., `=== jin: small dart happy path`, not `=== small dart happy path`). This ensures the vitest `-t <heroId>` filter in Step 4 only runs the new scenarios and not all pre-existing ones.

### Step 4 — Run and self-correct (up to 3 iterations)

Run the scripted-battles test filtered to this hero:

```bash
cd packages/shared && npx vitest run src/__tests__/e2e/scripted-battles.test.ts -t "<heroId>" --reporter=verbose
```

If assertions fail (e.g., generated file says `hp=85` but engine says `hp=80`):
1. Read the failure output to find the failing assertion line(s)
2. Correct the value in the `.txt` file to match actual engine output
3. Re-run

**The skill corrects assertions to match the engine. It does NOT modify hero definitions or game logic.** If a value looks wrong for game-design reasons, flag it as a note but do not auto-fix.

Repeat until all pass or 3 iterations are exhausted.

### Step 5 — Report

**If all tests pass:**
```
Generated: packages/shared/src/__tests__/e2e/scenarios/<heroId>.txt
Scenarios: <N> scenarios, <M> assertions
All tests passing.
```

**If still failing after 3 iterations:**
```
Still failing after 3 self-correction attempts.
Failing scenario: <scenario name>
Actual vs expected: <details>
This may be an engine bug or a scenario the DSL cannot express. Please investigate.
```

## What this skill does NOT do

- Does not verify that damage numbers are game-design-correct — it records what the engine produces
- Does not generate cross-hero interaction scenarios (covered by the fuzzer)
- Does not modify the fuzzer or any test infrastructure file
```

- [ ] **Step 3: Run `npm test` to confirm the new file doesn't break anything**

```bash
npm test
```

Expected: All tests pass (the skill file is a markdown file, not picked up by Vitest).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/generate-hero-tests.md
git commit -m "feat: add /generate-hero-tests Claude Code skill"
```

---

## Validation

After all tasks:

- [ ] **Fast tier passes in ~30s:**
  ```bash
  npm test
  ```

- [ ] **Skill works on a known hero:**
  ```
  /generate-hero-tests nan
  ```
  Verify the generated file `packages/shared/src/__tests__/e2e/scenarios/nan.txt` has passing scenarios.
  (Delete the generated file after validation if you don't want to commit it — the skill is the deliverable, not the generated file.)
