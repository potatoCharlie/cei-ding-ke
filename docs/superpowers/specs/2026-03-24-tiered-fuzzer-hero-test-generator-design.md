# Tiered Fuzzer & Hero Test Generator Design

## Summary

Two improvements to the automated test strategy:

1. **Tiered auto-scaling fuzzer** — the invariant fuzzer auto-discovers all heroes and covers all combinations. A `FUZZER_TIER` env var switches between a fast (~30s) developer tier and a deep (10–20 min) pre-ship tier.
2. **Hero test generator skill** — a Claude Code skill (`/generate-hero-tests <heroId>`) that reads a hero definition, generates a `.txt` scenario file covering all skills and the passive, runs the tests, self-corrects up to 3 times, and reports failures to the developer.

Scope: `packages/shared/src/__tests__/e2e/invariant-fuzzer.test.ts` (rewrite), `package.json` at repo root (new script), `.claude/skills/generate-hero-tests.md` (new skill file). Engine and hero definitions are untouched.

---

## 1. Tiered Auto-Scaling Fuzzer

### Combination generation

At test startup the fuzzer calls `getAllHeroes()` and computes:

- **1v1 pairs:** all C(N,2) unique unordered pairs of heroes.
- **2v2 team splits:** all C(N,4) groups of four heroes, each split into the 3 unique 2-vs-2 partitions. For heroes `[a,b,c,d]` the splits are `{a,b} vs {c,d}`, `{a,c} vs {b,d}`, `{a,d} vs {b,c}`.

No hardcoded hero names remain. Adding a hero file automatically expands coverage.

### Tiers

Controlled by the `FUZZER_TIER` environment variable (default: `fast`).

| Tier | 1v1 matches per pair | 2v2 combos sampled | 2v2 matches per combo | Approx runtime (14 heroes) |
|------|----------------------|--------------------|-----------------------|---------------------------|
| `fast` | 5 | up to 50 | 3 | ~30s |
| `deep` | 200 | up to 500 | 100 | ~10–20 min |

2v2 sampling uses a fixed seed (constant integer) so the same combos are always selected — failures are reproducible. When the total number of 2v2 combos is less than the cap, all combos are run.

### npm scripts

Added to root `package.json`:

```json
"test":       "cd packages/shared && npx vitest run",
"test:deep":  "FUZZER_TIER=deep cd packages/shared && npx vitest run"
```

`npm test` remains the fast developer command. `npm run test:deep` is run manually before shipping a feature.

### Additional invariants in `checkInvariants()`

Four new checks added alongside existing ones:

1. **`actionOrder` contains only alive, non-stunned players.** A stunned player must not appear in `actionOrder` for that turn (they cannot take actions). Note: their team may still win via passive effects such as Nan's stink aura.
2. **`currentActionIndex` never exceeds `actionOrder.length`.**
3. **Dead team → winner set.** If every player on a team has `hero.alive === false`, `state.winner` must be non-null and `state.phase` must be `'game_over'`.
4. **No duplicate IDs in `actionOrder`.** Each player ID appears at most once per turn's action order.

---

## 2. Hero Test Generator Skill

### Invocation

```
/generate-hero-tests <heroId>
```

Example: `/generate-hero-tests jin`

### Skill file

`.claude/skills/generate-hero-tests.md` at repo root.

### Process

**Step 1 — Read hero definition**

Read `packages/shared/src/heroes/<heroId>.ts`. Extract:
- Base HP and max HP
- Each skill: `id`, damage value and type (physical/magic), valid distance range, status effect applied (type + duration), `maxUses` (0 = unlimited)
- Passive: trigger condition and effect

**Step 2 — Read DSL reference**

Read 2–3 existing `.txt` files from `packages/shared/src/__tests__/e2e/scenarios/` to internalize current DSL syntax. Never guess syntax — derive it from examples.

**Step 3 — Generate scenario file**

Write `packages/shared/src/__tests__/e2e/scenarios/<heroId>.txt`. Scenarios generated per hero:

| Scenario | What it checks |
|----------|----------------|
| Each skill — happy path | Use skill at valid range, assert exact HP change on target |
| Each skill — status effect | Assert correct status field and duration after use (`stunned=true`, `trapped=2`, etc.) |
| Each skill — limited uses | Use skill until exhausted, assert correct use count / error on over-use |
| Passive | Set up trigger condition, verify passive fires with correct effect |
| Skill vs status target | Use skill on a trapped/stunned/invisible target where behaviour differs |
| 2v2 multi-target (if applicable) | Verify multi-target skills hit correct enemies |

Each scenario uses a fixed opponent from the existing hero pool (default: `nan` or `shan`, whichever is simplest for the scenario) to isolate the new hero's behaviour.

**Step 4 — Run and self-correct (up to 3 iterations)**

Run only the new scenario file:
```bash
cd packages/shared && npx vitest run --reporter=verbose 2>&1
```

If assertions fail (e.g., generated file says `hp=85` but engine produces `hp=80`):
- Read the failure output, identify which assertion line is wrong
- Correct the value in the `.txt` file to match actual engine output
- Re-run

The skill corrects scenario assertions to match the engine. It does **not** modify hero definitions or game logic. If a value looks wrong for game-design reasons, that is flagged as a note but not automatically fixed.

**Step 5 — Report**

- If all tests pass: print the path to the generated file and a summary of scenarios.
- If still failing after 3 iterations: print the failing scenario, actual vs expected values, and ask the developer to investigate — it may be a real engine bug or a scenario the skill cannot express in the DSL.

### What the skill does NOT do

- Does not verify that damage numbers are game-design-correct — it records what the engine produces. If a hero's numbers are wrong in the definition, the test will pass and the definition is wrong; that is a design review problem.
- Does not generate exhaustive cross-hero interaction scenarios — those are covered by the fuzzer. The skill generates targeted per-skill cases.
- Does not modify the fuzzer or any test infrastructure file.

---

## Testing

- After fuzzer rewrite: `npm test` passes in ~30s with 4 heroes; `npm run test:deep` runs in ~10–20 min.
- After adding a 5th hero: `npm test` automatically includes it in all 1v1 pairs and 2v2 combos — no changes to test files needed.
- Skill validation: run `/generate-hero-tests nan` (known hero) and verify the generated scenarios match existing `nan`-related tests.
