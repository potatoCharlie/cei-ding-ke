import { describe, it, expect } from 'vitest';
import { createGameState, executeAction } from '../../game-engine/GameState.js';
import { makeGame, setPositions, getHero, winRPSForPlayer } from '../../__tests__/helpers.js';

describe('Hans', () => {
  it('Stomp stuns enemies in the same block', () => {
    const state = makeGame('hans', 'shan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'stomp', targetId: 'p1' });
    expect(getHero(state, 'p2').statusEffects.find(e => e.type === 'stunned')?.remainingRounds).toBe(1);
  });

  it('Storm Hammer deals 20 damage and applies true 2-round stun', () => {
    const state = makeGame('hans', 'shan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'storm_hammer', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(80);
    expect(getHero(state, 'p2').statusEffects.find(e => e.type === 'stunned')?.remainingRounds).toBe(2);
  });

  it('Stomp hits both enemies in 2v2 when adjacent', () => {
    const state = createGameState('test-2v2', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'hans', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'fan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'shan', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'nan', teamIndex: 1 },
    ]);
    state.teams[0].players[0].hero.position = 5;
    state.teams[1].players[0].hero.position = 5;
    state.teams[1].players[1].hero.position = 5;
    state.phase = 'action_phase';
    state.actionOrder = ['p1'];

    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'stomp', targetId: 'p1' });
    expect(getHero(state, 'p3').statusEffects.some(e => e.type === 'stunned')).toBe(true);
    expect(getHero(state, 'p4').statusEffects.some(e => e.type === 'stunned')).toBe(true);
  });
});
