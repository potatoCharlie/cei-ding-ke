export type RPSChoice = 'rock' | 'paper' | 'scissors';

export type GamePhase =
  | 'hero_select'
  | 'rps_submit'
  | 'rps_resolve'
  | 'action_phase'
  | 'effect_resolve'
  | 'turn_end'
  | 'game_over';

export type ActionType = 'move_forward' | 'move_backward' | 'punch' | 'skill' | 'summon' | 'stay';

export type StatusEffectType = 'stunned' | 'trapped' | 'slowed';

export type DamageType = 'physical' | 'magic';

export interface StatusEffect {
  type: StatusEffectType;
  remainingRounds: number;
  /** For slowed: how much movement is reduced */
  movementPenalty?: number;
}

export interface PlayerAction {
  type: ActionType;
  playerId: string;
  skillId?: string;
  targetId?: string;
  /** If set, this action is for a minion rather than the hero. */
  minionId?: string;
}

export interface HeroState {
  heroId: string;
  playerId: string;
  hp: number;
  maxHp: number;
  /** Absolute position on the 1D grid (unbounded). */
  position: number;
  statusEffects: StatusEffect[];
  /** Track consecutive punches received for stun calculation */
  consecutivePunchesReceived: number;
  /** Track skill usage counts: skillId -> uses remaining */
  skillUsesRemaining: Record<string, number>;
  /** Whether this hero is alive */
  alive: boolean;
  /** Wind Walk specific: remaining invisible rounds */
  invisibleRounds: number;
}

export interface MinionState {
  minionId: string;
  ownerId: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Absolute position on the 1D grid (unbounded). */
  position: number;
  /** Minion type for determining abilities */
  type: string;
  /** Track consecutive punches dealt by this minion */
  consecutivePunchesDealt: number;
}

export interface TeamState {
  teamIndex: number;
  players: PlayerState[];
}

export interface PlayerState {
  id: string;
  name: string;
  hero: HeroState;
  minions: MinionState[];
  /** Whether the player is connected */
  connected: boolean;
}

export interface RPSResult {
  choices: Record<string, RPSChoice>;
  winners: string[];
  losers: string[];
  /** In case of draw, both re-submit */
  draw: boolean;
}

export interface TurnRecord {
  turnNumber: number;
  rpsResult: RPSResult;
  actions: PlayerAction[];
  effects: GameEffect[];
}

export interface GameEffect {
  type: 'damage' | 'heal' | 'status_apply' | 'status_remove' | 'move' | 'summon' | 'death';
  sourceId: string;
  targetId: string;
  value?: number;
  damageType?: DamageType;
  statusEffect?: StatusEffectType;
  description: string;
}

export interface GameState {
  id: string;
  mode: '1v1' | '2v2' | '3v3';
  phase: GamePhase;
  turn: number;
  teams: [TeamState, TeamState];
  /** Snapshot of hero positions at turn start (playerId → position), for passives like Nan's stink */
  positionsAtTurnStart: Record<string, number>;
  /** Pending RPS choices for current round */
  pendingRPS: Record<string, RPSChoice | null>;
  /** Action order for current turn (player IDs) */
  actionOrder: string[];
  /** Current action index in the order */
  currentActionIndex: number;
  /** When true, the current player still needs to submit a minion action before advancing. */
  awaitingMinionAction: boolean;
  /** History of all turns */
  history: TurnRecord[];
  /** Winner team index, null if game ongoing */
  winner: number | null;
  /** Players immune to stun this turn (were stunned at turn start, prevents re-stun loop) */
  stunImmuneThisTurn: string[];
}
