import React, { useState } from 'react';
import type { PlayerAction, GameState } from '@cei-ding-ke/shared';
import { getHero, getDistance } from '@cei-ding-ke/shared';

interface Props {
  actions: PlayerAction[];
  gameState: GameState;
  playerId: string;
  onAction: (action: PlayerAction) => void;
}

const ACTION_ICONS: Record<string, string> = {
  move_forward: '➡️',
  move_backward: '⬅️',
  punch: '👊',
  skill: '✨',
  summon: '🔮',
  stay: '🧍',
};

export function ActionPanel({ actions, gameState, playerId, onAction }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const player = gameState.teams.flatMap(t => t.players).find(p => p.id === playerId);
  const heroDef = player ? getHero(player.hero.heroId) : undefined;
  const allSkills = heroDef ? [...heroDef.physicalSkills, ...heroDef.magicSkills] : [];

  const allPlayers = gameState.teams.flatMap(t => t.players);
  const getTargetName = (targetId?: string): string => {
    if (!targetId) return '';
    if (targetId === playerId) return 'Self';
    const target = allPlayers.find(p => p.id === targetId);
    if (!target) return targetId;
    const targetHero = getHero(target.hero.heroId);
    return target.name || targetHero?.name || targetId;
  };

  // Resolve minion name if this is a minion action
  const getMinionName = (minionId?: string): string => {
    if (!minionId) return '';
    const minion = player?.minions.find(m => m.minionId === minionId);
    if (!minion) return 'Minion';
    const minionDef = heroDef?.minion;
    return minionDef?.name || minion.type;
  };

  const getActionLabel = (action: PlayerAction): string => {
    const targetName = getTargetName(action.targetId);
    const targetSuffix = targetName ? ` → ${targetName}` : '';
    const minionPrefix = action.minionId ? `${getMinionName(action.minionId)}: ` : '';

    switch (action.type) {
      case 'move_forward': return `${minionPrefix}Move Forward`;
      case 'move_backward': return `${minionPrefix}Move Backward`;
      case 'punch': return `${minionPrefix}Punch${targetSuffix}`;
      case 'stay': return `${minionPrefix}Stay`;
      case 'summon': return `Summon ${heroDef?.minion?.name || 'Minion'}`;
      case 'skill': {
        const skill = allSkills.find(s => s.id === action.skillId);
        if (skill) {
          const uses = player?.hero.skillUsesRemaining[skill.id];
          const usesText = uses !== undefined ? ` [${uses}]` : '';
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
      case 'stay': return '#6b7280';
      case 'summon': return '#a855f7';
      default: return '#6b7280';
    }
  };

  // Compute distance to nearest opponent hero
  const getHeroDistance = (): number => {
    if (!player) return 0;
    const myTeamIndex = gameState.teams.findIndex(t => t.players.some(p => p.id === playerId));
    const oppTeam = gameState.teams[1 - myTeamIndex];
    if (!oppTeam) return 0;
    const distances = oppTeam.players
      .filter(p => p.hero.alive)
      .map(p => getDistance(player.hero.position, p.hero.position));
    return distances.length > 0 ? Math.min(...distances) : 0;
  };

  const getMinionDistance = (minionId: string): number => {
    const minion = player?.minions.find(m => m.minionId === minionId);
    if (!minion || !player) return 0;
    const myTeamIndex = gameState.teams.findIndex(t => t.players.some(p => p.id === playerId));
    const oppTeam = gameState.teams[1 - myTeamIndex];
    if (!oppTeam) return 0;
    const distances = oppTeam.players
      .filter(p => p.hero.alive)
      .map(p => getDistance(minion.position, p.hero.position));
    return distances.length > 0 ? Math.min(...distances) : 0;
  };

  const getActionDescription = (action: PlayerAction): string => {
    switch (action.type) {
      case 'move_forward': {
        if (action.minionId) {
          const d = getMinionDistance(action.minionId);
          return `Distance to enemy: ${d}`;
        }
        const d = getHeroDistance();
        return `Distance to enemy: ${d}`;
      }
      case 'move_backward': {
        if (action.minionId) {
          const d = getMinionDistance(action.minionId);
          return `Distance to enemy: ${d}`;
        }
        const d = getHeroDistance();
        return `Distance to enemy: ${d}`;
      }
      case 'punch': {
        if (action.minionId) {
          const minionDef = heroDef?.minion;
          return `${minionDef?.punchDamage ?? 20} physical dmg. ${minionDef?.punchCountsForStun ? '3 consecutive = stun!' : ''}`;
        }
        return '10 physical dmg. 3 consecutive = stun!';
      }
      case 'skill': {
        const skill = allSkills.find(s => s.id === action.skillId);
        if (!skill) return '';
        const parts: string[] = [];
        if (skill.damage > 0) parts.push(`${skill.damage} ${skill.damageType} dmg`);
        if (skill.selfDamage > 0) parts.push(`${skill.selfDamage} self-dmg`);
        if (skill.selfHeal > 0) parts.push(`+${skill.selfHeal} self-heal`);
        if (skill.appliesStatus) parts.push(`applies ${skill.appliesStatus}`);
        if (skill.selfStun) parts.push('self-stun');
        parts.push(`range ${skill.minDistance}-${skill.maxDistance}`);
        return parts.join(' · ');
      }
      case 'stay': return 'Do nothing this turn';
      case 'summon': return heroDef?.minion?.description || '';
      default: return '';
    }
  };

  const getSkillIcon = (action: PlayerAction): string => {
    if (action.minionId) {
      if (action.type === 'punch') return '🪨';
      return '🪨';
    }
    if (action.type === 'skill') {
      const skill = allSkills.find(s => s.id === action.skillId);
      if (skill?.category === 'physical') return '⚔️';
      return '🔮';
    }
    return ACTION_ICONS[action.type] || '❓';
  };

  return (
    <div style={{
      background: '#16213e',
      borderRadius: 12,
      padding: 16,
      border: '2px solid #fbbf24',
    }}>
      <h3 style={{ color: '#fbbf24', marginBottom: 10, textAlign: 'center', fontSize: 15 }}>
        {actions.some(a => a.minionId) ? `🪨 ${heroDef?.minion?.name || 'Minion'}'s Turn` : 'Choose an Action'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {actions.map((action, i) => {
          const color = getActionColor(action);
          const isHovered = hoveredIndex === i;
          return (
            <button
              key={i}
              onClick={() => onAction(action)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: `2px solid ${isHovered ? color : color + '60'}`,
                background: isHovered ? color + '15' : '#0f172a',
                color: '#eee',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s',
                transform: isHovered ? 'translateX(4px)' : 'none',
              }}
            >
              <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>
                {getSkillIcon(action)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', color, fontSize: 14 }}>
                  {getActionLabel(action)}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                  {getActionDescription(action)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
