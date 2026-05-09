'use client';

import { motion } from 'framer-motion';
import { Cloud, CreditCard, Zap } from 'lucide-react';
import type { AgentEvent } from '@/lib/sseClient';
import type { TargetMode, IntegrationStatus, ApifyStatus, ZyndStatus, SuperplaneStatus } from '@/lib/types';

interface LeftRailProps {
  targetPath: string;
  events: AgentEvent[];
  isRunning: boolean;
  targetMode: TargetMode;
  repoUrl?: string;
  integrations: IntegrationStatus;
}

const TOOL_LEGEND = [
  { key: 'tree',      label: 'Map repository' },
  { key: 'read',      label: 'Read file' },
  { key: 'grep',      label: 'Search symbols' },
  { key: 'jump',      label: 'Follow import' },
  { key: 'summarize', label: 'Summarize file' },
] as const;

const APIFY_STATUS_LABEL: Record<ApifyStatus, string> = {
  unknown:        'unknown',
  not_configured: 'not configured',
  ready:          'ready',
  importing:      'importing…',
  imported:       'imported',
  error:          'error',
};

const ZYND_STATUS_LABEL: Record<ZyndStatus, string> = {
  demo_mode:        'demo mode',
  enabled:          'enabled',
  payment_required: 'pay required',
  error:            'error',
};

const SUPERPLANE_STATUS_LABEL: Record<SuperplaneStatus, string> = {
  disabled:      'disabled',
  pending:       'pending…',
  event_emitted: 'emitted',
  event_failed:  'failed',
};

function ApifyBadge({ status }: { status: ApifyStatus }) {
  const statusClass = `status--${status}`;
  return (
    <div className="integration-item">
      <div className="integration-item__name">
        <Cloud size={11} />
        <span>Apify</span>
      </div>
      <motion.span
        key={status}
        className={`integration-status-badge ${statusClass}`}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
      >
        {APIFY_STATUS_LABEL[status]}
      </motion.span>
    </div>
  );
}

function ZyndBadge({ status }: { status: ZyndStatus }) {
  const statusClass = `status--${status}`;
  return (
    <div className="integration-item">
      <div className="integration-item__name">
        <CreditCard size={11} />
        <span>Zynd x402</span>
      </div>
      <motion.span
        key={status}
        className={`integration-status-badge ${statusClass}`}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
      >
        {ZYND_STATUS_LABEL[status]}
      </motion.span>
    </div>
  );
}

function SuperplaneBadge({ status }: { status: SuperplaneStatus }) {
  const statusClass = `status--${status}`;
  return (
    <div className="integration-item">
      <div className="integration-item__name">
        <Zap size={11} />
        <span>Superplane</span>
      </div>
      <motion.span
        key={status}
        className={`integration-status-badge ${statusClass}`}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
      >
        {SUPERPLANE_STATUS_LABEL[status]}
      </motion.span>
    </div>
  );
}

export default function LeftRail({
  targetPath,
  events,
  isRunning,
  targetMode,
  repoUrl,
  integrations,
}: LeftRailProps) {
  const toolCalls = events.filter(e => e.type === 'tool_call');
  const toolResults = events.filter(e => e.type === 'tool_result');

  const filesRead = new Set<string>();
  for (const e of events) {
    if (e.type === 'tool_call' && (e.tool === 'read' || e.tool === 'jump') && e.input?.path) {
      filesRead.add(String(e.input.path));
    }
  }

  const status = isRunning ? 'Investigating…' : events.length > 0 ? 'Complete' : 'Idle';

  const repoDisplay = targetMode === 'github'
    ? (repoUrl ?? '—')
    : (targetPath || '—');

  return (
    <aside className="left-rail">
      <div className="rail-scroll">

        {/* Repository */}
        <div className="rail-section">
          <div className="rail-label">Repository</div>
          <div className="rail-value">{repoDisplay}</div>
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

        {/* Integration status */}
        <div className="rail-section">
          <div className="rail-label">Integrations</div>
          <div className="integration-list">
            <ApifyBadge status={integrations.apify} />
            <ZyndBadge status={integrations.zynd} />
            <SuperplaneBadge status={integrations.superplane} />
          </div>
        </div>

      </div>
    </aside>
  );
}
