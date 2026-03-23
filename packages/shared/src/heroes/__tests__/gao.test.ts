import { describe, it, expect } from 'vitest';
import { executeAction, getAvailableActions } from '../../game-engine/GameState.js';
import { makeGame, setPositions, getHero, getPlayer, winRPSForPlayer } from '../../__tests__/helpers.js';

describe('Gao', () => {
  it('summons Hellfire at hero position', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    const player = getPlayer(state, 'p1');
    expect(player.minions).toHaveLength(1);
    expect(player.minions[0].hp).toBe(100);
    expect(player.minions[0].position).toBe(player.hero.position);
  });

  it('cannot summon second Hellfire while first alive', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });
    expect(getPlayer(state, 'p1').minions).toHaveLength(1);
  });

  it('Hellfire punch deals 20 physical damage', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    const enemyPos = getHero(state, 'p2').position;
    getPlayer(state, 'p1').minions[0].position = enemyPos;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId });

    expect(getHero(state, 'p2').hp).toBe(80); // 100 - 20
  });

  it('Hellfire punches do NOT count toward 3-punch stun', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    const enemyPos = getHero(state, 'p2').position;
    getPlayer(state, 'p1').minions[0].position = enemyPos;

    for (let i = 0; i < 3; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'stay', playerId: 'p1' });
      executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId });
    }

    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(false);
  });

  it('minion gets actions when awaitingMinionAction', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });

    expect(state.awaitingMinionAction).toBe(true);
    const actions = getAvailableActions(state, 'p1');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(a => a.minionId != null)).toBe(true);
  });

  it('minion can move forward and backward', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });

    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'move_forward')).toBe(true);
    expect(actions.some(a => a.type === 'stay')).toBe(true);
  });
});
