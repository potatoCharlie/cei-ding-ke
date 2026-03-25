import { describe, it, expect } from 'vitest';
import { applyStatusEffect, tickStatusEffects, applyPassiveEffects, isStunned } from '../status-effects.js';
import { makeGame, setPositions, getHero } from '../../__tests__/helpers.js';

describe('applyStatusEffect', () => {
  it('adds a new status effect', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    applyStatusEffect(hero, 'stunned', 2);
    expect(hero.statusEffects).toHaveLength(1);
    expect(hero.statusEffects[0].type).toBe('stunned');
    expect(hero.statusEffects[0].remainingRounds).toBe(2);
  });

  it('stun on already-stunned hero refreshes to the longer duration', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    applyStatusEffect(hero, 'stunned', 1);
    expect(hero.statusEffects.some(e => e.type === 'stunned')).toBe(true);
    applyStatusEffect(hero, 'stunned', 3);
    expect(hero.statusEffects).toHaveLength(1);
    expect(hero.statusEffects[0].remainingRounds).toBe(3);
  });

  it('refreshes duration for non-stun effects (takes max)', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    applyStatusEffect(hero, 'trapped', 1);
    applyStatusEffect(hero, 'trapped', 3);
    expect(hero.statusEffects).toHaveLength(1);
    expect(hero.statusEffects[0].remainingRounds).toBe(3);
  });
});

describe('isStunned', () => {
  it('returns true when stunned', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.statusEffects.push({ type: 'stunned', remainingRounds: 1 });
    expect(isStunned(hero)).toBe(true);
  });

  it('returns false when not stunned', () => {
    const state = makeGame();
    expect(isStunned(getHero(state, 'p1'))).toBe(false);
  });
});

describe('tickStatusEffects', () => {
  it('decrements duration of all effects', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.statusEffects.push({ type: 'stunned', remainingRounds: 2 });
    tickStatusEffects(state);
    expect(hero.statusEffects[0].remainingRounds).toBe(1);
  });

  it('removes effects when duration reaches 0', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.statusEffects.push({ type: 'stunned', remainingRounds: 1 });
    const effects = tickStatusEffects(state);
    expect(hero.statusEffects).toHaveLength(0);
    expect(effects.some(e => e.type === 'status_remove' && e.statusEffect === 'stunned')).toBe(true);
  });

  it('applies Frozen DoT (10 magic damage) for trapped heroes', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.statusEffects.push({ type: 'trapped', remainingRounds: 2 });
    const effects = tickStatusEffects(state);
    const frozenDmg = effects.find(e => e.type === 'damage' && e.targetId === 'p1');
    expect(frozenDmg?.value).toBe(10);
    expect(frozenDmg?.damageType).toBe('magic');
  });

  it('decrements Wind Walk invisibleRounds', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.invisibleRounds = 3;
    tickStatusEffects(state);
    expect(hero.invisibleRounds).toBe(2);
  });

  it('emits status_remove when Wind Walk reaches 0', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.invisibleRounds = 1;
    const effects = tickStatusEffects(state);
    expect(hero.invisibleRounds).toBe(0);
    expect(effects.some(e => e.type === 'status_remove' && e.description.includes('Wind Walk'))).toBe(true);
  });
});

describe('applyPassiveEffects', () => {
  it('Nan stink aura deals 10 magic damage at distance 0', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 5);
    // Must be at same position both at turn start and now
    state.positionsAtTurnStart = { p1: 5, p2: 5 };
    const effects = applyPassiveEffects(state);
    const stink = effects.find(e => e.type === 'damage' && e.sourceId === 'p1');
    expect(stink?.value).toBe(10);
    expect(stink?.damageType).toBe('magic');
  });

  it('stink aura does NOT trigger if heroes moved apart during turn', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 6); // now at distance 1
    state.positionsAtTurnStart = { p1: 5, p2: 5 }; // were together at start
    const effects = applyPassiveEffects(state);
    expect(effects).toHaveLength(0);
  });

  it('stink aura does NOT trigger if heroes moved together during turn', () => {
    const state = makeGame('nan', 'shan');
    setPositions(state, 5, 5); // now at same position
    state.positionsAtTurnStart = { p1: 5, p2: 6 }; // were apart at start
    const effects = applyPassiveEffects(state);
    expect(effects).toHaveLength(0);
  });

  it('does not trigger for non-Nan heroes', () => {
    const state = makeGame('shan', 'nan');
    setPositions(state, 5, 5);
    state.positionsAtTurnStart = { p1: 5, p2: 5 };
    const effects = applyPassiveEffects(state);
    // Only Nan (p2) should trigger, not Shan (p1)
    const p1Effects = effects.filter(e => e.sourceId === 'p1');
    expect(p1Effects).toHaveLength(0);
  });
});
