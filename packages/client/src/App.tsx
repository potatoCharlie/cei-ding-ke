import React, { useState, useEffect, useCallback } from 'react';
import { socket, connectSocket } from './network/socket.js';
import type { GameState, RPSChoice, PlayerAction, GameEffect } from '@cei-ding-ke/shared';
import { getAllHeroes } from '@cei-ding-ke/shared';
import { HeroSelect } from './components/HeroSelect.js';
import { RPSPicker } from './components/RPSPicker.js';
import { ActionPanel } from './components/ActionPanel.js';
import { BattleHUD } from './components/BattleHUD.js';
import { GameLog } from './components/GameLog.js';

type Screen = 'menu' | 'lobby' | 'hero_select' | 'battle' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [rpsResult, setRpsResult] = useState<{ choices: Record<string, RPSChoice>; winners: string[]; draw: boolean } | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [availableActions, setAvailableActions] = useState<PlayerAction[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedHero, setSelectedHero] = useState('');
  const [error, setError] = useState('');
  const [gameOverWinner, setGameOverWinner] = useState<number | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-50), msg]);
  }, []);

  useEffect(() => {
    // Socket event listeners
    socket.on('game:state', (state: GameState) => {
      setGameState(state);
      setScreen('battle');
    });

    socket.on('game:phase', (data) => {
      addLog(`Phase: ${data.phase} (Turn ${data.turn})`);
      // Update gameState phase so the UI renders the correct panel
      setGameState(prev => prev ? { ...prev, phase: data.phase, turn: data.turn } : prev);
      if (data.phase === 'rps_submit') {
        setRpsResult(null);
        setIsMyTurn(false);
      }
    });

    socket.on('rps:result', (data) => {
      setRpsResult(data);
      const myChoice = data.choices[socket.id!];
      const won = data.winners.includes(socket.id!);
      addLog(`RPS: You chose ${myChoice}. ${data.draw ? 'Draw! Go again.' : won ? 'You win this round!' : 'You lose this round.'}`);
    });

    socket.on('rps:waiting', (data) => {
      addLog(`Waiting for RPS... (${data.submitted.length}/2 submitted)`);
    });

    socket.on('action:request', (data) => {
      if (data.playerId === socket.id) {
        setIsMyTurn(true);
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
      socket.emit('room:create', { name: playerName }, (res: { roomId: string }) => {
        setRoomId(res.roomId);
        setScreen('hero_select');
        addLog(`Room created: ${res.roomId}`);
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
      socket.emit('room:quickmatch', { name: playerName, heroId: selectedHero }, (res: { roomId: string }) => {
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
    addLog(`You chose: ${choice}`);
  };

  const handleAction = (action: PlayerAction) => {
    socket.emit('action:submit', action);
    setIsMyTurn(false);
  };

  // ─── Render ───

  if (screen === 'menu') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Cei Ding Ke</h1>
        <p style={styles.subtitle}>Rock Paper Scissors Battle</p>

        <div style={styles.card}>
          <input
            style={styles.input}
            placeholder="Your name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
          />

          <div style={styles.buttonGroup}>
            <button style={styles.button} onClick={handleCreateRoom}>
              Create Room
            </button>

            <div style={styles.joinRow}>
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="Room ID"
                value={joinRoomId}
                onChange={e => setJoinRoomId(e.target.value)}
              />
              <button style={styles.button} onClick={handleJoinRoom}>
                Join
              </button>
            </div>
          </div>

          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.card}>
          <h3>Quick Match</h3>
          <p style={{ fontSize: 14, marginBottom: 8 }}>Select a hero and find an opponent:</p>
          <div style={styles.heroGrid}>
            {getAllHeroes().map(hero => (
              <button
                key={hero.id}
                style={{
                  ...styles.heroButton,
                  ...(selectedHero === hero.id ? styles.heroButtonSelected : {}),
                }}
                onClick={() => setSelectedHero(hero.id)}
              >
                <strong>{hero.name}</strong>
                <span style={{ fontSize: 11 }}>{hero.description.slice(0, 40)}...</span>
              </button>
            ))}
          </div>
          <button
            style={{ ...styles.button, marginTop: 12, width: '100%' }}
            onClick={handleQuickMatch}
            disabled={!selectedHero || !playerName}
          >
            Quick Match
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'hero_select') {
    return (
      <div style={styles.container}>
        <h2>Select Your Hero</h2>
        <p>Room: {roomId}</p>
        <HeroSelect onSelect={handleHeroSelect} />
      </div>
    );
  }

  if (screen === 'lobby') {
    return (
      <div style={styles.container}>
        <h2>Waiting for Opponent</h2>
        <p>Room: <strong>{roomId}</strong></p>
        <p>Share this room ID with your friend!</p>
        <p>Hero: <strong>{selectedHero}</strong></p>
        <div style={styles.spinner} />
        <GameLog logs={logs} />
      </div>
    );
  }

  if (screen === 'result') {
    const myTeamIndex = gameState?.teams.findIndex(t =>
      t.players.some(p => p.id === socket.id),
    );
    const won = gameOverWinner === myTeamIndex;

    return (
      <div style={styles.container}>
        <h1 style={{ ...styles.title, color: won ? '#4ade80' : '#f87171' }}>
          {won ? 'VICTORY!' : 'DEFEAT'}
        </h1>
        <button style={styles.button} onClick={() => { setScreen('menu'); socket.disconnect(); }}>
          Back to Menu
        </button>
        <GameLog logs={logs} />
      </div>
    );
  }

  // Battle screen
  if (!gameState) {
    return (
      <div style={styles.container}>
        <p>Waiting for game to start...</p>
        <GameLog logs={logs} />
      </div>
    );
  }

  const myTeamIndex = gameState.teams.findIndex(t =>
    t.players.some(p => p.id === socket.id),
  );
  const myTeam = gameState.teams[myTeamIndex];
  const opponentTeam = gameState.teams[1 - myTeamIndex];
  const myPlayer = myTeam?.players.find(p => p.id === socket.id);
  const opponent = opponentTeam?.players[0];
  const phase = gameState.phase as string;

  return (
    <div style={styles.container}>
      <BattleHUD
        myPlayer={myPlayer!}
        opponent={opponent!}
        distance={gameState.distance}
        turn={gameState.turn}
        phase={phase}
      />

      {phase === 'rps_submit' && !rpsResult && (
        <RPSPicker onChoice={handleRPSChoice} />
      )}

      {rpsResult && rpsResult.draw && (
        <div style={styles.card}>
          <p>Draw! Pick again:</p>
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
        <p style={{ textAlign: 'center', padding: 16 }}>Waiting for opponent's action...</p>
      )}

      <GameLog logs={logs} />
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 600,
    margin: '0 auto',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    minHeight: '100vh',
  },
  title: {
    textAlign: 'center',
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fbbf24',
  },
  subtitle: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: -12,
  },
  card: {
    background: '#16213e',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #334155',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #475569',
    background: '#0f172a',
    color: '#eee',
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    background: '#3b82f6',
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  joinRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  },
  error: {
    color: '#f87171',
    marginTop: 8,
  },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  heroButton: {
    padding: 12,
    borderRadius: 8,
    border: '2px solid #334155',
    background: '#0f172a',
    color: '#eee',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    textAlign: 'left',
  },
  heroButtonSelected: {
    borderColor: '#fbbf24',
    background: '#1e293b',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #334155',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '20px auto',
  },
};
