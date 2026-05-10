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
        <div className="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="3" width="7" height="1" rx="0.5" fill="white" opacity="0.9"/>
            <rect x="2" y="5.5" width="5" height="1" rx="0.5" fill="white" opacity="0.7"/>
            <rect x="2" y="8" width="6" height="1" rx="0.5" fill="white" opacity="0.7"/>
            <rect x="2" y="10.5" width="4" height="1" rx="0.5" fill="white" opacity="0.5"/>
            <circle cx="12" cy="6.5" r="2.5" stroke="white" strokeWidth="1.2" opacity="0.9"/>
            <line x1="13.8" y1="8.5" x2="15.5" y2="10.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.9"/>
          </svg>
        </div>
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
