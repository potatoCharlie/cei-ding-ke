import { describe, it, expect } from 'vitest';
import { executeAction, getAvailableActions } from '../../game-engine/GameState.js';
import { makeGame, setPositions, getHero, getPlayer, winRPSForPlayer } from '../../__tests__/helpers.js';

describe('Octopus', () => {
  it('starts at 80 HP', () => {
    const state = makeGame('octopus', 'shan');
    expect(getHero(state, 'p1').maxHp).toBe(80);
  });

  it('Eat Legs heals 5 and disables movement after 8 uses', () => {
    const state = makeGame('octopus', 'shan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').hp = 20;

    for (let i = 0; i < 8; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'eat_legs', targetId: 'p1' });
    }

    expect(getHero(state, 'p1').hp).toBe(60);
    expect(getHero(state, 'p1').movementDisabled).toBe(true);
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'move_forward')).toBe(false);
    expect(actions.some(a => a.type === 'move_backward')).toBe(false);
  });

  it('Build Tower creates one stationary ranged summon', () => {
    const state = makeGame('octopus', 'shan');
    setPositions(state, 5, 6);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'build_tower', targetId: 'p1' });
    const tower = getPlayer(state, 'p1').minions[0];
    expect(tower.hp).toBe(5);
    expect(tower.canMove).toBe(false);
    expect(tower.attackMaxDistance).toBe(1);
  });

  it('magic-immune tower can be punched and hit by physical skills but not magic skills', () => {
    const state = makeGame('octopus', 'shan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'build_tower', targetId: 'p1' });
    const towerId = getPlayer(state, 'p1').minions[0].minionId;

    winRPSForPlayer(state, 'p2');
    executeAction(state, { type: 'punch', playerId: 'p2', targetId: towerId });
    expect(getPlayer(state, 'p1').minions[0].hp).toBeLessThan(5);

    const state2 = makeGame('octopus', 'nan');
    setPositions(state2, 5, 5);
    winRPSForPlayer(state2, 'p1');
    executeAction(state2, { type: 'skill', playerId: 'p1', skillId: 'build_tower', targetId: 'p1' });
    const towerId2 = getPlayer(state2, 'p1').minions[0].minionId;
    winRPSForPlayer(state2, 'p2');
    executeAction(state2, { type: 'skill', playerId: 'p2', skillId: 'magic_burn', targetId: towerId2 });
    expect(getPlayer(state2, 'p1').minions[0].hp).toBe(5);
  });

  it('tower gets a ranged 0-1 attack during minion action', () => {
    const state = makeGame('octopus', 'shan');
    setPositions(state, 5, 6);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'build_tower', targetId: 'p1' });

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });
    const towerId = getPlayer(state, 'p1').minions[0].minionId;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId: towerId });
    expect(getHero(state, 'p2').hp).toBe(75);
  });
});
