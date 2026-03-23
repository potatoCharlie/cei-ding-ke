import { describe, it, expect } from 'vitest';
import { executeAction, getAvailableActions, startTurn } from '../../game-engine/GameState.js';
import { makeGame, setPositions, getHero, winRPSForPlayer } from '../../__tests__/helpers.js';

describe('Jin', () => {
  it('Small Dart deals 5 damage + stun at distance 0', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'small_dart', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(95);
    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(true);
  });

  it('Small Dart works at distance 1', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 0, 1);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'small_dart', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(95);
  });

  it('Wind Walk sets invisibleRounds to 3', () => {
    const state = makeGame('jin', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'wind_walk', targetId: 'p1' });
    expect(getHero(state, 'p1').invisibleRounds).toBe(3);
  });

  it('invisible hero has 2x move speed', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 0, 3);
    getHero(state, 'p1').invisibleRounds = 3;

    const actions = getAvailableActions(state, 'p1');
    // Move forward should be available (speed 2, new pos = 2, dist to enemy = 1 ≤ 3)
    expect(actions.some(a => a.type === 'move_forward')).toBe(true);
  });

  it('Wind Walk exit punch deals 15 damage and ends invisibility', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').invisibleRounds = 2;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });

    expect(getHero(state, 'p1').invisibleRounds).toBe(0);
    expect(getHero(state, 'p2').hp).toBe(85); // 100 - 15
  });

  it('physical attacks miss invisible Jin', () => {
    const state = makeGame('shan', 'jin');
    setPositions(state, 5, 5);
    getHero(state, 'p2').invisibleRounds = 3;

    winRPSForPlayer(state, 'p1');
    const hpBefore = getHero(state, 'p2').hp;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(hpBefore); // no damage
  });

  it('magic attacks still hit invisible Jin', () => {
    const state = makeGame('nan', 'jin');
    setPositions(state, 5, 5);
    getHero(state, 'p2').invisibleRounds = 3;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'magic_burn', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(85); // took 15 magic damage
  });

  it('Wind Walk ticks down each turn', () => {
    const state = makeGame('jin', 'nan');
    getHero(state, 'p1').invisibleRounds = 3;
    startTurn(state);
    expect(getHero(state, 'p1').invisibleRounds).toBe(2);
  });

  it('Kuang deals 50 damage + 10 self-damage', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(50); // 100 - 50
    expect(getHero(state, 'p1').hp).toBe(90); // 100 - 10 self
  });

  it('Kuang self-cast heals 40', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').hp = 60;
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p1' });
    expect(getHero(state, 'p1').hp).toBe(100); // 60 + 40
  });

  it('Kuang is single use only', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p2' });
    expect(getHero(state, 'p1').skillUsesRemaining['kuang']).toBe(0);
  });
});
