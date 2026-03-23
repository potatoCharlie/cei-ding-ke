import { describe, it, expect } from 'vitest';
import { executeAction, submitRPS, resolveRPSRound, startTurn } from '../game-engine/GameState.js';
import { makeGame, setPositions, getHero, getPlayer, winRPSForPlayer } from './helpers.js';

describe('Multi-turn scenarios', () => {
  it('3-punch stun combo across multiple turns', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    for (let i = 0; i < 3; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    }

    expect(getHero(state, 'p2').hp).toBe(70); // 3 * 10
    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(true);
  });

  it('stun-break sequence: stunned hero wakes when punched', () => {
    const state = makeGame();
    setPositions(state, 5, 5);

    // Stun p2
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 3 });

    // p1 punches p2 → stun breaks
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });

    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(false);
    expect(getHero(state, 'p2').hp).toBe(90);
  });

  it('Jin stealth approach: Wind Walk + move + exit punch', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 0, 3);

    // Activate Wind Walk
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'wind_walk', targetId: 'p1' });
    expect(getHero(state, 'p1').invisibleRounds).toBe(3);

    // Move forward (speed 2): 0 → 2
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'move_forward', playerId: 'p1' });
    expect(getHero(state, 'p1').position).toBe(2);

    // Move forward again (speed 2): 2 → 4... but enemy is at 3.
    // After endTurn, invisibleRounds ticks down. Let's just punch from distance 0.
    // Reposition to be at enemy
    setPositions(state, 3, 3);
    getHero(state, 'p1').invisibleRounds = 1; // still invisible

    // Exit punch at same position
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p1').invisibleRounds).toBe(0);
    expect(getHero(state, 'p2').hp).toBe(85); // 15 wind walk punch
  });

  it('Gao summon + minion action in same turn', () => {
    const state = makeGame('gao', 'nan');

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    const player = getPlayer(state, 'p1');
    expect(player.minions).toHaveLength(1);
    expect(state.awaitingMinionAction).toBe(true);

    const minionId = player.minions[0].minionId;
    executeAction(state, { type: 'stay', playerId: 'p1', minionId });
    expect(state.awaitingMinionAction).toBe(false);
  });

  it('full game: one player kills the other', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    // Shan punches Nan to death (100 HP / 10 per punch = 10 punches)
    while (state.winner === null) {
      winRPSForPlayer(state, 'p1');
      if (getHero(state, 'p2').alive) {
        executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
      } else {
        break;
      }
    }

    expect(state.winner).toBe(0);
    expect(state.phase).toBe('game_over');
    expect(getHero(state, 'p2').alive).toBe(false);
  });

  it('RPS full flow: submit → resolve → action', () => {
    const state = makeGame();
    setPositions(state, 5, 5);

    expect(state.phase).toBe('rps_submit');
    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p2', 'scissors');
    const result = resolveRPSRound(state);

    expect(result.draw).toBe(false);
    expect(result.winners).toEqual(['p1']);
    expect(state.phase).toBe('action_phase');

    const hpBefore = getHero(state, 'p2').hp;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(hpBefore - 10);
  });
});
