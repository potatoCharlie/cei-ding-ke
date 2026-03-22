import type {
  GameState, GamePhase, PlayerAction, RPSChoice,
  RPSResult, GameEffect, HeroState, TurnRecord, PlayerState,
} from '../types/game.js';
import type { HeroDefinition } from '../types/hero.js';
import { PUNCH_STUN_THRESHOLD, TEAM_0_START, TEAM_1_START } from '../constants.js';
import { resolveRPS1v1, randomRPSChoice } from './rps.js';
import { moveForward, moveBackward } from './movement.js';
import { executePunch, executeSkill, executeWindWalkPunch } from './combat.js';
import { applyStatusEffect, tickStatusEffects, applyPassiveEffects, isStunned } from './status-effects.js';
import { getHero } from '../heroes/registry.js';
import { getDistance, getForwardDirection, getTeamIndex, isMoveLegal } from './position.js';

/**
 * Create a new game state for a 1v1 match.
 */
export function createGameState(
  gameId: string,
  player1: { id: string; name: string; heroId: string },
  player2: { id: string; name: string; heroId: string },
): GameState {
  const p1State = createPlayerState(player1.id, player1.name, player1.heroId, TEAM_0_START);
  const p2State = createPlayerState(player2.id, player2.name, player2.heroId, TEAM_1_START);

  const positionsAtTurnStart: Record<string, number> = {
    [player1.id]: TEAM_0_START,
    [player2.id]: TEAM_1_START,
  };

  return {
    id: gameId,
    mode: '1v1',
    phase: 'rps_submit',
    turn: 1,
    teams: [
      { teamIndex: 0, players: [p1State] },
      { teamIndex: 1, players: [p2State] },
    ],
    positionsAtTurnStart,
    pendingRPS: {},
    actionOrder: [],
    currentActionIndex: 0,
    awaitingMinionAction: false,
    history: [],
    winner: null,
  };
}

function createPlayerState(id: string, name: string, heroId: string, startPosition: number): PlayerState {
  const heroDef = getHero(heroId);
  const hp = heroDef?.hp ?? 100;

  const skillUsesRemaining: Record<string, number> = {};
  if (heroDef) {
    for (const skill of [...heroDef.physicalSkills, ...heroDef.magicSkills]) {
      if (skill.maxUses > 0) {
        skillUsesRemaining[skill.id] = skill.maxUses;
      }
    }
  }

  return {
    id,
    name,
    hero: {
      heroId,
      playerId: id,
      hp,
      maxHp: hp,
      position: startPosition,
      statusEffects: [],
      consecutivePunchesReceived: 0,
      skillUsesRemaining,
      alive: true,
      invisibleRounds: 0,
    },
    minions: [],
    connected: true,
  };
}

/**
 * Submit an RPS choice for a player.
 * Returns true if all players have submitted.
 */
export function submitRPS(state: GameState, playerId: string, choice: RPSChoice): boolean {
  if (state.phase !== 'rps_submit') return false;
  state.pendingRPS[playerId] = choice;

  const allPlayers = getAllAlivePlayers(state);
  const nonStunnedPlayers = allPlayers.filter(p => !isStunned(p.hero));

  return nonStunnedPlayers.every(p => state.pendingRPS[p.id] != null);
}

/**
 * Resolve the RPS round. For 1v1, determines who gets to act.
 */
export function resolveRPSRound(state: GameState): RPSResult {
  const allPlayers = getAllAlivePlayers(state);
  const nonStunnedPlayers = allPlayers.filter(p => !isStunned(p.hero));

  for (const player of nonStunnedPlayers) {
    if (state.pendingRPS[player.id] == null) {
      state.pendingRPS[player.id] = randomRPSChoice();
    }
  }

  if (state.mode === '1v1' && nonStunnedPlayers.length === 2) {
    const p1 = nonStunnedPlayers[0];
    const p2 = nonStunnedPlayers[1];
    const result = resolveRPS1v1(
      p1.id, state.pendingRPS[p1.id]!,
      p2.id, state.pendingRPS[p2.id]!,
    );

    state.phase = result.draw ? 'rps_submit' : 'action_phase';
    if (!result.draw) {
      state.actionOrder = result.winners;
      state.currentActionIndex = 0;
    }

    state.pendingRPS = {};
    return result;
  }

  if (state.mode === '1v1' && nonStunnedPlayers.length === 1) {
    const winner = nonStunnedPlayers[0];
    const loser = allPlayers.find(p => p.id !== winner.id)!;

    const result: RPSResult = {
      choices: { [winner.id]: 'rock' },
      winners: [winner.id],
      losers: [loser.id],
      draw: false,
    };

    state.phase = 'action_phase';
    state.actionOrder = [winner.id];
    state.currentActionIndex = 0;
    state.pendingRPS = {};

    return result;
  }

  state.pendingRPS = {};
  return { choices: {}, winners: [], losers: [], draw: true };
}

/**
 * Execute a player action during the action phase.
 */
export function executeAction(state: GameState, action: PlayerAction): GameEffect[] {
  if (state.phase !== 'action_phase') return [];

  const currentPlayerId = state.actionOrder[state.currentActionIndex];
  if (action.playerId !== currentPlayerId) return [];

  const player = findPlayer(state, action.playerId);
  if (!player || !player.hero.alive) return [];

  let effects: GameEffect[] = [];

  // ─── Minion action ───
  if (action.minionId) {
    if (!state.awaitingMinionAction) return [];
    effects = executeMinionAction(state, player, action);
    applyMinionEffects(state, effects);
    const deathEffects = checkDeaths(state);
    effects.push(...deathEffects);
    checkWinCondition(state);

    state.awaitingMinionAction = false;
    if (state.winner === null) {
      state.currentActionIndex++;
      if (state.currentActionIndex >= state.actionOrder.length) {
        endTurn(state);
      }
    }
    return effects;
  }

  // ─── Hero action ───
  switch (action.type) {
    case 'move_forward': {
      const result = moveForward(state, action.playerId);
      player.hero.position = result.newPosition;
      effects = result.effects;
      break;
    }
    case 'move_backward': {
      const result = moveBackward(state, action.playerId);
      player.hero.position = result.newPosition;
      effects = result.effects;
      break;
    }
    case 'punch': {
      if (player.hero.invisibleRounds > 0) {
        player.hero.invisibleRounds = 0;
        effects = executeWindWalkPunch(state, action.playerId, action.targetId);
      } else {
        effects = executePunch(state, action.playerId, action.targetId);
      }
      break;
    }
    case 'skill': {
      if (!action.skillId) return [];
      effects = executeSkill(state, action.playerId, action.skillId, action.targetId);

      if (effects.length > 0 && player.hero.skillUsesRemaining[action.skillId] !== undefined) {
        player.hero.skillUsesRemaining[action.skillId]--;
      }

      if (action.skillId === 'wind_walk') {
        player.hero.invisibleRounds = 3;
        effects = [{
          type: 'status_apply',
          sourceId: action.playerId,
          targetId: action.playerId,
          description: `${action.playerId} enters Wind Walk and becomes invisible for 3 rounds!`,
        }];
      }
      break;
    }
    case 'summon': {
      effects = executeSummon(state, action.playerId);
      break;
    }
    case 'stay': {
      effects = [{
        type: 'move',
        sourceId: action.playerId,
        targetId: action.playerId,
        value: 0,
        description: `${action.playerId} stays put`,
      }];
      break;
    }
  }

  applyEffects(state, effects);
  const deathEffects = checkDeaths(state);
  effects.push(...deathEffects);
  checkWinCondition(state);

  if (state.winner === null) {
    const hasAliveMinion = player.minions.some(m => m.alive);
    if (hasAliveMinion) {
      state.awaitingMinionAction = true;
    } else {
      state.currentActionIndex++;
      if (state.currentActionIndex >= state.actionOrder.length) {
        endTurn(state);
      }
    }
  }

  return effects;
}

/**
 * Execute a minion action (move or punch).
 */
function executeMinionAction(
  state: GameState,
  player: PlayerState,
  action: PlayerAction,
): GameEffect[] {
  const minion = player.minions.find(m => m.minionId === action.minionId);
  if (!minion || !minion.alive) return [];

  const heroDef = getHero(player.hero.heroId);
  const minionDef = heroDef?.minion;
  if (!minionDef) return [];

  const teamIndex = getTeamIndex(state, player.id);
  const forward = getForwardDirection(teamIndex);
  const effects: GameEffect[] = [];

  switch (action.type) {
    case 'move_forward': {
      const oldPos = minion.position;
      minion.position = minion.position + forward * minionDef.moveSpeed;
      effects.push({
        type: 'move',
        sourceId: minion.minionId,
        targetId: minion.minionId,
        value: minion.position - oldPos,
        description: `${minionDef.name} moves forward (position: ${oldPos} → ${minion.position})`,
      });
      break;
    }
    case 'move_backward': {
      const oldPos = minion.position;
      minion.position = minion.position - forward * minionDef.moveSpeed;
      effects.push({
        type: 'move',
        sourceId: minion.minionId,
        targetId: minion.minionId,
        value: minion.position - oldPos,
        description: `${minionDef.name} moves backward (position: ${oldPos} → ${minion.position})`,
      });
      break;
    }
    case 'punch': {
      const targetPlayer = action.targetId ? findPlayer(state, action.targetId) : null;
      if (!targetPlayer || !targetPlayer.hero.alive) return [];

      const dist = getDistance(minion.position, targetPlayer.hero.position);
      if (dist !== 0) return [];

      effects.push({
        type: 'damage',
        sourceId: minion.minionId,
        targetId: targetPlayer.id,
        value: minionDef.punchDamage,
        damageType: 'physical',
        description: `${minionDef.name} punches for ${minionDef.punchDamage} physical damage`,
      });

      if (minionDef.punchCountsForStun) {
        minion.consecutivePunchesDealt++;
        const newCount = targetPlayer.hero.consecutivePunchesReceived + 1;
        if (newCount >= PUNCH_STUN_THRESHOLD) {
          effects.push({
            type: 'status_apply',
            sourceId: minion.minionId,
            targetId: targetPlayer.id,
            statusEffect: 'stunned',
            value: 1,
            description: `${targetPlayer.id} is stunned after ${PUNCH_STUN_THRESHOLD} consecutive punches!`,
          });
        }
      }
      break;
    }
    case 'stay': {
      effects.push({
        type: 'move',
        sourceId: minion.minionId,
        targetId: minion.minionId,
        value: 0,
        description: `${minionDef.name} stays put`,
      });
      break;
    }
  }

  return effects;
}

/**
 * Remove stun when a hero takes damage (wake on hit).
 * This prevents infinite stun-lock (e.g., Jin's Small Dart).
 */
function removeStunOnDamage(hero: HeroState, effects: GameEffect[]): void {
  const stunIdx = hero.statusEffects.findIndex(e => e.type === 'stunned');
  if (stunIdx !== -1) {
    hero.statusEffects.splice(stunIdx, 1);
    effects.push({
      type: 'status_remove',
      sourceId: hero.playerId,
      targetId: hero.playerId,
      statusEffect: 'stunned',
      description: `${hero.playerId} wakes from stun after being hit!`,
    });
  }
}

/**
 * Apply minion action effects.
 */
function applyMinionEffects(state: GameState, effects: GameEffect[]): void {
  for (const effect of effects) {
    const target = findPlayer(state, effect.targetId);
    if (!target) continue;

    switch (effect.type) {
      case 'damage': {
        if (target.hero.invisibleRounds > 0 && effect.damageType === 'physical') continue;
        target.hero.hp -= (effect.value ?? 0);
        // Stun breaks on damage: wake up stunned heroes when they take damage
        removeStunOnDamage(target.hero, effects);
        break;
      }
      case 'status_apply': {
        if (effect.statusEffect) {
          applyStatusEffect(target.hero, effect.statusEffect, effect.value ?? 1);
        }
        break;
      }
    }

    if (effect.type === 'damage' && effect.damageType === 'physical' &&
        effect.description?.includes('punch')) {
      target.hero.consecutivePunchesReceived++;
      if (target.hero.consecutivePunchesReceived >= PUNCH_STUN_THRESHOLD) {
        applyStatusEffect(target.hero, 'stunned', 1);
        target.hero.consecutivePunchesReceived = 0;
      }
    }
  }
}

/**
 * Apply effects to the game state (mutates state).
 */
function applyEffects(state: GameState, effects: GameEffect[]): void {
  for (const effect of effects) {
    const target = findPlayer(state, effect.targetId);
    if (!target) continue;

    switch (effect.type) {
      case 'damage': {
        if (target.hero.invisibleRounds > 0 && effect.damageType === 'physical') continue;
        target.hero.hp -= (effect.value ?? 0);
        // Stun breaks on damage: wake up stunned heroes when they take damage
        removeStunOnDamage(target.hero, effects);
        break;
      }
      case 'heal': {
        target.hero.hp = Math.min(target.hero.maxHp, target.hero.hp + (effect.value ?? 0));
        break;
      }
      case 'status_apply': {
        if (effect.statusEffect) {
          applyStatusEffect(target.hero, effect.statusEffect, effect.value ?? 1);
        }
        break;
      }
      case 'status_remove': {
        if (effect.statusEffect) {
          target.hero.statusEffects = target.hero.statusEffects.filter(
            e => e.type !== effect.statusEffect,
          );
        }
        break;
      }
    }

    if (effect.type === 'damage' && effect.damageType === 'physical' &&
        effect.description?.includes('punch')) {
      target.hero.consecutivePunchesReceived++;
      if (target.hero.consecutivePunchesReceived >= PUNCH_STUN_THRESHOLD) {
        applyStatusEffect(target.hero, 'stunned', 1);
        target.hero.consecutivePunchesReceived = 0;
      }
    }
  }
}

function executeSummon(state: GameState, playerId: string): GameEffect[] {
  const player = findPlayer(state, playerId);
  if (!player) return [];

  const heroDef = getHero(player.hero.heroId);
  if (!heroDef?.minion) return [];

  if (player.minions.length > 0) return [];

  // Minion spawns at the hero's current position
  player.minions.push({
    minionId: `${heroDef.minion.id}_${playerId}`,
    ownerId: playerId,
    hp: heroDef.minion.hp,
    maxHp: heroDef.minion.hp,
    alive: true,
    position: player.hero.position,
    type: heroDef.minion.id,
    consecutivePunchesDealt: 0,
  });

  return [{
    type: 'summon',
    sourceId: playerId,
    targetId: playerId,
    description: `${playerId} summons ${heroDef.minion.name}!`,
  }];
}

/**
 * End the current turn.
 */
function endTurn(state: GameState): void {
  const passiveEffects = applyPassiveEffects(state);
  applyEffects(state, passiveEffects);

  checkDeaths(state);
  checkWinCondition(state);

  if (state.winner !== null) return;

  // Snapshot positions for next turn's passive checks
  const posSnap: Record<string, number> = {};
  for (const team of state.teams) {
    for (const player of team.players) {
      posSnap[player.id] = player.hero.position;
    }
  }

  state.turn++;
  state.phase = 'rps_submit';
  state.positionsAtTurnStart = posSnap;
  state.pendingRPS = {};
  state.actionOrder = [];
  state.currentActionIndex = 0;
  state.awaitingMinionAction = false;
}

/**
 * Start-of-turn processing: tick down status effects.
 */
export function startTurn(state: GameState): GameEffect[] {
  const tickEffects = tickStatusEffects(state);
  applyEffects(state, tickEffects);

  const deathEffects = checkDeaths(state);
  checkWinCondition(state);

  return [...tickEffects, ...deathEffects];
}

function checkDeaths(state: GameState): GameEffect[] {
  const effects: GameEffect[] = [];

  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.hero.alive && player.hero.hp <= 0) {
        player.hero.alive = false;
        effects.push({
          type: 'death',
          sourceId: player.id,
          targetId: player.id,
          description: `${player.id}'s hero has been defeated!`,
        });
      }
    }
  }

  return effects;
}

function checkWinCondition(state: GameState): void {
  for (let i = 0; i < state.teams.length; i++) {
    const allDead = state.teams[i].players.every(p => !p.hero.alive);
    if (allDead) {
      state.winner = 1 - i;
      state.phase = 'game_over';
      return;
    }
  }
}

// ─── Utility functions ───

function getAllAlivePlayers(state: GameState): PlayerState[] {
  return state.teams.flatMap(t => t.players.filter(p => p.hero.alive));
}

function findPlayer(state: GameState, playerId: string): PlayerState | undefined {
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.id === playerId) return player;
    }
  }
  return undefined;
}

function getOpponents(state: GameState, playerId: string): PlayerState[] {
  for (const team of state.teams) {
    if (team.players.some(p => p.id === playerId)) {
      const opponentTeamIndex = 1 - team.teamIndex;
      return state.teams[opponentTeamIndex].players.filter(p => p.hero.alive);
    }
  }
  return [];
}

/**
 * Get available actions for a player.
 */
export function getAvailableActions(state: GameState, playerId: string): PlayerAction[] {
  const player = findPlayer(state, playerId);
  if (!player || !player.hero.alive) return [];

  if (state.awaitingMinionAction) {
    return getAvailableMinionActions(state, player);
  }

  const actions: PlayerAction[] = [];
  const hero = player.hero;
  const heroDef = getHero(hero.heroId);
  const teamIndex = getTeamIndex(state, playerId);
  const forward = getForwardDirection(teamIndex);

  // Move forward / backward (if not trapped, and would not exceed max distance from any entity)
  const isTrapped = hero.statusEffects.some(e => e.type === 'trapped');
  if (!isTrapped) {
    const speed = hero.invisibleRounds > 0 ? 2 : (hero.statusEffects.some(e => e.type === 'slowed') ? 0.5 : 1);
    const fwdPos = hero.position + forward * speed;
    const bwdPos = hero.position - forward * speed;
    if (isMoveLegal(state, playerId, fwdPos)) {
      actions.push({ type: 'move_forward', playerId });
    }
    if (isMoveLegal(state, playerId, bwdPos)) {
      actions.push({ type: 'move_backward', playerId });
    }
  }

  const opponents = getOpponents(state, playerId);

  // Punch (distance 0 only)
  for (const opp of opponents) {
    if (getDistance(hero.position, opp.hero.position) === 0) {
      actions.push({ type: 'punch', playerId, targetId: opp.id });
    }
  }

  // Skills
  if (heroDef) {
    const allSkills = [...heroDef.physicalSkills, ...heroDef.magicSkills];
    for (const skill of allSkills) {
      const uses = hero.skillUsesRemaining[skill.id];
      if (uses !== undefined && uses <= 0) continue;

      // Check distance to each potential target
      if (skill.special?.includes('wind_walk')) {
        // Wind Walk: self-target, always available
        actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: playerId });
      } else if (skill.special?.includes('kuang_self_heal')) {
        for (const opp of opponents) {
          const d = getDistance(hero.position, opp.hero.position);
          if (d >= skill.minDistance && d <= skill.maxDistance) {
            actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: playerId });
            actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: opp.id });
          }
        }
      } else {
        for (const opp of opponents) {
          const d = getDistance(hero.position, opp.hero.position);
          if (d >= skill.minDistance && d <= skill.maxDistance) {
            actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: opp.id });
          }
        }
      }
    }
  }

  // Summon
  if (heroDef?.minion && player.minions.length === 0) {
    actions.push({ type: 'summon', playerId });
  }

  // Stay (do nothing)
  actions.push({ type: 'stay', playerId });

  return actions;
}

/**
 * Get available actions for a player's minions.
 */
function getAvailableMinionActions(state: GameState, player: PlayerState): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const opponents = getOpponents(state, player.id);
  const teamIndex = getTeamIndex(state, player.id);
  const forward = getForwardDirection(teamIndex);

  for (const minion of player.minions) {
    if (!minion.alive) continue;

    // Minion move forward / backward (constrained by max distance to any entity)
    const heroDef2 = getHero(player.hero.heroId);
    const mSpeed = heroDef2?.minion?.moveSpeed ?? 1;
    const fwdPos = minion.position + forward * mSpeed;
    const bwdPos = minion.position - forward * mSpeed;
    if (isMoveLegal(state, minion.minionId, fwdPos)) {
      actions.push({ type: 'move_forward', playerId: player.id, minionId: minion.minionId });
    }
    if (isMoveLegal(state, minion.minionId, bwdPos)) {
      actions.push({ type: 'move_backward', playerId: player.id, minionId: minion.minionId });
    }

    // Minion punch (at same position as opponent hero)
    for (const opp of opponents) {
      if (getDistance(minion.position, opp.hero.position) === 0) {
        actions.push({ type: 'punch', playerId: player.id, targetId: opp.id, minionId: minion.minionId });
      }
    }

    // Minion stay
    actions.push({ type: 'stay', playerId: player.id, minionId: minion.minionId });
  }

  return actions;
}
