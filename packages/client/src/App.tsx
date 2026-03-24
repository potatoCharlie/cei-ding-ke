import React, { useState, useEffect, useCallback, useRef } from 'react';
import { socket, connectSocket } from './network/socket.js';
import type { GameState, RPSChoice, PlayerAction, GameEffect } from '@cei-ding-ke/shared';
import { getAllHeroes, RPS_TIMER, ACTION_TIMER } from '@cei-ding-ke/shared';
import { HeroSelect } from './components/HeroSelect.js';
import { RPSPicker } from './components/RPSPicker.js';
import { ActionPanel } from './components/ActionPanel.js';
import { GameLog } from './components/GameLog.js';
import { BattleScene, type FloatingNumber } from './scenes/BattleScene.js';
import { AnimationManager } from './game/AnimationManager.js';
import type { BattleAnimation } from './game/AnimationTypes.js';
import { TimerRope } from './components/TimerRope.js';

type Screen = 'menu' | 'lobby' | 'hero_select' | 'battle' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [mode, setMode] = useState<'1v1' | '2v2'>('1v1');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [rpsResult, setRpsResult] = useState<{ choices: Record<string, RPSChoice>; winners: string[]; losers: string[]; draw: boolean } | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [availableActions, setAvailableActions] = useState<PlayerAction[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedHero, setSelectedHero] = useState('');
  const [error, setError] = useState('');
  const [gameOverWinner, setGameOverWinner] = useState<number | null>(null);

  // Animation state
  const [activeAnimations, setActiveAnimations] = useState<BattleAnimation[]>([]);
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([]);

  // Timer state
  const [timerTotal, setTimerTotal] = useState(0);
  const [timerStart, setTimerStart] = useState(0);

  const animManagerRef = useRef<AnimationManager | null>(null);

  // Initialize animation manager
  useEffect(() => {
    animManagerRef.current = new AnimationManager(
      setActiveAnimations,
      setFloatingNumbers,
      () => { /* queue done callback */ },
    );
    return () => { animManagerRef.current?.clear(); };
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-50), msg]);
  }, []);

  useEffect(() => {
    socket.on('game:state', (state: GameState) => {
      setGameState(state);
      setScreen('battle');
    });

    socket.on('game:phase', (data) => {
      addLog(`Phase: ${data.phase} (Turn ${data.turn})`);
      setGameState(prev => prev ? { ...prev, phase: data.phase, turn: data.turn } : prev);
      if (data.phase === 'rps_submit') {
        setRpsResult(prev => (prev?.draw ? prev : null));
        setIsMyTurn(false);
        setTimerTotal(RPS_TIMER);
        setTimerStart(Date.now());
      }
    });

    socket.on('rps:result', (data) => {
      setRpsResult(data);
      setTimerTotal(0);
      const myChoice = data.choices[socket.id!];
      const won = data.winners.includes(socket.id!);
      if (data.draw) {
        addLog(`RPS: You chose ${myChoice}. Draw! Go again.`);
      } else if (won) {
        addLog(`RPS: You chose ${myChoice}. You win this round!`);
      } else {
        addLog(`RPS: ${myChoice ? `You chose ${myChoice}. ` : ''}You lose this round.`);
      }
    });

    socket.on('rps:waiting', (data) => {
      addLog(`Waiting for RPS... (${data.submitted.length}/2 submitted)`);
    });

    socket.on('action:request', (data) => {
      if (data.playerId === socket.id) {
        setIsMyTurn(true);
        setTimerTotal(ACTION_TIMER);
        setTimerStart(Date.now());
        addLog('Your turn to act!');
      } else {
        setIsMyTurn(false);
        addLog('Opponent is choosing their action...');
      }
    });

    socket.on('available:actions', (actions: PlayerAction[]) => {
      setAvailableActions(actions);
    });

    socket.on('action:result', (data) => {
      const isMe = data.playerId === socket.id;
      const who = isMe ? 'You' : 'Opponent';
      addLog(`${who}: ${formatAction(data.action)}`);
      for (const effect of data.effects) {
        addLog(`  → ${effect.description}`);
      }
      setIsMyTurn(false);
      setTimerTotal(0);

      // Enqueue animations
      if (animManagerRef.current && data.effects.length > 0) {
        animManagerRef.current.enqueueEffects(data.effects, data.action.type);
      }
    });

    socket.on('turn:end', (data) => {
      addLog(`--- Turn ${data.turnNumber} ended ---`);
    });

    socket.on('game:end', (data) => {
      setGameOverWinner(data.winnerTeam);
      setScreen('result');
      addLog(`Game Over! Team ${data.winnerTeam + 1} wins!`);
    });

    socket.on('player:joined', (data) => {
      addLog(`${data.name} joined the room`);
    });

    socket.on('player:left', (data) => {
      addLog(`Player ${data.playerId} left`);
    });

    socket.on('error', (data) => {
      setError(data.message);
      addLog(`Error: ${data.message}`);
    });

    return () => {
      socket.off('game:state');
      socket.off('game:phase');
      socket.off('rps:result');
      socket.off('rps:waiting');
      socket.off('action:request');
      socket.off('available:actions');
      socket.off('action:result');
      socket.off('turn:end');
      socket.off('game:end');
      socket.off('player:joined');
      socket.off('player:left');
      socket.off('error');
    };
  }, [addLog]);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) { setError('Enter your name'); return; }
    try {
      await connectSocket();
      socket.emit('room:create', { name: playerName, mode }, (res: { roomId: string; mode: '1v1' | '2v2' }) => {
        setRoomId(res.roomId);
        setScreen('hero_select');
        addLog(`Room created: ${res.roomId} (${mode})`);
      });
    } catch {
      setError('Failed to connect to server');
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim() || !joinRoomId.trim()) { setError('Enter name and room ID'); return; }
    try {
      await connectSocket();
      socket.emit('room:join', { roomId: joinRoomId, name: playerName }, (res: { roomId?: string; error?: string }) => {
        if (res.error) { setError(res.error); return; }
        setRoomId(res.roomId!);
        setScreen('hero_select');
        addLog(`Joined room: ${res.roomId}`);
      });
    } catch {
      setError('Failed to connect to server');
    }
  };

  const handleQuickMatch = async () => {
    if (!playerName.trim() || !selectedHero) { setError('Enter name and select a hero'); return; }
    try {
      await connectSocket();
      socket.emit('room:quickmatch', { name: playerName, heroId: selectedHero, mode }, (res: { roomId: string }) => {
        setRoomId(res.roomId);
        setScreen('battle');
        addLog(`Quick match! Room: ${res.roomId}`);
      });
    } catch {
      setError('Failed to connect to server');
    }
  };

  const handleHeroSelect = (heroId: string) => {
    setSelectedHero(heroId);
    socket.emit('hero:select', { heroId });
    addLog(`Selected hero: ${heroId}. Waiting for opponent...`);
    setScreen('lobby');
  };

  const handleRPSChoice = (choice: RPSChoice) => {
    socket.emit('rps:submit', { choice });
    setRpsResult(null);
    addLog(`You chose: ${choice}`);
  };

  const handleAction = (action: PlayerAction) => {
    socket.emit('action:submit', action);
    setIsMyTurn(false);
  };

  // ─── MENU ───
  if (screen === 'menu') {
    return (
      <div className="app-container">
        <div className="menu-screen">
          <div className="menu-header">
            <h1 className="game-title">Cei Ding Ke</h1>
            <p className="game-subtitle">Rock Paper Scissors Battle Arena</p>
            <div className="title-decoration" />
          </div>

          <div className="menu-card">
            <div className="card-header">Enter the Arena</div>
            <input
              className="game-input"
              placeholder="Your battle name..."
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
            />

            <div className="mode-toggle">
              <button
                className={`mode-btn ${mode === '1v1' ? 'active' : ''}`}
                onClick={() => setMode('1v1')}
              >
                1v1
              </button>
              <button
                className={`mode-btn ${mode === '2v2' ? 'active' : ''}`}
                onClick={() => setMode('2v2')}
              >
                2v2
              </button>
            </div>
            <button className="game-btn game-btn-primary" onClick={handleCreateRoom}>
              Create Room ({mode})
            </button>

            <div className="divider">
              <span>or join existing</span>
            </div>

            <div className="join-row">
              <input
                className="game-input"
                placeholder="Room ID"
                value={joinRoomId}
                onChange={e => setJoinRoomId(e.target.value)}
                style={{ marginBottom: 0 }}
              />
              <button className="game-btn game-btn-secondary" onClick={handleJoinRoom}>
                Join
              </button>
            </div>
          </div>

          <div className="menu-card">
            <div className="card-header">Quick Match</div>
            <p className="card-hint">Select a hero and find an opponent</p>
            <div className="hero-mini-grid">
              {getAllHeroes().map(hero => (
                <button
                  key={hero.id}
                  className={`hero-mini-btn ${selectedHero === hero.id ? 'selected' : ''}`}
                  onClick={() => setSelectedHero(hero.id)}
                >
                  <strong>{hero.name}</strong>
                  <span className="hero-mini-desc">{hero.description.slice(0, 40)}...</span>
                </button>
              ))}
            </div>
            <button
              className="game-btn game-btn-gold"
              onClick={handleQuickMatch}
              disabled={!selectedHero || !playerName}
            >
              Find Match ({mode})
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </div>

        <style>{menuStyles}</style>
      </div>
    );
  }

  // ─── HERO SELECT ───
  if (screen === 'hero_select') {
    return (
      <div className="app-container">
        <div className="screen-header">
          <h2 className="screen-title">Choose Your Champion</h2>
          <p className="screen-subtitle">Room: <span className="room-id">{roomId}</span></p>
        </div>
        <HeroSelect onSelect={handleHeroSelect} />
        <style>{menuStyles}</style>
      </div>
    );
  }

  // ─── LOBBY ───
  if (screen === 'lobby') {
    return (
      <div className="app-container">
        <div className="lobby-screen">
          <div className="lobby-icon">
            <div className="lobby-spinner" />
          </div>
          <h2 className="screen-title">Awaiting Challenger</h2>
          <div className="room-display">
            <span className="room-label">Room Code</span>
            <span className="room-code">{roomId}</span>
          </div>
          <p className="lobby-hint">Share this code with your opponent</p>
          <p className="lobby-hero">Playing as <strong>{selectedHero}</strong></p>
        </div>
        <GameLog logs={logs} />
        <style>{menuStyles}</style>
      </div>
    );
  }

  // ─── RESULT ───
  if (screen === 'result') {
    const myTeamIndex = gameState?.teams.findIndex(t =>
      t.players.some(p => p.id === socket.id),
    );
    const won = gameOverWinner === myTeamIndex;

    return (
      <div className="app-container">
        <div className="result-screen">
          <div className={`result-banner ${won ? 'victory' : 'defeat'}`}>
            <h1 className="result-text">{won ? 'VICTORY' : 'DEFEAT'}</h1>
            <div className="result-glow" />
          </div>
          <button className="game-btn game-btn-primary" onClick={() => { setScreen('menu'); socket.disconnect(); }}>
            Return to Menu
          </button>
        </div>
        <GameLog logs={logs} />
        <style>{menuStyles}</style>
      </div>
    );
  }

  // ─── BATTLE ───
  if (!gameState) {
    return (
      <div className="app-container">
        <div className="lobby-screen">
          <div className="lobby-spinner" />
          <p className="screen-subtitle">Waiting for game to start...</p>
        </div>
        <GameLog logs={logs} />
        <style>{menuStyles}</style>
      </div>
    );
  }

  const phase = gameState.phase as string;

  return (
    <div className="app-container">
      <BattleScene
        gameState={gameState}
        myPlayerId={socket.id!}
        activeAnimations={activeAnimations}
        floatingNumbers={floatingNumbers}
      />

      {timerTotal > 0 && (
        <TimerRope totalSeconds={timerTotal} startTime={timerStart} />
      )}

      {phase === 'rps_submit' && !rpsResult && (
        <RPSPicker onChoice={handleRPSChoice} />
      )}

      {rpsResult && !rpsResult.draw && (
        <RPSResultBanner result={rpsResult} myId={socket.id!} />
      )}

      {rpsResult && rpsResult.draw && (
        <div className="rps-draw-wrapper">
          <RPSDrawBanner choices={rpsResult.choices} myId={socket.id!} />
          <RPSPicker onChoice={handleRPSChoice} />
        </div>
      )}

      {phase === 'action_phase' && isMyTurn && (
        <ActionPanel
          actions={availableActions}
          gameState={gameState}
          playerId={socket.id!}
          onAction={handleAction}
        />
      )}

      {phase === 'action_phase' && !isMyTurn && (
        <div className="waiting-banner">
          Waiting for opponent's action...
        </div>
      )}

      <GameLog logs={logs} />

      <style>{menuStyles}</style>
    </div>
  );
}

const RPS_EMOJI: Record<string, string> = { rock: '✊', paper: '✋', scissors: '✌️' };

function RPSDrawBanner({ choices, myId }: { choices: Record<string, RPSChoice>; myId: string }) {
  const myChoice = choices[myId];
  const oppChoice = Object.entries(choices).find(([id]) => id !== myId)?.[1];
  return (
    <div className="rps-draw-banner">
      <div className="rps-draw-emojis">
        {myChoice && RPS_EMOJI[myChoice]} vs {oppChoice && RPS_EMOJI[oppChoice]}
      </div>
      <div className="rps-draw-text">Draw! Pick again</div>
    </div>
  );
}

function RPSResultBanner({ result, myId }: { result: { winners: string[]; losers: string[]; draw: boolean }; myId: string }) {
  const won = result.winners.includes(myId);
  return (
    <div className={`rps-result-banner ${won ? 'won' : 'lost'}`}>
      {won ? 'You won RPS! Choose your action.' : 'Opponent won RPS.'}
    </div>
  );
}

function formatAction(action: PlayerAction): string {
  switch (action.type) {
    case 'move_forward': return 'moves forward';
    case 'move_backward': return 'moves backward';
    case 'punch': return 'throws a punch!';
    case 'skill': return `uses skill: ${action.skillId}`;
    case 'summon': return 'summons a minion!';
    default: return action.type;
  }
}

const menuStyles = `
  .app-container {
    max-width: 620px;
    margin: 0 auto;
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100vh;
    animation: fadeIn 0.4s ease-out;
  }

  .menu-screen {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 24px;
  }

  .menu-header {
    text-align: center;
    margin-bottom: 8px;
  }

  .game-title {
    font-family: var(--font-display);
    font-size: 32px;
    color: var(--gold);
    text-shadow: 0 0 30px #f59e0b40, 0 2px 0 #b4530980;
    letter-spacing: 2px;
    margin-bottom: 8px;
  }

  .game-subtitle {
    font-size: 14px;
    color: var(--text-dim);
    letter-spacing: 3px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .title-decoration {
    width: 80px;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--gold), transparent);
    margin: 12px auto 0;
  }

  .menu-card {
    background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
    border-radius: 14px;
    padding: 22px;
    border: 1px solid var(--border-base);
    box-shadow: 0 4px 24px #00000040;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .card-header {
    font-family: var(--font-display);
    font-size: 13px;
    color: var(--gold-light);
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .card-hint {
    font-size: 13px;
    color: var(--text-dim);
    margin-bottom: 4px;
  }

  .game-input {
    width: 100%;
    padding: 12px 16px;
    border-radius: 10px;
    border: 2px solid var(--border-base);
    background: var(--bg-deep);
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 500;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    margin-bottom: 8px;
  }

  .game-input:focus {
    border-color: var(--gold-dim);
    box-shadow: 0 0 0 3px #f59e0b15;
  }

  .game-input::placeholder {
    color: var(--text-dim);
    font-weight: 400;
  }

  .game-btn {
    padding: 12px 24px;
    border-radius: 10px;
    border: 2px solid transparent;
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .game-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px #00000040;
  }

  .game-btn:active {
    transform: translateY(0);
  }

  .game-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .game-btn-primary {
    background: linear-gradient(180deg, #3b82f6, #2563eb);
    color: white;
    border-color: #3b82f680;
    box-shadow: 0 2px 12px #3b82f630;
  }

  .game-btn-primary:hover {
    background: linear-gradient(180deg, #60a5fa, #3b82f6);
    box-shadow: 0 4px 20px #3b82f650;
  }

  .game-btn-secondary {
    background: var(--bg-surface);
    color: var(--text-primary);
    border-color: var(--border-base);
    padding: 12px 20px;
    white-space: nowrap;
  }

  .game-btn-secondary:hover {
    border-color: var(--border-bright);
    background: var(--bg-elevated);
  }

  .game-btn-gold {
    background: linear-gradient(180deg, var(--gold), var(--gold-dim));
    color: #1a1a2e;
    border-color: var(--gold);
    box-shadow: 0 2px 12px #f59e0b30;
  }

  .game-btn-gold:hover {
    background: linear-gradient(180deg, var(--gold-light), var(--gold));
    box-shadow: 0 4px 20px #f59e0b50;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text-dim);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-dim);
  }

  .join-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .join-row .game-input {
    flex: 1;
  }

  .hero-mini-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 4px;
  }

  .hero-mini-btn {
    padding: 14px;
    border-radius: 10px;
    border: 2px solid var(--border-dim);
    background: var(--bg-card);
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    font-family: var(--font-body);
    transition: all 0.2s;
  }

  .hero-mini-btn:hover {
    border-color: var(--border-bright);
    background: var(--bg-elevated);
  }

  .hero-mini-btn.selected {
    border-color: var(--gold);
    background: linear-gradient(180deg, #f59e0b10, #f59e0b05);
    box-shadow: 0 0 12px #f59e0b20;
  }

  .hero-mini-btn strong {
    color: var(--gold-light);
    font-size: 14px;
  }

  .hero-mini-desc {
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.3;
  }

  .error-banner {
    padding: 10px 16px;
    border-radius: 8px;
    background: #7f1d1d20;
    border: 1px solid #ef444440;
    color: var(--team-red-light);
    font-size: 13px;
    font-weight: 500;
  }

  /* ─── Screen Header ─── */
  .screen-header {
    text-align: center;
    padding: 16px 0;
  }

  .screen-title {
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--gold);
    margin-bottom: 6px;
    text-shadow: 0 0 20px #f59e0b30;
  }

  .screen-subtitle {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .room-id {
    font-family: var(--font-display);
    color: var(--cyan);
    font-size: 13px;
  }

  /* ─── Lobby ─── */
  .lobby-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 0 24px;
    text-align: center;
  }

  .lobby-icon {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
  }

  .lobby-spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--border-dim);
    border-top: 3px solid var(--gold);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .room-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px 32px;
    background: var(--bg-surface);
    border: 1px solid var(--border-base);
    border-radius: 12px;
  }

  .room-label {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 2px;
  }

  .room-code {
    font-family: var(--font-display);
    font-size: 20px;
    color: var(--cyan);
    text-shadow: 0 0 12px #06b6d430;
    letter-spacing: 3px;
  }

  .lobby-hint {
    font-size: 13px;
    color: var(--text-dim);
  }

  .lobby-hero {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .lobby-hero strong {
    color: var(--gold-light);
    font-family: var(--font-display);
    font-size: 12px;
  }

  /* ─── Result Screen ─── */
  .result-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 64px 0 32px;
  }

  .result-banner {
    position: relative;
    text-align: center;
    padding: 24px 48px;
  }

  .result-text {
    font-family: var(--font-display);
    font-size: 36px;
    letter-spacing: 6px;
    position: relative;
    z-index: 1;
  }

  .result-banner.victory .result-text {
    color: #4ade80;
    text-shadow: 0 0 40px #4ade8060, 0 0 80px #4ade8030;
  }

  .result-banner.defeat .result-text {
    color: #f87171;
    text-shadow: 0 0 40px #f8717160, 0 0 80px #f8717130;
  }

  .result-glow {
    position: absolute;
    inset: -20px;
    border-radius: 50%;
    z-index: 0;
    animation: pulseGlow 2s ease-in-out infinite;
  }

  .result-banner.victory .result-glow {
    background: radial-gradient(ellipse, #4ade8020, transparent 70%);
  }

  .result-banner.defeat .result-glow {
    background: radial-gradient(ellipse, #f8717120, transparent 70%);
  }

  /* ─── RPS Banners ─── */
  .rps-draw-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .rps-draw-banner {
    text-align: center;
    padding: 12px 16px;
    border-radius: 12px;
    background: linear-gradient(180deg, #f59e0b10, #f59e0b05);
    border: 1px solid #fbbf2430;
  }

  .rps-draw-emojis {
    font-size: 30px;
    margin-bottom: 4px;
  }

  .rps-draw-text {
    font-family: var(--font-display);
    color: var(--gold);
    font-size: 11px;
    letter-spacing: 1px;
  }

  .rps-result-banner {
    text-align: center;
    padding: 10px 16px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.5px;
  }

  .rps-result-banner.won {
    background: linear-gradient(180deg, #16532520, #16532510);
    border: 1px solid #22c55e40;
    color: #4ade80;
  }

  .rps-result-banner.lost {
    background: linear-gradient(180deg, #7f1d1d20, #7f1d1d10);
    border: 1px solid #ef444440;
    color: #f87171;
  }

  /* ─── Waiting Banner ─── */
  .waiting-banner {
    text-align: center;
    padding: 16px;
    color: var(--text-dim);
    font-style: italic;
    font-size: 14px;
  }

  /* ─── Mode Toggle ─── */
  .mode-toggle {
    display: flex;
    gap: 8px;
  }

  .mode-btn {
    flex: 1;
    padding: 10px;
    border-radius: 8px;
    border: 2px solid var(--border-dim);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-family: var(--font-display);
    font-size: 13px;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .mode-btn:hover {
    border-color: var(--border-bright);
  }

  .mode-btn.active {
    border-color: var(--gold);
    background: linear-gradient(180deg, #f59e0b15, #f59e0b05);
    color: var(--gold);
  }
`;
