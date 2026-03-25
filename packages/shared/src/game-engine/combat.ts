import { PUNCH_DAMAGE } from '../constants.js';
import type { GameState, GameEffect, HeroState, PlayerAction } from '../types/game.js';
import type { SkillDefinition } from '../types/hero.js';
import { getHero } from '../heroes/registry.js';
import { getDistance, getTeamIndex, findHeroByPlayerId, findOpponentHero } from './position.js';

/**
 * Execute a punch action. Can only punch at distance 0.
 */
export function executePunch(
  state: GameState,
  attackerId: string,
  targetId?: string,
): GameEffect[] {
  const attacker = findHeroByPlayerId(state, attackerId);
  const defender = targetId ? findHeroByPlayerId(state, targetId) : findOpponentHero(state, attackerId);
  if (!attacker || !defender || !defender.alive) return [];

  if (getDistance(attacker.position, defender.position) !== 0) return [];

  // Can't punch invisible target
  if (defender.invisibleRounds > 0) return [];

  const effects: GameEffect[] = [];

  effects.push({
    type: 'damage',
    sourceId: attackerId,
    targetId: getPlayerId(state, defender),
    value: PUNCH_DAMAGE,
    damageType: 'physical',
    description: `${attackerId} throws a punch for ${PUNCH_DAMAGE} physical damage`,
  });

  // 3-punch stun is tracked and applied in GameState.applyEffects
  return effects;
}

/**
 * Execute a Wind Walk exit punch (15 physical damage).
 */
export function executeWindWalkPunch(
  state: GameState,
  attackerId: string,
  targetId?: string,
): GameEffect[] {
  const attacker = findHeroByPlayerId(state, attackerId);
  const defender = targetId ? findHeroByPlayerId(state, targetId) : findOpponentHero(state, attackerId);
  if (!attacker || !defender || !defender.alive) return [];

  if (getDistance(attacker.position, defender.position) !== 0) return [];

  const effects: GameEffect[] = [];

  effects.push({
    type: 'damage',
    sourceId: attackerId,
    targetId: getPlayerId(state, defender),
    value: 15,
    damageType: 'physical',
    description: `${attackerId} exits Wind Walk with a powerful punch for 15 physical damage!`,
  });

  // 3-punch stun is tracked and applied in GameState.applyEffects
  return effects;
}

/**
 * Execute a skill action.
 */
export function executeSkill(
  state: GameState,
  casterId: string,
  skillId: string,
  targetId?: string,
): GameEffect[] {
  const caster = findHeroByPlayerId(state, casterId);
  if (!caster || !caster.alive) return [];

  const heroDef = getHero(caster.heroId);
  if (!heroDef) return [];

  const allSkills = [...heroDef.physicalSkills, ...heroDef.magicSkills];
  const skill = allSkills.find(s => s.id === skillId);
  if (!skill) return [];

  const usesRemaining = caster.skillUsesRemaining[skillId];
  if (usesRemaining !== undefined && usesRemaining <= 0) return [];

  // Handle special cases
  if (skill.special?.includes('wind_walk')) {
    return executeWindWalk(state, casterId);
  }

  if (skill.special?.includes('kuang_self_heal') && targetId === casterId) {
    return executeKuangSelfCast(state, casterId, skillId);
  }

  // Kuang teammate heal: same as self-heal (40 HP), no self-damage
  if (skill.special?.includes('kuang_self_heal') && targetId !== casterId) {
    const casterTeamIndex = getTeamIndex(state, casterId);
    const targetTeamIndex = getTeamIndex(state, targetId!);
    if (casterTeamIndex === targetTeamIndex) {
      return executeKuangTeammateHeal(state, casterId, targetId!);
    }
  }

  // Find target
  const target = targetId
    ? findHeroByPlayerId(state, targetId)
    : findOpponentHero(state, casterId);

  if (!target || !target.alive) return [];

  // Check distance between caster and target
  const dist = getDistance(caster.position, target.position);
  if (dist < skill.minDistance || dist > skill.maxDistance) return [];

  // Check if target is invisible
  if (target.invisibleRounds > 0 && skill.damageType === 'physical') return [];

  const effects: GameEffect[] = [];

  if (skill.damage > 0) {
    effects.push({
      type: 'damage',
      sourceId: casterId,
      targetId: getPlayerId(state, target),
      value: skill.damage,
      damageType: skill.damageType,
      description: `${casterId} uses ${skill.name} for ${skill.damage} ${skill.damageType} damage`,
    });
  }

  if (skill.selfDamage > 0) {
    effects.push({
      type: 'damage',
      sourceId: casterId,
      targetId: casterId,
      value: skill.selfDamage,
      damageType: skill.damageType,
      description: `${casterId} takes ${skill.selfDamage} self-damage from ${skill.name}`,
    });
  }

  if (skill.selfHeal > 0) {
    effects.push({
      type: 'heal',
      sourceId: casterId,
      targetId: casterId,
      value: skill.selfHeal,
      description: `${casterId} heals ${skill.selfHeal} HP from ${skill.name}`,
    });
  }

  if (skill.appliesStatus && skill.statusDuration) {
    effects.push({
      type: 'status_apply',
      sourceId: casterId,
      targetId: getPlayerId(state, target),
      statusEffect: skill.appliesStatus,
      value: skill.statusDuration,
      description: `${getPlayerId(state, target)} is ${skill.appliesStatus} for ${skill.statusDuration} round(s)`,
    });
  }

  if (skill.selfStun) {
    effects.push({
      type: 'status_apply',
      sourceId: casterId,
      targetId: casterId,
      statusEffect: 'stunned',
      value: 1,
      description: `${casterId} is stunned from using ${skill.name}`,
    });
  }

  return effects;
}

function executeWindWalk(state: GameState, casterId: string): GameEffect[] {
  return [{
    type: 'status_apply',
    sourceId: casterId,
    targetId: casterId,
    statusEffect: 'stunned',
    value: 3,
    description: `${casterId} enters Wind Walk and becomes invisible for 3 rounds!`,
  }];
}

function executeKuangSelfCast(state: GameState, casterId: string, skillId: string): GameEffect[] {
  return [{
    type: 'heal',
    sourceId: casterId,
    targetId: casterId,
    value: 40,
    description: `${casterId} uses Kuang on self, healing 40 HP!`,
  }];
}

function executeKuangTeammateHeal(state: GameState, casterId: string, targetId: string): GameEffect[] {
  return [{
    type: 'heal',
    sourceId: casterId,
    targetId: targetId,
    value: 40,
    description: `${casterId} uses Kuang on teammate ${targetId}, healing 40 HP!`,
  }];
}

// ─── Helper functions ───

function getPlayerId(state: GameState, hero: HeroState): string {
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.hero === hero) return player.id;
    }
  }
  return '';
}
