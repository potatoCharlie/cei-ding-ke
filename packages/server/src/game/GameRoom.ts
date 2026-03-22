import { v4 as uuid } from 'uuid';
import type { Server, Socket } from 'socket.io';
import {
  createGameState, submitRPS, resolveRPSRound, executeAction, getAvailableActions, startTurn,
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
}

export class GameRoom {
  readonly id: string;
  private players: Map<string, RoomPlayer> = new Map();
  private state: GameState | null = null;
  private io: Server;
  private rpsTimer: ReturnType<typeof setTimeout> | null = null;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(io: Server) {
    this.id = uuid().slice(0, 8);
    this.io = io;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= 2;
  }

  get gameState(): GameState | null {
    return this.state;
  }

  hasPlayer(socketId: string): boolean {
    return this.players.has(socketId);
  }

  addPlayer(socket: Socket, name: string): boolean {
    if (this.isFull) return false;

    const player: RoomPlayer = {
      id: socket.id,
      name,
      heroId: '',
      socket,
      ready: false,
    };

    this.players.set(socket.id, player);
    socket.join(this.id);

    // Notify others
    this.io.to(this.id).emit('player:joined', { playerId: socket.id, name });

    return true;
  }

  removePlayer(socketId: string): void {
    this.players.delete(socketId);
    this.io.to(this.id).emit('player:left', { playerId: socketId });

    // If game is in progress, forfeit
    if (this.state && this.state.winner === null) {
      const remainingPlayers = Array.from(this.players.keys());
      if (remainingPlayers.length > 0) {
        // Find which team the remaining player is on
        for (let i = 0; i < this.state.teams.length; i++) {
          if (this.state.teams[i].players.some(p => remainingPlayers.includes(p.id))) {
            this.state.winner = i;
            this.state.phase = 'game_over';
            this.io.to(this.id).emit('game:end', {
              winnerTeam: i,
              stats: {},
            });
            break;
          }
        }
      }
    }
  }

  selectHero(socketId: string, heroId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;
    player.heroId = heroId;
    player.ready = true;

    // Check if all players are ready
    const allReady = Array.from(this.players.values()).every(p => p.ready && p.heroId);
    if (allReady && this.players.size === 2) {
      this.startGame();
    }
  }

  private startGame(): void {
    const playerList = Array.from(this.players.values());

    this.state = createGameState(
      this.id,
      { id: playerList[0].id, name: playerList[0].name, heroId: playerList[0].heroId },
      { id: playerList[1].id, name: playerList[1].name, heroId: playerList[1].heroId },
    );

    // Send full state to all players
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

    // Check if any player is stunned BEFORE ticking effects.
    // Stun applied last turn has remainingRounds=1; ticking would remove it
    // before we get a chance to detect it. So snapshot stun status first.
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
    this.io.to(this.id).emit('rps:waiting', { submitted });

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

    // If we're back to rps_submit, start new round
    if (currentPhase === 'rps_submit') {
      this.beginRPSPhase();
    } else if (currentPhase === 'action_phase') {
      // Next player's action
      this.requestAction();
    }
  }

  // ─── Timers ───

  private startRPSTimer(): void {
    this.rpsTimer = setTimeout(() => {
      if (!this.state || this.state.phase !== 'rps_submit') return;

      // Auto-submit for players who haven't submitted
      for (const player of this.players.values()) {
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
