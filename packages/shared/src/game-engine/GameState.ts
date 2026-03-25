import type {
  GameState, GamePhase, PlayerAction, RPSChoice,
  RPSResult, GameEffect, HeroState, TurnRecord, PlayerState,
} from '../types/game.js';
import type { HeroDefinition } from '../types/hero.js';
import { PUNCH_STUN_THRESHOLD, TEAM_0_START, TEAM_1_START } from '../constants.js';
import { resolveRPS1v1, resolveRPSMulti, randomRPSChoice } from './rps.js';
import { moveForward, moveBackward } from './movement.js';
import { executePunch, executeSkill, executeWindWalkPunch } from './combat.js';
import { applyStatusEffect, tickStatusEffects, applyPassiveEffects, isStunned } from './status-effects.js';
import { getHero } from '../heroes/registry.js';
import { getDistance, getForwardDirection, getTeamIndex, isMoveLegal, findOpponentHero, findMinionById } from './position.js';

type PlayerInput = { id: string; name: string; heroId: string };
type PlayerInputMulti = { id: string; name: string; heroId: string; teamIndex: number };
type GameMode = '1v1' | '2v2' | '3v3';

/**
 * Create a new game state.
 *
 * Old 1v1 signature (backward-compatible):
 *   createGameState(gameId, player1, player2)
 *
 * New multi-player signature:
 *   createGameState(gameId, mode, players)
 */
export function createGameState(
  gameId: string,
  player1: PlayerInput,
  player2: PlayerInput,
): GameState;
export function createGameState(
  gameId: string,
  mode: GameMode,
  players: PlayerInputMulti[],
): GameState;
export function createGameState(
  gameId: string,
  player1OrMode: PlayerInput | GameMode,
  player2OrPlayers: PlayerInput | PlayerInputMulti[],
): GameState {
  // Detect which overload was called
  if (typeof player1OrMode === 'string') {
    // New signature: createGameState(gameId, mode, players)
    const mode = player1OrMode;
    const players = player2OrPlayers as PlayerInputMulti[];
    return createGameStateMulti(gameId, mode, players);
  } else {
    // Old signature: createGameState(gameId, player1, player2)
    const player1 = player1OrMode;
    const player2 = player2OrPlayers as PlayerInput;
    return createGameStateMulti(gameId, '1v1', [
      { ...player1, teamIndex: 0 },
      { ...player2, teamIndex: 1 },
    ]);
  }
}

function createGameStateMulti(
  gameId: string,
  mode: GameMode,
  players: PlayerInputMulti[],
): GameState {
  // Reject 3v3 for now
  if (mode === '3v3') {
    throw new Error('3v3 mode is not available yet (requires 6+ heroes)');
  }

  // Validate unique heroes (only enforced for multi-player modes, not 1v1)
  if (mode !== '1v1') {
    const heroIds = players.map(p => p.heroId);
    if (new Set(heroIds).size !== heroIds.length) {
      throw new Error('Duplicate hero IDs not allowed');
    }
  }

  const startPositions: Record<number, number> = {
    0: TEAM_0_START,
    1: TEAM_1_START,
  };

  const positionsAtTurnStart: Record<string, number> = {};
  const team0Players: PlayerState[] = [];
  const team1Players: PlayerState[] = [];

  for (const p of players) {
    const startPos = startPositions[p.teamIndex];
    const playerState = createPlayerState(p.id, p.name, p.heroId, startPos);
    positionsAtTurnStart[p.id] = startPos;
    if (p.teamIndex === 0) {
      team0Players.push(playerState);
    } else {
      team1Players.push(playerState);
    }
  }

  return {
    id: gameId,
    mode,
    phase: 'rps_submit',
    turn: 1,
    teams: [
      { teamIndex: 0, players: team0Players },
      { teamIndex: 1, players: team1Players },
    ],
    positionsAtTurnStart,
    pendingRPS: {},
    actionOrder: [],
    currentActionIndex: 0,
    awaitingMinionAction: false,
    history: [],
    winner: null,
    stunImmuneThisTurn: [],
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
      damageBonus: 0,
      legsEaten: 0,
      movementDisabled: false,
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

  // Auto-fill missing choices with random
  for (const player of nonStunnedPlayers) {
    if (state.pendingRPS[player.id] == null) {
      state.pendingRPS[player.id] = randomRPSChoice();
    }
  }

  // Only one non-stunned player: they win automatically
  if (nonStunnedPlayers.length <= 1) {
    const winners = nonStunnedPlayers.map(p => p.id);
    const losers = allPlayers.filter(p => !winners.includes(p.id)).map(p => p.id);

    const result: RPSResult = {
      choices: { ...state.pendingRPS } as Record<string, RPSChoice>,
      winners,
      losers,
      draw: false,
    };

    state.phase = 'action_phase';
    state.actionOrder = winners;
    state.currentActionIndex = 0;
    state.pendingRPS = {};
    return result;
  }

  // Build choices map for non-stunned players
  const choices: Record<string, RPSChoice> = {};
  for (const p of nonStunnedPlayers) {
    choices[p.id] = state.pendingRPS[p.id]!;
  }

  const multiResult = resolveRPSMulti(choices);

  const allChoices = { ...state.pendingRPS } as Record<string, RPSChoice>;
  state.pendingRPS = {};

  if (!multiResult) {
    // Tie
    return { choices: allChoices, winners: [], losers: [], draw: true };
  }

  const stunnedIds = allPlayers.filter(p => isStunned(p.hero)).map(p => p.id);

  state.phase = 'action_phase';
  state.actionOrder = multiResult.winners;
  state.currentActionIndex = 0;

  return {
    choices: allChoices,
    winners: multiResult.winners,
    losers: [...multiResult.losers, ...stunnedIds],
    draw: false,
  };
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

  // Acting hero resets their own received punch counter
  if (!action.minionId) {
    player.hero.consecutivePunchesReceived = 0;
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
      const heroDef = getHero(player.hero.heroId);
      const skill = heroDef
        ? [...heroDef.physicalSkills, ...heroDef.magicSkills].find(s => s.id === action.skillId)
        : undefined;

      if (skill?.special?.includes('build_tower')) {
        effects = executeSummon(state, action.playerId);
        if (effects.length > 0 && player.hero.skillUsesRemaining[action.skillId] !== undefined) {
          player.hero.skillUsesRemaining[action.skillId]--;
        }
        break;
      }

      effects = executeSkill(state, action.playerId, action.skillId, action.targetId);

      if (effects.length > 0 && player.hero.skillUsesRemaining[action.skillId] !== undefined) {
        player.hero.skillUsesRemaining[action.skillId]--;
      }

      if (effects.length > 0 && skill?.special?.includes('heart_fire_buff') && action.targetId) {
        const targetPlayer = findPlayer(state, action.targetId);
        if (targetPlayer) {
          targetPlayer.hero.damageBonus = Math.max(targetPlayer.hero.damageBonus, 5);
        }
      }

      if (effects.length > 0 && skill?.special?.includes('eat_legs')) {
        player.hero.legsEaten++;
        if (player.hero.legsEaten >= 8) {
          player.hero.movementDisabled = true;
        }
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

  applyEffects(state, effects, true);
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

  const teamIndex = getTeamIndex(state, player.id);
  const oppHero = findOpponentHero(state, player.id);
  const towardEnemy = getTowardEnemyDirection(minion.position, oppHero, teamIndex);
  const effects: GameEffect[] = [];

  switch (action.type) {
    case 'move_forward': {
      if (!minion.canMove) return [];
      const oldPos = minion.position;
      minion.position = minion.position + towardEnemy * minion.moveSpeed;
      effects.push({
        type: 'move',
        sourceId: minion.minionId,
        targetId: minion.minionId,
        value: minion.position - oldPos,
        description: `${minion.name} moves toward enemy (position: ${oldPos} → ${minion.position})`,
      });
      break;
    }
    case 'move_backward': {
      if (!minion.canMove) return [];
      const oldPos = minion.position;
      minion.position = minion.position - towardEnemy * minion.moveSpeed;
      effects.push({
        type: 'move',
        sourceId: minion.minionId,
        targetId: minion.minionId,
        value: minion.position - oldPos,
        description: `${minion.name} moves away from enemy (position: ${oldPos} → ${minion.position})`,
      });
      break;
    }
    case 'punch': {
      const targetPlayer = action.targetId ? findPlayer(state, action.targetId) : null;
      if (!targetPlayer || !targetPlayer.hero.alive) return [];

      const dist = getDistance(minion.position, targetPlayer.hero.position);
      if (dist < minion.attackMinDistance || dist > minion.attackMaxDistance) return [];

      effects.push({
        type: 'damage',
        sourceId: minion.minionId,
        targetId: targetPlayer.id,
        value: minion.punchDamage,
        damageType: 'physical',
        description: `${minion.name} attacks for ${minion.punchDamage} physical damage`,
      });
      break;
    }
    case 'stay': {
      effects.push({
        type: 'move',
        sourceId: minion.minionId,
        targetId: minion.minionId,
        value: 0,
        description: `${minion.name} stays put`,
      });
      break;
    }
  }

  return effects;
}

/**
 * Apply minion action effects.
 */
function applyMinionEffects(state: GameState, effects: GameEffect[]): void {
  for (const effect of effects) {
    applySingleEffect(state, effect);
  }
}

/**
 * Apply effects to the game state (mutates state).
 * When breakStun is true, damage will wake stunned heroes (for active attacks only,
 * not for passive/DoT damage like stink aura or frozen).
 */
function applyEffects(state: GameState, effects: GameEffect[], breakStun = false): void {
  for (const effect of effects) {
    applySingleEffect(state, effect);
  }
}

function applySingleEffect(state: GameState, effect: GameEffect): void {
  const targetPlayer = findPlayer(state, effect.targetId);
  const targetMinion = findMinionById(state, effect.targetId);

  switch (effect.type) {
    case 'damage': {
      if (targetPlayer) {
        if (targetPlayer.hero.invisibleRounds > 0 && effect.damageType === 'physical') return;
        targetPlayer.hero.hp -= (effect.value ?? 0);
        if (effect.damageType === 'physical' && effect.description?.includes('punch')) {
          targetPlayer.hero.consecutivePunchesReceived++;
          if (targetPlayer.hero.consecutivePunchesReceived >= PUNCH_STUN_THRESHOLD) {
            applyStatusEffect(targetPlayer.hero, 'stunned', 1);
            targetPlayer.hero.consecutivePunchesReceived = 0;
          }
        }
      } else if (targetMinion) {
        if (effect.damageType && targetMinion.immuneTo.includes(effect.damageType)) return;
        targetMinion.hp -= (effect.value ?? 0);
      }
      break;
    }
    case 'heal': {
      if (targetPlayer) {
        targetPlayer.hero.hp = Math.min(targetPlayer.hero.maxHp, targetPlayer.hero.hp + (effect.value ?? 0));
      } else if (targetMinion) {
        targetMinion.hp = Math.min(targetMinion.maxHp, targetMinion.hp + (effect.value ?? 0));
      }
      break;
    }
    case 'status_apply': {
      if (targetPlayer && effect.statusEffect) {
        applyStatusEffect(targetPlayer.hero, effect.statusEffect, effect.value ?? 1);
      }
      break;
    }
    case 'status_remove': {
      if (targetPlayer && effect.statusEffect) {
        targetPlayer.hero.statusEffects = targetPlayer.hero.statusEffects.filter(
          e => e.type !== effect.statusEffect,
        );
      }
      break;
    }
  }
}

function executeSummon(state: GameState, playerId: string): GameEffect[] {
  const player = findPlayer(state, playerId);
  if (!player) return [];

  const heroDef = getHero(player.hero.heroId);
  if (!heroDef?.minion) return [];

  if (player.minions.some(minion => minion.alive)) return [];

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
    name: heroDef.minion.name,
    punchDamage: heroDef.minion.punchDamage,
    punchCountsForStun: heroDef.minion.punchCountsForStun,
    immuneTo: heroDef.minion.immuneTo,
    moveSpeed: heroDef.minion.moveSpeed,
    canMove: heroDef.minion.canMove ?? true,
    attackMinDistance: heroDef.minion.attackMinDistance ?? 0,
    attackMaxDistance: heroDef.minion.attackMaxDistance ?? 0,
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
export function endTurn(state: GameState): void {
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
  // Record who is stunned before ticking, so they can't be re-stunned this turn
  const allPlayers = state.teams.flatMap(t => t.players).filter(p => p.hero.alive);
  state.stunImmuneThisTurn = allPlayers.filter(p => isStunned(p.hero)).map(p => p.id);

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

      for (const minion of player.minions) {
        if (minion.alive && minion.hp <= 0) {
          minion.alive = false;
          effects.push({
            type: 'death',
            sourceId: minion.minionId,
            targetId: minion.minionId,
            description: `${minion.name} has been destroyed!`,
          });
        }
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

/**
 * Get the direction (+1 or -1) that moves toward the nearest enemy.
 * Forward = toward enemy, backward = away from enemy.
 */
function getTowardEnemyDirection(myPos: number, oppHero: HeroState | undefined, teamIndex: number): 1 | -1 {
  if (!oppHero || oppHero.position === myPos) {
    // At same position or no opponent: fall back to team-based direction
    return getForwardDirection(teamIndex);
  }
  return oppHero.position > myPos ? 1 : -1;
}

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

function getOpponentSummons(state: GameState, playerId: string) {
  return getOpponents(state, playerId).flatMap(player => player.minions.filter(minion => minion.alive));
}

function getTeammates(state: GameState, playerId: string): PlayerState[] {
  for (const team of state.teams) {
    if (team.players.some(p => p.id === playerId)) {
      return team.players.filter(p => p.id !== playerId && p.hero.alive);
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

  // Direction toward nearest enemy
  const oppHero = findOpponentHero(state, playerId);
  const towardEnemy = getTowardEnemyDirection(hero.position, oppHero, getTeamIndex(state, playerId));

  // Move forward / backward (if not trapped, and would not exceed max distance from any entity)
  const isTrapped = hero.statusEffects.some(e => e.type === 'trapped');
  if (!isTrapped && !hero.movementDisabled) {
    const speed = hero.invisibleRounds > 0 ? 2 : (hero.statusEffects.some(e => e.type === 'slowed') ? 0.5 : 1);
    const fwdPos = hero.position + towardEnemy * speed;
    const bwdPos = hero.position - towardEnemy * speed;
    if (isMoveLegal(state, playerId, fwdPos)) {
      actions.push({ type: 'move_forward', playerId });
    }
    if (isMoveLegal(state, playerId, bwdPos)) {
      actions.push({ type: 'move_backward', playerId });
    }
  }

  const opponents = getOpponents(state, playerId);
  const opponentSummons = getOpponentSummons(state, playerId);

  // Punch (distance 0 only)
  for (const opp of opponents) {
    if (getDistance(hero.position, opp.hero.position) === 0) {
      actions.push({ type: 'punch', playerId, targetId: opp.id });
    }
  }
  for (const summon of opponentSummons) {
    if (getDistance(hero.position, summon.position) === 0) {
      actions.push({ type: 'punch', playerId, targetId: summon.minionId });
    }
  }

  // Skills
  if (heroDef) {
    const allSkills = [...heroDef.physicalSkills, ...heroDef.magicSkills];
    for (const skill of allSkills) {
      const uses = hero.skillUsesRemaining[skill.id];
      if (uses !== undefined && uses <= 0) continue;

      if (skill.special?.includes('wind_walk') || skill.special?.includes('eat_legs')) {
        actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: playerId });
      } else if (skill.special?.includes('stomp_aoe')) {
        const adjacentEnemies = opponents.filter(opp =>
          getDistance(hero.position, opp.hero.position) === 0,
        );
        if (adjacentEnemies.length > 0) {
          actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: playerId });
        }
      } else if (skill.special?.includes('heart_fire_buff')) {
        actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: playerId });
        for (const mate of getTeammates(state, playerId)) {
          const d = getDistance(hero.position, mate.hero.position);
          if (d >= skill.minDistance && d <= skill.maxDistance) {
            actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: mate.id });
          }
        }
      } else if (skill.special?.includes('kuang_self_heal')) {
        actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: playerId });
        for (const opp of opponents) {
          const d = getDistance(hero.position, opp.hero.position);
          if (d >= skill.minDistance && d <= skill.maxDistance) {
            actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: opp.id });
          }
        }
        for (const mate of getTeammates(state, playerId)) {
          const d = getDistance(hero.position, mate.hero.position);
          if (d >= skill.minDistance && d <= skill.maxDistance) {
            actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: mate.id });
          }
        }
      } else {
        for (const opp of opponents) {
          const d = getDistance(hero.position, opp.hero.position);
          if (d >= skill.minDistance && d <= skill.maxDistance) {
            actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: opp.id });
          }
        }
        if (skill.category === 'physical') {
          for (const summon of opponentSummons) {
            const d = getDistance(hero.position, summon.position);
            if (d >= skill.minDistance && d <= skill.maxDistance) {
              actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: summon.minionId });
            }
          }
        }
      }
    }
  }

  // Summon
  const hasExplicitBuildTower = heroDef?.magicSkills.some(skill => skill.special?.includes('build_tower'));
  if (heroDef?.minion && player.minions.length === 0 && !hasExplicitBuildTower) {
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

  for (const minion of player.minions) {
    if (!minion.alive) continue;

    // Minion move toward/away from nearest enemy
    const oppHero = findOpponentHero(state, player.id);
    const minionTowardEnemy = getTowardEnemyDirection(minion.position, oppHero, teamIndex);
    const fwdPos = minion.position + minionTowardEnemy * minion.moveSpeed;
    const bwdPos = minion.position - minionTowardEnemy * minion.moveSpeed;
    if (minion.canMove) {
      if (isMoveLegal(state, minion.minionId, fwdPos)) {
        actions.push({ type: 'move_forward', playerId: player.id, minionId: minion.minionId });
      }
      if (isMoveLegal(state, minion.minionId, bwdPos)) {
        actions.push({ type: 'move_backward', playerId: player.id, minionId: minion.minionId });
      }
    }

    // Minion attack
    for (const opp of opponents) {
      const d = getDistance(minion.position, opp.hero.position);
      if (d >= minion.attackMinDistance && d <= minion.attackMaxDistance) {
        actions.push({ type: 'punch', playerId: player.id, targetId: opp.id, minionId: minion.minionId });
      }
    }

    // Minion stay
    actions.push({ type: 'stay', playerId: player.id, minionId: minion.minionId });
  }

  return actions;
}
