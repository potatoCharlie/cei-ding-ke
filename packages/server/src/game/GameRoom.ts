import { v4 as uuid } from 'uuid';
import type { Server, Socket } from 'socket.io';
import {
  createGameState, submitRPS, resolveRPSRound, executeAction, getAvailableActions, startTurn, endTurn,
  isStunned,
  RPS_TIMER, ACTION_TIMER,
  type GameState, type RPSChoice, type PlayerAction, type RPSResult, type GameEffect,
} from '@cei-ding-ke/shared';

interface RoomPlayer {
  id: string;
  name: string;
  heroId: string;
  socket: Socket;
  ready: boolean;
  teamIndex: number;
}

export class GameRoom {
  readonly id: string;
  private players: Map<string, RoomPlayer> = new Map();
  private state: GameState | null = null;
  private io: Server;
  private rpsTimer: ReturnType<typeof setTimeout> | null = null;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private mode: '1v1' | '2v2';
  private maxPlayers: number;

  constructor(io: Server, mode: '1v1' | '2v2' = '1v1') {
    this.id = uuid().slice(0, 8);
    this.io = io;
    this.mode = mode;
    this.maxPlayers = mode === '2v2' ? 4 : 2;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  get gameState(): GameState | null {
    return this.state;
  }

  get gameMode(): '1v1' | '2v2' {
    return this.mode;
  }

  hasPlayer(socketId: string): boolean {
    return this.players.has(socketId);
  }

  addPlayer(socket: Socket, name: string): boolean {
    if (this.isFull) return false;

    // Alternating team assignment by join order: 0→team0, 1→team1, 2→team0, 3→team1
    const joinIndex = this.players.size;
    const teamIndex = joinIndex % 2;

    const player: RoomPlayer = {
      id: socket.id,
      name,
      heroId: '',
      socket,
      ready: false,
      teamIndex,
    };

    this.players.set(socket.id, player);
    socket.join(this.id);

    this.io.to(this.id).emit('player:joined', { playerId: socket.id, name });
    this.emitLobbyUpdate();

    return true;
  }

  removePlayer(socketId: string): void {
    const leavingPlayer = this.players.get(socketId);
    this.players.delete(socketId);
    this.io.to(this.id).emit('player:left', { playerId: socketId });

    const remainingPlayers = Array.from(this.players.keys());
    if (this.state && this.state.winner === null && leavingPlayer !== undefined && remainingPlayers.length > 0) {
      // The leaving player's team forfeits — the other team wins
      const winningTeam = leavingPlayer.teamIndex === 0 ? 1 : 0;
      this.state.winner = winningTeam;
      this.state.phase = 'game_over';
      this.io.to(this.id).emit('game:end', {
        winnerTeam: winningTeam,
        stats: {},
      });
    }
  }

  selectHero(socketId: string, heroId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;

    // Check for duplicate hero across all current selections
    for (const [id, p] of this.players) {
      if (id !== socketId && p.heroId === heroId) {
        player.socket.emit('error', { message: `${heroId} is already taken by another player` });
        return;
      }
    }

    player.heroId = heroId;
    player.ready = true;
    this.emitLobbyUpdate();

    const allReady = Array.from(this.players.values()).every(p => p.ready && p.heroId);
    if (allReady && this.players.size === this.maxPlayers) {
      this.startGame();
    }
  }

  private startGame(): void {
    const playerInputs = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      heroId: p.heroId,
      teamIndex: p.teamIndex,
    }));

    this.state = createGameState(this.id, this.mode, playerInputs);

    this.io.to(this.id).emit('game:state', this.state);
    this.beginRPSPhase();
  }

  /**
   * Begin the RPS phase for the current turn.
   * Ticks status effects from the previous turn, then checks if any player is stunned
   * and auto-resolves RPS if so (stunned player skips, other player acts automatically).
   */
  private beginRPSPhase(): void {
    if (!this.state) return;

    // Snapshot stun status BEFORE ticking so 1-round stuns cause the player
    // to miss this RPS round. Ticking afterward removes the stun so they're
    // free next turn. Infinite stun-lock from re-stunning is prevented in
    // applyEffects (stun-break suppresses same-action re-stun).
    const allPlayers = this.state.teams.flatMap(t => t.players).filter(p => p.hero.alive);
    const stunnedPlayers = allPlayers.filter(p => isStunned(p.hero));
    const nonStunnedPlayers = allPlayers.filter(p => !isStunned(p.hero));

    // Now tick status effects (decrements durations, applies Frozen DoT, etc.)
    if (this.state.turn > 1) {
      const tickEffects = startTurn(this.state);
      if (tickEffects.length > 0) {
        this.io.to(this.id).emit('game:state', this.state);
      }

      // Check if game ended from DoT
      if ((this.state.phase as string) === 'game_over') {
        this.io.to(this.id).emit('game:end', {
          winnerTeam: this.state.winner!,
          stats: {},
        });
        return;
      }
    }

    // Clear stun immunity from previous turn, then mark currently stunned
    // players as immune so they can't be re-stunned this same turn.
    this.state.stunImmuneThisTurn = stunnedPlayers.map(p => p.id);

    if (stunnedPlayers.length > 0 && nonStunnedPlayers.length === 0) {
      // All alive players are stunned — apply end-of-turn passives, then start next turn
      endTurn(this.state);
      this.io.to(this.id).emit('game:state', this.state);
      if ((this.state.phase as string) === 'game_over') {
        this.io.to(this.id).emit('game:end', { winnerTeam: this.state.winner!, stats: {} });
        return;
      }
      this.beginRPSPhase();
      return;
    }

    if (stunnedPlayers.length > 0 && nonStunnedPlayers.length > 0) {
      // Auto-resolve: non-stunned player gets to act without RPS
      this.state.phase = 'action_phase';
      this.state.actionOrder = nonStunnedPlayers.map(p => p.id);
      this.state.currentActionIndex = 0;

      this.io.to(this.id).emit('rps:result', {
        choices: {},
        winners: nonStunnedPlayers.map(p => p.id),
        losers: stunnedPlayers.map(p => p.id),
        draw: false,
      });

      this.io.to(this.id).emit('game:phase', {
        phase: 'action_phase',
        turn: this.state.turn,
        actionOrder: this.state.actionOrder,
        currentActionIndex: 0,
      });

      this.io.to(this.id).emit('game:state', this.state);
      this.requestAction();
      return;
    }

    // Normal RPS phase
    this.io.to(this.id).emit('game:phase', {
      phase: 'rps_submit',
      turn: this.state.turn,
    });
    this.startRPSTimer();
  }

  handleRPSSubmit(socketId: string, choice: RPSChoice): void {
    if (!this.state || this.state.phase !== 'rps_submit') return;

    const allSubmitted = submitRPS(this.state, socketId, choice);

    // Notify others that this player submitted (without revealing choice)
    const submitted = Object.keys(this.state.pendingRPS).filter(
      id => this.state!.pendingRPS[id] != null,
    );

    const total = this.state.teams
      .flatMap(t => t.players)
      .filter(p => p.hero.alive && !isStunned(p.hero))
      .length;

    this.io.to(this.id).emit('rps:waiting', { submitted, total });

    if (allSubmitted) {
      this.clearTimers();
      this.resolveRPS();
    }
  }

  private resolveRPS(): void {
    if (!this.state) return;

    const result = resolveRPSRound(this.state);

    this.io.to(this.id).emit('rps:result', {
      choices: result.choices,
      winners: result.winners,
      losers: result.losers,
      draw: result.draw,
    });

    if (result.draw) {
      // Re-do RPS
      this.io.to(this.id).emit('game:phase', {
        phase: 'rps_submit',
        turn: this.state.turn,
      });
      this.startRPSTimer();
    } else {
      // Action phase
      this.io.to(this.id).emit('game:phase', {
        phase: 'action_phase',
        turn: this.state.turn,
        actionOrder: this.state.actionOrder,
        currentActionIndex: 0,
      });

      this.requestAction();
    }
  }

  private requestAction(): void {
    if (!this.state || this.state.phase !== 'action_phase') return;

    const currentPlayerId = this.state.actionOrder[this.state.currentActionIndex];
    if (!currentPlayerId) return;

    // Send available actions to the current player
    const availableActions = getAvailableActions(this.state, currentPlayerId);

    this.io.to(this.id).emit('action:request', {
      playerId: currentPlayerId,
      timeLimit: ACTION_TIMER,
    });

    // Send available actions only to the acting player
    const player = this.players.get(currentPlayerId);
    if (player) {
      player.socket.emit('available:actions', availableActions);
    }

    this.startActionTimer(currentPlayerId);
  }

  handleActionSubmit(socketId: string, action: PlayerAction): void {
    if (!this.state || this.state.phase !== 'action_phase') return;

    const currentPlayerId = this.state.actionOrder[this.state.currentActionIndex];
    if (socketId !== currentPlayerId) return;

    this.clearTimers();

    const effects = executeAction(this.state, action);

    this.io.to(this.id).emit('action:result', {
      playerId: socketId,
      action,
      effects,
    });

    const currentPhase = this.state.phase as string;

    // Check if game is over
    if (currentPhase === 'game_over') {
      this.io.to(this.id).emit('game:end', {
        winnerTeam: this.state.winner!,
        stats: {},
      });
      return;
    }

    // Send updated state
    this.io.to(this.id).emit('game:state', this.state);

    // If awaiting minion action, request another action from the same player
    if (this.state.awaitingMinionAction) {
      this.requestAction();
      return;
    }

    // If we're back to rps_submit, start new round
    if (currentPhase === 'rps_submit') {
      this.beginRPSPhase();
    } else if (currentPhase === 'action_phase') {
      // Next player's action
      this.requestAction();
    }
  }

  private emitLobbyUpdate(): void {
    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      heroId: p.heroId,
      teamIndex: p.teamIndex,
      ready: p.ready,
    }));
    this.io.to(this.id).emit('lobby:update', { mode: this.mode, players });
  }

  // ─── Timers ───

  private startRPSTimer(): void {
    this.rpsTimer = setTimeout(() => {
      if (!this.state || this.state.phase !== 'rps_submit') return;

      // Only auto-submit for alive non-stunned players
      const alivePlayers = this.state.teams
        .flatMap(t => t.players)
        .filter(p => p.hero.alive && !isStunned(p.hero));

      for (const player of alivePlayers) {
        if (this.state.pendingRPS[player.id] == null) {
          submitRPS(this.state, player.id, ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)] as RPSChoice);
        }
      }

      this.resolveRPS();
    }, RPS_TIMER * 1000);
  }

  private startActionTimer(playerId: string): void {
    this.actionTimer = setTimeout(() => {
      if (!this.state || this.state.phase !== 'action_phase') return;

      // Auto-skip: move forward as default action
      const defaultAction: PlayerAction = {
        type: 'move_forward',
        playerId,
      };

      this.handleActionSubmit(playerId, defaultAction);
    }, ACTION_TIMER * 1000);
  }

  private clearTimers(): void {
    if (this.rpsTimer) {
      clearTimeout(this.rpsTimer);
      this.rpsTimer = null;
    }
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }

  destroy(): void {
    this.clearTimers();
  }
}
