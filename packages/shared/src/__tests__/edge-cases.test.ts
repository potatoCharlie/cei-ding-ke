import { describe, it, expect } from 'vitest';
import { executeAction, getAvailableActions, startTurn } from '../game-engine/GameState.js';
import { makeGame, setPositions, getHero, getPlayer, winRPSForPlayer } from './helpers.js';

describe('Edge cases', () => {
  it('hero at exactly 1 HP dies from punch', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    getHero(state, 'p2').hp = 1;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });

    expect(getHero(state, 'p2').alive).toBe(false);
    expect(state.winner).toBe(0);
  });

  it('dead hero returns no available actions', () => {
    const state = makeGame();
    getHero(state, 'p2').alive = false;
    getHero(state, 'p2').hp = 0;

    const actions = getAvailableActions(state, 'p2');
    expect(actions).toHaveLength(0);
  });

  it('executeAction with dead hero returns empty', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    getHero(state, 'p1').alive = false;
    getHero(state, 'p1').hp = 0;

    winRPSForPlayer(state, 'p1');
    const effects = executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    expect(effects).toHaveLength(0);
  });

  it('negative positions work correctly', () => {
    const state = makeGame();
    setPositions(state, -5, -2);

    const actions = getAvailableActions(state, 'p1');
    expect(actions.some(a => a.type === 'move_forward')).toBe(true);
  });

  it('hero at 0 HP from Frozen DoT dies correctly', () => {
    const state = makeGame();
    getHero(state, 'p1').hp = 5;
    getHero(state, 'p1').statusEffects.push({ type: 'trapped', remainingRounds: 2 });

    startTurn(state);
    // Frozen DoT = 10 damage, hero had 5 HP → should die
    expect(getHero(state, 'p1').hp).toBeLessThanOrEqual(0);
    expect(getHero(state, 'p1').alive).toBe(false);
  });

  it('MAX_DISTANCE constraint blocks movement at edge', () => {
    const state = makeGame();
    setPositions(state, 0, 3); // already at max distance

    const actions = getAvailableActions(state, 'p2');
    // p2 at 3, enemy at 0 → backward would go to 4 → distance 4 → blocked
    expect(actions.some(a => a.type === 'move_backward')).toBe(false);
    // Forward toward enemy is fine
    expect(actions.some(a => a.type === 'move_forward')).toBe(true);
  });

  it('heal does not exceed maxHp', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 0, 3);
    getHero(state, 'p1').hp = 99;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'call_fly', targetId: 'p2' });

    expect(getHero(state, 'p1').hp).toBe(100); // capped at maxHp, not 104
  });

  it('Kuang self-heal does not exceed maxHp', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    getHero(state, 'p1').hp = 80;

    winRPSForPlayer(state, 'p1');
    executeAction(state, { type: 'skill', playerId: 'p1', skillId: 'kuang', targetId: 'p1' });

    expect(getHero(state, 'p1').hp).toBe(100); // capped, not 120
  });

  it('Wind Walk punch at distance > 0 returns empty', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 0, 1);
    getHero(state, 'p1').invisibleRounds = 2;

    winRPSForPlayer(state, 'p1');
    const hpBefore = getHero(state, 'p2').hp;
    executeAction(state, { type: 'punch', playerId: 'p1', targetId: 'p2' });
    // Wind Walk punch still requires distance 0
    expect(getHero(state, 'p2').hp).toBe(hpBefore);
  });

  it('multiple status effects tick independently', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.statusEffects.push({ type: 'stunned', remainingRounds: 1 });
    hero.statusEffects.push({ type: 'trapped', remainingRounds: 2 });

    startTurn(state);

    // Stunned (1 round) should be gone, trapped (2 rounds) should be at 1
    expect(hero.statusEffects.some(e => e.type === 'stunned')).toBe(false);
    expect(hero.statusEffects.some(e => e.type === 'trapped')).toBe(true);
    expect(hero.statusEffects.find(e => e.type === 'trapped')?.remainingRounds).toBe(1);
  });
});
