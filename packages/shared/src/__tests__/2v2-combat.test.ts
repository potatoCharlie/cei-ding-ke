import { describe, it, expect } from 'vitest';
import { createGameState, resolveRPSRound, executeAction, submitRPS, startTurn, getAvailableActions } from '../game-engine/GameState.js';

describe('2v2 punch counter (target-based)', () => {
  function make2v2() {
    return createGameState('test', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'jin', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'shan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'nan', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'gao', teamIndex: 1 },
    ]);
  }

  function setAllSamePos(state: ReturnType<typeof createGameState>, pos: number) {
    for (const team of state.teams) {
      for (const player of team.players) {
        player.hero.position = pos;
      }
    }
  }

  it('punch counter increments on target when punched', () => {
    const state = make2v2();
    setAllSamePos(state, 5);
    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p3' });
    expect(state.teams[1].players[0].hero.consecutivePunchesReceived).toBe(1);
  });

  it('3 punches from different attackers trigger stun on target', () => {
    const state = make2v2();
    setAllSamePos(state, 5);

    // Round 1: p1 punches p3
    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p3' });

    // Round 2: p2 punches p3
    state.phase = 'action_phase';
    state.actionOrder = ['p2'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'punch', playerId: 'p2', targetId: 'p3' });

    // Round 3: p1 punches p3 again → stun
    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p3' });

    const p3 = state.teams[1].players[0].hero;
    expect(p3.statusEffects.some(e => e.type === 'stunned')).toBe(true);
    expect(p3.consecutivePunchesReceived).toBe(0); // reset after stun
  });

  it('target acting resets their own punch counter', () => {
    const state = make2v2();
    setAllSamePos(state, 5);

    // p1 punches p3 twice
    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p3' });

    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p3' });

    expect(state.teams[1].players[0].hero.consecutivePunchesReceived).toBe(2);

    // p3 acts (stay) → resets counter
    state.phase = 'action_phase';
    state.actionOrder = ['p3'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'stay', playerId: 'p3' });

    expect(state.teams[1].players[0].hero.consecutivePunchesReceived).toBe(0);

    // p1 punches p3 again — only 1 punch now, no stun
    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p3' });

    const p3 = state.teams[1].players[0].hero;
    expect(p3.consecutivePunchesReceived).toBe(1);
    expect(p3.statusEffects.some(e => e.type === 'stunned')).toBe(false);
  });
});

describe('Kuang teammate heal', () => {
  function make2v2() {
    return createGameState('test', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'jin', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'shan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'nan', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'gao', teamIndex: 1 },
    ]);
  }

  it('Kuang on teammate heals 40 HP', () => {
    const state = make2v2();
    for (const t of state.teams) for (const p of t.players) p.hero.position = 5;
    state.teams[0].players[1].hero.hp = 50; // p2 is injured

    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;

    const effects = executeAction(state, {
      type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p2',
    });

    expect(state.teams[0].players[1].hero.hp).toBe(90); // 50 + 40
    // p1 should NOT take 10 self-damage when healing teammate
    expect(state.teams[0].players[0].hero.hp).toBe(100);
  });

  it('Kuang on self still heals 40 HP', () => {
    const state = make2v2();
    for (const t of state.teams) for (const p of t.players) p.hero.position = 5;
    state.teams[0].players[0].hero.hp = 50;

    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;

    executeAction(state, {
      type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p1',
    });

    expect(state.teams[0].players[0].hero.hp).toBe(90);
  });

  it('Kuang on enemy still does 50 damage + 10 self-damage', () => {
    const state = make2v2();
    for (const t of state.teams) for (const p of t.players) p.hero.position = 5;

    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;

    executeAction(state, {
      type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p3',
    });

    expect(state.teams[1].players[0].hero.hp).toBe(50); // 100 - 50
    expect(state.teams[0].players[0].hero.hp).toBe(90); // 100 - 10
  });
});
