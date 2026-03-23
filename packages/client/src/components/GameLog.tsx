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
    <div className="gamelog-container">
      {logs.length === 0 && (
        <p className="gamelog-empty">Game log will appear here...</p>
      )}
      {logs.map((log, i) => (
        <div
          key={i}
          className={`gamelog-entry ${log.startsWith('---') ? 'divider' : ''} ${log.startsWith('  →') ? 'effect' : ''}`}
        >
          {log}
        </div>
      ))}
      <div ref={bottomRef} />

      <style>{`
        .gamelog-container {
          background: var(--bg-deep);
          border-radius: 10px;
          padding: 12px 14px;
          max-height: 180px;
          overflow-y: auto;
          border: 1px solid var(--border-dim);
          font-size: 12px;
          font-family: 'Chakra Petch', monospace;
        }

        .gamelog-empty {
          color: var(--text-dim);
          font-style: italic;
        }

        .gamelog-entry {
          color: var(--text-secondary);
          padding: 2px 0;
          line-height: 1.5;
          border-bottom: 1px solid #ffffff04;
        }

        .gamelog-entry.divider {
          color: var(--text-dim);
          border-bottom: 1px solid var(--border-dim);
          margin: 4px 0;
          padding: 4px 0;
          font-size: 11px;
        }

        .gamelog-entry.effect {
          color: var(--text-dim);
          padding-left: 12px;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}
