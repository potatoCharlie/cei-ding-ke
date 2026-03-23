import React, { useState } from 'react';
import { getAllHeroes } from '@cei-ding-ke/shared';
import { getHeroVisual } from '../game/SpriteConfig.js';

interface Props {
  onSelect: (heroId: string) => void;
}

export function HeroSelect({ onSelect }: Props) {
  const heroes = getAllHeroes();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="heroselect-grid">
      {heroes.map(hero => {
        const visual = getHeroVisual(hero.id);
        const isHovered = hoveredId === hero.id;
        return (
          <button
            key={hero.id}
            onClick={() => onSelect(hero.id)}
            onMouseEnter={() => setHoveredId(hero.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={`heroselect-card ${isHovered ? 'hovered' : ''}`}
            style={{ '--hero-color': visual.color } as React.CSSProperties}
          >
            <div className="heroselect-header">
              <div className="heroselect-sprite" style={{ background: visual.bgGradient }}>
                {visual.emoji}
              </div>
              <div className="heroselect-title">
                <h3 className="heroselect-name">{hero.name}</h3>
                <p className="heroselect-desc">{hero.description}</p>
              </div>
            </div>

            <div className="heroselect-skills">
              {hero.passive && (
                <div className="heroselect-skill-row">
                  <span className="skill-tag purple">Passive</span>
                  <span className="skill-text"><strong>{hero.passive.name}</strong>: {hero.passive.description}</span>
                </div>
              )}

              {hero.physicalSkills.map(skill => (
                <div key={skill.id} className="heroselect-skill-row">
                  <span className="skill-tag red">Physical</span>
                  <span className="skill-text"><strong>{skill.name}</strong>: {skill.description}</span>
                </div>
              ))}

              {hero.magicSkills.map(skill => (
                <div key={skill.id} className="heroselect-skill-row">
                  <span className="skill-tag blue">Magic</span>
                  <span className="skill-text"><strong>{skill.name}</strong>: {skill.description}</span>
                </div>
              ))}

              {hero.minion && (
                <div className="heroselect-skill-row">
                  <span className="skill-tag green">Minion</span>
                  <span className="skill-text"><strong>{hero.minion.name}</strong>: {hero.minion.description}</span>
                </div>
              )}
            </div>
          </button>
        );
      })}

      <style>{`
        .heroselect-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .heroselect-card {
          background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
          border: 2px solid var(--border-base);
          border-radius: 14px;
          padding: 18px;
          color: var(--text-primary);
          cursor: pointer;
          text-align: left;
          font-family: var(--font-body);
          transition: all 0.2s ease;
          animation: fadeIn 0.3s ease-out both;
          position: relative;
          overflow: hidden;
        }

        .heroselect-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, #ffffff04, transparent);
          pointer-events: none;
        }

        .heroselect-card.hovered {
          border-color: var(--hero-color);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px #00000060, 0 0 0 1px var(--hero-color);
        }

        .heroselect-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }

        .heroselect-sprite {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          flex-shrink: 0;
          border: 2px solid #ffffff15;
          box-shadow: 0 2px 12px #00000040;
        }

        .heroselect-title {
          flex: 1;
          min-width: 0;
        }

        .heroselect-name {
          font-family: var(--font-display);
          font-size: 14px;
          color: var(--hero-color);
          margin-bottom: 3px;
          letter-spacing: 1px;
        }

        .heroselect-desc {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .heroselect-skills {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .heroselect-skill-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          line-height: 1.4;
        }

        .skill-tag {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .skill-tag.red { background: #ef444430; color: #fca5a5; border: 1px solid #ef444425; }
        .skill-tag.blue { background: #3b82f630; color: #93c5fd; border: 1px solid #3b82f625; }
        .skill-tag.green { background: #10b98130; color: #6ee7b7; border: 1px solid #10b98125; }
        .skill-tag.purple { background: #a855f730; color: #d8b4fe; border: 1px solid #a855f725; }

        .skill-text {
          color: var(--text-secondary);
        }

        .skill-text strong {
          color: var(--text-primary);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
