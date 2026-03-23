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
      case 'move_backward': return '#10b981';
      case 'punch': return '#ef4444';
      case 'skill': {
        const skill = allSkills.find(s => s.id === action.skillId);
        return skill?.category === 'physical' ? '#f97316' : '#3b82f6';
      }
      case 'stay': return '#64748b';
      case 'summon': return '#a855f7';
      default: return '#64748b';
    }
  };

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
      return '🪨';
    }
    if (action.type === 'skill') {
      const skill = allSkills.find(s => s.id === action.skillId);
      if (skill?.category === 'physical') return '⚔️';
      return '🔮';
    }
    return ACTION_ICONS[action.type] || '❓';
  };

  const isMinionTurn = actions.some(a => a.minionId);

  return (
    <div className="action-container">
      <h3 className="action-title">
        {isMinionTurn ? `🪨 ${heroDef?.minion?.name || 'Minion'}'s Turn` : 'Choose an Action'}
      </h3>
      <div className="action-list">
        {actions.map((action, i) => {
          const color = getActionColor(action);
          const isHovered = hoveredIndex === i;
          return (
            <button
              key={i}
              onClick={() => onAction(action)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`action-btn ${isHovered ? 'hovered' : ''}`}
              style={{
                '--action-color': color,
                '--action-color-dim': color + '40',
                '--action-color-bg': color + '10',
                animationDelay: `${i * 0.05}s`,
              } as React.CSSProperties}
            >
              <span className="action-icon">{getSkillIcon(action)}</span>
              <div className="action-info">
                <div className="action-label" style={{ color }}>{getActionLabel(action)}</div>
                <div className="action-desc">{getActionDescription(action)}</div>
              </div>
              <div className="action-arrow">›</div>
            </button>
          );
        })}
      </div>

      <style>{`
        .action-container {
          background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
          border-radius: 14px;
          padding: 18px;
          border: 2px solid var(--gold-dim);
          box-shadow: 0 0 20px #f59e0b15, 0 4px 24px #00000040;
        }

        .action-title {
          font-family: var(--font-display);
          font-size: 11px;
          color: var(--gold);
          text-align: center;
          margin-bottom: 12px;
          letter-spacing: 1px;
          text-shadow: 0 0 12px #f59e0b30;
        }

        .action-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .action-btn {
          padding: 11px 14px;
          border-radius: 10px;
          border: 2px solid var(--action-color-dim);
          background: var(--bg-card);
          color: var(--text-primary);
          cursor: pointer;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.15s ease;
          font-family: var(--font-body);
          animation: fadeIn 0.25s ease-out both;
          position: relative;
          overflow: hidden;
        }

        .action-btn::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: var(--action-color);
          opacity: 0;
          transition: opacity 0.15s;
        }

        .action-btn.hovered {
          border-color: var(--action-color);
          background: var(--action-color-bg);
          transform: translateX(4px);
          box-shadow: 0 2px 12px #00000030;
        }

        .action-btn.hovered::before {
          opacity: 1;
        }

        .action-icon {
          font-size: 22px;
          width: 32px;
          text-align: center;
          flex-shrink: 0;
        }

        .action-info {
          flex: 1;
          min-width: 0;
        }

        .action-label {
          font-weight: 700;
          font-size: 14px;
          line-height: 1.3;
        }

        .action-desc {
          font-size: 11px;
          color: var(--text-dim);
          margin-top: 1px;
          line-height: 1.3;
        }

        .action-arrow {
          font-size: 20px;
          color: var(--text-dim);
          opacity: 0;
          transition: all 0.15s;
          transform: translateX(-4px);
        }

        .action-btn.hovered .action-arrow {
          opacity: 1;
          transform: translateX(0);
          color: var(--action-color);
        }
      `}</style>
    </div>
  );
}
