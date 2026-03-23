import React, { useState, useEffect } from 'react';

interface Props {
  totalSeconds: number;
  startTime: number;
}

export function TimerRope({ totalSeconds, startTime }: Props) {
  const [remaining, setRemaining] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = Math.max(0, 1 - elapsed / totalSeconds);
      setRemaining(pct);
    }, 50);
    return () => clearInterval(interval);
  }, [totalSeconds, startTime]);

  const color = remaining > 0.5
    ? 'var(--hp-green)'
    : remaining > 0.2
    ? 'var(--hp-yellow)'
    : 'var(--hp-red)';

  const isUrgent = remaining <= 0.2;

  return (
    <div className="timer-rope">
      <div
        className={`timer-fill ${isUrgent ? 'urgent' : ''}`}
        style={{
          width: `${remaining * 100}%`,
          background: color,
          boxShadow: isUrgent ? `0 0 10px ${color}, 0 0 20px ${color}` : `0 0 6px ${color}`,
        }}
      />

      <style>{`
        .timer-rope {
          width: 100%;
          height: 6px;
          background: var(--bg-deep);
          border-radius: 3px;
          overflow: hidden;
          border: 1px solid var(--border-dim);
        }

        .timer-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.1s linear;
        }

        .timer-fill.urgent {
          animation: timerPulse 0.5s ease-in-out infinite;
        }

        @keyframes timerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
