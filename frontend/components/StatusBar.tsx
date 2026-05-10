'use client';

import { Settings2 } from 'lucide-react';

type BackendStatus = 'checking' | 'connected' | 'error';

const STATUS_LABEL: Record<BackendStatus, string> = {
  checking: 'connecting',
  connected: 'connected',
  error: 'offline',
};

interface StatusBarProps {
  backendStatus: BackendStatus;
  isRunning: boolean;
  iterationCount: number | null;
  onOpenIntegrations: () => void;
  integrationsAlertCount?: number;
  integrationsButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function StatusBar({
  backendStatus,
  isRunning,
  iterationCount,
  onOpenIntegrations,
  integrationsAlertCount = 0,
  integrationsButtonRef,
}: StatusBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <div className="brand-mark" aria-hidden="true">FM</div>
        <span className="brand-name">FileMind</span>
        <span className="brand-meta">structure-aware nav</span>
      </div>

      <div className="topbar__right">
        {iterationCount !== null && !isRunning && (
          <span className="iter-pill">
            <span className="iter-pill__num">{iterationCount}</span> iter
          </span>
        )}

        {isRunning && (
          <span className="status-pill status-pill--running" aria-live="polite">
            <span className="status-pill__dot" />
            investigating
          </span>
        )}

        <span className={`status-pill status-pill--${backendStatus}`} aria-live="polite">
          <span className="status-pill__dot" />
          {STATUS_LABEL[backendStatus]}
        </span>

        <button
          ref={integrationsButtonRef}
          type="button"
          className="topbar-btn"
          onClick={onOpenIntegrations}
          aria-label="Open integrations panel"
        >
          <Settings2 size={13} aria-hidden="true" />
          <span>Integrations</span>
          {integrationsAlertCount > 0 && (
            <span className="topbar-btn__count" aria-label={`${integrationsAlertCount} alerts`}>
              {integrationsAlertCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
