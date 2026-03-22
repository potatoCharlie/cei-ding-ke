import React, { useState } from 'react';
import type { RPSChoice } from '@cei-ding-ke/shared';

interface Props {
  onChoice: (choice: RPSChoice) => void;
}

const choices: { value: RPSChoice; emoji: string; label: string }[] = [
  { value: 'rock', emoji: '✊', label: 'Rock' },
  { value: 'paper', emoji: '✋', label: 'Paper' },
  { value: 'scissors', emoji: '✌️', label: 'Scissors' },
];

export function RPSPicker({ onChoice }: Props) {
  const [picked, setPicked] = useState(false);

  const handlePick = (choice: RPSChoice) => {
    if (picked) return;
    setPicked(true);
    onChoice(choice);
    // Reset after a short delay for next round
    setTimeout(() => setPicked(false), 2000);
  };

  return (
    <div style={{
      background: '#16213e',
      borderRadius: 12,
      padding: 20,
      border: '1px solid #334155',
      textAlign: 'center',
    }}>
      <h3 style={{ marginBottom: 12, color: '#fbbf24' }}>
        {picked ? 'Waiting for opponent...' : 'Choose your weapon!'}
      </h3>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
        {choices.map(({ value, emoji, label }) => (
          <button
            key={value}
            onClick={() => handlePick(value)}
            disabled={picked}
            style={{
              width: 100,
              height: 100,
              borderRadius: 16,
              border: '2px solid #475569',
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
            }}
          >
            <span>{emoji}</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
