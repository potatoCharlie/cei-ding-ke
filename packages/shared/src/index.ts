// Types
export type * from './types/game.js';
export type * from './types/hero.js';
export type * from './types/protocol.js';

// Constants
export * from './constants.js';

// Game Engine
export { createGameState, submitRPS, resolveRPSRound, executeAction, getAvailableActions, startTurn } from './game-engine/GameState.js';
export { resolveRPS1v1, resolveRPSMulti, compareRPS, randomRPSChoice } from './game-engine/rps.js';
export { moveForward, moveBackward } from './game-engine/movement.js';
export { executePunch, executeSkill } from './game-engine/combat.js';
export { applyStatusEffect, tickStatusEffects, applyPassiveEffects, isStunned } from './game-engine/status-effects.js';
export { getDistance, getTeamIndex, getHeroDistance } from './game-engine/position.js';

// Heroes
export { getHero, getAllHeroes, getHeroIds } from './heroes/registry.js';
