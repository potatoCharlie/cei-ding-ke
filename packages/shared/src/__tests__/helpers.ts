import { createGameState } from '../game-engine/GameState.js';
import type { GameState, HeroState, PlayerState } from '../types/game.js';

/** Create a standard 1v1 game state for testing. */
export function makeGame(
  hero1 = 'nan',
  hero2 = 'shan',
  p1 = 'p1',
  p2 = 'p2',
): GameState {
  return createGameState('test-game',
    { id: p1, name: 'Player1', heroId: hero1 },
    { id: p2, name: 'Player2', heroId: hero2 },
  );
}

/** Skip RPS and put the game in action_phase with the given player acting. */
export function winRPSForPlayer(state: GameState, winnerId: string): void {
  state.phase = 'action_phase';
  state.actionOrder = [winnerId];
  state.currentActionIndex = 0;
  state.awaitingMinionAction = false;
}

/** Set hero positions directly. */
export function setPositions(state: GameState, p1Pos: number, p2Pos: number): void {
  state.teams[0].players[0].hero.position = p1Pos;
  state.teams[1].players[0].hero.position = p2Pos;
}

/** Get the PlayerState for a player ID. */
export function getPlayer(state: GameState, playerId: string): PlayerState {
  for (const team of state.teams) {
    for (const p of team.players) {
      if (p.id === playerId) return p;
    }
  }
  throw new Error(`Player ${playerId} not found`);
}

/** Get the HeroState for a player ID. */
export function getHero(state: GameState, playerId: string): HeroState {
  return getPlayer(state, playerId).hero;
}
