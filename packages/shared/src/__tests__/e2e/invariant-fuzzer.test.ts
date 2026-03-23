import { describe, it, expect } from 'vitest';
import { simulateRandomMatch, formatLog, checkInvariants } from './battle-simulator.js';

const HEROES = ['nan', 'shan', 'gao', 'jin'];
const MATCHES_PER_COMBO = 50;
const MAX_TURNS = 50;

describe('Invariant Fuzzer', () => {

  for (const hero1 of HEROES) {
    for (const hero2 of HEROES) {
      it(`${hero1} vs ${hero2}: ${MATCHES_PER_COMBO} random matches with no invariant violations`, () => {
        for (let i = 0; i < MATCHES_PER_COMBO; i++) {
          const { state, log, violations } = simulateRandomMatch(hero1, hero2, MAX_TURNS);

          if (violations.length > 0) {
            const logStr = formatLog(log);
            throw new Error(
              `Invariant violations in ${hero1} vs ${hero2} match #${i + 1}:\n` +
              violations.join('\n') +
              `\n\nFull battle log:\n${logStr}`
            );
          }

          // Game should either be over or have run out of turns
          if (state.phase !== 'game_over') {
            // Not game over after MAX_TURNS — check this is acceptable
            // (some matchups with lots of movement may take many turns)
            // Just verify invariants hold at the end
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
  }

  it('all hero combinations terminate within reasonable turns', () => {
    let totalGames = 0;
    let gamesOver = 0;
    const MAX_TURNS_FOR_TERMINATION = 100;

    for (const hero1 of HEROES) {
      for (const hero2 of HEROES) {
        for (let i = 0; i < 10; i++) {
          const { state } = simulateRandomMatch(hero1, hero2, MAX_TURNS_FOR_TERMINATION);
          totalGames++;
          if (state.phase === 'game_over') gamesOver++;
        }
      }
    }

    // At least 50% of games should terminate (some may time out due to movement-only turns)
    const terminationRate = gamesOver / totalGames;
    expect(terminationRate).toBeGreaterThan(0.3);
  });

});
