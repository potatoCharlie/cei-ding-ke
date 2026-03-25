import React, { useMemo } from 'react';
import type { GameState, PlayerState, MinionState, HeroState } from '@cei-ding-ke/shared';
import { getHero, getDistance, getTeamIndex } from '@cei-ding-ke/shared';
import { getHeroVisual, STATUS_ICONS } from '../game/SpriteConfig.js';
import type { BattleAnimation } from '../game/AnimationTypes.js';
import './BattleScene.css';

interface Props {
  gameState: GameState;
  myPlayerId: string;
  activeAnimations: BattleAnimation[];
  floatingNumbers: FloatingNumber[];
}

export interface FloatingNumber {
  id: number;
  targetId: string;
  text: string;
  type: 'damage' | 'magic-damage' | 'heal';
}

/** Entity in a grid cell: hero or minion. */
type CellEntity = {
  kind: 'hero';
  player: PlayerState;
  isMe: boolean;
} | {
  kind: 'minion';
  minion: MinionState;
  owner: PlayerState;
  isMe: boolean;
}

function ActionOrderBar({ gameState, myPlayerId }: { gameState: GameState; myPlayerId: string }) {
  if (gameState.phase !== 'action_phase' || gameState.actionOrder.length === 0) return null;

  const allPlayers = gameState.teams.flatMap(t => t.players);

  return (
    <div className="action-order-bar">
      {gameState.actionOrder.map((playerId, index) => {
        const player = allPlayers.find(p => p.id === playerId);
        if (!player) return null;

        const teamIndex = gameState.teams.findIndex(t => t.players.some(p => p.id === playerId));
        const visual = getHeroVisual(player.hero.heroId);
        const isActing = index === gameState.currentActionIndex;
        const hasActed = index < gameState.currentActionIndex;
        const isMe = playerId === myPlayerId;

        return (
          <div
            key={playerId}
            className={`action-order-card ${isActing ? 'acting' : ''} ${hasActed ? 'done' : ''}`}
            style={isActing ? { borderColor: teamIndex === 0 ? 'var(--team-blue)' : 'var(--team-red-light)', boxShadow: `0 0 12px ${teamIndex === 0 ? 'var(--team-blue)' : 'var(--team-red-light)'}40` } : {}}
          >
            <div className="action-order-emoji">{visual.emoji}</div>
            <div className="action-order-name" style={{ color: isActing ? (teamIndex === 0 ? 'var(--team-blue)' : 'var(--team-red-light)') : undefined }}>
              {player.name}{isMe ? ' ★' : ''}
            </div>
            {isActing && <div className="action-order-badge">acting</div>}
            {hasActed && <div className="action-order-badge done-badge">✓</div>}
          </div>
        );
      })}
    </div>
  );
}

export function BattleScene({ gameState, myPlayerId, activeAnimations, floatingNumbers }: Props) {
  const myTeamIndex = gameState.teams.findIndex(t =>
    t.players.some(p => p.id === myPlayerId),
  );

  const isActionPhase = gameState.phase === 'action_phase';
  const currentActorId = isActionPhase
    ? gameState.actionOrder[gameState.currentActionIndex]
    : null;
  const isMinionTurn = gameState.awaitingMinionAction && currentActorId === myPlayerId;

  // Collect all entity positions, compute the display range dynamically.
  // If local player is team 0 (moves right), positions shown left-to-right ascending.
  // If local player is team 1 (moves left), we reverse the display order.
  const { cells, displayPositions } = useMemo(() => {
    // Gather all positions
    const allPositions: number[] = [];
    for (const team of gameState.teams) {
      for (const player of team.players) {
        if (player.hero.alive) allPositions.push(player.hero.position);
        for (const minion of player.minions) {
          if (minion.alive) allPositions.push(minion.position);
        }
      }
    }

    if (allPositions.length === 0) {
      return { cells: new Map<number, CellEntity[]>(), displayPositions: [] };
    }

    const minPos = Math.min(...allPositions);
    const maxPos = Math.max(...allPositions);

    // Create cells for the range, plus 1 padding on each side for movement room
    const paddedMin = minPos - 1;
    const paddedMax = maxPos + 1;

    const cellMap = new Map<number, CellEntity[]>();
    for (let p = paddedMin; p <= paddedMax; p++) {
      cellMap.set(p, []);
    }

    for (const team of gameState.teams) {
      const isMyTeam = team.teamIndex === myTeamIndex;
      for (const player of team.players) {
        if (player.hero.alive) {
          cellMap.get(player.hero.position)?.push({ kind: 'hero', player, isMe: isMyTeam });
        }
        for (const minion of player.minions) {
          if (minion.alive) {
            cellMap.get(minion.position)?.push({ kind: 'minion', minion, owner: player, isMe: isMyTeam });
          }
        }
      }
    }

    // Display order: team 0 sees ascending (left=low), team 1 sees descending (left=high)
    const positions = Array.from(cellMap.keys()).sort((a, b) => a - b);
    const displayPositions = myTeamIndex === 1 ? positions.reverse() : positions;

    return { cells: cellMap, displayPositions };
  }, [gameState, myTeamIndex]);

  return (
    <div className="battle-arena">
      <ActionOrderBar gameState={gameState} myPlayerId={myPlayerId} />

      {/* Turn info */}
      <div className="turn-overlay">
        <span className="turn-badge">Turn {gameState.turn}</span>
        <span>{formatPhase(gameState.phase)}</span>
        {isMinionTurn && <span style={{ color: '#f59e0b' }}>Minion's Turn</span>}
      </div>

      {/* Grid of blocks */}
      <div className="arena-grid" style={{ gridTemplateColumns: `repeat(${displayPositions.length}, 1fr)` }}>
        {displayPositions.map((pos) => {
          const entities = cells.get(pos) ?? [];
          return (
            <div key={pos} className="grid-cell">
              <div className="grid-cell-entities">
                {entities.map((ent) => {
                  if (ent.kind === 'hero') {
                    return (
                      <HeroCard
                        key={ent.player.id}
                        player={ent.player}
                        isMe={ent.isMe}
                        isActiveTurn={currentActorId === ent.player.id && !gameState.awaitingMinionAction}
                        activeAnimations={activeAnimations}
                        floatingNumbers={floatingNumbers}
                      />
                    );
                  } else {
                    return (
                      <MinionCard
                        key={ent.minion.minionId}
                        minion={ent.minion}
                        owner={ent.owner}
                        isMe={ent.isMe}
                        isActiveTurn={isMinionTurn && ent.isMe}
                      />
                    );
                  }
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeroCard({
  player,
  isMe,
  isActiveTurn,
  activeAnimations,
  floatingNumbers,
}: {
  player: PlayerState;
  isMe: boolean;
  isActiveTurn: boolean;
  activeAnimations: BattleAnimation[];
  floatingNumbers: FloatingNumber[];
}) {
  const hero = player.hero;
  const visual = getHeroVisual(hero.heroId);
  const hpPercent = Math.max(0, (hero.hp / hero.maxHp) * 100);
  const hpColor = hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#f97316' : '#ef4444';

  const animClass = useMemo(() => {
    const classes: string[] = [];
    for (const anim of activeAnimations) {
      if (anim.type === 'damage' && anim.targetId === player.id) classes.push('anim-damage');
      if (anim.type === 'heal' && anim.targetId === player.id) classes.push('anim-heal');
      if (anim.type === 'death' && anim.targetId === player.id) classes.push('anim-death');
      if (anim.type === 'status_apply' && anim.targetId === player.id && anim.effect === 'stunned') {
        classes.push('anim-stun');
      }
    }
    return classes.join(' ');
  }, [activeAnimations, player.id]);

  const statusBadges = hero.statusEffects.map(e => ({
    icon: STATUS_ICONS[e.type]?.icon ?? '❓',
    label: `${e.type} (${e.remainingRounds})`,
  }));
  if (hero.invisibleRounds > 0) {
    statusBadges.push({ icon: STATUS_ICONS.invisible.icon, label: `invisible (${hero.invisibleRounds})` });
  }

  const myFloats = floatingNumbers.filter(fn => fn.targetId === player.id);
  const isInvisible = hero.invisibleRounds > 0;

  return (
    <div className={`entity-card hero-card ${isMe ? 'is-me' : 'is-enemy'} ${animClass}`}>
      {/* Floating numbers */}
      {myFloats.map(fn => (
        <div key={fn.id} className={`float-number ${fn.type}`}>{fn.text}</div>
      ))}

      <div className="entity-label">
        {isMe ? 'YOU' : 'ENEMY'}
      </div>

      <div
        className={`hero-sprite${isActiveTurn ? ' active-turn' : ''}`}
        style={{
          background: visual.bgGradient,
          opacity: isInvisible ? 0.3 : 1,
        }}
      >
        {visual.emoji}
      </div>

      <div className="entity-name">{player.name || visual.label}</div>

      <div className="hero-hp-bar">
        <div className="hero-hp-fill" style={{ width: `${hpPercent}%`, background: hpColor }} />
      </div>
      <div className="hero-hp-text" style={{ color: hpColor }}>{hero.hp}/{hero.maxHp}</div>

      {statusBadges.length > 0 && (
        <div className="status-badges">
          {statusBadges.map((s, i) => (
            <span key={i} className="status-badge" title={s.label}>{s.icon}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function MinionCard({
  minion,
  owner,
  isMe,
  isActiveTurn,
}: {
  minion: MinionState;
  owner: PlayerState;
  isMe: boolean;
  isActiveTurn: boolean;
}) {
  const heroDef = getHero(owner.hero.heroId);
  const minionDef = heroDef?.minion;
  const name = minionDef?.name || minion.type;
  const hpPercent = Math.max(0, (minion.hp / minion.maxHp) * 100);

  return (
    <div className={`entity-card minion-entity-card ${isMe ? 'is-me' : 'is-enemy'}${isActiveTurn ? ' active' : ''}`}>
      <div className="minion-sprite-icon">{isMe ? '🪨' : '🪨'}</div>
      <div className="entity-name" style={{ color: isMe ? '#60a5fa' : '#f87171', fontSize: 10 }}>{name}</div>
      <div className="minion-hp-bar">
        <div className="minion-hp-fill" style={{ width: `${hpPercent}%` }} />
      </div>
      <div className="minion-hp-text">{minion.hp}/{minion.maxHp}</div>
    </div>
  );
}

function formatPhase(phase: string): string {
  switch (phase) {
    case 'rps_submit': return 'Rock Paper Scissors!';
    case 'rps_resolve': return 'Resolving...';
    case 'action_phase': return 'Action Phase';
    case 'effect_resolve': return 'Resolving Effects...';
    case 'turn_end': return 'Turn Ending...';
    case 'game_over': return 'Game Over';
    default: return phase;
  }
}
