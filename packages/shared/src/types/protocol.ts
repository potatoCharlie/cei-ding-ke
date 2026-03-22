import type { RPSChoice, GameState, GameEffect, PlayerAction } from './game.js';

// ─── Client -> Server ───

export interface ClientEvents {
  'player:ready': () => void;
  'hero:select': (data: { heroId: string }) => void;
  'rps:submit': (data: { choice: RPSChoice }) => void;
  'action:submit': (data: PlayerAction) => void;
  'order:yield': (data: { toPlayerId: string }) => void;
}

// ─── Server -> Client ───

export interface GamePhaseData {
  phase: GameState['phase'];
  turn: number;
  actionOrder?: string[];
  currentActionIndex?: number;
}

export interface RPSResultData {
  choices: Record<string, RPSChoice>;
  winners: string[];
  losers: string[];
  draw: boolean;
}

export interface ActionResultData {
  playerId: string;
  action: PlayerAction;
  effects: GameEffect[];
}

export interface GameEndData {
  winnerTeam: number;
  stats: Record<string, PlayerStats>;
}

export interface PlayerStats {
  damageDealt: number;
  damageTaken: number;
  skillsUsed: number;
  rpsWins: number;
}

export interface ServerEvents {
  'game:state': (state: GameState) => void;
  'game:phase': (data: GamePhaseData) => void;
  'rps:result': (data: RPSResultData) => void;
  'rps:waiting': (data: { submitted: string[] }) => void;
  'action:result': (data: ActionResultData) => void;
  'action:request': (data: { playerId: string; timeLimit: number }) => void;
  'turn:end': (data: { turnNumber: number }) => void;
  'game:end': (data: GameEndData) => void;
  'timer:tick': (data: { phase: string; remaining: number }) => void;
  'error': (data: { message: string }) => void;
  'player:joined': (data: { playerId: string; name: string }) => void;
  'player:left': (data: { playerId: string }) => void;
}
