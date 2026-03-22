import React from 'react';
import type { PlayerState } from '@cei-ding-ke/shared';

interface Props {
  myPlayer: PlayerState;
  opponent: PlayerState;
  distance: number;
  turn: number;
  phase: string;
}

export function BattleHUD({ myPlayer, opponent, distance, turn, phase }: Props) {
  return (
    <div style={{
      background: '#16213e',
      borderRadius: 12,
      padding: 16,
      border: '1px solid #334155',
    }}>
      {/* Turn info */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>Turn {turn}</span>
        <span style={{ color: '#64748b', margin: '0 8px' }}>|</span>
        <span style={{ color: '#94a3b8' }}>{formatPhase(phase)}</span>
      </div>

      {/* Battlefield */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        {/* My hero */}
        <HeroCard player={myPlayer} isMe={true} />

        {/* Distance indicator */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  background: i <= distance ? '#334155' : '#0f172a',
                  border: i === distance ? '2px solid #fbbf24' : '1px solid #475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#94a3b8',
                }}
              >
                {i}
              </div>
            ))}
          </div>
          <span style={{ fontSize: 12, color: '#64748b' }}>Distance: {distance}</span>
        </div>

        {/* Opponent */}
        <HeroCard player={opponent} isMe={false} />
      </div>

      {/* Status effects */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <StatusEffects effects={myPlayer.hero.statusEffects} invisible={myPlayer.hero.invisibleRounds} />
        <StatusEffects effects={opponent.hero.statusEffects} invisible={opponent.hero.invisibleRounds} />
      </div>
    </div>
  );
}

function HeroCard({ player, isMe }: { player: PlayerState; isMe: boolean }) {
  const hero = player.hero;
  const hpPercent = (hero.hp / hero.maxHp) * 100;
  const hpColor = hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#f97316' : '#ef4444';

  return (
    <div style={{
      textAlign: 'center',
      minWidth: 120,
      opacity: hero.alive ? 1 : 0.4,
    }}>
      <div style={{
        fontSize: 12,
        color: isMe ? '#3b82f6' : '#ef4444',
        fontWeight: 'bold',
        marginBottom: 4,
      }}>
        {isMe ? 'YOU' : 'ENEMY'}
      </div>
      <div style={{
        fontSize: 28,
        marginBottom: 4,
        filter: hero.invisibleRounds > 0 ? 'opacity(0.3)' : 'none',
      }}>
        {getHeroEmoji(hero.heroId)}
      </div>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
        {player.name}
      </div>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
        {hero.heroId.toUpperCase()}
      </div>
      {/* HP Bar */}
      <div style={{
        width: '100%',
        height: 8,
        background: '#1e293b',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 2,
      }}>
        <div style={{
          width: `${Math.max(0, hpPercent)}%`,
          height: '100%',
          background: hpColor,
          borderRadius: 4,
          transition: 'width 0.3s',
        }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 'bold', color: hpColor }}>
        {hero.hp} / {hero.maxHp}
      </div>
    </div>
  );
}

function StatusEffects({ effects, invisible }: { effects: PlayerState['hero']['statusEffects']; invisible: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {effects.map((e, i) => (
        <span key={i} style={{
          padding: '2px 6px',
          borderRadius: 4,
          background: getStatusColor(e.type),
          color: 'white',
          fontSize: 11,
        }}>
          {e.type} ({e.remainingRounds})
        </span>
      ))}
      {invisible > 0 && (
        <span style={{
          padding: '2px 6px',
          borderRadius: 4,
          background: '#6366f1',
          color: 'white',
          fontSize: 11,
        }}>
          invisible ({invisible})
        </span>
      )}
    </div>
  );
}

function getHeroEmoji(heroId: string): string {
  const emojis: Record<string, string> = {
    nan: '🦨',
    shan: '⚔️',
    gao: '🔥',
    jin: '🗡️',
  };
  return emojis[heroId] || '🦸';
}

function getStatusColor(type: string): string {
  switch (type) {
    case 'stunned': return '#f97316';
    case 'trapped': return '#3b82f6';
    case 'slowed': return '#8b5cf6';
    default: return '#6b7280';
  }
}

function formatPhase(phase: string): string {
  switch (phase) {
    case 'rps_submit': return 'Rock Paper Scissors!';
    case 'rps_resolve': return 'Resolving RPS...';
    case 'action_phase': return 'Action Phase';
    case 'effect_resolve': return 'Resolving Effects...';
    case 'turn_end': return 'Turn Ending...';
    case 'game_over': return 'Game Over';
    default: return phase;
  }
}
