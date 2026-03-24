import { describe, it, expect } from 'vitest';
import { createGameState } from '../game-engine/GameState.js';
import { TEAM_0_START, TEAM_1_START } from '../constants.js';

describe('2v2 game creation', () => {
  it('creates a 2v2 game with 4 players on 2 teams', () => {
    const state = createGameState('test', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'jin', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'shan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'nan', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'gao', teamIndex: 1 },
    ]);

    expect(state.mode).toBe('2v2');
    expect(state.teams[0].players).toHaveLength(2);
    expect(state.teams[1].players).toHaveLength(2);
    expect(state.teams[0].players[0].hero.position).toBe(TEAM_0_START);
    expect(state.teams[0].players[1].hero.position).toBe(TEAM_0_START);
    expect(state.teams[1].players[0].hero.position).toBe(TEAM_1_START);
    expect(state.teams[1].players[1].hero.position).toBe(TEAM_1_START);
  });

  it('rejects duplicate hero IDs', () => {
    expect(() => createGameState('test', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'jin', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'jin', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'nan', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'gao', teamIndex: 1 },
    ])).toThrow();
  });

  it('1v1 still works with new signature', () => {
    const state = createGameState('test', '1v1', [
      { id: 'p1', name: 'P1', heroId: 'nan', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'shan', teamIndex: 1 },
    ]);
    expect(state.mode).toBe('1v1');
    expect(state.teams[0].players).toHaveLength(1);
    expect(state.teams[1].players).toHaveLength(1);
  });

  it('rejects 3v3', () => {
    expect(() => createGameState('test', '3v3', [
      { id: 'p1', name: 'P1', heroId: 'jin', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'shan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'nan', teamIndex: 0 },
      { id: 'p4', name: 'P4', heroId: 'gao', teamIndex: 1 },
      { id: 'p5', name: 'P5', heroId: 'jin', teamIndex: 1 },
      { id: 'p6', name: 'P6', heroId: 'shan', teamIndex: 1 },
    ])).toThrow();
  });
});
