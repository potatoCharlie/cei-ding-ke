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

  useEffect(() => {
    if (!revealData) setPicked(false);
  }, [revealData]);

  const handlePick = (choice: RPSChoice) => {
    if (picked) return;
    setPicked(true);
    onChoice(choice);
  };

  return (
    <div className="rps-container">
      <h3 className="rps-title">
        {picked ? 'Waiting for opponent...' : 'Choose your weapon!'}
      </h3>
      <div className="rps-choices">
        {choices.map(({ value, emoji, label }, idx) => {
          const isHovered = hoveredChoice === value;
          return (
            <button
              key={value}
              onClick={() => handlePick(value)}
              onMouseEnter={() => !picked && setHoveredChoice(value)}
              onMouseLeave={() => setHoveredChoice(null)}
              disabled={picked}
              className={`rps-btn ${isHovered && !picked ? 'hovered' : ''} ${picked ? 'disabled' : ''}`}
              style={{ animationDelay: `${idx * 0.15}s` }}
            >
              <span className="rps-emoji">{emoji}</span>
              <span className="rps-label">{label}</span>
            </button>
          );
        })}
      </div>

      <style>{`
        .rps-container {
          background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
          border-radius: 14px;
          padding: 22px;
          border: 1px solid var(--border-base);
          text-align: center;
          box-shadow: 0 4px 24px #00000040;
        }

        .rps-title {
          font-family: var(--font-display);
          font-size: 12px;
          color: var(--gold);
          margin-bottom: 16px;
          letter-spacing: 1px;
          text-shadow: 0 0 12px #f59e0b30;
        }

        .rps-choices {
          display: flex;
          justify-content: center;
          gap: 14px;
        }

        .rps-btn {
          width: 110px;
          height: 110px;
          border-radius: 16px;
          border: 2px solid var(--border-base);
          background: var(--bg-card);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
          animation: fadeIn 0.3s ease-out both;
          position: relative;
          overflow: hidden;
        }

        .rps-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, #ffffff06, transparent);
          pointer-events: none;
        }

        .rps-btn.hovered {
          border-color: var(--gold);
          transform: scale(1.08) translateY(-4px);
          box-shadow: 0 8px 24px #f59e0b25, 0 0 0 1px #f59e0b30;
          background: linear-gradient(180deg, #f59e0b12, var(--bg-card));
        }

        .rps-btn.disabled {
          opacity: 0.35;
          cursor: not-allowed;
          transform: none;
        }

        .rps-emoji {
          font-size: 42px;
          display: inline-block;
          transition: transform 0.2s;
        }

        .rps-btn.hovered .rps-emoji {
          transform: scale(1.1);
        }

        .rps-label {
          font-family: var(--font-display);
          font-size: 9px;
          color: var(--text-dim);
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .rps-btn.hovered .rps-label {
          color: var(--gold-light);
        }
      `}</style>
    </div>
  );
}
