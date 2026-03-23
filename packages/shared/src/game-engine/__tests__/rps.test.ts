import { describe, it, expect } from 'vitest';
import { compareRPS, resolveRPS1v1, randomRPSChoice } from '../rps.js';

describe('compareRPS', () => {
  it('rock beats scissors', () => expect(compareRPS('rock', 'scissors')).toBe(1));
  it('scissors beats paper', () => expect(compareRPS('scissors', 'paper')).toBe(1));
  it('paper beats rock', () => expect(compareRPS('paper', 'rock')).toBe(1));

  it('scissors loses to rock', () => expect(compareRPS('scissors', 'rock')).toBe(-1));
  it('paper loses to scissors', () => expect(compareRPS('paper', 'scissors')).toBe(-1));
  it('rock loses to paper', () => expect(compareRPS('rock', 'paper')).toBe(-1));

  it('rock draws rock', () => expect(compareRPS('rock', 'rock')).toBe(0));
  it('paper draws paper', () => expect(compareRPS('paper', 'paper')).toBe(0));
  it('scissors draws scissors', () => expect(compareRPS('scissors', 'scissors')).toBe(0));
});

describe('resolveRPS1v1', () => {
  it('returns p1 as winner when p1 wins', () => {
    const result = resolveRPS1v1('p1', 'rock', 'p2', 'scissors');
    expect(result.winners).toEqual(['p1']);
    expect(result.losers).toEqual(['p2']);
    expect(result.draw).toBe(false);
    expect(result.choices).toEqual({ p1: 'rock', p2: 'scissors' });
  });

  it('returns p2 as winner when p2 wins', () => {
    const result = resolveRPS1v1('p1', 'rock', 'p2', 'paper');
    expect(result.winners).toEqual(['p2']);
    expect(result.losers).toEqual(['p1']);
    expect(result.draw).toBe(false);
  });

  it('returns draw when same choice', () => {
    const result = resolveRPS1v1('p1', 'paper', 'p2', 'paper');
    expect(result.winners).toEqual([]);
    expect(result.losers).toEqual([]);
    expect(result.draw).toBe(true);
  });
});

describe('randomRPSChoice', () => {
  it('returns a valid RPS choice', () => {
    for (let i = 0; i < 20; i++) {
      const choice = randomRPSChoice();
      expect(['rock', 'paper', 'scissors']).toContain(choice);
    }
  });
});
