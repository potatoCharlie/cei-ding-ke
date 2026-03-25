import { describe, it, expect } from 'vitest';
import { executeAction } from '../../game-engine/GameState.js';
import { makeGame, setPositions, getHero, winRPSForPlayer } from '../../__tests__/helpers.js';

describe('Mu', () => {
  it('Medium Dart deals 10 damage at distance 0-1', () => {
    const state = makeGame('mu', 'shan');
    setPositions(state, 4, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'medium_dart', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(90);
  });

  it('Kuang damages enemies and self-damages caster', () => {
    const state = makeGame('mu', 'shan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p2' });
    expect(getHero(state, 'p1').hp).toBe(90);
    expect(getHero(state, 'p2').hp).toBe(50);
  });

  it('Kuang self-cast heals 40 and is single use', () => {
    const state = makeGame('mu', 'shan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').hp = 50;
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p1' });
    expect(getHero(state, 'p1').hp).toBe(90);
    expect(getHero(state, 'p1').skillUsesRemaining.kuang).toBe(0);
  });
});
