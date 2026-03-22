import type { GameState, HeroState, MinionState, PlayerState } from '../types/game.js';
import { MAX_DISTANCE } from '../constants.js';

/** Distance between two positions on the 1D grid. */
export function getDistance(posA: number, posB: number): number {
  return Math.abs(posA - posB);
}

/**
 * Forward direction for a team.
 * Team 0 moves toward higher positions (→), Team 1 moves toward lower positions (←).
 */
export function getForwardDirection(teamIndex: number): 1 | -1 {
  return teamIndex === 0 ? 1 : -1;
}

/** Get the team index for a player. Returns -1 if not found. */
export function getTeamIndex(state: GameState, playerId: string): number {
  for (let i = 0; i < state.teams.length; i++) {
    if (state.teams[i].players.some(p => p.id === playerId)) return i;
  }
  return -1;
}

/** Get the distance between a player's hero and their opponent's hero. */
export function getHeroDistance(state: GameState, playerId: string): number {
  const hero = findHeroByPlayerId(state, playerId);
  const oppHero = findOpponentHero(state, playerId);
  if (!hero || !oppHero) return Infinity;
  return getDistance(hero.position, oppHero.position);
}

/** Find a hero by player ID. */
export function findHeroByPlayerId(state: GameState, playerId: string): HeroState | undefined {
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.id === playerId) return player.hero;
    }
  }
  return undefined;
}

/** Find the first alive opponent hero for a given player. */
export function findOpponentHero(state: GameState, playerId: string): HeroState | undefined {
  const teamIdx = getTeamIndex(state, playerId);
  if (teamIdx === -1) return undefined;
  const oppTeam = state.teams[1 - teamIdx];
  return oppTeam.players.find(p => p.hero.alive)?.hero;
}

/**
 * Collect all alive entity positions in the game.
 * Returns array of { id, position } for heroes and minions.
 */
export function getAllEntityPositions(state: GameState): { id: string; position: number }[] {
  const entities: { id: string; position: number }[] = [];
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.hero.alive) {
        entities.push({ id: player.id, position: player.hero.position });
      }
      for (const minion of player.minions) {
        if (minion.alive) {
          entities.push({ id: minion.minionId, position: minion.position });
        }
      }
    }
  }
  return entities;
}

/**
 * Check if moving an entity to a new position would keep all pairwise
 * distances within MAX_DISTANCE (3). Returns true if the move is valid.
 */
export function isMoveLegal(state: GameState, entityId: string, newPosition: number): boolean {
  const entities = getAllEntityPositions(state);
  for (const ent of entities) {
    if (ent.id === entityId) continue;
    if (getDistance(newPosition, ent.position) > MAX_DISTANCE) {
      return false;
    }
  }
  return true;
}
