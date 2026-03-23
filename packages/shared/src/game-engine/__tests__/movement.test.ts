import { describe, it, expect } from 'vitest';
import { moveForward, moveBackward, getMoveSpeed, canMove } from '../movement.js';
import { makeGame, setPositions, getHero } from '../../__tests__/helpers.js';

describe('getMoveSpeed', () => {
  it('returns 1 for normal hero', () => {
    const state = makeGame();
    expect(getMoveSpeed(getHero(state, 'p1'))).toBe(1);
  });

  it('returns 0.5 for slowed hero', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.statusEffects.push({ type: 'slowed', remainingRounds: 2 });
    expect(getMoveSpeed(hero)).toBe(0.5);
  });
});

describe('canMove', () => {
  it('returns true for normal hero', () => {
    const state = makeGame();
    expect(canMove(getHero(state, 'p1'))).toBe(true);
  });

  it('returns false for trapped hero', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.statusEffects.push({ type: 'trapped', remainingRounds: 2 });
    expect(canMove(hero)).toBe(false);
  });
});

describe('moveForward', () => {
  it('moves toward enemy', () => {
    const state = makeGame();
    setPositions(state, 1, 3);
    const result = moveForward(state, 'p1');
    // p1 at 1, enemy at 3 → forward = +1 → new position = 2
    expect(result.newPosition).toBe(2);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].type).toBe('move');
  });

  it('moves in correct direction for team 1', () => {
    const state = makeGame();
    setPositions(state, 1, 3);
    const result = moveForward(state, 'p2');
    // p2 at 3, enemy at 1 → forward = -1 → new position = 2
    expect(result.newPosition).toBe(2);
  });

  it('does not move when trapped', () => {
    const state = makeGame();
    const hero = getHero(state, 'p1');
    hero.statusEffects.push({ type: 'trapped', remainingRounds: 2 });
    const result = moveForward(state, 'p1');
    expect(result.newPosition).toBe(hero.position);
    expect(result.effects).toHaveLength(0);
  });

  it('moves 2x when invisible (Wind Walk)', () => {
    const state = makeGame();
    setPositions(state, 0, 3);
    const hero = getHero(state, 'p1');
    hero.invisibleRounds = 3;
    const result = moveForward(state, 'p1');
    // Forward toward enemy at 3 → +2 → new position = 2
    expect(result.newPosition).toBe(2);
  });
});

describe('moveBackward', () => {
  it('moves away from enemy', () => {
    const state = makeGame();
    setPositions(state, 2, 3);
    const result = moveBackward(state, 'p1');
    // p1 at 2, enemy at 3 → toward enemy = +1 → backward = -1 → new position = 1
    expect(result.newPosition).toBe(1);
  });

  it('moves away correctly for team 1', () => {
    const state = makeGame();
    setPositions(state, 1, 3);
    const result = moveBackward(state, 'p2');
    // p2 at 3, enemy at 1 → toward enemy = -1 → backward = +1 → new position = 4
    expect(result.newPosition).toBe(4);
  });
});
