import React, { useMemo } from 'react';
import type { GameState, PlayerState, MinionState, HeroState, TeamState } from '@cei-ding-ke/shared';
import { getHero } from '@cei-ding-ke/shared';
import { getHeroVisual, STATUS_ICONS } from '../game/SpriteConfig.js';
import type { BattleAnimation } from '../game/AnimationTypes.js';
import './BattleScene.css';

export interface FloatingNumber {
  id: number;
  targetId: string;
  text: string;
  type: 'damage' | 'magic-damage' | 'heal';
}

interface Props {
  gameState: GameState;
  myPlayerId: string;
  activeAnimations: BattleAnimation[];
  floatingNumbers: FloatingNumber[];
}

// ─── Status badge helper ───

function buildStatusBadges(hero: HeroState): Array<{ text: string; label: string }> {
  const badges: Array<{ text: string; label: string }> = [];
  for (const e of hero.statusEffects) {
    const cfg = STATUS_ICONS[e.type];
    if (cfg) badges.push({ text: `${cfg.icon}${e.remainingRounds}`, label: e.type });
  }
  if (hero.invisibleRounds > 0) {
    badges.push({ text: `${STATUS_ICONS.invisible.icon}${hero.invisibleRounds}`, label: 'invisible' });
  }
  if (hero.damageBonus > 0) {
    badges.push({ text: STATUS_ICONS.heart_fire_buff.icon, label: 'heart_fire_buff' });
  }
  return badges;
}

// ─── HeroCell — rendered inside arena-cell-enemy or arena-cell-team ───

function HeroCell({
  player,
  isEnemy,
  isActiveTurn,
  activeAnimations,
  floatingNumbers,
}: {
  player: PlayerState;
  isEnemy: boolean;
  isActiveTurn: boolean;
  activeAnimations: BattleAnimation[];
  floatingNumbers: FloatingNumber[];
}) {
  const hero = player.hero;
  const visual = getHeroVisual(hero.heroId);
  const hpPercent = Math.max(0, (hero.hp / hero.maxHp) * 100);
  const hpColor = hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#f97316' : '#ef4444';
  const isInvisible = hero.invisibleRounds > 0;

  const animClass = useMemo(() => {
    const cls: string[] = [];
    for (const a of activeAnimations) {
      if (a.type === 'damage' && a.targetId === player.id) cls.push('anim-damage');
      if (a.type === 'heal' && a.targetId === player.id) cls.push('anim-heal');
      if (a.type === 'death' && a.targetId === player.id) cls.push('anim-death');
      if (a.type === 'status_apply' && a.targetId === player.id && a.effect === 'stunned') cls.push('anim-stun');
    }
    return cls.join(' ');
  }, [activeAnimations, player.id]);

  const allBadges = buildStatusBadges(hero);
  // Cap at 3 in cell; show "+N" for overflow
  const cellBadges = allBadges.slice(0, 3);
  const overflow = allBadges.length - cellBadges.length;

  const myFloats = floatingNumbers.filter(fn => fn.targetId === player.id);

  // Enemy: content order is HP bar → status → emoji → name (aligns to bottom, emoji near ground)
  // Team:  content order is emoji → status → HP bar → name → ACT (aligns to top, emoji near ground)
  if (isEnemy) {
    return (
      <div className={`hero-cell ${animClass}`} style={{ position: 'relative' }}>
        {myFloats.map(fn => (
          <div key={fn.id} className={`float-number ${fn.type}`}>{fn.text}</div>
        ))}
        <div className="hero-cell-hp-bar">
          <div className="hero-cell-hp-fill" style={{ width: `${hpPercent}%`, background: hpColor }} />
        </div>
        {cellBadges.length > 0 && (
          <div className="hero-cell-status">
            {cellBadges.map((b, i) => <span key={i} className="hero-cell-status-badge" title={b.label}>{b.text}</span>)}
            {overflow > 0 && <span className="hero-cell-status-badge">+{overflow}</span>}
          </div>
        )}
        <div
          className={`hero-cell-emoji enemy-glow ${isInvisible ? 'invisible-hero' : ''}`}
          style={{ filter: `drop-shadow(0 0 6px #ef4444)` }}
        >
          {visual.emoji}
        </div>
        <div className="hero-cell-name enemy-name">{player.name}</div>
      </div>
    );
  }

  return (
    <div className={`hero-cell ${animClass}`} style={{ position: 'relative' }}>
      {myFloats.map(fn => (
        <div key={fn.id} className={`float-number ${fn.type}`}>{fn.text}</div>
      ))}
      <div
        className={`hero-cell-emoji team-glow ${isInvisible ? 'invisible-hero' : ''}`}
        style={{ filter: `drop-shadow(0 0 6px ${visual.glowColor})` }}
      >
        {visual.emoji}
      </div>
      {cellBadges.length > 0 && (
        <div className="hero-cell-status">
          {cellBadges.map((b, i) => <span key={i} className="hero-cell-status-badge" title={b.label}>{b.text}</span>)}
          {overflow > 0 && <span className="hero-cell-status-badge">+{overflow}</span>}
        </div>
      )}
      <div className="hero-cell-hp-bar">
        <div className="hero-cell-hp-fill" style={{ width: `${hpPercent}%`, background: hpColor }} />
      </div>
      <div className="hero-cell-name team-name">{player.name}</div>
      {isActiveTurn && <div className="hero-cell-act-badge">ACT</div>}
    </div>
  );
}

// ─── MinionCell — smaller, appears below HeroCell in same column ───

function MinionCell({
  minion,
  owner,
  isEnemy,
  isActiveTurn,
}: {
  minion: MinionState;
  owner: PlayerState;
  isEnemy: boolean;
  isActiveTurn: boolean;
}) {
  const heroDef = getHero(owner.hero.heroId);
  const name = heroDef?.minion?.name ?? minion.type;
  const hpPercent = Math.max(0, (minion.hp / minion.maxHp) * 100);
  return (
    <div className="minion-cell" style={{ opacity: isActiveTurn ? 1 : 0.85 }}>
      <div className="minion-cell-emoji" style={{ transform: isEnemy ? 'scaleX(-1)' : undefined }}>🪨</div>
      <div className="minion-cell-hp-bar">
        <div className="minion-cell-hp-fill" style={{ width: `${hpPercent}%` }} />
      </div>
      <div className="minion-cell-name">{name}</div>
    </div>
  );
}

// ─── PortraitBar — replaces ActionOrderBar ───

function PortraitBar({
  gameState,
  myPlayerId,
  myTeamIndex,
}: {
  gameState: GameState;
  myPlayerId: string;
  myTeamIndex: number;
}) {
  const isActionPhase = gameState.phase === 'action_phase';
  const myTeamPlayers = gameState.teams[myTeamIndex]?.players ?? [];
  const enemyTeamPlayers = gameState.teams.find((_: unknown, i: number) => i !== myTeamIndex)?.players ?? [];

  const getCardState = (playerId: string): 'acting' | 'acted' | 'default' => {
    if (!isActionPhase) return 'default';
    const idx = gameState.actionOrder.indexOf(playerId);
    if (idx === -1) return 'default';
    if (idx === gameState.currentActionIndex) return 'acting';
    if (idx < gameState.currentActionIndex) return 'acted';
    return 'default';
  };

  const getOrderLabel = (playerId: string): string | null => {
    if (!isActionPhase) return null;
    const idx = gameState.actionOrder.indexOf(playerId);
    if (idx === -1) return null;
    return ['1st', '2nd', '3rd', '4th'][idx] ?? `${idx + 1}th`;
  };

  const renderCard = (player: PlayerState, isEnemy: boolean) => {
    const visual = getHeroVisual(player.hero.heroId);
    const cardState = getCardState(player.id);
    const orderLabel = getOrderLabel(player.id);
    const allBadges = buildStatusBadges(player.hero);
    const isMe = player.id === myPlayerId;

    return (
      <div
        key={player.id}
        className={`portrait-card ${isEnemy ? 'enemy-card' : 'team-card'} ${cardState === 'acting' ? 'acting' : ''} ${cardState === 'acted' ? 'acted' : ''}`}
      >
        {orderLabel && <div className="portrait-card-order-badge">{orderLabel}</div>}
        <div className="portrait-card-emoji">{visual.emoji}</div>
        <div className="portrait-card-name">
          {player.name}{isMe ? ' ★' : ''} · {player.hero.hp}hp
        </div>
        <div className="portrait-card-status">
          {allBadges.map((b, i) => (
            <span key={i} title={b.label}>{b.text}</span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="portrait-bar">
      <div className="portrait-bar-team">
        {myTeamPlayers.map((p: PlayerState) => renderCard(p, false))}
      </div>
      <div className="portrait-bar-divider">|</div>
      <div className="portrait-bar-team">
        {enemyTeamPlayers.map((p: PlayerState) => renderCard(p, true))}
      </div>
    </div>
  );
}

// ─── CellEntry type (module-level so callbacks can annotate it) ───

type CellEntry = { kind: 'hero'; player: PlayerState } | { kind: 'minion'; minion: MinionState; owner: PlayerState };

// ─── BattleScene — main component ───

export function BattleScene({ gameState, myPlayerId, activeAnimations, floatingNumbers }: Props) {
  const myTeamIndex = gameState.teams.findIndex((t: TeamState) => t.players.some((p: PlayerState) => p.id === myPlayerId));

  const isActionPhase = gameState.phase === 'action_phase';
  const currentActorId = isActionPhase
    ? gameState.actionOrder[gameState.currentActionIndex]
    : null;
  const isMinionTurn = gameState.awaitingMinionAction && currentActorId === myPlayerId;

  // Build two separate position maps: one for enemy entities, one for my team
  const { displayPositions, enemyCells, myCells } = useMemo(() => {
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
      return { displayPositions: [], enemyCells: new Map<number, CellEntry[]>(), myCells: new Map<number, CellEntry[]>() };
    }

    const minPos = Math.min(...allPositions);
    const maxPos = Math.max(...allPositions);
    // At least 5 columns to prevent jarring collapse
    const paddedMin = Math.min(minPos - 1, maxPos - 4);
    const paddedMax = Math.max(maxPos + 1, paddedMin + 4);

    const enemyMap = new Map<number, CellEntry[]>();
    const myMap = new Map<number, CellEntry[]>();

    for (let p = paddedMin; p <= paddedMax; p++) {
      enemyMap.set(p, []);
      myMap.set(p, []);
    }

    for (const team of gameState.teams) {
      const isMyTeam = team.teamIndex === myTeamIndex;
      const map = isMyTeam ? myMap : enemyMap;
      for (const player of team.players) {
        if (player.hero.alive) {
          map.get(player.hero.position)?.push({ kind: 'hero', player });
        }
        for (const minion of player.minions) {
          if (minion.alive) {
            map.get(minion.position)?.push({ kind: 'minion', minion, owner: player });
          }
        }
      }
    }

    const positions = Array.from(enemyMap.keys()).sort((a, b) => a - b);
    const displayPositions = myTeamIndex === 1 ? [...positions].reverse() : positions;

    return { displayPositions, enemyCells: enemyMap, myCells: myMap };
  }, [gameState, myTeamIndex]);

  const colCount = displayPositions.length;

  const formatPhase = (phase: string) => {
    switch (phase) {
      case 'rps_submit': return 'Rock Paper Scissors!';
      case 'rps_resolve': return 'Resolving...';
      case 'action_phase': return 'Action Phase';
      case 'effect_resolve': return 'Resolving Effects...';
      case 'turn_end': return 'Turn Ending...';
      case 'game_over': return 'Game Over';
      default: return phase;
    }
  };

  return (
    <div className="battle-arena">
      {/* Torch strip */}
      <div className="torch-strip">
        <span>🔥</span>
        <div className="torch-strip-line" />
        <span>🔥</span>
      </div>

      {/* Turn bar */}
      <div className="turn-bar">
        <span className="turn-badge">Turn {gameState.turn}</span>
        <span className="turn-phase">
          {formatPhase(gameState.phase)}
          {isMinionTurn && ' · Minion'}
        </span>
        <span className="turn-timer" />
      </div>

      {/* Column grid: enemy row + ground divider + my team row */}
      <div
        className="arena-grid"
        style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
      >
        {/* Enemy row */}
        {displayPositions.map(pos => {
          const entities = enemyCells.get(pos) ?? [];
          const hasActiveEnemy = entities.some((e: CellEntry) => e.kind === 'hero' && e.player.id === currentActorId);
          return (
            <div
              key={`enemy-${pos}`}
              className={`arena-cell-enemy${hasActiveEnemy ? ' active-cell' : ''}`}
            >
              {entities.map((ent: CellEntry) => {
                if (ent.kind === 'hero') {
                  return (
                    <HeroCell
                      key={ent.player.id}
                      player={ent.player}
                      isEnemy={true}
                      isActiveTurn={currentActorId === ent.player.id && !gameState.awaitingMinionAction}
                      activeAnimations={activeAnimations}
                      floatingNumbers={floatingNumbers}
                    />
                  );
                }
                return (
                  <MinionCell
                    key={ent.minion.minionId ?? ent.minion.type}
                    minion={ent.minion}
                    owner={ent.owner}
                    isEnemy={true}
                    isActiveTurn={false}
                  />
                );
              })}
            </div>
          );
        })}

        {/* Ground divider spans all columns */}
        <div className="arena-ground-divider" />

        {/* My team row */}
        {displayPositions.map(pos => {
          const entities = myCells.get(pos) ?? [];
          const hasActiveTeam = entities.some((e: CellEntry) => e.kind === 'hero' && e.player.id === currentActorId);
          return (
            <div
              key={`team-${pos}`}
              className={`arena-cell-team${hasActiveTeam ? ' active-cell' : ''}`}
            >
              {entities.map((ent: CellEntry) => {
                if (ent.kind === 'hero') {
                  return (
                    <HeroCell
                      key={ent.player.id}
                      player={ent.player}
                      isEnemy={false}
                      isActiveTurn={currentActorId === ent.player.id && !gameState.awaitingMinionAction}
                      activeAnimations={activeAnimations}
                      floatingNumbers={floatingNumbers}
                    />
                  );
                }
                return (
                  <MinionCell
                    key={ent.minion.minionId ?? ent.minion.type}
                    minion={ent.minion}
                    owner={ent.owner}
                    isEnemy={false}
                    isActiveTurn={isMinionTurn && ent.owner.id === myPlayerId}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Portrait bar */}
      <PortraitBar
        gameState={gameState}
        myPlayerId={myPlayerId}
        myTeamIndex={myTeamIndex}
      />
    </div>
  );
}
