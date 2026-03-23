import type { GameState, GameEffect, HeroState, StatusEffect } from '../types/game.js';
import { getHero } from '../heroes/registry.js';
import { getDistance } from './position.js';

/**
 * Apply a status effect to a hero.
 */
export function applyStatusEffect(
  hero: HeroState,
  type: StatusEffect['type'],
  duration: number,
): void {
  const existing = hero.statusEffects.find(e => e.type === type);
  if (existing) {
    // If already stunned and receiving another stun, wake up instead.
    // This prevents infinite stun-lock (e.g., Small Dart stun on stunned target).
    if (type === 'stunned') {
      hero.statusEffects = hero.statusEffects.filter(e => e.type !== 'stunned');
      return;
    }
    existing.remainingRounds = Math.max(existing.remainingRounds, duration);
  } else {
    hero.statusEffects.push({
      type,
      remainingRounds: duration,
    });
  }
}

/**
 * Tick all status effects, removing expired ones.
 */
export function tickStatusEffects(state: GameState): GameEffect[] {
  const effects: GameEffect[] = [];

  for (const team of state.teams) {
    for (const player of team.players) {
      const hero = player.hero;
      if (!hero.alive) continue;

      // Process Frozen DoT (trapped = frozen, 10 magic damage per round)
      const trappedEffect = hero.statusEffects.find(e => e.type === 'trapped');
      if (trappedEffect) {
        effects.push({
          type: 'damage',
          sourceId: 'frozen_dot',
          targetId: player.id,
          value: 10,
          damageType: 'magic',
          description: `${player.id} takes 10 magic damage from Frozen`,
        });
      }

      // Tick down wind walk
      if (hero.invisibleRounds > 0) {
        hero.invisibleRounds--;
        if (hero.invisibleRounds === 0) {
          effects.push({
            type: 'status_remove',
            sourceId: player.id,
            targetId: player.id,
            description: `${player.id}'s Wind Walk ends`,
          });
        }
      }

      // Tick down all status effects
      hero.statusEffects = hero.statusEffects.filter(effect => {
        effect.remainingRounds--;
        if (effect.remainingRounds <= 0) {
          effects.push({
            type: 'status_remove',
            sourceId: player.id,
            targetId: player.id,
            statusEffect: effect.type,
            description: `${player.id} is no longer ${effect.type}`,
          });
          return false;
        }
        return true;
      });
    }
  }

  return effects;
}

/**
 * Apply Nan's passive stink aura damage when at same position.
 * Only triggers if heroes were at the same position at BOTH start and end of turn.
 */
export function applyPassiveEffects(state: GameState): GameEffect[] {
  const effects: GameEffect[] = [];

  for (const team of state.teams) {
    for (const player of team.players) {
      const heroDef = getHero(player.hero.heroId);
      if (!heroDef?.passive || !player.hero.alive) continue;

      if (heroDef.passive.trigger === 'distance_0') {
        const opponentTeam = state.teams[1 - team.teamIndex];
        for (const opponent of opponentTeam.players) {
          if (!opponent.hero.alive) continue;

          // Check distance NOW
          const distNow = getDistance(player.hero.position, opponent.hero.position);
          if (distNow !== 0) continue;

          // Check distance at START of turn
          const playerStartPos = state.positionsAtTurnStart[player.id];
          const opponentStartPos = state.positionsAtTurnStart[opponent.id];
          if (playerStartPos === undefined || opponentStartPos === undefined) continue;
          const distAtStart = getDistance(playerStartPos, opponentStartPos);
          if (distAtStart !== 0) continue;

          // Both at same position at start AND end of turn
          effects.push({
            type: 'damage',
            sourceId: player.id,
            targetId: opponent.id,
            value: heroDef.passive.damage,
            damageType: heroDef.passive.damageType,
            description: `${player.id}'s ${heroDef.passive.name} deals ${heroDef.passive.damage} ${heroDef.passive.damageType} damage to ${opponent.id}`,
          });
        }
      }
    }
  }

  return effects;
}

/**
 * Check if a hero is stunned.
 */
export function isStunned(hero: HeroState): boolean {
  return hero.statusEffects.some(e => e.type === 'stunned');
}
