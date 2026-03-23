import { describe, it, expect } from 'vitest';
import { executeAction, getAvailableActions, startTurn } from '../../game-engine/GameState.js';
import { makeGame, setPositions, getHero, winRPSForPlayer } from '../../__tests__/helpers.js';

describe('Shan', () => {
  it('Big Darts deals 25 damage + self-stun at distance 0', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'big_darts', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(75); // 100-25
    expect(getHero(state, 'p1').statusEffects.some(e => e.type === 'stunned')).toBe(true);
  });

  it('Big Darts works at distance 1', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 0, 1);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'big_darts', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(75);
  });

  it('Big Darts fails at distance 2', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 0, 2);
    winRPSForPlayer(state, 'p1');
    const hpBefore = getHero(state, 'p2').hp;
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'big_darts', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(hpBefore);
  });

  it('Frozen applies 10 initial damage + trapped status', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'frozen', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(90); // 10 initial
    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'trapped')).toBe(true);
  });

  it('Frozen DoT deals 10 magic damage per tick while trapped', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    // Apply frozen
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'frozen', targetId: 'p2' });
    const hpAfterFrozen = getHero(state, 'p2').hp; // 90 (100 - 10 initial)

    // Tick once → 10 DoT damage
    startTurn(state);
    expect(getHero(state, 'p2').hp).toBe(hpAfterFrozen - 10); // 80
  });

  it('Frozen limited to 2 uses', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    for (let i = 0; i < 2; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'frozen', targetId: 'p2' });
    }

    expect(getHero(state, 'p1').skillUsesRemaining['frozen']).toBe(0);
  });

  it('trapped hero cannot move', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'frozen', targetId: 'p2' });

    // p2 is trapped, check available actions
    const actions = getAvailableActions(state, 'p2');
    expect(actions.some(a => a.type === 'move_forward')).toBe(false);
    expect(actions.some(a => a.type === 'move_backward')).toBe(false);
  });
});
