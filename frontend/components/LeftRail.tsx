'use client';

import type { AgentEvent } from '@/lib/sseClient';

interface LeftRailProps {
  targetPath: string;
  events: AgentEvent[];
  isRunning: boolean;
}

const TOOL_LEGEND = [
  { key: 'tree',      label: 'Map repository' },
  { key: 'read',      label: 'Read file' },
  { key: 'grep',      label: 'Search symbols' },
  { key: 'jump',      label: 'Follow import' },
  { key: 'summarize', label: 'Summarize file' },
] as const;

const SPONSOR_BADGES = [
  { label: 'Apify remote repo', tag: 'pending' },
  { label: 'Zynd x402',         tag: 'pending' },
  { label: 'Superplane',        tag: 'pending' },
];

export default function LeftRail({ targetPath, events, isRunning }: LeftRailProps) {
  const toolCalls = events.filter(e => e.type === 'tool_call');
  const toolResults = events.filter(e => e.type === 'tool_result');

  const filesRead = new Set<string>();
  for (const e of events) {
    if (e.type === 'tool_call' && (e.tool === 'read' || e.tool === 'jump') && e.input?.path) {
      filesRead.add(String(e.input.path));
    }
  }

  const status = isRunning ? 'Investigating…' : events.length > 0 ? 'Complete' : 'Idle';

  return (
    <aside className="left-rail">
      <div className="rail-scroll">

        {/* Repository */}
        <div className="rail-section">
          <div className="rail-label">Repository</div>
          <div className="rail-value">{targetPath || '—'}</div>
        </div>

        {/* Session stats */}
        <div className="rail-section">
          <div className="rail-label">Session</div>
          <div className="rail-stat">
            <span>Status</span>
            <span className="rail-stat__value">{status}</span>
          </div>
          <div className="rail-stat">
            <span>Tool calls</span>
            <span className="rail-stat__value">{toolCalls.length}</span>
          </div>
          <div className="rail-stat">
            <span>Results</span>
            <span className="rail-stat__value">{toolResults.length}</span>
          </div>
          <div className="rail-stat">
            <span>Files seen</span>
            <span className="rail-stat__value">{filesRead.size}</span>
          </div>
        </div>

        {/* Tool legend */}
        <div className="rail-section">
          <div className="rail-label">Tools</div>
          <div className="tool-legend">
            {TOOL_LEGEND.map(t => (
              <div key={t.key} className="tool-legend-item">
                <div className={`tool-dot tool-dot--${t.key}`} />
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Files read */}
        {filesRead.size > 0 && (
          <div className="rail-section">
            <div className="rail-label">Files read</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {Array.from(filesRead).map(f => (
                <div key={f} className="rail-value" style={{ fontSize: 10, wordBreak: 'break-all' }}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sponsor track badges */}
        <div className="rail-section">
          <div className="rail-label">Integrations</div>
          <div className="sponsor-badges">
            {SPONSOR_BADGES.map(b => (
              <div key={b.label} className="sponsor-badge">
                <span>{b.label}</span>
                <span className="sponsor-badge__tag">{b.tag}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </aside>
  );
}
