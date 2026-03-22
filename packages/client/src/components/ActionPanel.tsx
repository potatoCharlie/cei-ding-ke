import React from 'react';
import type { PlayerAction, GameState } from '@cei-ding-ke/shared';
import { getHero } from '@cei-ding-ke/shared';

interface Props {
  actions: PlayerAction[];
  gameState: GameState;
  playerId: string;
  onAction: (action: PlayerAction) => void;
}

export function ActionPanel({ actions, gameState, playerId, onAction }: Props) {
  // Get hero definition for skill names
  const player = gameState.teams.flatMap(t => t.players).find(p => p.id === playerId);
  const heroDef = player ? getHero(player.hero.heroId) : undefined;
  const allSkills = heroDef ? [...heroDef.physicalSkills, ...heroDef.magicSkills] : [];

  // Helper to get player/hero display name by id
  const allPlayers = gameState.teams.flatMap(t => t.players);
  const getTargetName = (targetId?: string): string => {
    if (!targetId) return '';
    if (targetId === playerId) return 'Self';
    const target = allPlayers.find(p => p.id === targetId);
    if (!target) return targetId;
    const targetHero = getHero(target.hero.heroId);
    return target.name || targetHero?.name || targetId;
  };

  const getActionLabel = (action: PlayerAction): string => {
    const targetName = getTargetName(action.targetId);
    const targetSuffix = targetName ? ` -> ${targetName}` : '';

    switch (action.type) {
      case 'move_forward': return 'Move Forward';
      case 'move_backward': return 'Move Backward';
      case 'punch': return `Punch${targetSuffix} (-10 HP)`;
      case 'summon': return `Summon ${heroDef?.minion?.name || 'Minion'}`;
      case 'skill': {
        const skill = allSkills.find(s => s.id === action.skillId);
        if (skill) {
          const uses = player?.hero.skillUsesRemaining[skill.id];
          const usesText = uses !== undefined ? ` [${uses} left]` : '';
          return `${skill.name}${targetSuffix}${usesText}`;
        }
        return action.skillId || 'Unknown Skill';
      }
      default: return action.type;
    }
  };

  const getActionColor = (action: PlayerAction): string => {
    switch (action.type) {
      case 'move_forward':
      case 'move_backward': return '#22c55e';
      case 'punch': return '#ef4444';
      case 'skill': {
        const skill = allSkills.find(s => s.id === action.skillId);
        return skill?.category === 'physical' ? '#f97316' : '#3b82f6';
      }
      case 'summon': return '#a855f7';
      default: return '#6b7280';
    }
  };

  const getActionDescription = (action: PlayerAction): string => {
    switch (action.type) {
      case 'move_forward': return `Distance: ${gameState.distance} -> ${gameState.distance - 1}`;
      case 'move_backward': return `Distance: ${gameState.distance} -> ${gameState.distance + 1}`;
      case 'punch': return 'Requires distance 0. 3 consecutive = stun!';
      case 'skill': {
        const skill = allSkills.find(s => s.id === action.skillId);
        return skill?.description || '';
      }
      case 'summon': return heroDef?.minion?.description || '';
      default: return '';
    }
  };

  return (
    <div style={{
      background: '#16213e',
      borderRadius: 12,
      padding: 20,
      border: '2px solid #fbbf24',
    }}>
      <h3 style={{ color: '#fbbf24', marginBottom: 12, textAlign: 'center' }}>
        Your Turn - Choose an Action
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={() => onAction(action)}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: `2px solid ${getActionColor(action)}`,
              background: '#0f172a',
              color: '#eee',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <span style={{ fontWeight: 'bold', color: getActionColor(action) }}>
              {getActionLabel(action)}
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              {getActionDescription(action)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
