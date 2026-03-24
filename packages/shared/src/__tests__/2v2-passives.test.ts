import { describe, it, expect } from 'vitest';
import { createGameState, executeAction, startTurn } from '../game-engine/GameState.js';

describe('2v2 Nan stink aura', () => {
  it('damages all enemies at distance 0', () => {
    const state = createGameState('test', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'nan', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'shan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'jin', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'gao', teamIndex: 1 },
    ]);

    // All at same position
    for (const t of state.teams) for (const p of t.players) p.hero.position = 5;
    state.positionsAtTurnStart = { p1: 5, p2: 5, p3: 5, p4: 5 };

    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;

    executeAction(state, { type: 'stay', playerId: 'p1' });

    // After endTurn, both enemies should take 10 damage
    expect(state.teams[1].players[0].hero.hp).toBe(90); // p3
    expect(state.teams[1].players[1].hero.hp).toBe(90); // p4
    // Teammates should NOT be damaged
    expect(state.teams[0].players[1].hero.hp).toBe(100); // p2
  });

  it('only damages enemies at distance 0, not those further away', () => {
    const state = createGameState('test', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'nan', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'shan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'jin', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'gao', teamIndex: 1 },
    ]);

    state.teams[0].players[0].hero.position = 5; // nan
    state.teams[0].players[1].hero.position = 5;
    state.teams[1].players[0].hero.position = 5; // p3 same
    state.teams[1].players[1].hero.position = 6; // p4 different
    state.positionsAtTurnStart = { p1: 5, p2: 5, p3: 5, p4: 6 };

    state.phase = 'action_phase';
    state.actionOrder = ['p1'];
    state.currentActionIndex = 0;
    executeAction(state, { type: 'stay', playerId: 'p1' });

    expect(state.teams[1].players[0].hero.hp).toBe(90); // p3 damaged
    expect(state.teams[1].players[1].hero.hp).toBe(100); // p4 not damaged
  });
});
