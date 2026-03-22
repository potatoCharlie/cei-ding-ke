import type { RPSChoice, RPSResult } from '../types/game.js';

/**
 * Determine the winner of a rock-paper-scissors round.
 * Returns 1 if a wins, -1 if b wins, 0 if draw.
 */
export function compareRPS(a: RPSChoice, b: RPSChoice): number {
  if (a === b) return 0;
  if (
    (a === 'rock' && b === 'scissors') ||
    (a === 'scissors' && b === 'paper') ||
    (a === 'paper' && b === 'rock')
  ) {
    return 1;
  }
  return -1;
}

/**
 * Resolve a 1v1 RPS round.
 */
export function resolveRPS1v1(
  player1Id: string,
  choice1: RPSChoice,
  player2Id: string,
  choice2: RPSChoice,
): RPSResult {
  const result = compareRPS(choice1, choice2);
  const choices: Record<string, RPSChoice> = {
    [player1Id]: choice1,
    [player2Id]: choice2,
  };

  if (result === 0) {
    return { choices, winners: [], losers: [], draw: true };
  }

  if (result === 1) {
    return { choices, winners: [player1Id], losers: [player2Id], draw: false };
  }

  return { choices, winners: [player2Id], losers: [player1Id], draw: false };
}

/**
 * Pick a random RPS choice (used for timeouts).
 */
export function randomRPSChoice(): RPSChoice {
  const choices: RPSChoice[] = ['rock', 'paper', 'scissors'];
  return choices[Math.floor(Math.random() * 3)];
}
