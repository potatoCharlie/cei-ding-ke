/**
 * Log Audit Fuzzer — 1000 random 1v1 games
 *
 * Runs 1000 fully random games (random hero pairs, random RPS, random actions)
 * and audits each turn's log for:
 *
 *   1. All invariants from checkInvariants() — HP bounds, death consistency,
 *      status durations, skill uses, minion count, phase/winner consistency,
 *      max distance between alive entities (added to checkInvariants).
 *
 *   2. HP delta consistency — if a hero's HP decreased, at least one 'damage'
 *      effect targeting them must appear in the log for that turn. If HP
 *      increased, at least one 'heal' effect must appear. Silent HP changes
 *      indicate engine bugs.
 *
 * On any violation the test throws immediately with the full battle log so the
 * bug can be reproduced.
 */

import { describe, it } from 'vitest';
import { getHeroIds, getHero } from '../../index.js';
import {
  simulateRandomMatch,
  formatLog,
  type BattleLog,
} from './battle-simulator.js';

const TOTAL_GAMES = 1000;
const MAX_TURNS_PER_GAME = 80;

// ─── HP Delta Audit ───────────────────────────────────────────────────────────

/**
 * Audits the game log for HP delta consistency:
 * - HP decreased without any 'damage' effect targeting that player → bug
 * - HP increased without any 'heal' effect targeting that player → bug
 *
 * Dead heroes (hp=0, alive=false) are excluded after the turn they die.
 */
function auditHpDeltas(
  log: BattleLog,
  playerIds: string[],
  initialHp: Record<string, number>
): string[] {
  const violations: string[] = [];

  // Track HP between turns; initialised from actual hero starting HP
  const hpBefore: Record<string, number> = { ...initialHp };

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    const turnLabel = `Turn ${i + 1}`;

    // All effects this turn (DoT, hero actions, minion actions)
    const allEffects = [
      ...entry.startTurnEffects,
      ...entry.heroEffects,
      ...entry.minionEffects,
    ];

    for (const id of playerIds) {
      const snap = entry.stateAfter[id] as
        | { hp: number; position: number; alive: boolean }
        | undefined;
      if (!snap) continue;

      const prev = hpBefore[id];
      const curr = snap.hp;

      if (curr < prev) {
        // HP dropped — must have at least one damage effect targeting this player
        const hasDamage = allEffects.some(
          e => e.targetId === id && e.type === 'damage'
        );
        if (!hasDamage) {
          violations.push(
            `${turnLabel}: ${id} HP dropped ${prev} → ${curr} but no 'damage' effect recorded for them`
          );
        }
      }

      if (curr > prev) {
        // HP rose — must have at least one heal effect targeting this player
        const hasHeal = allEffects.some(
          e => e.targetId === id && e.type === 'heal'
        );
        if (!hasHeal) {
          violations.push(
            `${turnLabel}: ${id} HP rose ${prev} → ${curr} but no 'heal' effect recorded for them`
          );
        }
      }

      hpBefore[id] = curr;
    }
  }

  return violations;
}

// ─── Main Fuzzer ──────────────────────────────────────────────────────────────

describe('Log Audit Fuzzer', () => {
  it(`${TOTAL_GAMES} random 1v1 games: no invariant or HP-delta violations`, () => {
    const heroIds = getHeroIds();

    let totalTurns = 0;
    let gamesCompleted = 0; // reached game_over within turn limit

    for (let g = 0; g < TOTAL_GAMES; g++) {
      // Pick two random heroes (may repeat across games)
      const h1 = heroIds[Math.floor(Math.random() * heroIds.length)];
      const h2 = heroIds[Math.floor(Math.random() * heroIds.length)];

      const { state, log, violations } = simulateRandomMatch(h1, h2, MAX_TURNS_PER_GAME);

      totalTurns += log.length;
      if (state.phase === 'game_over') gamesCompleted++;

      // 1. Invariant violations (HP bounds, death consistency, max distance, etc.)
      if (violations.length > 0) {
        throw new Error(
          `Game ${g + 1} (${h1} vs ${h2}): invariant violations:\n` +
          violations.join('\n') +
          `\n\nBattle log:\n${formatLog(log)}`
        );
      }

      // 2. HP delta audit — use actual hero starting HP (Octopus has 80, not 100)
      const initialHp = {
        p1: getHero(h1)?.hp ?? 100,
        p2: getHero(h2)?.hp ?? 100,
      };
      const deltaViolations = auditHpDeltas(log, ['p1', 'p2'], initialHp);
      if (deltaViolations.length > 0) {
        throw new Error(
          `Game ${g + 1} (${h1} vs ${h2}): HP delta violations:\n` +
          deltaViolations.join('\n') +
          `\n\nBattle log:\n${formatLog(log)}`
        );
      }
    }

    const terminationPct = Math.round((gamesCompleted / TOTAL_GAMES) * 100);
    const avgTurns = (totalTurns / TOTAL_GAMES).toFixed(1);
    console.log(
      `\n[Log Audit Fuzzer] ${TOTAL_GAMES} games | ` +
      `${gamesCompleted}/${TOTAL_GAMES} completed (${terminationPct}%) | ` +
      `avg ${avgTurns} turns/game | ` +
      `${totalTurns} total turns audited — no violations found`
    );
  });
});
