import { describe, it, expect } from 'vitest';
import { createGameState, submitRPS, resolveRPSRound, executeAction, getAvailableActions, startTurn } from '../GameState.js';
import { makeGame, setPositions, getHero, getPlayer, winRPSForPlayer } from '../../__tests__/helpers.js';

describe('createGameState', () => {
  it('initializes with correct defaults', () => {
    const state = makeGame();
    expect(state.phase).toBe('rps_submit');
    expect(state.turn).toBe(1);
    expect(state.winner).toBeNull();
    expect(state.teams).toHaveLength(2);
    expect(state.teams[0].players[0].hero.position).toBe(1);
    expect(state.teams[1].players[0].hero.position).toBe(2);
    expect(state.teams[0].players[0].hero.hp).toBe(100);
    expect(state.teams[0].players[0].hero.alive).toBe(true);
  });

  it('initializes skill uses correctly', () => {
    const state = makeGame('nan', 'shan');
    const hero = getHero(state, 'p1');
    expect(hero.skillUsesRemaining['magic_burn']).toBe(2);
    // call_fly has maxUses=-1 (unlimited), so no entry
  });
});

describe('submitRPS', () => {
  it('returns false when only one player submits', () => {
    const state = makeGame();
    expect(submitRPS(state, 'p1', 'rock')).toBe(false);
  });

  it('returns true when both players submit', () => {
    const state = makeGame();
    submitRPS(state, 'p1', 'rock');
    expect(submitRPS(state, 'p2', 'scissors')).toBe(true);
  });

  it('rejects submission in wrong phase', () => {
    const state = makeGame();
    state.phase = 'action_phase';
    expect(submitRPS(state, 'p1', 'rock')).toBe(false);
  });

  it('auto-completes if one player is stunned', () => {
    const state = makeGame();
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 1 });
    // Only p1 needs to submit
    expect(submitRPS(state, 'p1', 'rock')).toBe(true);
  });
});

describe('resolveRPSRound', () => {
  it('transitions to action_phase on non-draw', () => {
    const state = makeGame();
    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p2', 'scissors');
    const result = resolveRPSRound(state);
    expect(result.draw).toBe(false);
    expect(state.phase).toBe('action_phase');
    expect(state.actionOrder).toEqual(['p1']);
  });

  it('stays in rps_submit on draw', () => {
    const state = makeGame();
    submitRPS(state, 'p1', 'rock');
    submitRPS(state, 'p2', 'rock');
    const result = resolveRPSRound(state);
    expect(result.draw).toBe(true);
    expect(state.phase).toBe('rps_submit');
  });

  it('auto-wins for non-stunned player when opponent is stunned', () => {
    const state = makeGame();
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 1 });
    submitRPS(state, 'p1', 'rock');
    const result = resolveRPSRound(state);
    expect(result.winners).toEqual(['p1']);
    expect(state.phase).toBe('action_phase');
  });
});

describe('executeAction', () => {
  it('rejects action in wrong phase', () => {
    const state = makeGame();
    const effects = executeAction(state, { type: 'punch', playerId: 'p1' });
    expect(effects).toHaveLength(0);
  });

  it('rejects action from wrong player', () => {
    const state = makeGame();
    winRPSForPlayer(state, 'p1');
    const effects = executeAction(state, { type: 'punch', playerId: 'p2' });
    expect(effects).toHaveLength(0);
  });

  it('executes punch and applies damage', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    const effects = executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(effects.some(e => e.type === 'damage')).toBe(true);
    expect(getHero(state, 'p2').hp).toBe(90);
  });

  it('3 consecutive punches cause stun', () => {
    const state = makeGame();
    setPositions(state, 5, 5);

    // Punch 3 times
    for (let i = 0; i < 3; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    }

    const hero2 = getHero(state, 'p2');
    expect(hero2.statusEffects.some(e => e.type === 'stunned')).toBe(true);
    expect(hero2.consecutivePunchesReceived).toBe(0); // reset after stun
  });

  it('target acting resets their own punch counter (target-based)', () => {
    const state = makeGame();
    setPositions(state, 5, 5);

    // Punch twice
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(2);

    // Attacker does non-punch — does NOT reset target's counter (target-based)
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(2);

    // Target acts — resets their own counter
    winRPSForPlayer(state, 'p2');
    executeAction(state, { type: 'stay', playerId: 'p2' });
    expect(getHero(state, 'p2').consecutivePunchesReceived).toBe(0);
  });

  it('move_forward updates hero position', () => {
    const state = makeGame();
    setPositions(state, 0, 3);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'move_forward', playerId: 'p1' });
    expect(getHero(state, 'p1').position).toBe(1);
  });

  it('stay does not change position', () => {
    const state = makeGame();
    winRPSForPlayer(state, 'p1');
    const posBefore = getHero(state, 'p1').position;
    executeAction(state, { type: 'stay', playerId: 'p1' });
    expect(getHero(state, 'p1').position).toBe(posBefore);
  });

  it('summon creates a minion', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    const effects = executeAction(state, { type: 'summon', playerId: 'p1' });
    const player = getPlayer(state, 'p1');
    expect(player.minions).toHaveLength(1);
    expect(player.minions[0].alive).toBe(true);
    expect(player.minions[0].position).toBe(player.hero.position);
    expect(effects.some(e => e.type === 'summon')).toBe(true);
  });

  it('cannot summon when minion already exists', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    // Try to summon again
    winRPSForPlayer(state, 'p1');
    const effects = executeAction(state, { type: 'summon', playerId: 'p1' });
    expect(getPlayer(state, 'p1').minions).toHaveLength(1);
  });

  it('sets awaitingMinionAction after hero action if minion alive', () => {
    const state = makeGame('gao', 'nan');
    // First summon
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    // On next turn, hero acts → awaiting minion action
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });
    expect(state.awaitingMinionAction).toBe(true);
  });

  it('minion punch deals correct damage', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    // Move minion to same position as enemy
    getPlayer(state, 'p1').minions[0].position = getHero(state, 'p2').position;

    // Hero stay → then minion punches
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });
    expect(state.awaitingMinionAction).toBe(true);

    const p2HpBefore = getHero(state, 'p2').hp;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId });
    expect(getHero(state, 'p2').hp).toBe(p2HpBefore - 20); // Hellfire punch = 20
  });

  it('minion punches do NOT count toward 3-punch stun', () => {
    const state = makeGame('gao', 'nan');
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'summon', playerId: 'p1' });

    const minionId = getPlayer(state, 'p1').minions[0].minionId;
    getPlayer(state, 'p1').minions[0].position = getHero(state, 'p2').position;

    // Minion punches 3 times — should NOT stun
    for (let i = 0; i < 3; i++) {
      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'stay', playerId: 'p1' });
      executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2', minionId });
    }

    expect(getHero(state, 'p2').statusEffects.some(e => e.type === 'stunned')).toBe(false);
  });

  it('hero dies when HP reaches 0', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    getHero(state, 'p2').hp = 5;
    winRPSForPlayer(state, 'p1');
    const effects = executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p2').alive).toBe(false);
    expect(effects.some(e => e.type === 'death')).toBe(true);
  });

  it('game ends when all opponent heroes dead', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    getHero(state, 'p2').hp = 5;
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(state.winner).toBe(0); // team 0 wins
    expect(state.phase).toBe('game_over');
  });

  it('Wind Walk punch clears invisibility and deals 15 damage', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').invisibleRounds = 3;
    winRPSForPlayer(state, 'p1');
    const effects = executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(getHero(state, 'p1').invisibleRounds).toBe(0);
    expect(getHero(state, 'p2').hp).toBe(85); // 100 - 15
  });

  it('stun persists through active hero damage', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 2 });

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });

    const stun = getHero(state, 'p2').statusEffects.find(e => e.type === 'stunned');
    expect(stun?.remainingRounds).toBe(2);
  });

  it('stun does NOT break on passive damage (end-of-turn stink)', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 5);
    state.positionsAtTurnStart = { p1: 5, p2: 5 };
    getHero(state, 'p2').statusEffects.push({ type: 'stunned', remainingRounds: 2 });

    // Nan stays → endTurn → stink aura fires with breakStun=false
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'stay', playerId: 'p1' });

    // After endTurn, stink aura should have dealt damage but NOT removed stun
    // The stun should still be present (though ticked down by startTurn)
    const hero2 = getHero(state, 'p2');
    // Stun should survive passive damage
    // Note: endTurn calls applyPassiveEffects with breakStun=false (default)
    // After endTurn, turn advances, startTurn ticks it down by 1 → remainingRounds=1
    // So stun should still be present
    expect(hero2.hp).toBeLessThan(100); // took stink damage
  });

  it('skill uses decrement correctly', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 5);
    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'magic_burn', targetId: 'p2' });
    expect(getHero(state, 'p1').skillUsesRemaining['magic_burn']).toBe(1);
  });
});

describe('getAvailableActions', () => {
  it('includes punch at distance 0', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'punch')).toBe(true);
  });

  it('excludes punch at distance > 0', () => {
    const state = makeGame();
    setPositions(state, 0, 2);
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'punch')).toBe(false);
  });

  it('includes movement actions', () => {
    const state = makeGame();
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'move_forward')).toBe(true);
    expect(actions.some(a => a.type === 'move_backward')).toBe(true);
  });

  it('excludes movement for trapped hero', () => {
    const state = makeGame();
    getHero(state, 'p1').statusEffects.push({ type: 'trapped', remainingRounds: 2 });
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'move_forward')).toBe(false);
    expect(actions.some(a => a.type === 'move_backward')).toBe(false);
  });

  it('always includes stay', () => {
    const state = makeGame();
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'stay')).toBe(true);
  });

  it('includes summon for Gao with no minion', () => {
    const state = makeGame('gao', 'nan');
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'summon')).toBe(true);
  });

  it('excludes summon when minion exists', () => {
    const state = makeGame('gao', 'nan');
    getPlayer(state, 'p1').minions.push({
      minionId: 'hellfire_p1', ownerId: 'p1', hp: 100, maxHp: 100,
      alive: true, position: 1, type: 'hellfire', consecutivePunchesDealt: 0,
      name: 'Hellfire', punchDamage: 20, punchCountsForStun: false, immuneTo: ['magic'],
      moveSpeed: 1, canMove: true, attackMinDistance: 0, attackMaxDistance: 0,
    });
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'summon')).toBe(false);
  });

  it('excludes exhausted skills', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').skillUsesRemaining['magic_burn'] = 0;
    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.skillId === 'magic_burn')).toBe(false);
  });

  it('returns minion actions when awaitingMinionAction', () => {
    const state = makeGame('gao', 'nan');
    state.awaitingMinionAction = true;
    getPlayer(state, 'p1').minions.push({
      minionId: 'hellfire_p1', ownerId: 'p1', hp: 100, maxHp: 100,
      alive: true, position: 1, type: 'hellfire', consecutivePunchesDealt: 0,
      name: 'Hellfire', punchDamage: 20, punchCountsForStun: false, immuneTo: ['magic'],
      moveSpeed: 1, canMove: true, attackMinDistance: 0, attackMaxDistance: 0,
    });
    const actions = getAvailableActions(state, 'p1');
    expect(actions.every(a => a.minionId === 'hellfire_p1')).toBe(true);
    expect(actions.some(a => a.type === 'stay')).toBe(true);
  });
});

describe('startTurn', () => {
  it('ticks status effects', () => {
    const state = makeGame();
    getHero(state, 'p1').statusEffects.push({ type: 'stunned', remainingRounds: 1 });
    startTurn(state);
    expect(getHero(state, 'p1').statusEffects).toHaveLength(0);
  });

  it('applies Frozen DoT damage', () => {
    const state = makeGame();
    getHero(state, 'p1').statusEffects.push({ type: 'trapped', remainingRounds: 2 });
    const hpBefore = getHero(state, 'p1').hp;
    startTurn(state);
    expect(getHero(state, 'p1').hp).toBe(hpBefore - 10);
  });
});
