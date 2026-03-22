import { PUNCH_DAMAGE, PUNCH_STUN_THRESHOLD } from '../constants.js';
import type { GameState, GameEffect, HeroState, PlayerAction } from '../types/game.js';
import type { SkillDefinition } from '../types/hero.js';
import { getHero } from '../heroes/registry.js';

/**
 * Execute a punch action. Can only punch at distance 0.
 */
export function executePunch(
  state: GameState,
  attackerId: string,
  targetId?: string,
): GameEffect[] {
  if (state.distance !== 0) return [];

  const attacker = findHero(state, attackerId);
  const defender = targetId ? findHero(state, targetId) : findOpponentHero(state, attackerId);
  if (!attacker || !defender || !defender.alive) return [];

  // Can't punch invisible target
  if (defender.invisibleRounds > 0) return [];

  const effects: GameEffect[] = [];

  // Deal punch damage
  effects.push({
    type: 'damage',
    sourceId: attackerId,
    targetId: getPlayerId(state, defender),
    value: PUNCH_DAMAGE,
    damageType: 'physical',
    description: `${attackerId} throws a punch for ${PUNCH_DAMAGE} physical damage`,
  });

  // Track consecutive punches
  const newConsecutive = defender.consecutivePunchesReceived + 1;
  if (newConsecutive >= PUNCH_STUN_THRESHOLD) {
    effects.push({
      type: 'status_apply',
      sourceId: attackerId,
      targetId: getPlayerId(state, defender),
      statusEffect: 'stunned',
      value: 1,
      description: `${getPlayerId(state, defender)} is stunned after ${PUNCH_STUN_THRESHOLD} consecutive punches!`,
    });
  }

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
  if (state.distance !== 0) return [];

  const defender = targetId ? findHero(state, targetId) : findOpponentHero(state, attackerId);
  if (!defender || !defender.alive) return [];

  const effects: GameEffect[] = [];

  effects.push({
    type: 'damage',
    sourceId: attackerId,
    targetId: getPlayerId(state, defender),
    value: 15,
    damageType: 'physical',
    description: `${attackerId} exits Wind Walk with a powerful punch for 15 physical damage!`,
  });

  // Wind Walk exit punch also counts toward consecutive punches
  const newConsecutive = defender.consecutivePunchesReceived + 1;
  if (newConsecutive >= PUNCH_STUN_THRESHOLD) {
    effects.push({
      type: 'status_apply',
      sourceId: attackerId,
      targetId: getPlayerId(state, defender),
      statusEffect: 'stunned',
      value: 1,
      description: `${getPlayerId(state, defender)} is stunned after ${PUNCH_STUN_THRESHOLD} consecutive punches!`,
    });
  }

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
  const caster = findHero(state, casterId);
  if (!caster || !caster.alive) return [];

  const heroDef = getHero(caster.heroId);
  if (!heroDef) return [];

  const allSkills = [...heroDef.physicalSkills, ...heroDef.magicSkills];
  const skill = allSkills.find(s => s.id === skillId);
  if (!skill) return [];

  // Check uses remaining
  const usesRemaining = caster.skillUsesRemaining[skillId];
  if (usesRemaining !== undefined && usesRemaining <= 0) return [];

  // Check distance
  if (state.distance < skill.minDistance || state.distance > skill.maxDistance) return [];

  const effects: GameEffect[] = [];

  // Handle special cases
  if (skill.special?.includes('wind_walk')) {
    return executeWindWalk(state, casterId);
  }

  if (skill.special?.includes('kuang_self_heal') && targetId === casterId) {
    return executeKuangSelfCast(state, casterId, skillId);
  }

  // Find target (default to opponent)
  const target = targetId
    ? findHeroById(state, targetId)
    : findOpponentHero(state, casterId);

  if (!target || !target.alive) return [];

  // Check if target is invisible (immune to targeted damage)
  if (target.invisibleRounds > 0 && skill.damageType === 'physical') return [];

  // Deal damage
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

  // Self damage
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

  // Self heal
  if (skill.selfHeal > 0) {
    effects.push({
      type: 'heal',
      sourceId: casterId,
      targetId: casterId,
      value: skill.selfHeal,
      description: `${casterId} heals ${skill.selfHeal} HP from ${skill.name}`,
    });
  }

  // Apply status effect
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

  // Self stun
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
    statusEffect: 'stunned', // Reusing for the effect application tracking
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

// ─── Helper functions ───

function findHero(state: GameState, playerId: string): HeroState | undefined {
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.id === playerId) return player.hero;
    }
  }
  return undefined;
}

function findHeroById(state: GameState, playerId: string): HeroState | undefined {
  return findHero(state, playerId);
}

function findOpponentHero(state: GameState, playerId: string): HeroState | undefined {
  const playerTeamIndex = getTeamIndex(state, playerId);
  if (playerTeamIndex === -1) return undefined;

  const opponentTeam = state.teams[1 - playerTeamIndex];
  // In 1v1, return the first alive opponent
  return opponentTeam.players.find(p => p.hero.alive)?.hero;
}

function getTeamIndex(state: GameState, playerId: string): number {
  for (let i = 0; i < state.teams.length; i++) {
    if (state.teams[i].players.some(p => p.id === playerId)) return i;
  }
  return -1;
}

function getPlayerId(state: GameState, hero: HeroState): string {
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.hero === hero) return player.id;
    }
  }
  return '';
}
