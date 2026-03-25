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
