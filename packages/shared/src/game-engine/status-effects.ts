import type { GameState, GameEffect, HeroState, StatusEffect } from '../types/game.js';
import { getHero } from '../heroes/registry.js';

/**
 * Apply a status effect to a hero.
 */
export function applyStatusEffect(
  hero: HeroState,
  type: StatusEffect['type'],
  duration: number,
): void {
  // Check if already has this effect - refresh duration
  const existing = hero.statusEffects.find(e => e.type === type);
  if (existing) {
    existing.remainingRounds = Math.max(existing.remainingRounds, duration);
  } else {
    hero.statusEffects.push({
      type,
      remainingRounds: duration,
    });
  }
}

/**
 * Tick all status effects at end of turn, removing expired ones.
 * Returns effects for any damage-over-time or removals.
 */
export function tickStatusEffects(state: GameState): GameEffect[] {
  const effects: GameEffect[] = [];

  for (const team of state.teams) {
    for (const player of team.players) {
      const hero = player.hero;
      if (!hero.alive) continue;

      // Process Frozen DoT (Shan's Frozen: 10 magic damage per trapped round)
      const trappedEffect = hero.statusEffects.find(e => e.type === 'trapped');
      if (trappedEffect) {
        // Check if this trap was caused by Frozen (has frozen_dot special)
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
 * Apply Nan's passive stink aura damage at distance 0.
 */
export function applyPassiveEffects(state: GameState): GameEffect[] {
  const effects: GameEffect[] = [];

  // Nan's stink only triggers if players were at distance 0 at BOTH start and end of turn
  if (state.distance !== 0 || state.distanceAtTurnStart !== 0) return effects;

  for (const team of state.teams) {
    for (const player of team.players) {
      const heroDef = getHero(player.hero.heroId);
      if (!heroDef?.passive || !player.hero.alive) continue;

      if (heroDef.passive.trigger === 'distance_0') {
        // Find opponents
        const opponentTeam = state.teams[1 - team.teamIndex];
        for (const opponent of opponentTeam.players) {
          if (!opponent.hero.alive) continue;

          // Passive still affects invisible heroes (per game rules: Nan affects Jin in Wind Walk)
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
 * Check if a hero is stunned (cannot act this round).
 */
export function isStunned(hero: HeroState): boolean {
  return hero.statusEffects.some(e => e.type === 'stunned');
}
