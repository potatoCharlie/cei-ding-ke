import React from 'react';
import { getAllHeroes } from '@cei-ding-ke/shared';
import { getHeroVisual } from '../game/SpriteConfig.js';

interface Props {
  onSelect: (heroId: string) => void;
  selectedHeroId?: string;
}

export function HeroSelect({ onSelect, selectedHeroId }: Props) {
  const heroes = getAllHeroes();

  return (
    <div className="heroselect-grid">
      {heroes.map(hero => {
        const visual = getHeroVisual(hero.id);
        const isSelected = selectedHeroId === hero.id;

        return (
          <button
            key={hero.id}
            onClick={() => onSelect(hero.id)}
            className={`heroselect-card ${isSelected ? 'selected' : ''}`}
            style={{ '--hero-color': visual.color } as React.CSSProperties}
          >
            {/* Avatar strip */}
            <div
              className="heroselect-avatar"
              style={{ background: visual.bgGradient }}
            >
              <span className="heroselect-emoji">{visual.emoji}</span>
            </div>

            {/* Info panel */}
            <div className="heroselect-info">
              <div className="heroselect-name">{hero.name.toUpperCase()}</div>
              <div className="heroselect-archetype">{visual.archetype}</div>
              <div className="heroselect-skills">
                {hero.passive && (
                  <div className="heroselect-skill-line">🟣 {hero.passive.name}</div>
                )}
                {hero.physicalSkills.map(s => (
                  <div key={s.id} className="heroselect-skill-line">🔴 {s.name}</div>
                ))}
                {hero.magicSkills.map(s => (
                  <div key={s.id} className="heroselect-skill-line">🔵 {s.name}</div>
                ))}
                {hero.minion && (
                  <div className="heroselect-skill-line">🟢 {hero.minion.name}</div>
                )}
              </div>
            </div>

            {/* Bottom accent bar */}
            <div className="heroselect-accent" />
          </button>
        );
      })}

      <style>{`
        .heroselect-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .heroselect-card {
          display: flex;
          position: relative;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid #374151;
          background: linear-gradient(135deg, var(--bg-elevated), var(--bg-surface));
          cursor: pointer;
          text-align: left;
          font-family: var(--font-body);
          transition: all 0.2s ease;
          padding: 0;
        }

        .heroselect-card:hover {
          border-color: var(--hero-color);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px #00000050;
        }

        .heroselect-card.selected {
          border: 2px solid var(--hero-color);
          box-shadow: 0 0 12px color-mix(in srgb, var(--hero-color) 30%, transparent);
        }

        .heroselect-avatar {
          width: 52px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .heroselect-emoji {
          font-size: 28px;
          filter: drop-shadow(0 2px 4px #00000080);
        }

        .heroselect-info {
          flex: 1;
          padding: 6px 8px;
          overflow: hidden;
          min-width: 0;
        }

        .heroselect-name {
          font-family: var(--font-display);
          font-size: 10px;
          color: var(--hero-color);
          letter-spacing: 1px;
          margin-bottom: 1px;
        }

        .heroselect-archetype {
          font-size: 7px;
          color: #94a3b8;
          margin-bottom: 4px;
        }

        .heroselect-skills {
          display: flex;
          flex-direction: column;
          gap: 1px;
          overflow: hidden;
        }

        .heroselect-skill-line {
          font-size: 7px;
          color: var(--text-secondary);
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .heroselect-accent {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #374151;
        }

        .heroselect-card.selected .heroselect-accent {
          background: var(--hero-color);
        }
      `}</style>
    </div>
  );
}
