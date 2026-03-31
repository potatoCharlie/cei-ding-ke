import { NORMAL_MOVE_SPEED, SLOWED_MOVE_SPEED } from '../constants.js';
import type { GameState, HeroState, GameEffect } from '../types/game.js';
import { getTeamIndex, getForwardDirection, findHeroByPlayerId, findOpponentHero } from './position.js';

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
  return !hero.movementDisabled && !hero.statusEffects.some(e => e.type === 'trapped');
}

/**
 * Get the direction toward the nearest opponent (+1 or -1).
 * Returns +1 if opponent is at a higher position, -1 if lower.
 * Falls back to team-based direction if no opponent found.
 */
function getDirectionTowardEnemy(state: GameState, playerId: string, heroPos: number): 1 | -1 {
  const oppHero = findOpponentHero(state, playerId);
  if (!oppHero) {
    // Fallback: team 0 goes right, team 1 goes left
    const teamIndex = getTeamIndex(state, playerId);
    return teamIndex === 0 ? 1 : -1;
  }
  if (oppHero.position === heroPos) return getForwardDirection(getTeamIndex(state, playerId));
  return oppHero.position > heroPos ? 1 : -1;
}

/**
 * Move a hero forward (toward nearest opponent). Returns the new position and effects.
 */
export function moveForward(state: GameState, playerId: string): { newPosition: number; effects: GameEffect[] } {
  const hero = findHeroByPlayerId(state, playerId);
  if (!hero) return { newPosition: 0, effects: [] };

  if (!canMove(hero)) {
    return { newPosition: hero.position, effects: [] };
  }

  const speed = getMoveSpeed(hero);
  const effectiveSpeed = hero.invisibleRounds > 0 ? 2 : speed;
  const direction = getDirectionTowardEnemy(state, playerId, hero.position);

  const newPosition = hero.position + direction * effectiveSpeed;

  return {
    newPosition,
    effects: [{
      type: 'move',
      sourceId: playerId,
      targetId: playerId,
      value: newPosition - hero.position,
      description: `${playerId} moves toward enemy (position: ${hero.position} → ${newPosition})`,
    }],
  };
}

/**
 * Move a hero backward (away from nearest opponent). Returns the new position and effects.
 */
export function moveBackward(state: GameState, playerId: string): { newPosition: number; effects: GameEffect[] } {
  const hero = findHeroByPlayerId(state, playerId);
  if (!hero) return { newPosition: 0, effects: [] };

  if (!canMove(hero)) {
    return { newPosition: hero.position, effects: [] };
  }

  const speed = getMoveSpeed(hero);
  const effectiveSpeed = hero.invisibleRounds > 0 ? 2 : speed;
  const direction = getDirectionTowardEnemy(state, playerId, hero.position);

  // Backward is opposite of toward enemy
  const newPosition = hero.position - direction * effectiveSpeed;

  return {
    newPosition,
    effects: [{
      type: 'move',
      sourceId: playerId,
      targetId: playerId,
      value: newPosition - hero.position,
      description: `${playerId} moves away from enemy (position: ${hero.position} → ${newPosition})`,
    }],
  };
}
