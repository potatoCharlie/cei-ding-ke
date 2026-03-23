import { describe, it, expect } from 'vitest';
import { getDistance, getForwardDirection, getTeamIndex, getHeroDistance, findHeroByPlayerId, findOpponentHero, getAllEntityPositions, isMoveLegal } from '../position.js';
import { makeGame, setPositions, getPlayer } from '../../__tests__/helpers.js';

describe('getDistance', () => {
  it('returns absolute difference', () => expect(getDistance(1, 4)).toBe(3));
  it('returns 0 for same position', () => expect(getDistance(5, 5)).toBe(0));
  it('works with negative positions', () => expect(getDistance(-3, 2)).toBe(5));
  it('is commutative', () => expect(getDistance(1, 4)).toBe(getDistance(4, 1)));
});

describe('getForwardDirection', () => {
  it('team 0 goes right (+1)', () => expect(getForwardDirection(0)).toBe(1));
  it('team 1 goes left (-1)', () => expect(getForwardDirection(1)).toBe(-1));
});

describe('getTeamIndex', () => {
  it('returns 0 for team 0 player', () => {
    const state = makeGame();
    expect(getTeamIndex(state, 'p1')).toBe(0);
  });

  it('returns 1 for team 1 player', () => {
    const state = makeGame();
    expect(getTeamIndex(state, 'p2')).toBe(1);
  });

  it('returns -1 for unknown player', () => {
    const state = makeGame();
    expect(getTeamIndex(state, 'unknown')).toBe(-1);
  });
});

describe('getHeroDistance', () => {
  it('returns starting distance between heroes', () => {
    const state = makeGame();
    // TEAM_0_START=1, TEAM_1_START=2, distance=1
    expect(getHeroDistance(state, 'p1')).toBe(1);
  });

  it('returns correct distance after repositioning', () => {
    const state = makeGame();
    setPositions(state, 0, 3);
    expect(getHeroDistance(state, 'p1')).toBe(3);
  });
});

describe('getAllEntityPositions', () => {
  it('returns both heroes', () => {
    const state = makeGame();
    const positions = getAllEntityPositions(state);
    expect(positions).toHaveLength(2);
    expect(positions.map(p => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('includes minions', () => {
    const state = makeGame('gao', 'nan');
    const player = getPlayer(state, 'p1');
    player.minions.push({
      minionId: 'hellfire_p1',
      ownerId: 'p1',
      hp: 100,
      maxHp: 100,
      alive: true,
      position: 1,
      type: 'hellfire',
      consecutivePunchesDealt: 0,
    });
    const positions = getAllEntityPositions(state);
    expect(positions).toHaveLength(3);
  });

  it('excludes dead entities', () => {
    const state = makeGame();
    state.teams[1].players[0].hero.alive = false;
    const positions = getAllEntityPositions(state);
    expect(positions).toHaveLength(1);
  });
});

describe('isMoveLegal', () => {
  it('allows movement within MAX_DISTANCE (3)', () => {
    const state = makeGame();
    setPositions(state, 0, 0);
    expect(isMoveLegal(state, 'p1', 3)).toBe(true);
  });

  it('blocks movement exceeding MAX_DISTANCE', () => {
    const state = makeGame();
    setPositions(state, 0, 0);
    expect(isMoveLegal(state, 'p1', 4)).toBe(false);
  });

  it('checks against all entities including minions', () => {
    const state = makeGame('gao', 'nan');
    setPositions(state, 0, 2);
    const player = getPlayer(state, 'p1');
    player.minions.push({
      minionId: 'hellfire_p1',
      ownerId: 'p1',
      hp: 100,
      maxHp: 100,
      alive: true,
      position: 0,
      type: 'hellfire',
      consecutivePunchesDealt: 0,
    });
    // Moving p2 to position 4 is distance 4 from hellfire at 0 — blocked
    expect(isMoveLegal(state, 'p2', 4)).toBe(false);
    // Moving p2 to position 3 is distance 3 from hellfire — OK
    expect(isMoveLegal(state, 'p2', 3)).toBe(true);
  });
});
