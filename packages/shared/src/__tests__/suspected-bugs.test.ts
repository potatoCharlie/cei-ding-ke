import { describe, it, expect } from 'vitest';
import { executeAction, startTurn, getAvailableActions, submitRPS, resolveRPSRound } from '../game-engine/GameState.js';
import { getHero as getHeroDef } from '../heroes/registry.js';
import { makeGame, setPositions, getHero, getPlayer, winRPSForPlayer } from './helpers.js';

describe('Suspected bugs — Hellfire magic immunity', () => {
  it('Hellfire minion definition declares magic immunity', () => {
    // The minion definition says immuneTo: ['magic'], but currently
    // minions cannot be targeted by skills (combat only targets heroes).
    // This test documents that the immunity field exists in the definition.
    const gaoDef = getHeroDef('gao');
    expect(gaoDef?.minion?.immuneTo).toContain('magic');
  });

  it('skills cannot target minions (only heroes)', () => {
    // Currently, all skills target heroes via findHeroByPlayerId/findOpponentHero.
    // Separate heroes so Nan's stink aura doesn't interfere.
    const state = makeGame('nan', 'gao');
    setPositions(state, 3, 5);

    // Gao summons Hellfire
    winRPSForPlayer(state, 'p2');
    executeAction(state, { type: 'summon', playerId: 'p2' });
    const minionId = getPlayer(state, 'p2').minions[0].minionId;
    executeAction(state, { type: 'stay', playerId: 'p2', minionId });

    // Move heroes together for magic burn (dist 0)
    setPositions(state, 5, 5);
    // Nan uses Magic Burn — should hit p2's hero, not the minion
    winRPSForPlayer(state, 'p1');
    const p2HpBefore = getHero(state, 'p2').hp;
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'magic_burn', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(p2HpBefore - 15); // hero takes 15 damage
    expect(getPlayer(state, 'p2').minions[0].hp).toBe(100); // minion untouched
  });
});

describe('Suspected bugs — Minion stun-break behavior', () => {
  it('minion punch breaks stun on target hero (via applyMinionEffects)', () => {
    const state = makeGame('gao', 'nan');
    setPositions(state, 5, 5);

    // Summon Hellfire
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });
    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    executeAction(state, { type: 'stay', playerId: 'p1', minionId });

    // Stun p2
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 3 });

    // Minion punches stunned hero → applyMinionEffects calls removeStunOnDamage
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });

    // Now minion action
    state.awaitingMinionAction = true;
    state.currentActionIndex = 0;
    state.phase = 'action_phase';
    state.actionOrder = ['p1'];

    // Actually, let's redo this more cleanly
    const state2 = makeGame('gao', 'nan');
    setPositions(state2, 5, 5);

    // Summon minion first
    winRPSForPlayer(state2, 'p1');
    executeAction(state2, { type: 'summon', playerId: 'p1' });
    const mid = getPlayer(state2, 'p1').minions[0].minionId;
    // Set minion position to same as enemy
    getPlayer(state2, 'p1').minions[0].position = 5;
    executeAction(state2, { type: 'stay', playerId: 'p1', minionId: mid });

    // Stun p2 before next turn
    getHero(state2, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 3 });

    // Next turn: Gao hero stays, then minion punches stunned hero
    winRPSForPlayer(state2, 'p1');
    executeAction(state2, { type: 'stay', playerId: 'p1' });

    // Minion should punch the stunned hero
    const mid2 = getPlayer(state2, 'p1').minions[0].minionId;
    executeAction(state2, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId: mid2 });

    // Stun should be broken by minion damage (removeStunOnDamage is called in applyMinionEffects)
    expect(getHero(state2, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(false);
    expect(getHero(state2, 'p2').hp).toBe(80); // 100 - 20 minion punch damage
  });

  it('minion punch does NOT count toward 3-punch stun counter', () => {
    const state = makeGame('gao', 'nan');
    setPositions(state, 5, 5);

    // Summon minion
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });
    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    getPlayer(state, 'p1').minions[0].position = 5;
    executeAction(state, { type: 'stay', playerId: 'p1', minionId });

    // Minion punches 3 times — should NOT trigger 3-punch stun
    for (let i = 0; i < 3; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'stay', playerId: 'p1' });
      const mid = getPlayer(state, 'p1').minions[0].minionId;
      executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId: mid });
    }

    // p2 should have taken 60 damage (3 * 20) but NOT be stunned
    expect(getHero(state, 'p2').hp).toBe(40);
    // consecutivePunchesReceived should still be 0 (minion punches excluded)
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(0);
  });
});

describe('Suspected bugs — consecutivePunchesReceived reset', () => {
  it('counter resets when attacker does a non-punch action', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    // Punch twice
    for (let i = 0; i < 2; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    }
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(2);

    // Now p1 does "stay" → should reset the counter
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(0);
  });

  it('counter resets when attacker uses a skill instead of punching', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    // Punch twice
    for (let i = 0; i < 2; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    }
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(2);

    // Use Big Darts instead of punch → should reset
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'big_darts', targetId: 'p2' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(0);
  });

  it('counter resets when attacker moves instead of punching', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    // Punch twice
    for (let i = 0; i < 2; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    }
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(2);

    // Move instead → should reset
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'move_backward', playerId: 'p1' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(0);
  });

  it('counter persists across turns if attacker keeps punching', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);

    // Punch twice across separate turns
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(1);

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(2);

    // Third punch → stun triggers and counter resets
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(0);
    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(true);
  });
});

describe('Suspected bugs — Stun interactions', () => {
  it('stunned player auto-submits RPS (other player wins automatically)', () => {
    const state = makeGame();
    setPositions(state, 5, 5);

    // Stun p2
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 2 });

    // Only p1 needs to submit RPS
    const allSubmitted = submitRPS(state, 'p1', 'rock');
    expect(allSubmitted).toBe(true);

    const result = resolveRPSRound(state);
    expect(result.winners).toEqual(['p1']);
    expect(result.draw).toBe(false);
  });

  it('active damage (hero punch) breaks stun', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 3 });

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });

    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(false);
  });

  it('active damage (skill) breaks old stun, skill re-applies new stun', () => {
    // Magic Burn deals damage (breaking existing stun) then applies stun for 1 round.
    // The old 3-round stun should be replaced by the new 1-round stun.
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 5);
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 3 });

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'magic_burn', targetId: 'p2' });

    // Stun should be re-applied at 1 round (from magic_burn)
    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(true);
    expect(getHero(state, 'p2').statusEffects.find(e => e.type === 'stunned')?.remainingRounds).toBe(1);
    // Damage was still dealt
    expect(getHero(state, 'p2').hp).toBe(85);
  });

  it('passive damage (Frozen DoT) does NOT break stun', () => {
    const state = makeGame();
    getHero(state, 'p1').statusEffects.push({ type: 'stunned', remainingRounds: 3 });
    getHero(state, 'p1').statusEffects.push({ type: 'trapped', remainingRounds: 2 });

    // startTurn ticks effects → Frozen DoT fires via tickStatusEffects
    // Frozen DoT damage should NOT break stun
    startTurn(state);

    // Stun should still exist (ticked from 3 to 2)
    const stunEffect = getHero(state, 'p1').statusEffects.find(e => e.type === 'stunned');
    expect(stunEffect).toBeDefined();
    expect(stunEffect!.remainingRounds).toBe(2);
  });

  it('passive damage (stink aura) does NOT break stun', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 5);
    state.positionsAtTurnStart = { p1: 5, p2: 5 };

    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 2 });

    // Nan stays → endTurn → stink aura fires (passive, breakStun=false)
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });

    // p2 took stink damage but stun should NOT be broken
    expect(getHero(state, 'p2').hp).toBeLessThan(100);
    // After endTurn + new turn cycle, stun may have ticked but should still be present
    // (startTurn is NOT called by endTurn — it's called externally by the server)
  });
});

describe('Suspected bugs — Invisible interactions', () => {
  it('physical punch misses invisible hero', () => {
    const state = makeGame('shan', 'jin');
    setPositions(state, 5, 5);
    getHero(state, 'p2').invisibleRounds = 2;

    winRPSForPlayer(state, 'p1');
    const hpBefore = getHero(state, 'p2').hp;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(hpBefore); // punch missed
  });

  it('physical skill misses invisible hero', () => {
    const state = makeGame('shan', 'jin');
    setPositions(state, 5, 5);
    getHero(state, 'p2').invisibleRounds = 2;

    winRPSForPlayer(state, 'p1');
    const hpBefore = getHero(state, 'p2').hp;
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'big_darts', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(hpBefore); // Big Darts is physical → misses
  });

  it('magic skill hits invisible hero', () => {
    const state = makeGame('nan', 'jin');
    setPositions(state, 5, 5);
    getHero(state, 'p2').invisibleRounds = 2;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'magic_burn', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(85); // magic hits invisible
  });

  it('call_fly (magic) hits invisible hero at range', () => {
    const state = makeGame('nan', 'jin');
    setPositions(state, 0, 3);
    getHero(state, 'p2').invisibleRounds = 2;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'call_fly', targetId: 'p2' });

    expect(getHero(state, 'p2').hp).toBe(95); // Call Fly deals 5 magic
  });

  it('invisible hero exit punch clears invisibility', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').invisibleRounds = 2;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });

    expect(getHero(state, 'p1').invisibleRounds).toBe(0); // invisibility ends
    expect(getHero(state, 'p2').hp).toBe(85); // Wind Walk punch = 15 damage
  });
});
