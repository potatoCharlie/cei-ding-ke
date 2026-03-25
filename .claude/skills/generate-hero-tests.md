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
