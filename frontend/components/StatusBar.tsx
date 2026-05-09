'use client';

type BackendStatus = 'checking' | 'connected' | 'error';

const STATUS_LABEL: Record<BackendStatus, string> = {
  checking: 'checking',
  connected: 'connected',
  error: 'unavailable',
};

interface StatusBarProps {
  backendStatus: BackendStatus;
  isRunning: boolean;
  iterationCount: number | null;
}

export default function StatusBar({ backendStatus, isRunning, iterationCount }: StatusBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <div className="topbar__logo">FM</div>
        <span className="topbar__name">FileMind</span>
        <div className="topbar__divider" />
        <span className="topbar__subtitle">Structure-aware codebase investigation</span>
      </div>

      <div className="topbar__right">
        {iterationCount !== null && (
          <div className="topbar__iter">iter: {iterationCount}</div>
        )}

        {isRunning && (
          <div className="status-pill status-pill--running">
            <div className="status-pill__dot" />
            investigating
          </div>
        )}

        <div className={`status-pill status-pill--${backendStatus}`}>
          <div className="status-pill__dot" />
          {STATUS_LABEL[backendStatus]}
        </div>
      </div>
    </header>
  );
}
