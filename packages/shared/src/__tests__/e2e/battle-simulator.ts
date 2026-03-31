import {
  createGameState, executeAction, startTurn, getAvailableActions,
  type GameState, type PlayerAction, type GameEffect,
  MAX_DISTANCE,
} from '../../index.js';
import { isStunned } from '../../game-engine/status-effects.js';

// ─── Types ───

export interface PlayerExpectation {
  hp?: number;
  position?: number;
  positionStart?: number;
  positionEnd?: number;
  alive?: boolean;
  stunned?: boolean;
  trapped?: boolean;
  invisible?: boolean;
}

export interface TurnScript {
  /** Who wins RPS this turn (array for multi-winner support) */
  rpsWinners: string[];
  /** Hero actions for the RPS winners (one per winner) */
  actions: PlayerAction[];
  /** Minion action (required if hero has an alive minion) */
  minionAction?: PlayerAction;
  /** Optional assertions after this turn completes */
  expect?: {
    [key: string]: PlayerExpectation | string | number | null | undefined;
  };
}

export interface BattleScript {
  /** Test name (from script file header) */
  name?: string;
  hero1: string;
  hero2: string;
  hero3?: string;
  hero4?: string;
  /** Optional starting positions (default: 1 and 2) */
  startPositions?: Record<string, number>;
  /** Optional initial state mutations (e.g., set HP, apply status) */
  setup?: (state: GameState) => void;
  turns: TurnScript[];
}

export interface BattleLogEntry {
  turn: number;
  rpsWinners: string[];
  actions: PlayerAction[];
  minionAction?: PlayerAction;
  heroEffects: GameEffect[];
  minionEffects: GameEffect[];
  startTurnEffects: GameEffect[];
  turnStartPositions: Record<string, number>;
  stateAfter: {
    [key: string]: { hp: number; position: number; alive: boolean; status: string[]; invisibleRounds: number } | string | number | null;
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

function getAllPlayerIds(state: GameState): string[] {
  const ids: string[] = [];
  for (const team of state.teams) {
    for (const p of team.players) {
      ids.push(p.id);
    }
  }
  return ids;
}

function snapshotState(state: GameState) {
  const result: BattleLogEntry['stateAfter'] = {
    phase: state.phase,
    turn: state.turn,
    winner: state.winner,
  };

  for (const id of getAllPlayerIds(state)) {
    const h = getHeroState(state, id);
    result[id] = {
      hp: h.hp,
      position: h.position,
      alive: h.alive,
      status: h.statusEffects.map(e => e.type),
      invisibleRounds: h.invisibleRounds,
    };
  }

  return result;
}

function winRPS(state: GameState, winnerIds: string[]): void {
  state.phase = 'action_phase';
  state.actionOrder = winnerIds;
  state.currentActionIndex = 0;
  state.awaitingMinionAction = false;
}

/**
 * Asserts that the winner list passed to winRPS is valid (all alive and non-stunned).
 * Throws immediately — this is a fuzzer construction bug, not an engine violation.
 */
function assertWinnerListValid(state: GameState, winnerIds: string[]): void {
  for (const id of winnerIds) {
    let found = false;
    for (const team of state.teams) {
      for (const player of team.players) {
        if (player.id === id) {
          found = true;
          if (!player.hero.alive) {
            throw new Error(`FUZZER BUG: winner '${id}' is not alive`);
          }
          if (isStunned(player.hero)) {
            throw new Error(`FUZZER BUG: winner '${id}' is stunned`);
          }
        }
      }
    }
    if (!found) {
      throw new Error(`FUZZER BUG: winner '${id}' is not a valid player ID`);
    }
  }
}

/**
 * Simulate a full battle from a script. Returns a BattleLog.
 * Throws on assertion failures with the full log for debugging.
 */
export function simulateBattle(script: BattleScript): BattleLog {
  let state: GameState;

  if (script.hero3 && script.hero4) {
    // 2v2 mode
    state = createGameState('e2e-test', '2v2', [
      { id: 'p1', name: 'P1', heroId: script.hero1, teamIndex: 0 },
      { id: 'p2', name: 'P2', heroId: script.hero2, teamIndex: 0 },
      { id: 'p3', name: 'P3', heroId: script.hero3, teamIndex: 1 },
      { id: 'p4', name: 'P4', heroId: script.hero4, teamIndex: 1 },
    ]);
  } else {
    // 1v1 mode
    state = createGameState(
      'e2e-test',
      { id: 'p1', name: 'Player1', heroId: script.hero1 },
      { id: 'p2', name: 'Player2', heroId: script.hero2 },
    );
  }

  if (script.startPositions) {
    for (const [playerId, pos] of Object.entries(script.startPositions)) {
      getHeroState(state, playerId).position = pos;
      state.positionsAtTurnStart[playerId] = pos;
    }
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

    const turnStartPositions = { ...state.positionsAtTurnStart };

    // Tick status effects (mirrors server's beginRPSPhase behavior)
    let startTurnEffects: GameEffect[] = [];
    if (state.turn > 1) {
      startTurnEffects = startTurn(state);
      // Check if game ended from DoT (cast needed: startTurn mutates phase but TS can't see it)
      if ((state.phase as string) === 'game_over') {
        log.push({
          turn: state.turn,
          rpsWinners: turn.rpsWinners,
          actions: turn.actions,
          heroEffects: [],
          minionEffects: [],
          startTurnEffects,
          turnStartPositions,
          stateAfter: snapshotState(state),
        });
        break;
      }
    }

    // Set RPS winners
    winRPS(state, turn.rpsWinners);

    // Execute hero actions (one per winner)
    const heroEffects: GameEffect[] = [];
    for (const action of turn.actions) {
      if ((state.phase as string) === 'game_over') break;
      const effects = executeAction(state, action);
      heroEffects.push(...effects);
    }

    // Execute minion action if needed
    let minionEffects: GameEffect[] = [];
    if (state.awaitingMinionAction && turn.minionAction) {
      minionEffects = executeAction(state, turn.minionAction);
    }

    // Record log entry
    const entry: BattleLogEntry = {
      turn: state.turn <= 1 ? i + 1 : state.turn - ((state.phase as string) === 'game_over' ? 0 : 1),
      rpsWinners: turn.rpsWinners,
      actions: turn.actions,
      minionAction: turn.minionAction,
      heroEffects,
      minionEffects,
      startTurnEffects,
      turnStartPositions,
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

  // Check player assertions (p1, p2, p3, p4)
  for (const key of Object.keys(expect)) {
    if (key.match(/^p\d+$/)) {
      const playerExpect = expect[key] as PlayerExpectation;
      const playerState = entry.stateAfter[key] as { hp: number; position: number; alive: boolean; status: string[]; invisibleRounds: number } | undefined;
      if (!playerState) {
        throw new Error(`Player ${key} not found in state snapshot.\n${ctx()}`);
      }
      assertPlayerState(key, playerExpect, entry.turnStartPositions[key], playerState, ctx);
    }
  }

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
  actualStartPosition: number | undefined,
  actual: { hp: number; position: number; alive: boolean; status: string[]; invisibleRounds: number },
  ctx: () => string,
): void {
  if (expected.positionStart !== undefined && actualStartPosition !== expected.positionStart) {
    throw new Error(`${playerId} start position: expected ${expected.positionStart}, got ${actualStartPosition}.\n${ctx()}`);
  }
  if (expected.positionEnd !== undefined && actual.position !== expected.positionEnd) {
    throw new Error(`${playerId} end position: expected ${expected.positionEnd}, got ${actual.position}.\n${ctx()}`);
  }
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
      `--- Turn ${i + 1} (RPS winners: ${entry.rpsWinners.join(', ')}) ---`,
    ];
    for (const action of entry.actions) {
      lines.push(`  Action: ${action.type}${action.skillId ? ` (${action.skillId})` : ''} by ${action.playerId}`);
    }
    if (entry.minionAction) {
      lines.push(`  Minion: ${entry.minionAction.type}`);
    }
    if (entry.startTurnEffects.length > 0) {
      lines.push(`  Start-of-turn: ${entry.startTurnEffects.map(e => e.description).join(', ')}`);
    }
    if (entry.heroEffects.length > 0) {
      lines.push(`  Effects: ${entry.heroEffects.map(e => e.description).join(', ')}`);
    }
    // Print all player states
    for (const key of Object.keys(entry.stateAfter)) {
      if (key.match(/^p\d+$/)) {
        const ps = entry.stateAfter[key] as { hp: number; position: number; alive: boolean; status: string[]; invisibleRounds: number };
        lines.push(`  ${key.toUpperCase()}: startPos=${entry.turnStartPositions[key]} endPos=${ps.position} HP=${ps.hp} alive=${ps.alive} status=[${ps.status.join(',')}]`);
      }
    }
    lines.push(`  Phase: ${entry.stateAfter.phase} | Winner: ${entry.stateAfter.winner}`);
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
      const aliveMinionCount = player.minions.filter(m => m.alive).length;
      if (aliveMinionCount > 1) {
        violations.push(`${player.id} has ${aliveMinionCount} minions (max 1)`);
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

  // Dead team → game over
  for (let i = 0; i < state.teams.length; i++) {
    const team = state.teams[i];
    if (team.players.length > 0 && team.players.every(p => !p.hero.alive)) {
      if (state.winner === null || state.phase !== 'game_over') {
        violations.push(`Team ${i} all players dead but game not over (phase=${state.phase}, winner=${state.winner})`);
      }
    }
  }

  // currentActionIndex must not exceed actionOrder length
  if (state.currentActionIndex > state.actionOrder.length) {
    violations.push(`currentActionIndex ${state.currentActionIndex} exceeds actionOrder.length ${state.actionOrder.length}`);
  }

  // No duplicate IDs in actionOrder
  const seen = new Set<string>();
  for (const id of state.actionOrder) {
    if (seen.has(id)) {
      violations.push(`Duplicate ID '${id}' in actionOrder: [${state.actionOrder.join(', ')}]`);
      break;
    }
    seen.add(id);
  }

  // Max distance between any two alive entities (heroes + minions) must be ≤ MAX_DISTANCE
  const aliveEntities: Array<{ label: string; pos: number }> = [];
  for (const team of state.teams) {
    for (const player of team.players) {
      if (player.hero.alive) {
        aliveEntities.push({ label: player.id, pos: player.hero.position });
      }
      for (const minion of player.minions) {
        if (minion.alive) {
          aliveEntities.push({ label: `${player.id}_minion`, pos: minion.position });
        }
      }
    }
  }
  for (let a = 0; a < aliveEntities.length; a++) {
    for (let b = a + 1; b < aliveEntities.length; b++) {
      const dist = Math.abs(aliveEntities[a].pos - aliveEntities[b].pos);
      if (dist > MAX_DISTANCE) {
        violations.push(
          `Max distance violated: ${aliveEntities[a].label}@${aliveEntities[a].pos} vs ${aliveEntities[b].label}@${aliveEntities[b].pos} (dist=${dist}, max=${MAX_DISTANCE})`
        );
      }
    }
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
          rpsWinners: ['n/a'],
          actions: [{ type: 'stay', playerId: 'n/a' }],
          heroEffects: [],
          minionEffects: [],
          startTurnEffects,
          turnStartPositions: { ...state.positionsAtTurnStart },
          stateAfter: snapshotState(state),
        });
        break;
      }
    }

    // Random RPS winner — must be alive and non-stunned
    const h1 = getHeroState(state, 'p1');
    const h2 = getHeroState(state, 'p2');
    const p1Eligible = h1.alive && !isStunned(h1);
    const p2Eligible = h2.alive && !isStunned(h2);

    let actualWinner: string;
    if (p1Eligible && p2Eligible) {
      actualWinner = Math.random() < 0.5 ? 'p1' : 'p2';
    } else if (p1Eligible) {
      actualWinner = 'p1';
    } else if (p2Eligible) {
      actualWinner = 'p2';
    } else {
      // Both stunned — advance turn with a no-op to avoid infinite loop
      const aliveId = ['p1', 'p2'].find(id => getHeroState(state, id).alive) ?? 'p1';
      winRPS(state, [aliveId]);
      executeAction(state, { type: 'stay', playerId: aliveId });
      continue;
    }

    winRPS(state, [actualWinner]);
    assertWinnerListValid(state, [actualWinner]);

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
      rpsWinners: [actualWinner],
      actions: [heroAction],
      minionAction,
      heroEffects,
      minionEffects,
      startTurnEffects,
      turnStartPositions: { ...state.positionsAtTurnStart },
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

/**
 * Simulate a random 2v2 match. Returns { state, log, violations }.
 */
export function simulateRandomMatch2v2(
  team0Heroes: string[],
  team1Heroes: string[],
  maxTurns: number,
): { state: GameState; log: BattleLog; violations: string[] } {
  const state = createGameState('fuzz-test', '2v2', [
    { id: 'p1', name: 'Player1', heroId: team0Heroes[0], teamIndex: 0 },
    { id: 'p2', name: 'Player2', heroId: team0Heroes[1], teamIndex: 0 },
    { id: 'p3', name: 'Player3', heroId: team1Heroes[0], teamIndex: 1 },
    { id: 'p4', name: 'Player4', heroId: team1Heroes[1], teamIndex: 1 },
  ]);

  const log: BattleLog = [];
  const allViolations: string[] = [];
  const playerIds = ['p1', 'p2', 'p3', 'p4'];

  for (let turn = 0; turn < maxTurns; turn++) {
    if (state.phase === 'game_over') break;

    // Tick status effects
    let startTurnEffects: GameEffect[] = [];
    if (state.turn > 1) {
      startTurnEffects = startTurn(state);
      if ((state.phase as string) === 'game_over') {
        log.push({
          turn: turn + 1,
          rpsWinners: ['n/a'],
          actions: [{ type: 'stay', playerId: 'n/a' }],
          heroEffects: [],
          minionEffects: [],
          startTurnEffects,
          turnStartPositions: { ...state.positionsAtTurnStart },
          stateAfter: snapshotState(state),
        });
        break;
      }
    }

    // Randomly pick 1-2 winners from alive, non-stunned players
    const eligible = playerIds.filter(id => {
      const hero = getHeroState(state, id);
      return hero.alive && !isStunned(hero);
    });

    if (eligible.length === 0) {
      // All alive players are stunned — just advance turn with no actions
      winRPS(state, [playerIds.find(id => getHeroState(state, id).alive) ?? 'p1']);
      const stayAction: PlayerAction = { type: 'stay', playerId: state.actionOrder[0] };
      executeAction(state, stayAction);
      log.push({
        turn: turn + 1,
        rpsWinners: state.actionOrder,
        actions: [stayAction],
        heroEffects: [],
        minionEffects: [],
        startTurnEffects,
        turnStartPositions: { ...state.positionsAtTurnStart },
        stateAfter: snapshotState(state),
      });
      continue;
    }

    // Randomly pick 1 or 2 winners from eligible players (from different teams preferably)
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const numWinners = Math.random() < 0.5 ? 1 : Math.min(2, shuffled.length);
    const winners = shuffled.slice(0, numWinners);

    winRPS(state, winners);
    assertWinnerListValid(state, winners);

    // Execute actions for each winner
    const allHeroEffects: GameEffect[] = [];
    const allActions: PlayerAction[] = [];
    let minionAction: PlayerAction | undefined;
    let minionEffects: GameEffect[] = [];

    for (const winnerId of winners) {
      if ((state.phase as string) === 'game_over') break;

      // Skip if this winner died during this round
      const hero = getHeroState(state, winnerId);
      if (!hero.alive) continue;

      const heroAction = pickRandomAction(state, winnerId);
      if (!heroAction) {
        const stayAction: PlayerAction = { type: 'stay', playerId: winnerId };
        executeAction(state, stayAction);
        allActions.push(stayAction);
        continue;
      }

      const effects = executeAction(state, heroAction);
      allHeroEffects.push(...effects);
      allActions.push(heroAction);

      // Handle minion action if needed
      if (state.awaitingMinionAction) {
        minionAction = pickRandomAction(state, winnerId) ?? { type: 'stay', playerId: winnerId };
        minionEffects = executeAction(state, minionAction);
      }
    }

    log.push({
      turn: turn + 1,
      rpsWinners: winners,
      actions: allActions,
      minionAction,
      heroEffects: allHeroEffects,
      minionEffects,
      startTurnEffects,
      turnStartPositions: { ...state.positionsAtTurnStart },
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
