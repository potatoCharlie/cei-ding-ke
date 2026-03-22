import type {
  GameState, GamePhase, PlayerAction, RPSChoice,
  RPSResult, GameEffect, HeroState, TurnRecord, PlayerState,
} from '../types/game.js';
import type { HeroDefinition } from '../types/hero.js';
import { STARTING_DISTANCE, PUNCH_STUN_THRESHOLD } from '../constants.js';
import { resolveRPS1v1, randomRPSChoice } from './rps.js';
import { moveForward, moveBackward } from './movement.js';
import { executePunch, executeSkill, executeWindWalkPunch } from './combat.js';
import { applyStatusEffect, tickStatusEffects, applyPassiveEffects, isStunned } from './status-effects.js';
import { getHero } from '../heroes/registry.js';

/**
 * Create a new game state for a 1v1 match.
 */
export function createGameState(
  gameId: string,
  player1: { id: string; name: string; heroId: string },
  player2: { id: string; name: string; heroId: string },
): GameState {
  return {
    id: gameId,
    mode: '1v1',
    phase: 'rps_submit',
    turn: 1,
    teams: [
      {
        teamIndex: 0,
        players: [createPlayerState(player1.id, player1.name, player1.heroId)],
      },
      {
        teamIndex: 1,
        players: [createPlayerState(player2.id, player2.name, player2.heroId)],
      },
    ],
    distance: STARTING_DISTANCE,
    distanceAtTurnStart: STARTING_DISTANCE,
    pendingRPS: {},
    actionOrder: [],
    currentActionIndex: 0,
    history: [],
    winner: null,
  };
}

function createPlayerState(id: string, name: string, heroId: string): PlayerState {
  const heroDef = getHero(heroId);
  const hp = heroDef?.hp ?? 100;

  // Initialize skill uses
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

  // Check if all non-stunned players have submitted
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

  // Auto-submit for players who didn't submit (timeout)
  for (const player of nonStunnedPlayers) {
    if (state.pendingRPS[player.id] == null) {
      state.pendingRPS[player.id] = randomRPSChoice();
    }
  }

  // 1v1 resolution
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

    // Clear pending RPS for next round
    state.pendingRPS = {};

    return result;
  }

  // Handle stunned player case: other player auto-wins
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

  // Fallback: draw
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

  switch (action.type) {
    case 'move_forward': {
      const result = moveForward(state, action.playerId);
      state.distance = result.newDistance;
      effects = result.effects;
      break;
    }
    case 'move_backward': {
      const result = moveBackward(state, action.playerId);
      state.distance = result.newDistance;
      effects = result.effects;
      break;
    }
    case 'punch': {
      // Check if hero is in wind walk - exit with special punch
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

      // Decrement skill uses
      if (effects.length > 0 && player.hero.skillUsesRemaining[action.skillId] !== undefined) {
        player.hero.skillUsesRemaining[action.skillId]--;
      }

      // Handle Wind Walk activation
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
  }

  // Apply effects to game state
  applyEffects(state, effects);

  // Check for deaths
  const deathEffects = checkDeaths(state);
  effects.push(...deathEffects);

  // Check win condition
  checkWinCondition(state);

  // Advance to next action or end turn
  if (state.winner === null) {
    state.currentActionIndex++;
    if (state.currentActionIndex >= state.actionOrder.length) {
      endTurn(state);
    }
  }

  return effects;
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
        // Check magic immunity (e.g., Hellfire)
        if (effect.damageType === 'magic') {
          // For now, only heroes - minion immunity handled separately
        }

        // Check if target is invisible and damage is physical/targeted
        if (target.hero.invisibleRounds > 0 && effect.damageType === 'physical') {
          continue; // Skip physical damage to invisible target
        }

        target.hero.hp -= (effect.value ?? 0);
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

    // Track consecutive punches
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

  // Check if minion already exists
  if (player.minions.length > 0) return [];

  player.minions.push({
    minionId: `${heroDef.minion.id}_${playerId}`,
    ownerId: playerId,
    hp: heroDef.minion.hp,
    maxHp: heroDef.minion.hp,
    alive: true,
    distanceFromOpponent: state.distance,
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
 * End the current turn: apply passives, advance turn counter.
 * Status effects are NOT ticked here — they tick at the start of the next turn
 * so that effects applied mid-turn (e.g., stun from Magic Burn) persist into the next round.
 */
function endTurn(state: GameState): void {
  // Apply passive effects (e.g., Nan's stink)
  const passiveEffects = applyPassiveEffects(state);
  applyEffects(state, passiveEffects);

  // Check for deaths after passives
  checkDeaths(state);
  checkWinCondition(state);

  if (state.winner !== null) return;

  // Reset for next turn
  state.turn++;
  state.phase = 'rps_submit';
  state.distanceAtTurnStart = state.distance;
  state.pendingRPS = {};
  state.actionOrder = [];
  state.currentActionIndex = 0;
}

/**
 * Start-of-turn processing: tick down status effects and check deaths from DoT.
 * Called by the server AFTER the action phase resolves (i.e., at the beginning of
 * the next turn before RPS), so effects like stun last through one full round.
 */
export function startTurn(state: GameState): GameEffect[] {
  const tickEffects = tickStatusEffects(state);
  applyEffects(state, tickEffects);

  // Check for deaths from DoT (e.g., Frozen)
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
      state.winner = 1 - i; // Other team wins
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
 * Get available actions for a player given current game state.
 */
export function getAvailableActions(state: GameState, playerId: string): PlayerAction[] {
  const player = findPlayer(state, playerId);
  if (!player || !player.hero.alive) return [];

  const actions: PlayerAction[] = [];
  const hero = player.hero;
  const heroDef = getHero(hero.heroId);

  // Move forward (if not trapped and distance > 0)
  if (!hero.statusEffects.some(e => e.type === 'trapped') && state.distance > 0) {
    actions.push({ type: 'move_forward', playerId });
  }

  // Move backward (if not trapped and distance < MAX)
  if (!hero.statusEffects.some(e => e.type === 'trapped') && state.distance < 3) {
    actions.push({ type: 'move_backward', playerId });
  }

  // Get all valid targets (alive opponents)
  const opponents = getOpponents(state, playerId);

  // Punch (distance 0 only) — one action per target
  if (state.distance === 0) {
    for (const opp of opponents) {
      actions.push({ type: 'punch', playerId, targetId: opp.id });
    }
  }

  // Skills — one action per (skill, target) pair
  if (heroDef) {
    const allSkills = [...heroDef.physicalSkills, ...heroDef.magicSkills];
    for (const skill of allSkills) {
      // Check uses remaining
      const uses = hero.skillUsesRemaining[skill.id];
      if (uses !== undefined && uses <= 0) continue;

      // Check distance
      if (state.distance >= skill.minDistance && state.distance <= skill.maxDistance) {
        // Self-targeting skills (e.g., Wind Walk, Kuang self-heal)
        if (skill.special?.includes('wind_walk')) {
          actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: playerId });
        } else if (skill.special?.includes('kuang_self_heal')) {
          // Kuang can target self (heal) or opponent (damage)
          actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: playerId });
          for (const opp of opponents) {
            actions.push({ type: 'skill', playerId, skillId: skill.id, targetId: opp.id });
          }
        } else {
          // Normal offensive skill — one per opponent
          for (const opp of opponents) {
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

  return actions;
}
