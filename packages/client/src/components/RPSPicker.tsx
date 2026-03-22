import React, { useState, useEffect } from 'react';
import type { RPSChoice } from '@cei-ding-ke/shared';

interface Props {
  onChoice: (choice: RPSChoice) => void;
  /** If provided, show the reveal phase with both choices. */
  revealData?: {
    myChoice?: RPSChoice;
    opponentChoice?: RPSChoice;
    iWon: boolean;
    draw: boolean;
  };
}

const choices: { value: RPSChoice; emoji: string; label: string }[] = [
  { value: 'rock', emoji: '✊', label: 'Rock' },
  { value: 'paper', emoji: '✋', label: 'Paper' },
  { value: 'scissors', emoji: '✌️', label: 'Scissors' },
];

export function RPSPicker({ onChoice, revealData }: Props) {
  const [picked, setPicked] = useState(false);
  const [hoveredChoice, setHoveredChoice] = useState<RPSChoice | null>(null);

  // Reset picked state when revealData changes (new round)
  useEffect(() => {
    if (!revealData) setPicked(false);
  }, [revealData]);

  const handlePick = (choice: RPSChoice) => {
    if (picked) return;
    setPicked(true);
    onChoice(choice);
  };

  return (
    <div style={{
      background: '#16213e',
      borderRadius: 12,
      padding: 20,
      border: '1px solid #334155',
      textAlign: 'center',
    }}>
      <h3 style={{ marginBottom: 12, color: '#fbbf24', fontSize: 16 }}>
        {picked ? 'Waiting for opponent...' : 'Choose your weapon!'}
      </h3>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
        {choices.map(({ value, emoji, label }) => {
          const isHovered = hoveredChoice === value;
          return (
            <button
              key={value}
              onClick={() => handlePick(value)}
              onMouseEnter={() => !picked && setHoveredChoice(value)}
              onMouseLeave={() => setHoveredChoice(null)}
              disabled={picked}
              style={{
                width: 100,
                height: 100,
                borderRadius: 16,
                border: `2px solid ${isHovered && !picked ? '#fbbf24' : '#475569'}`,
                background: picked ? '#1e293b' : '#0f172a',
                cursor: picked ? 'default' : 'pointer',
                fontSize: 40,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                opacity: picked ? 0.5 : 1,
                transition: 'all 0.2s',
                transform: isHovered && !picked ? 'scale(1.1)' : 'scale(1)',
              }}
            >
              <span style={{
                display: 'inline-block',
                animation: !picked ? 'rpsBob 1.5s ease-in-out infinite' : 'none',
                animationDelay: `${choices.indexOf({ value, emoji, label } as any) * 0.2}s`,
              }}>
                {emoji}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes rpsBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
