import React from 'react';
import { getAllHeroes } from '@cei-ding-ke/shared';

interface Props {
  onSelect: (heroId: string) => void;
}

export function HeroSelect({ onSelect }: Props) {
  const heroes = getAllHeroes();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {heroes.map(hero => (
        <button
          key={hero.id}
          onClick={() => onSelect(hero.id)}
          style={{
            background: '#16213e',
            border: '2px solid #334155',
            borderRadius: 12,
            padding: 16,
            color: '#eee',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <h3 style={{ color: '#fbbf24', marginBottom: 4 }}>{hero.name}</h3>
          <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8 }}>{hero.description}</p>

          {hero.passive && (
            <div style={{ marginBottom: 6 }}>
              <span style={tagStyle('purple')}>Passive</span>
              <span style={{ fontSize: 13 }}>{hero.passive.name}: {hero.passive.description}</span>
            </div>
          )}

          {hero.physicalSkills.map(skill => (
            <div key={skill.id} style={{ marginBottom: 4 }}>
              <span style={tagStyle('red')}>Physical</span>
              <span style={{ fontSize: 13 }}>
                <strong>{skill.name}</strong>: {skill.description}
              </span>
            </div>
          ))}

          {hero.magicSkills.map(skill => (
            <div key={skill.id} style={{ marginBottom: 4 }}>
              <span style={tagStyle('blue')}>Magic</span>
              <span style={{ fontSize: 13 }}>
                <strong>{skill.name}</strong>: {skill.description}
              </span>
            </div>
          ))}

          {hero.minion && (
            <div>
              <span style={tagStyle('green')}>Minion</span>
              <span style={{ fontSize: 13 }}>
                <strong>{hero.minion.name}</strong>: {hero.minion.description}
              </span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function tagStyle(color: string): React.CSSProperties {
  const colors: Record<string, string> = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#22c55e',
    purple: '#a855f7',
  };
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    background: colors[color] || '#666',
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    marginRight: 6,
    textTransform: 'uppercase',
  };
}
