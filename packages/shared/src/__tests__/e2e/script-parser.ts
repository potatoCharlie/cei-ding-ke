import type { GameState, PlayerAction } from '../../types/game.js';
import type { BattleScript, TurnScript, PlayerExpectation } from './battle-simulator.js';

/**
 * Parse a battle script text file into BattleScript objects.
 *
 * DSL format:
 *   === Scenario Name
 *   heroes: shan vs nan
 *   heroes: jin shan vs nan gao    (2v2)
 *   pos: 5 5
 *   pos: 5 5 5 5                    (2v2)
 *   setup p1: hp=50
 *   setup p2: stunned=2
 *
 *   turn 1: p1 wins
 *     p1 punch p2
 *     > p1: hp=100 posStart=5 posEnd=6
 *     > p2: hp=90 stunned=false
 *     > phase=rps_submit winner=null
 *
 *   turn 2: p1 p2 win               (2v2 multi-winner)
 *     p1 skill small_dart p3
 *     p2 punch p4
 *     minion hellfire_p1 punch p3
 *     > p3: hp=80 trapped=true posStart=5 posEnd=5
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
  let hero3: string | undefined;
  let hero4: string | undefined;
  const positions: Record<string, number> = {};
  const setupActions: SetupAction[] = [];
  const turns: TurnScript[] = [];
  let currentTurn: TurnScript | null = null;

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // heroes: jin shan vs nan gao (2v2)
    const hero4Match = line.match(/^heroes:\s*(\w+)\s+(\w+)\s+vs\s+(\w+)\s+(\w+)$/);
    if (hero4Match) {
      hero1 = hero4Match[1];
      hero2 = hero4Match[2];
      hero3 = hero4Match[3];
      hero4 = hero4Match[4];
      continue;
    }

    // heroes: shan vs nan (1v1)
    const heroMatch = line.match(/^heroes:\s*(\w+)\s+vs\s+(\w+)$/);
    if (heroMatch) {
      hero1 = heroMatch[1];
      hero2 = heroMatch[2];
      continue;
    }

    // pos: 5 5 5 5 (2v2)
    const pos4Match = line.match(/^pos:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/);
    if (pos4Match) {
      positions.p1 = parseInt(pos4Match[1]);
      positions.p2 = parseInt(pos4Match[2]);
      positions.p3 = parseInt(pos4Match[3]);
      positions.p4 = parseInt(pos4Match[4]);
      continue;
    }

    // pos: 5 5 (1v1)
    const posMatch = line.match(/^pos:\s*(-?\d+)\s+(-?\d+)$/);
    if (posMatch) {
      positions.p1 = parseInt(posMatch[1]);
      positions.p2 = parseInt(posMatch[2]);
      continue;
    }

    // setup p1: hp=50 stunned=2
    const setupMatch = line.match(/^setup\s+(p[1-4]):\s*(.+)$/);
    if (setupMatch) {
      const playerId = setupMatch[1];
      const props = parseKeyValues(setupMatch[2]);
      setupActions.push({ playerId, props });
      continue;
    }

    // turn N: p1 p2 win (multi-winner) or turn N: p1 wins (single winner)
    const turnMatch = line.match(/^turn\s+\d+:\s*((?:p[1-4]\s*)+)wins?$/);
    if (turnMatch) {
      if (currentTurn) turns.push(currentTurn);
      const winnerIds = turnMatch[1].trim().split(/\s+/);
      currentTurn = {
        rpsWinners: winnerIds,
        actions: [], // filled by action lines
      };
      continue;
    }

    // Must be inside a turn from here
    if (!currentTurn) continue;

    // > p1: hp=90 stunned=false (player assertion)
    const assertPlayerMatch = line.match(/^>\s*(p[1-4]):\s*(.+)$/);
    if (assertPlayerMatch) {
      if (!currentTurn.expect) currentTurn.expect = {};
      const playerId = assertPlayerMatch[1];
      currentTurn.expect[playerId] = parsePlayerExpectation(assertPlayerMatch[2]);
      continue;
    }

    // > phase=game_over winner=0 (game assertion)
    const assertGameMatch = line.match(/^>\s*(.+)$/);
    if (assertGameMatch && !assertGameMatch[1].match(/^p[1-4]:/)) {
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
      // For minion owner, use the first winner in rpsWinners
      currentTurn.minionAction = parseMinionAction(minionId, currentTurn.rpsWinners[0], actionStr);
      continue;
    }

    // p1 punch p2 / p1 skill small_dart p2 / p1 move_forward / p1 stay / p1 summon
    const actionMatch = line.match(/^(p[1-4])\s+(.+)$/);
    if (actionMatch) {
      const playerId = actionMatch[1];
      currentTurn.actions.push(parseAction(playerId, actionMatch[2]));
      continue;
    }
  }

  // Push last turn
  if (currentTurn) turns.push(currentTurn);

  // Ensure each turn has at least a default stay action if no actions were parsed
  for (const turn of turns) {
    if (turn.actions.length === 0) {
      turn.actions.push({ type: 'stay', playerId: turn.rpsWinners[0] });
    }
  }

  if (turns.length === 0) return null;

  const is2v2 = !!(hero3 && hero4);

  const script: BattleScript = {
    name,
    hero1,
    hero2,
    turns,
  };

  if (hero3) script.hero3 = hero3;
  if (hero4) script.hero4 = hero4;

  if (Object.keys(positions).length > 0) {
    script.startPositions = positions;
  }

  if (setupActions.length > 0) {
    script.setup = (state: GameState) => {
      for (const { playerId, props } of setupActions) {
        // Map player IDs to team/player indices:
        // 1v1: p1 → teams[0].players[0], p2 → teams[1].players[0]
        // 2v2: p1 → teams[0].players[0], p2 → teams[0].players[1],
        //       p3 → teams[1].players[0], p4 → teams[1].players[1]
        let teamIdx: number;
        let playerIdx: number;
        if (is2v2) {
          if (playerId === 'p1') { teamIdx = 0; playerIdx = 0; }
          else if (playerId === 'p2') { teamIdx = 0; playerIdx = 1; }
          else if (playerId === 'p3') { teamIdx = 1; playerIdx = 0; }
          else { teamIdx = 1; playerIdx = 1; } // p4
        } else {
          teamIdx = playerId === 'p1' ? 0 : 1;
          playerIdx = 0;
        }
        const hero = state.teams[teamIdx].players[playerIdx].hero;

        if (props.hp !== undefined) hero.hp = parseInt(props.hp as string);
        if (props.stunned !== undefined) {
          hero.statusEffects.push({ type: 'stunned', remainingRounds: parseInt(props.stunned as string) });
        }
        if (props.trapped !== undefined) {
          hero.statusEffects.push({ type: 'trapped', remainingRounds: parseInt(props.trapped as string) });
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
  if (props.posStart !== undefined) expect.positionStart = parseInt(props.posStart);
  if (props.posEnd !== undefined) expect.positionEnd = parseInt(props.posEnd);
  if (props.alive !== undefined) expect.alive = props.alive === 'true';
  if (props.stunned !== undefined) expect.stunned = props.stunned === 'true';
  if (props.trapped !== undefined) expect.trapped = props.trapped === 'true';
  if (props.invisible !== undefined) expect.invisible = props.invisible === 'true';

  return expect;
}
