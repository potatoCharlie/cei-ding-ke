import { MAX_DISTANCE, NORMAL_MOVE_SPEED, SLOWED_MOVE_SPEED } from '../constants.js';
import type { GameState, HeroState, GameEffect } from '../types/game.js';

/**
 * Get the effective move speed for a hero based on status effects.
 */
export function getMoveSpeed(hero: HeroState): number {
  const isSlowed = hero.statusEffects.some(e => e.type === 'slowed');
  return isSlowed ? SLOWED_MOVE_SPEED : NORMAL_MOVE_SPEED;
}

/**
 * Check if a hero can move (not trapped).
 */
export function canMove(hero: HeroState): boolean {
  return !hero.statusEffects.some(e => e.type === 'trapped');
}

/**
 * Move a hero forward (closer to opponent). Returns the new distance and effects.
 */
export function moveForward(state: GameState, playerId: string): { newDistance: number; effects: GameEffect[] } {
  const hero = findHero(state, playerId);
  if (!hero) return { newDistance: state.distance, effects: [] };

  if (!canMove(hero)) {
    return { newDistance: state.distance, effects: [] };
  }

  const speed = getMoveSpeed(hero);
  // Wind Walk: Jin moves 2 per round
  const effectiveSpeed = hero.invisibleRounds > 0 ? 2 : speed;

  const newDistance = Math.max(0, state.distance - effectiveSpeed);

  return {
    newDistance,
    effects: [{
      type: 'move',
      sourceId: playerId,
      targetId: playerId,
      value: -(state.distance - newDistance),
      description: `${playerId} moves forward (distance: ${state.distance} -> ${newDistance})`,
    }],
  };
}

/**
 * Move a hero backward (away from opponent). Returns the new distance and effects.
 */
export function moveBackward(state: GameState, playerId: string): { newDistance: number; effects: GameEffect[] } {
  const hero = findHero(state, playerId);
  if (!hero) return { newDistance: state.distance, effects: [] };

  if (!canMove(hero)) {
    return { newDistance: state.distance, effects: [] };
  }

  const speed = getMoveSpeed(hero);
  const effectiveSpeed = hero.invisibleRounds > 0 ? 2 : speed;

  // Cannot move beyond max distance
  if (state.distance >= MAX_DISTANCE) {
    return { newDistance: state.distance, effects: [] };
  }

  const newDistance = Math.min(MAX_DISTANCE, state.distance + effectiveSpeed);

  return {
    newDistance,
    effects: [{
      type: 'move',
      sourceId: playerId,
      targetId: playerId,
      value: newDistance - state.distance,
      description: `${playerId} moves backward (distance: ${state.distance} -> ${newDistance})`,
    }],
  };
}

function findHero(state: GameState, playerId: string): HeroState | undefined {
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.id === playerId) return player.hero;
    }
  }
  return undefined;
}
