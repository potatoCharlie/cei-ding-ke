import { describe, it, expect } from 'vitest';
import { createGameState, executeAction } from '../../game-engine/GameState.js';
import { makeGame, setPositions, getHero, winRPSForPlayer } from '../../__tests__/helpers.js';

describe('Fan', () => {
  it('Heart Fire buffs self and increases punch damage by 5', () => {
    const state = makeGame('fan', 'shan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'heart_fire', targetId: 'p1' });
    expect(getHero(state, 'p1').damageBonus).toBe(5);

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(85);
  });

  it('Heart Fire buffs allies and does not stack', () => {
    const state = createGameState('test-2v2', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'fan', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'nan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'shan', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'jin', teamIndex: 1 },
    ]);
    state.teams[0].players[0].hero.position = 5;
    state.teams[0].players[1].hero.position = 5;
    state.phase = 'action_phase';
    state.actionOrder = ['p1'];

    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'heart_fire', targetId: 'p2' });
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'heart_fire', targetId: 'p2' });
    expect(getHero(state, 'p2').damageBonus).toBe(5);
  });

  it('buffed hero skills gain +5 damage but summons do not', () => {
    const state = makeGame('fan', 'nan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'heart_fire', targetId: 'p1' });

    const allyState = makeGame('fan', 'shan');
    setPositions(allyState, 5, 5);
    getHero(allyState, 'p1').damageBonus = 5;
    winRPSForPlayer(allyState, 'p1');
    executeAction(allyState, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(allyState, 'p2').hp).toBe(85);
  });
});
