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

  // Color shifts from green → yellow → red as time runs out
  const color = remaining > 0.5
    ? '#22c55e'
    : remaining > 0.2
    ? '#f59e0b'
    : '#ef4444';

  const isUrgent = remaining <= 0.2;

  return (
    <div style={{
      width: '100%',
      height: 6,
      background: '#1e293b',
      borderRadius: 3,
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${remaining * 100}%`,
        height: '100%',
        background: color,
        borderRadius: 3,
        transition: 'width 0.1s linear',
        boxShadow: isUrgent ? `0 0 8px ${color}` : 'none',
      }} />
    </div>
  );
}
