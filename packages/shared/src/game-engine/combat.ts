import { PUNCH_DAMAGE } from '../constants.js';
import type { GameState, GameEffect, HeroState, PlayerAction } from '../types/game.js';
import { getHero } from '../heroes/registry.js';
import { getDistance, getTeamIndex, findHeroByPlayerId, findOpponentHero, findMinionById, findPlayerByMinionId } from './position.js';

/**
 * Execute a punch action. Can only punch at distance 0.
 */
export function executePunch(
  state: GameState,
  attackerId: string,
  targetId?: string,
): GameEffect[] {
  const attacker = findHeroByPlayerId(state, attackerId);
  const defenderHero = targetId ? findHeroByPlayerId(state, targetId) : findOpponentHero(state, attackerId);
  const defenderMinion = targetId ? findMinionById(state, targetId) : undefined;
  if (!attacker) return [];

  const targetPosition = defenderHero?.alive ? defenderHero.position : defenderMinion?.alive ? defenderMinion.position : undefined;
  if (targetPosition == null) return [];

  if (getDistance(attacker.position, targetPosition) !== 0) return [];

  // Can't punch invisible target
  if (defenderHero?.invisibleRounds && defenderHero.invisibleRounds > 0) return [];

  const damage = PUNCH_DAMAGE + attacker.damageBonus;

  return [{
    type: 'damage',
    sourceId: attackerId,
    targetId: defenderHero ? getPlayerId(state, defenderHero) : defenderMinion!.minionId,
    value: damage,
    damageType: 'physical',
    description: `${attackerId} throws a punch for ${damage} physical damage`,
  }];
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

  const damage = 15 + attacker.damageBonus;

  return [{
    type: 'damage',
    sourceId: attackerId,
    targetId: getPlayerId(state, defender),
    value: damage,
    damageType: 'physical',
    description: `${attackerId} exits Wind Walk with a powerful punch for ${damage} physical damage!`,
  }];
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

  if (skill.special?.includes('stomp_aoe')) {
    return executeStomp(state, casterId, skill);
  }

  if (skill.special?.includes('heart_fire_buff')) {
    return executeHeartFire(state, casterId, targetId ?? casterId, skill);
  }

  if (skill.special?.includes('eat_legs')) {
    return executeEatLegs(state, casterId, skill);
  }

  if (skill.special?.includes('build_tower')) {
    return executeBuildTower(state, casterId);
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
  const targetHero = targetId ? findHeroByPlayerId(state, targetId) : findOpponentHero(state, casterId);
  const targetMinion = targetId ? findMinionById(state, targetId) : undefined;
  if (!targetHero?.alive && !targetMinion?.alive) return [];

  // Check distance between caster and target
  const targetPosition = targetHero?.alive ? targetHero.position : targetMinion!.position;
  const dist = getDistance(caster.position, targetPosition);
  if (dist < skill.minDistance || dist > skill.maxDistance) return [];

  // Check if target is invisible
  if (targetHero && targetHero.invisibleRounds > 0 && skill.damageType === 'physical') return [];
  if (targetMinion) {
    if (skill.category === 'magic' && targetMinion.immuneTo.includes('magic')) return [];
    if (skill.category === 'magic' && !targetMinion.immuneTo.includes('magic')) {
      // allowed
    } else if (skill.category !== 'physical') {
      return [];
    }
  }

  const effects: GameEffect[] = [];
  const damage = skill.damage > 0 ? skill.damage + caster.damageBonus : 0;

  if (damage > 0) {
    effects.push({
      type: 'damage',
      sourceId: casterId,
      targetId: targetHero ? getPlayerId(state, targetHero) : targetMinion!.minionId,
      value: damage,
      damageType: skill.damageType,
      description: `${casterId} uses ${skill.name} for ${damage} ${skill.damageType} damage`,
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
    if (!targetHero) return effects;
    effects.push({
      type: 'status_apply',
      sourceId: casterId,
      targetId: getPlayerId(state, targetHero),
      statusEffect: skill.appliesStatus,
      value: skill.statusDuration,
      description: `${getPlayerId(state, targetHero)} is ${skill.appliesStatus} for ${skill.statusDuration} round(s)`,
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

function executeStomp(state: GameState, casterId: string, skill: { name: string; statusDuration?: number }): GameEffect[] {
  const caster = findHeroByPlayerId(state, casterId);
  if (!caster) return [];
  const casterTeamIndex = getTeamIndex(state, casterId);
  const effects: GameEffect[] = [];

  for (const team of state.teams) {
    if (team.teamIndex === casterTeamIndex) continue;
    for (const player of team.players) {
      if (!player.hero.alive) continue;
      if (getDistance(caster.position, player.hero.position) !== 0) continue;
      effects.push({
        type: 'status_apply',
        sourceId: casterId,
        targetId: player.id,
        statusEffect: 'stunned',
        value: skill.statusDuration ?? 1,
        description: `${player.id} is stunned by ${skill.name}`,
      });
    }
  }

  return effects;
}

function executeHeartFire(
  state: GameState,
  casterId: string,
  targetId: string,
  skill: { minDistance: number; maxDistance: number; name: string },
): GameEffect[] {
  const caster = findHeroByPlayerId(state, casterId);
  const target = findHeroByPlayerId(state, targetId);
  if (!caster || !target || !target.alive) return [];
  if (getTeamIndex(state, casterId) !== getTeamIndex(state, targetId)) return [];

  const dist = getDistance(caster.position, target.position);
  if (dist < skill.minDistance || dist > skill.maxDistance) return [];

  return [{
    type: 'status_apply',
    sourceId: casterId,
    targetId,
    description: `${casterId} empowers ${targetId} with ${skill.name}`,
  }];
}

function executeEatLegs(
  state: GameState,
  casterId: string,
  skill: { name: string; selfHeal: number },
): GameEffect[] {
  const caster = findHeroByPlayerId(state, casterId);
  if (!caster) return [];
  return [{
    type: 'heal',
    sourceId: casterId,
    targetId: casterId,
    value: skill.selfHeal,
    description: `${casterId} uses ${skill.name} and heals ${skill.selfHeal} HP`,
  }];
}

function executeBuildTower(state: GameState, casterId: string): GameEffect[] {
  const player = findPlayerByPlayerId(state, casterId);
  if (!player) return [];
  const heroDef = getHero(player.hero.heroId);
  if (!heroDef?.minion || player.minions.some(minion => minion.alive)) return [];
  return [{
    type: 'summon',
    sourceId: casterId,
    targetId: casterId,
    description: `${casterId} builds ${heroDef.minion.name}!`,
  }];
}

function findPlayerByPlayerId(state: GameState, playerId: string) {
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.id === playerId) return player;
    }
  }
  return undefined;
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
