import {
  createGameState, executeAction, startTurn, getAvailableActions,
  type GameState, type PlayerAction, type GameEffect,
} from '../../index.js';
import { isStunned } from '../../game-engine/status-effects.js';

// ─── Types ───

export interface PlayerExpectation {
  hp?: number;
  position?: number;
  alive?: boolean;
  stunned?: boolean;
  trapped?: boolean;
  invisible?: boolean;
}

export interface TurnScript {
  /** Who wins RPS this turn */
  rpsWinner: 'p1' | 'p2';
  /** Hero action for the RPS winner */
  action: PlayerAction;
  /** Minion action (required if hero has an alive minion) */
  minionAction?: PlayerAction;
  /** Optional assertions after this turn completes */
  expect?: {
    p1?: PlayerExpectation;
    p2?: PlayerExpectation;
    phase?: string;
    winner?: number | null;
  };
}

export interface BattleScript {
  /** Test name (from script file header) */
  name?: string;
  hero1: string;
  hero2: string;
  /** Optional starting positions (default: 1 and 2) */
  startPositions?: { p1: number; p2: number };
  /** Optional initial state mutations (e.g., set HP, apply status) */
  setup?: (state: GameState) => void;
  turns: TurnScript[];
}

export interface BattleLogEntry {
  turn: number;
  rpsWinner: string;
  action: PlayerAction;
  minionAction?: PlayerAction;
  heroEffects: GameEffect[];
  minionEffects: GameEffect[];
  startTurnEffects: GameEffect[];
  stateAfter: {
    p1: { hp: number; position: number; alive: boolean; status: string[]; invisibleRounds: number };
    p2: { hp: number; position: number; alive: boolean; status: string[]; invisibleRounds: number };
    phase: string;
    turn: number;
    winner: number | null;
  };
}

export type BattleLog = BattleLogEntry[];

// ─── Simulator ───

function getHeroState(state: GameState, playerId: string) {
  for (const team of state.teams) {
    for (const p of team.players) {
      if (p.id === playerId) return p.hero;
    }
  }
  throw new Error(`Player ${playerId} not found`);
}

function getPlayerState(state: GameState, playerId: string) {
  for (const team of state.teams) {
    for (const p of team.players) {
      if (p.id === playerId) return p;
    }
  }
  throw new Error(`Player ${playerId} not found`);
}

function snapshotState(state: GameState) {
  const h1 = getHeroState(state, 'p1');
  const h2 = getHeroState(state, 'p2');
  return {
    p1: {
      hp: h1.hp,
      position: h1.position,
      alive: h1.alive,
      status: h1.statusEffects.map(e => e.type),
      invisibleRounds: h1.invisibleRounds,
    },
    p2: {
      hp: h2.hp,
      position: h2.position,
      alive: h2.alive,
      status: h2.statusEffects.map(e => e.type),
      invisibleRounds: h2.invisibleRounds,
    },
    phase: state.phase,
    turn: state.turn,
    winner: state.winner,
  };
}

function winRPS(state: GameState, winnerId: string): void {
  state.phase = 'action_phase';
  state.actionOrder = [winnerId];
  state.currentActionIndex = 0;
  state.awaitingMinionAction = false;
}

/**
 * Simulate a full battle from a script. Returns a BattleLog.
 * Throws on assertion failures with the full log for debugging.
 */
export function simulateBattle(script: BattleScript): BattleLog {
  const state = createGameState(
    'e2e-test',
    { id: 'p1', name: 'Player1', heroId: script.hero1 },
    { id: 'p2', name: 'Player2', heroId: script.hero2 },
  );

  if (script.startPositions) {
    getHeroState(state, 'p1').position = script.startPositions.p1;
    getHeroState(state, 'p2').position = script.startPositions.p2;
  }

  if (script.setup) {
    script.setup(state);
  }

  const log: BattleLog = [];

  for (let i = 0; i < script.turns.length; i++) {
    const turn = script.turns[i];

    // Game already over — stop
    if (state.phase === 'game_over') {
      break;
    }

    // Tick status effects (mirrors server's beginRPSPhase behavior)
    let startTurnEffects: GameEffect[] = [];
    if (state.turn > 1) {
      startTurnEffects = startTurn(state);
      // Check if game ended from DoT (cast needed: startTurn mutates phase but TS can't see it)
      if ((state.phase as string) === 'game_over') {
        log.push({
          turn: state.turn,
          rpsWinner: turn.rpsWinner,
          action: turn.action,
          heroEffects: [],
          minionEffects: [],
          startTurnEffects,
          stateAfter: snapshotState(state),
        });
        break;
      }
    }

    // Set RPS winner
    winRPS(state, turn.rpsWinner);

    // Execute hero action
    const heroEffects = executeAction(state, turn.action);

    // Execute minion action if needed
    let minionEffects: GameEffect[] = [];
    if (state.awaitingMinionAction && turn.minionAction) {
      minionEffects = executeAction(state, turn.minionAction);
    }

    // Record log entry
    const entry: BattleLogEntry = {
      turn: state.turn <= 1 ? i + 1 : state.turn - ((state.phase as string) === 'game_over' ? 0 : 1),
      rpsWinner: turn.rpsWinner,
      action: turn.action,
      minionAction: turn.minionAction,
      heroEffects,
      minionEffects,
      startTurnEffects,
      stateAfter: snapshotState(state),
    };
    log.push(entry);

    // Run assertions
    if (turn.expect) {
      assertTurnExpectations(turn.expect, entry, log, i);
    }
  }

  return log;
}

function assertTurnExpectations(
  expect: NonNullable<TurnScript['expect']>,
  entry: BattleLogEntry,
  log: BattleLog,
  turnIndex: number,
): void {
  const ctx = () => `Turn ${turnIndex + 1} failed.\nBattle log:\n${formatLog(log)}`;

  if (expect.p1) assertPlayerState('p1', expect.p1, entry.stateAfter.p1, ctx);
  if (expect.p2) assertPlayerState('p2', expect.p2, entry.stateAfter.p2, ctx);

  if (expect.phase !== undefined && entry.stateAfter.phase !== expect.phase) {
    throw new Error(`Expected phase '${expect.phase}', got '${entry.stateAfter.phase}'.\n${ctx()}`);
  }
  if (expect.winner !== undefined && entry.stateAfter.winner !== expect.winner) {
    throw new Error(`Expected winner ${expect.winner}, got ${entry.stateAfter.winner}.\n${ctx()}`);
  }
}

function assertPlayerState(
  playerId: string,
  expected: PlayerExpectation,
  actual: BattleLogEntry['stateAfter']['p1'],
  ctx: () => string,
): void {
  if (expected.hp !== undefined && actual.hp !== expected.hp) {
    throw new Error(`${playerId} HP: expected ${expected.hp}, got ${actual.hp}.\n${ctx()}`);
  }
  if (expected.position !== undefined && actual.position !== expected.position) {
    throw new Error(`${playerId} position: expected ${expected.position}, got ${actual.position}.\n${ctx()}`);
  }
  if (expected.alive !== undefined && actual.alive !== expected.alive) {
    throw new Error(`${playerId} alive: expected ${expected.alive}, got ${actual.alive}.\n${ctx()}`);
  }
  if (expected.stunned !== undefined) {
    const isStunned = actual.status.includes('stunned');
    if (isStunned !== expected.stunned) {
      throw new Error(`${playerId} stunned: expected ${expected.stunned}, got ${isStunned}.\n${ctx()}`);
    }
  }
  if (expected.trapped !== undefined) {
    const isTrapped = actual.status.includes('trapped');
    if (isTrapped !== expected.trapped) {
      throw new Error(`${playerId} trapped: expected ${expected.trapped}, got ${isTrapped}.\n${ctx()}`);
    }
  }
  if (expected.invisible !== undefined) {
    const isInvisible = actual.invisibleRounds > 0;
    if (isInvisible !== expected.invisible) {
      throw new Error(`${playerId} invisible: expected ${expected.invisible}, got ${isInvisible}.\n${ctx()}`);
    }
  }
}

/**
 * Format battle log for debugging output.
 */
export function formatLog(log: BattleLog): string {
  return log.map((entry, i) => {
    const lines = [
      `--- Turn ${i + 1} (RPS winner: ${entry.rpsWinner}) ---`,
      `  Action: ${entry.action.type}${entry.action.skillId ? ` (${entry.action.skillId})` : ''}`,
    ];
    if (entry.minionAction) {
      lines.push(`  Minion: ${entry.minionAction.type}`);
    }
    if (entry.startTurnEffects.length > 0) {
      lines.push(`  Start-of-turn: ${entry.startTurnEffects.map(e => e.description).join(', ')}`);
    }
    if (entry.heroEffects.length > 0) {
      lines.push(`  Effects: ${entry.heroEffects.map(e => e.description).join(', ')}`);
    }
    lines.push(
      `  P1: HP=${entry.stateAfter.p1.hp} pos=${entry.stateAfter.p1.position} alive=${entry.stateAfter.p1.alive} status=[${entry.stateAfter.p1.status.join(',')}]`,
      `  P2: HP=${entry.stateAfter.p2.hp} pos=${entry.stateAfter.p2.position} alive=${entry.stateAfter.p2.alive} status=[${entry.stateAfter.p2.status.join(',')}]`,
      `  Phase: ${entry.stateAfter.phase} | Winner: ${entry.stateAfter.winner}`,
    );
    return lines.join('\n');
  }).join('\n');
}

// ─── Fuzzer Utilities ───

/**
 * Check all game invariants. Returns an array of violation messages (empty = all good).
 */
export function checkInvariants(state: GameState): string[] {
  const violations: string[] = [];

  for (const team of state.teams) {
    for (const player of team.players) {
      const h = player.hero;

      // HP bounds
      if (h.alive && h.hp > h.maxHp) {
        violations.push(`${player.id} HP ${h.hp} exceeds maxHp ${h.maxHp}`);
      }

      // Death consistency
      if (!h.alive && h.hp > 0) {
        violations.push(`${player.id} is dead but HP is ${h.hp}`);
      }
      if (h.alive && h.hp <= 0) {
        violations.push(`${player.id} is alive but HP is ${h.hp}`);
      }

      // Status effect durations
      for (const effect of h.statusEffects) {
        if (effect.remainingRounds < 0) {
          violations.push(`${player.id} has ${effect.type} with negative duration ${effect.remainingRounds}`);
        }
      }

      // Skill uses
      for (const [skillId, uses] of Object.entries(h.skillUsesRemaining)) {
        if (uses < 0) {
          violations.push(`${player.id} has skill ${skillId} with negative uses ${uses}`);
        }
      }

      // Minion count
      if (player.minions.length > 1) {
        violations.push(`${player.id} has ${player.minions.length} minions (max 1)`);
      }
    }
  }

  // Phase/winner consistency
  if (state.winner !== null && state.phase !== 'game_over') {
    violations.push(`Winner is ${state.winner} but phase is ${state.phase}`);
  }
  if (state.phase === 'game_over' && state.winner === null) {
    violations.push(`Phase is game_over but winner is null`);
  }

  // Valid phase
  const validPhases = ['hero_select', 'rps_submit', 'rps_resolve', 'action_phase', 'effect_resolve', 'turn_end', 'game_over'];
  if (!validPhases.includes(state.phase)) {
    violations.push(`Invalid phase: ${state.phase}`);
  }

  return violations;
}

/**
 * Pick a random valid action for the given player from getAvailableActions.
 */
export function pickRandomAction(state: GameState, playerId: string): PlayerAction | null {
  const actions = getAvailableActions(state, playerId);
  if (actions.length === 0) return null;
  return actions[Math.floor(Math.random() * actions.length)];
}

/**
 * Simulate a random match. Returns { state, log, violations }.
 */
export function simulateRandomMatch(
  hero1: string,
  hero2: string,
  maxTurns: number,
  seed?: number,
): { state: GameState; log: BattleLog; violations: string[] } {
  const state = createGameState(
    'fuzz-test',
    { id: 'p1', name: 'Player1', heroId: hero1 },
    { id: 'p2', name: 'Player2', heroId: hero2 },
  );

  const log: BattleLog = [];
  const allViolations: string[] = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    if (state.phase === 'game_over') break;

    // Tick status effects
    let startTurnEffects: GameEffect[] = [];
    if (state.turn > 1) {
      startTurnEffects = startTurn(state);
      if ((state.phase as string) === 'game_over') {
        log.push({
          turn: turn + 1,
          rpsWinner: 'n/a',
          action: { type: 'stay', playerId: 'n/a' },
          heroEffects: [],
          minionEffects: [],
          startTurnEffects,
          stateAfter: snapshotState(state),
        });
        break;
      }
    }

    // Random RPS winner
    const winner = Math.random() < 0.5 ? 'p1' : 'p2';
    // Check if winner is alive; if not, pick the other
    const h1 = getHeroState(state, 'p1');
    const h2 = getHeroState(state, 'p2');
    let actualWinner = winner;
    if (winner === 'p1' && !h1.alive) actualWinner = 'p2';
    if (winner === 'p2' && !h2.alive) actualWinner = 'p1';

    winRPS(state, actualWinner);

    // Pick random hero action
    const heroAction = pickRandomAction(state, actualWinner);
    if (!heroAction) {
      // No actions available — use stay
      const stayAction: PlayerAction = { type: 'stay', playerId: actualWinner };
      executeAction(state, stayAction);
      continue;
    }

    const heroEffects = executeAction(state, heroAction);

    // Pick random minion action if needed
    let minionEffects: GameEffect[] = [];
    let minionAction: PlayerAction | undefined;
    if (state.awaitingMinionAction) {
      minionAction = pickRandomAction(state, actualWinner) ?? { type: 'stay', playerId: actualWinner };
      minionEffects = executeAction(state, minionAction);
    }

    log.push({
      turn: turn + 1,
      rpsWinner: actualWinner,
      action: heroAction,
      minionAction,
      heroEffects,
      minionEffects,
      startTurnEffects,
      stateAfter: snapshotState(state),
    });

    // Check invariants
    const violations = checkInvariants(state);
    if (violations.length > 0) {
      allViolations.push(...violations.map(v => `Turn ${turn + 1}: ${v}`));
    }
  }

  return { state, log, violations: allViolations };
}
