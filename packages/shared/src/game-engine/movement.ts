import { NORMAL_MOVE_SPEED, SLOWED_MOVE_SPEED } from '../constants.js';
import type { GameState, HeroState, GameEffect } from '../types/game.js';
import { getForwardDirection, getTeamIndex, findHeroByPlayerId } from './position.js';

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
 * Move a hero forward (toward opponent). Returns the new position and effects.
 */
export function moveForward(state: GameState, playerId: string): { newPosition: number; effects: GameEffect[] } {
  const hero = findHeroByPlayerId(state, playerId);
  if (!hero) return { newPosition: 0, effects: [] };

  if (!canMove(hero)) {
    return { newPosition: hero.position, effects: [] };
  }

  const speed = getMoveSpeed(hero);
  const effectiveSpeed = hero.invisibleRounds > 0 ? 2 : speed;
  const teamIndex = getTeamIndex(state, playerId);
  const direction = getForwardDirection(teamIndex);

  const newPosition = hero.position + direction * effectiveSpeed;

  return {
    newPosition,
    effects: [{
      type: 'move',
      sourceId: playerId,
      targetId: playerId,
      value: newPosition - hero.position,
      description: `${playerId} moves forward (position: ${hero.position} → ${newPosition})`,
    }],
  };
}

/**
 * Move a hero backward (away from opponent). Returns the new position and effects.
 */
export function moveBackward(state: GameState, playerId: string): { newPosition: number; effects: GameEffect[] } {
  const hero = findHeroByPlayerId(state, playerId);
  if (!hero) return { newPosition: 0, effects: [] };

  if (!canMove(hero)) {
    return { newPosition: hero.position, effects: [] };
  }

  const speed = getMoveSpeed(hero);
  const effectiveSpeed = hero.invisibleRounds > 0 ? 2 : speed;
  const teamIndex = getTeamIndex(state, playerId);
  const direction = getForwardDirection(teamIndex);

  // Backward is opposite of forward
  const newPosition = hero.position - direction * effectiveSpeed;

  return {
    newPosition,
    effects: [{
      type: 'move',
      sourceId: playerId,
      targetId: playerId,
      value: newPosition - hero.position,
      description: `${playerId} moves backward (position: ${hero.position} → ${newPosition})`,
    }],
  };
}
