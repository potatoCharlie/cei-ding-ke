import type { GameState, PlayerAction } from '../../types/game.js';
import type { BattleScript, TurnScript, PlayerExpectation } from './battle-simulator.js';

/**
 * Parse a battle script text file into BattleScript objects.
 *
 * DSL format:
 *   === Scenario Name
 *   heroes: shan vs nan
 *   pos: 5 5
 *   setup p1: hp=50
 *   setup p2: stunned=2
 *
 *   turn 1: p1 wins
 *     p1 punch p2
 *     > p1: hp=100
 *     > p2: hp=90 stunned=false
 *     > phase=rps_submit winner=null
 *
 *   turn 2: p2 wins
 *     p2 skill frozen p1
 *     minion hellfire_p1 punch p2
 *     > p1: hp=80 trapped=true
 */
export function parseScriptFile(content: string): BattleScript[] {
  const scripts: BattleScript[] = [];
  const sections = content.split(/^===/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const script = parseScenario(trimmed);
    if (script) scripts.push(script);
  }

  return scripts;
}

function parseScenario(text: string): BattleScript | null {
  const lines = text.split('\n');

  // First line is the scenario name (after === was split off)
  const name = lines[0].trim();
  if (!name) return null;

  let hero1 = 'nan';
  let hero2 = 'shan';
  let p1Pos: number | undefined;
  let p2Pos: number | undefined;
  const setupActions: SetupAction[] = [];
  const turns: TurnScript[] = [];
  let currentTurn: TurnScript | null = null;

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // heroes: shan vs nan
    const heroMatch = line.match(/^heroes:\s*(\w+)\s+vs\s+(\w+)$/);
    if (heroMatch) {
      hero1 = heroMatch[1];
      hero2 = heroMatch[2];
      continue;
    }

    // pos: 5 5
    const posMatch = line.match(/^pos:\s*(-?\d+)\s+(-?\d+)$/);
    if (posMatch) {
      p1Pos = parseInt(posMatch[1]);
      p2Pos = parseInt(posMatch[2]);
      continue;
    }

    // setup p1: hp=50 stunned=2 posStart=5
    const setupMatch = line.match(/^setup\s+(p[12]):\s*(.+)$/);
    if (setupMatch) {
      const playerId = setupMatch[1];
      const props = parseKeyValues(setupMatch[2]);
      setupActions.push({ playerId, props });
      continue;
    }

    // turn N: p1 wins
    const turnMatch = line.match(/^turn\s+\d+:\s*(p[12])\s+wins$/);
    if (turnMatch) {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        rpsWinner: turnMatch[1] as 'p1' | 'p2',
        action: { type: 'stay', playerId: turnMatch[1] }, // default, overridden by action line
      };
      continue;
    }

    // Must be inside a turn from here
    if (!currentTurn) continue;

    // > p1: hp=90 stunned=false
    const assertPlayerMatch = line.match(/^>\s*(p[12]):\s*(.+)$/);
    if (assertPlayerMatch) {
      if (!currentTurn.expect) currentTurn.expect = {};
      const playerId = assertPlayerMatch[1] as 'p1' | 'p2';
      currentTurn.expect[playerId] = parsePlayerExpectation(assertPlayerMatch[2]);
      continue;
    }

    // > phase=game_over winner=0
    const assertGameMatch = line.match(/^>\s*(.+)$/);
    if (assertGameMatch && !assertGameMatch[1].startsWith('p1:') && !assertGameMatch[1].startsWith('p2:')) {
      if (!currentTurn.expect) currentTurn.expect = {};
      const props = parseKeyValues(assertGameMatch[1]);
      if (props.phase !== undefined) currentTurn.expect.phase = props.phase as string;
      if (props.winner !== undefined) {
        currentTurn.expect.winner = props.winner === 'null' ? null : parseInt(props.winner as string);
      }
      continue;
    }

    // minion hellfire_p1 punch p2
    const minionMatch = line.match(/^minion\s+(\S+)\s+(.+)$/);
    if (minionMatch) {
      const minionId = minionMatch[1];
      const actionStr = minionMatch[2];
      currentTurn.minionAction = parseMinionAction(minionId, currentTurn.rpsWinner, actionStr);
      continue;
    }

    // p1 punch p2 / p1 skill small_dart p2 / p1 move_forward / p1 stay / p1 summon
    const actionMatch = line.match(/^(p[12])\s+(.+)$/);
    if (actionMatch) {
      const playerId = actionMatch[1];
      currentTurn.action = parseAction(playerId, actionMatch[2]);
      continue;
    }
  }

  // Push last turn
  if (currentTurn) turns.push(currentTurn);

  if (turns.length === 0) return null;

  const script: BattleScript = {
    name,
    hero1,
    hero2,
    turns,
  };

  if (p1Pos !== undefined && p2Pos !== undefined) {
    script.startPositions = { p1: p1Pos, p2: p2Pos };
  }

  if (setupActions.length > 0) {
    script.setup = (state: GameState) => {
      for (const { playerId, props } of setupActions) {
        const teamIdx = playerId === 'p1' ? 0 : 1;
        const hero = state.teams[teamIdx].players[0].hero;

        if (props.hp !== undefined) hero.hp = parseInt(props.hp as string);
        if (props.stunned !== undefined) {
          hero.statusEffects.push({ type: 'stunned', remainingRounds: parseInt(props.stunned as string) });
        }
        if (props.trapped !== undefined) {
          hero.statusEffects.push({ type: 'trapped', remainingRounds: parseInt(props.trapped as string) });
        }
        if (props.posStart !== undefined) {
          state.positionsAtTurnStart[playerId] = parseInt(props.posStart as string);
        }
      }
    };
  }

  return script;
}

// ─── Action Parsing ───

function parseAction(playerId: string, actionStr: string): PlayerAction {
  const parts = actionStr.trim().split(/\s+/);
  const actionType = parts[0];

  switch (actionType) {
    case 'punch':
      return { type: 'punch', playerId, targetId: parts[1] };
    case 'skill': {
      const skillId = parts[1];
      const targetId = parts[2] || playerId; // self-target if omitted
      return { type: 'skill', playerId, skillId, targetId };
    }
    case 'summon':
      return { type: 'summon', playerId };
    case 'stay':
      return { type: 'stay', playerId };
    case 'move_forward':
      return { type: 'move_forward', playerId };
    case 'move_backward':
      return { type: 'move_backward', playerId };
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

function parseMinionAction(minionId: string, ownerId: string, actionStr: string): PlayerAction {
  const parts = actionStr.trim().split(/\s+/);
  const actionType = parts[0];

  switch (actionType) {
    case 'punch':
      return { type: 'punch', playerId: ownerId, targetId: parts[1], minionId };
    case 'move_forward':
      return { type: 'move_forward', playerId: ownerId, minionId };
    case 'move_backward':
      return { type: 'move_backward', playerId: ownerId, minionId };
    case 'stay':
      return { type: 'stay', playerId: ownerId, minionId };
    default:
      throw new Error(`Unknown minion action type: ${actionType}`);
  }
}

// ─── Key-Value Parsing ───

interface SetupAction {
  playerId: string;
  props: Record<string, string | number | boolean>;
}

function parseKeyValues(str: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = str.trim().split(/\s+/);
  for (const pair of pairs) {
    const [key, val] = pair.split('=');
    if (key && val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

function parsePlayerExpectation(str: string): PlayerExpectation {
  const props = parseKeyValues(str);
  const expect: PlayerExpectation = {};

  if (props.hp !== undefined) expect.hp = parseInt(props.hp);
  if (props.pos !== undefined) expect.position = parseInt(props.pos);
  if (props.alive !== undefined) expect.alive = props.alive === 'true';
  if (props.stunned !== undefined) expect.stunned = props.stunned === 'true';
  if (props.trapped !== undefined) expect.trapped = props.trapped === 'true';
  if (props.invisible !== undefined) expect.invisible = props.invisible === 'true';

  return expect;
}
