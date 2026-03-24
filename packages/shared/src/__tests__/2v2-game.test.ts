import { describe, it, expect } from 'vitest';
import { createGameState, submitRPS, resolveRPSRound } from '../game-engine/GameState.js';
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

describe('2v2 RPS resolution', () => {
  function make2v2() {
    return createGameState('test', '2v2', [
      { id: 'p1', name: 'P1', heroId: 'jin', teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: 'shan', teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: 'nan', teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: 'gao', teamIndex: 1 },
    ]);
  }

  it('all 4 submit, 2 choices → winners and losers', () => {
    const state = make2v2();
    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p2', 'rock');
    submitRPS(state, 'p3', 'scissors');
    submitRPS(state, 'p4', 'scissors');

    const result = resolveRPSRound(state);
    expect(result.draw).toBe(false);
    expect(result.winners.sort()).toEqual(['p1', 'p2']);
    expect(result.losers.sort()).toEqual(['p3', 'p4']);
    expect(state.phase).toBe('action_phase');
    expect(state.actionOrder.length).toBe(2);
  });

  it('all 3 choices present → tie, stays in rps_submit', () => {
    const state = make2v2();
    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p2', 'scissors');
    submitRPS(state, 'p3', 'paper');
    submitRPS(state, 'p4', 'rock');

    const result = resolveRPSRound(state);
    expect(result.draw).toBe(true);
    expect(state.phase).toBe('rps_submit');
  });

  it('stunned player skipped from RPS', () => {
    const state = make2v2();
    // Stun p2
    state.teams[0].players[1].hero.statusEffects.push({ type: 'stunned', remainingRounds: 1 });

    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p3', 'scissors');
    const allSubmitted = submitRPS(state, 'p4', 'scissors');

    expect(allSubmitted).toBe(true);
    const result = resolveRPSRound(state);
    expect(result.winners).toEqual(['p1']);
  });

  it('single winner gets ordered first in actionOrder', () => {
    const state = make2v2();
    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p2', 'scissors');
    submitRPS(state, 'p3', 'scissors');
    submitRPS(state, 'p4', 'scissors');

    const result = resolveRPSRound(state);
    expect(result.winners).toEqual(['p1']);
    expect(state.actionOrder).toEqual(['p1']);
  });
});
