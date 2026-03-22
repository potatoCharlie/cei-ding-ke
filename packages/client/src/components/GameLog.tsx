import React, { useEffect, useRef } from 'react';

interface Props {
  logs: string[];
}

export function GameLog({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 8,
      padding: 12,
      maxHeight: 200,
      overflowY: 'auto',
      border: '1px solid #1e293b',
      fontSize: 13,
      fontFamily: 'monospace',
    }}>
      {logs.length === 0 && (
        <p style={{ color: '#475569' }}>Game log will appear here...</p>
      )}
      {logs.map((log, i) => (
        <div key={i} style={{ color: '#94a3b8', padding: '2px 0' }}>
          {log}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
