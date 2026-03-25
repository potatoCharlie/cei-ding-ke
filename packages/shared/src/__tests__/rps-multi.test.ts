import { describe, it, expect } from 'vitest';
import { resolveRPSMulti } from '../game-engine/rps.js';

describe('resolveRPSMulti', () => {
  it('returns tie when all 3 choices present', () => {
    const result = resolveRPSMulti({
      p1: 'rock', p2: 'scissors', p3: 'paper',
    });
    expect(result).toBeNull();
  });

  it('returns tie when all choices are the same', () => {
    const result = resolveRPSMulti({
      p1: 'rock', p2: 'rock', p3: 'rock',
    });
    expect(result).toBeNull();
  });

  it('2 choices: rock beats scissors', () => {
    const result = resolveRPSMulti({
      p1: 'rock', p2: 'scissors', p3: 'rock',
    });
    expect(result).not.toBeNull();
    expect(result!.winners.sort()).toEqual(['p1', 'p3']);
    expect(result!.losers).toEqual(['p2']);
  });

  it('2 choices: paper beats rock', () => {
    const result = resolveRPSMulti({
      p1: 'rock', p2: 'paper', p3: 'paper', p4: 'rock',
    });
    expect(result).not.toBeNull();
    expect(result!.winners.sort()).toEqual(['p2', 'p3']);
    expect(result!.losers.sort()).toEqual(['p1', 'p4']);
  });

  it('2 choices: scissors beats paper', () => {
    const result = resolveRPSMulti({
      p1: 'scissors', p2: 'paper',
    });
    expect(result).not.toBeNull();
    expect(result!.winners).toEqual(['p1']);
    expect(result!.losers).toEqual(['p2']);
  });

  it('single player returns that player as winner', () => {
    const result = resolveRPSMulti({ p1: 'rock' });
    expect(result).not.toBeNull();
    expect(result!.winners).toEqual(['p1']);
    expect(result!.losers).toEqual([]);
  });

  it('2 players same choice is a tie', () => {
    const result = resolveRPSMulti({ p1: 'rock', p2: 'rock' });
    expect(result).toBeNull();
  });
});
