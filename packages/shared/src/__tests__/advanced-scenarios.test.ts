import { describe, it, expect } from 'vitest';
import { executeAction, startTurn, getAvailableActions, submitRPS, resolveRPSRound } from '../game-engine/GameState.js';
import { makeGame, setPositions, getHero, getPlayer, winRPSForPlayer } from './helpers.js';

describe('Advanced scenarios — Skill interactions', () => {
  it('Shan Big Darts self-stun + opponent follow-up', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    // Shan uses Big Darts → deals 25, self-stuns
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'big_darts', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(75);
    expect(getHero(state, 'p1').statusEffects.some(e => e.type === 'stunned')).toBe(true);

    // Next turn: p1 stunned → p2 auto-wins RPS
    const allSubmitted = submitRPS(state, 'p2', 'rock');
    expect(allSubmitted).toBe(true);

    const result = resolveRPSRound(state);
    expect(result.winners).toEqual(['p2']);
  });

  it('Shan Frozen traps + DoT over multiple turns', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    // Shan uses Frozen → 10 initial + trap 2 rounds
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'frozen', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(90); // 10 initial magic damage
    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'trapped')).toBe(true);

    // p2 should not be able to move while trapped
    const actions = getAvailableActions(state, 'p2');
    expect(actions.some(a => a.type === 'move_forward')).toBe(false);
    expect(actions.some(a => a.type === 'move_backward')).toBe(false);
  });

  it('Frozen DoT ticks on startTurn', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p2').statusEffects.push({ type: 'trapped', remainingRounds: 2 });
    getHero(state, 'p2').hp = 80;

    startTurn(state);

    // Frozen DoT deals 10 magic damage per tick
    expect(getHero(state, 'p2').hp).toBe(70);
    // trapped ticked from 2 → 1
    expect(getHero(state, 'p2').statusEffects.find(e => e.type === 'trapped')?.remainingRounds).toBe(1);
  });

  it('Jin Small Dart + stun → opponent skips turn', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);

    // Jin uses Small Dart → 5 damage + stun 1 round
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'small_dart', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(95);
    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(true);
  });

  it('Jin Kuang deals 50 to enemy and 10 self-damage', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(50); // 50 magic damage
    expect(getHero(state, 'p1').hp).toBe(90); // 10 self-damage
  });

  it('Jin Kuang self-cast heals 40 without dealing damage', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').hp = 50;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p1' });

    expect(getHero(state, 'p1').hp).toBe(90); // 50 + 40 heal
    expect(getHero(state, 'p2').hp).toBe(100); // enemy untouched
  });
});

describe('Advanced scenarios — Multi-turn combat', () => {
  it('alternating RPS winners', () => {
    const state = makeGame();
    setPositions(state, 5, 5);

    // Turn 1: p1 wins, punches
    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p2', 'scissors');
    resolveRPSRound(state);
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(90);

    // Turn 2: p2 wins, punches back
    submitRPS(state, 'p1', 'scissors');
    submitRPS(state, 'p2', 'rock');
    resolveRPSRound(state);
    executeAction(state, { type: 'punch', playerId: 'p2', targetId: 'p1' });
    expect(getHero(state, 'p1').hp).toBe(90);
  });

  it('draw in RPS requires resubmission', () => {
    const state = makeGame();
    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p2', 'rock');
    const result = resolveRPSRound(state);

    expect(result.draw).toBe(true);
    expect(state.phase).toBe('rps_submit'); // back to RPS
  });

  it('Gao summon + minion walks toward enemy + punches', () => {
    const state = makeGame('gao', 'nan');
    setPositions(state, 0, 2);

    // Turn 1: summon at position 0
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });
    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    expect(getPlayer(state, 'p1').minions[0].position).toBe(0);

    // Minion moves forward toward enemy (at position 2)
    executeAction(state, { type: 'move_forward', playerId: 'p1', minionId });
    expect(getPlayer(state, 'p1').minions[0].position).toBe(1);

    // Turn 2: hero stays, minion moves again
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });
    executeAction(state, { type: 'move_forward', playerId: 'p1', minionId });
    expect(getPlayer(state, 'p1').minions[0].position).toBe(2);

    // Turn 3: hero stays, minion punches enemy (now at distance 0)
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId });
    expect(getHero(state, 'p2').hp).toBe(80); // 20 minion punch damage
  });

  it('approach → punch → retreat pattern', () => {
    // Use shan vs jin (no passives that fire at dist 0)
    const state = makeGame('shan', 'jin');
    setPositions(state, 1, 2);

    // Move forward (toward enemy)
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'move_forward', playerId: 'p1' });
    expect(getHero(state, 'p1').position).toBe(2); // now at enemy position

    // Punch
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').hp).toBe(90);

    // Move backward (away from enemy)
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'move_backward', playerId: 'p1' });
    expect(getHero(state, 'p1').position).toBe(1);
  });
});

describe('Advanced scenarios — Game over conditions', () => {
  it('game ends when hero HP reaches 0 from skill', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p2').hp = 5;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'small_dart', targetId: 'p2' });

    expect(getHero(state, 'p2').alive).toBe(false);
    expect(state.winner).toBe(0);
    expect(state.phase).toBe('game_over');
  });

  it('game ends when hero HP reaches 0 from Frozen DoT', () => {
    const state = makeGame('shan', 'nan');
    getHero(state, 'p2').hp = 5;
    getHero(state, 'p2').statusEffects.push({ type: 'trapped', remainingRounds: 2 });

    startTurn(state);

    expect(getHero(state, 'p2').alive).toBe(false);
    expect(state.winner).toBe(0);
  });

  it('game ends when hero HP reaches 0 from stink aura', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 5);
    state.positionsAtTurnStart = { p1: 5, p2: 5 };
    getHero(state, 'p2').hp = 5;

    // Nan stays → endTurn → stink aura kills p2
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });

    expect(getHero(state, 'p2').alive).toBe(false);
    expect(state.winner).toBe(0);
  });

  it('game ends when hero HP reaches 0 from minion punch', () => {
    const state = makeGame('gao', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p2').hp = 15;

    // Summon + minion punches
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });
    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId });

    expect(getHero(state, 'p2').alive).toBe(false);
    expect(state.winner).toBe(0);
  });

  it('game does not continue after game_over', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    getHero(state, 'p2').hp = 10;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });

    expect(state.phase).toBe('game_over');

    // Trying to do anything after game over should return empty
    const effects = executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(effects).toHaveLength(0);
  });
});

describe('Advanced scenarios — Position mechanics', () => {
  it('heroes at same position can punch each other', () => {
    const state = makeGame();
    setPositions(state, 5, 5);

    const p1Actions = getAvailableActions(state, 'p1');
    const p2Actions = getAvailableActions(state, 'p2');
    expect(p1Actions.some(a => a.type === 'punch')).toBe(true);
    expect(p2Actions.some(a => a.type === 'punch')).toBe(true);
  });

  it('forward direction is toward enemy regardless of team', () => {
    const state = makeGame();
    setPositions(state, 1, 3);

    // p1 (pos 1) moves forward → goes toward p2 (pos 3) → position 2
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'move_forward', playerId: 'p1' });
    expect(getHero(state, 'p1').position).toBe(2);

    // p2 (pos 3) moves forward → goes toward p1 (now pos 2) → position 2
    winRPSForPlayer(state, 'p2');
    executeAction(state, { type: 'move_forward', playerId: 'p2' });
    expect(getHero(state, 'p2').position).toBe(2);
  });

  it('backward direction is away from enemy', () => {
    const state = makeGame();
    setPositions(state, 2, 3);

    // p1 (pos 2) moves backward → away from p2 (pos 3) → position 1
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'move_backward', playerId: 'p1' });
    expect(getHero(state, 'p1').position).toBe(1);
  });

  it('MAX_DISTANCE constraint with minion present', () => {
    const state = makeGame('gao', 'nan');
    setPositions(state, 0, 3);

    // Summon minion at position 0
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });
    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    expect(getPlayer(state, 'p1').minions[0].position).toBe(0);
    executeAction(state, { type: 'stay', playerId: 'p1', minionId });

    // p2 at pos 3, minion at pos 0: distance = 3 (max)
    // p2 trying to move backward (away from hero at 0) would go to 4
    // distance from minion = 4 → exceeds MAX_DISTANCE → should be blocked
    winRPSForPlayer(state, 'p2');
    const actions = getAvailableActions(state, 'p2');
    expect(actions.some(a => a.type === 'move_backward')).toBe(false);
  });
});
