'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { streamQuery } from '@/lib/sseClient';
import type { AgentEvent } from '@/lib/sseClient';
import type { TargetMode, IntegrationStatus, ZyndPaymentInfo, BackendIntegrationsStatus } from '@/lib/types';
import StatusBar from '@/components/StatusBar';
import LeftRail from '@/components/LeftRail';
import QueryInput from '@/components/QueryInput';
import ReasoningTrace from '@/components/ReasoningTrace';
import AnswerPanel from '@/components/AnswerPanel';

const API_URL = process.env.NEXT_PUBLIC_FILEMIND_API_URL ?? 'http://localhost:3001';

type ImportStatus = 'idle' | 'importing' | 'done' | 'error';

function ImportProgress({ repoUrl }: { repoUrl: string }) {
  return (
    <motion.div
      className="import-event import-event--importing"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="import-event__icon">
        <Loader2 size={13} className="import-spinner" />
      </div>
      <div className="import-event__body">
        <div className="import-event__label">Importing repository</div>
        <div className="import-event__detail">{repoUrl}</div>
      </div>
    </motion.div>
  );
}

function ImportResult({ message }: { message: string }) {
  return (
    <motion.div
      className="import-event import-event--done"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="import-event__icon">
        <CheckCircle2 size={13} />
      </div>
      <div className="import-event__body">
        <div className="import-event__label">Import complete</div>
        <div className="import-event__detail">{message}</div>
      </div>
    </motion.div>
  );
}

function ImportError({ message }: { message: string }) {
  return (
    <motion.div
      className="import-event import-event--error"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="import-event__icon">
        <XCircle size={13} />
      </div>
      <div className="import-event__body">
        <div className="import-event__label">Import failed</div>
        <div className="import-event__detail">{message}</div>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const [query, setQuery] = useState('How does authentication work?');
  const [targetPath, setTargetPath] = useState('../demo/sample-repos/nextjs-starter');
  const [targetMode, setTargetMode] = useState<TargetMode>('local');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [iterationCount, setIterationCount] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    apify: 'unknown',
    zynd: 'demo_mode',
    superplane: 'disabled',
  });
  const [zyndPaymentInfo, setZyndPaymentInfo] = useState<ZyndPaymentInfo | null>(null);

  const streamRef = useRef<{ close: () => void } | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  // Tracks the backend's reported superplane enabled state for use after investigations
  const backendSuperplaneEnabled = useRef(false);

  // Health check polling
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        setBackendStatus(res.ok ? 'connected' : 'error');
      } catch {
        setBackendStatus('error');
      }
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);

  // Fetch integration status on mount — sets honest initial badge state from backend
  useEffect(() => {
    const fetchIntegrations = async () => {
      try {
        const res = await fetch(`${API_URL}/integrations/status`);
        if (!res.ok) return;
        const status: BackendIntegrationsStatus = await res.json();

        backendSuperplaneEnabled.current = status.superplane.enabled && status.superplane.configured;

        setIntegrations(prev => ({
          ...prev,
          apify: status.apify.configured ? 'ready' : 'not_configured',
          zynd: status.zynd.enabled
            ? status.zynd.configured
              ? 'enabled'
              : 'error'
            : 'demo_mode',
          superplane: status.superplane.enabled ? 'disabled' : 'disabled',
        }));
      } catch {
        // Backend unavailable — leave defaults for graceful degradation
      }
    };
    fetchIntegrations();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    streamRef.current?.close();
  }, []);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length, importStatus]);

  // Sync apify badge with target mode (only if in github mode and apify unknown)
  useEffect(() => {
    if (targetMode === 'github' && integrations.apify === 'unknown') {
      setIntegrations(prev => ({ ...prev, apify: 'not_configured' }));
    }
  }, [targetMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildEventHandlers = useCallback((resolvedPath: string) => {
    return {
      onEvent(event: AgentEvent) {
        setEvents(prev => [...prev, event]);
        if (event.type === 'final' && event.content) setAnswer(event.content);
        if (event.type === 'done') {
          setIterationCount(event.iterationCount ?? null);
          setIsRunning(false);
          // Mark superplane as emitted if it was configured — server fires it server-side
          if (backendSuperplaneEnabled.current) {
            setIntegrations(prev => ({ ...prev, superplane: 'event_emitted' }));
          }
        }
        if (event.type === 'error') {
          setError(event.error ?? 'Unknown error');
          setIsRunning(false);
        }
      },
      onError(err: Error) {
        setError(err.message);
        setIsRunning(false);
      },
      onClose() {
        setIsRunning(false);
      },
      onPaymentRequired(info: ZyndPaymentInfo) {
        setZyndPaymentInfo(info);
        setIntegrations(prev => ({ ...prev, zynd: 'payment_required' }));
        setIsRunning(false);
        // query is preserved intentionally — user can retry after paying
      },
      onServiceUnavailable(message: string) {
        setError(message);
        setIsRunning(false);
      },
      resolvedPath,
    };
  }, []);

  const handleSubmit = useCallback(() => {
    if (isRunning || !query.trim()) return;
    streamRef.current?.close();
    streamRef.current = null;

    setEvents([]);
    setAnswer(null);
    setIterationCount(null);
    setError(null);
    setZyndPaymentInfo(null);
    setSubmittedQuery(query.trim());
    setImportStatus('idle');
    setImportMessage(null);
    setIntegrations(prev => ({
      ...prev,
      superplane: backendSuperplaneEnabled.current ? 'pending' : 'disabled',
    }));
    setIsRunning(true);

    const handlers = buildEventHandlers(targetPath.trim());

    const stream = streamQuery({
      baseUrl: API_URL,
      query: query.trim(),
      targetPath: targetPath.trim(),
      onEvent: handlers.onEvent,
      onError: handlers.onError,
      onClose: handlers.onClose,
      onPaymentRequired: handlers.onPaymentRequired,
      onServiceUnavailable: handlers.onServiceUnavailable,
    });

    streamRef.current = stream;
  }, [isRunning, query, targetPath, buildEventHandlers]);

  const handleGithubSubmit = useCallback(async () => {
    if (isRunning || !query.trim() || !repoUrl.trim()) return;
    streamRef.current?.close();
    streamRef.current = null;

    setEvents([]);
    setAnswer(null);
    setIterationCount(null);
    setError(null);
    setZyndPaymentInfo(null);
    setSubmittedQuery(query.trim());
    setImportStatus('importing');
    setImportMessage(null);
    setIntegrations(prev => ({
      ...prev,
      apify: 'importing',
      superplane: backendSuperplaneEnabled.current ? 'pending' : 'disabled',
    }));

    try {
      const res = await fetch(`${API_URL}/repos/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          branch: branch.trim() || 'main',
        }),
      });

      // Payment required from import endpoint
      if (res.status === 402) {
        const body = await res.json().catch(() => ({})) as Record<string, string>;
        const info: ZyndPaymentInfo = {
          price: body.price ?? '0.01',
          currency: body.currency ?? 'USDC',
          walletAddress: body.walletAddress ?? '',
          agentId: body.agentId ?? '',
          paymentHeader: body.paymentHeader ?? 'x-payment',
        };
        setZyndPaymentInfo(info);
        setIntegrations(prev => ({ ...prev, zynd: 'payment_required' }));
        setImportStatus('error');
        setImportMessage('Payment required to import repository');
        setIsRunning(false);
        return;
      }

      const data: { targetPath?: string; repoUrl?: string; branch?: string; fileCount?: number; error?: string } =
        await res.json();

      if (!res.ok) {
        const errMsg = data.error ?? 'Import failed';
        setImportStatus('error');
        setImportMessage(errMsg);

        const isApifyMisconfigured =
          errMsg.toLowerCase().includes('apify') ||
          errMsg.toLowerCase().includes('not configured');

        setIntegrations(prev => ({
          ...prev,
          apify: isApifyMisconfigured ? 'not_configured' : 'error',
        }));
        return;
      }

      const fileCount = data.fileCount ?? 0;
      const importedPath = data.targetPath ?? '';
      const importedRepo = data.repoUrl ?? repoUrl.trim();

      setImportStatus('done');
      setImportMessage(`Imported ${fileCount} files from ${importedRepo}`);
      setIntegrations(prev => ({ ...prev, apify: 'imported' }));

      // Phase 2: stream with the returned targetPath
      setIsRunning(true);
      const handlers = buildEventHandlers(importedPath);

      const stream = streamQuery({
        baseUrl: API_URL,
        query: query.trim(),
        targetPath: importedPath,
        onEvent: handlers.onEvent,
        onError: handlers.onError,
        onClose: handlers.onClose,
        onPaymentRequired: handlers.onPaymentRequired,
        onServiceUnavailable: handlers.onServiceUnavailable,
      });

      streamRef.current = stream;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Import failed';
      setImportStatus('error');
      setImportMessage(errMsg);
      setIntegrations(prev => ({ ...prev, apify: 'error' }));
    }
  }, [isRunning, query, repoUrl, branch, buildEventHandlers]);

  const handleCancel = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    setIsRunning(false);
  }, []);

  const handleTargetModeChange = useCallback((mode: TargetMode) => {
    setTargetMode(mode);
  }, []);

  const onSubmit = targetMode === 'github' ? handleGithubSubmit : handleSubmit;

  return (
    <div className="app-shell">
      <StatusBar
        backendStatus={backendStatus}
        isRunning={isRunning}
        iterationCount={iterationCount}
      />
      <div className="workbench">
        <LeftRail
          targetPath={targetPath}
          events={events}
          isRunning={isRunning}
          targetMode={targetMode}
          repoUrl={repoUrl}
          integrations={integrations}
          zyndPaymentInfo={zyndPaymentInfo}
        />
        <div className="center-panel">
          <div className="conversation-feed" ref={feedRef}>
            {!submittedQuery ? (
              <div className="feed-empty">
                <div className="feed-empty__icon">
                  <Search size={18} />
                </div>
                <div className="feed-empty__title">No investigation running</div>
                <div className="feed-empty__sub">
                  {'Type a question below and FileMind will\nwalk the file system and cite its path.'}
                </div>
              </div>
            ) : (
              <>
                {/* Import progress -- shown above user bubble in GitHub mode */}
                <AnimatePresence>
                  {importStatus === 'importing' && (
                    <ImportProgress repoUrl={repoUrl} />
                  )}
                  {importStatus === 'done' && importMessage && (
                    <ImportResult message={importMessage} />
                  )}
                  {importStatus === 'error' && importMessage && (
                    <ImportError message={importMessage} />
                  )}
                </AnimatePresence>

                {/* Only show user bubble + trace if import succeeded or we're in local mode */}
                {(importStatus !== 'error') && (
                  <>
                    <div className="user-bubble">
                      <div className="user-bubble__content">{submittedQuery}</div>
                    </div>
                    <ReasoningTrace events={events} isRunning={isRunning} />
                  </>
                )}
              </>
            )}
          </div>
          <QueryInput
            query={query}
            targetPath={targetPath}
            isRunning={isRunning}
            onQueryChange={setQuery}
            onTargetPathChange={setTargetPath}
            onSubmit={onSubmit}
            onCancel={handleCancel}
            targetMode={targetMode}
            onTargetModeChange={handleTargetModeChange}
            repoUrl={repoUrl}
            onRepoUrlChange={setRepoUrl}
            branch={branch}
            onBranchChange={setBranch}
          />
        </div>
        <AnswerPanel
          answer={answer}
          iterationCount={iterationCount}
          isRunning={isRunning}
          error={error}
          events={events}
        />
      </div>
    </div>
  );
}
