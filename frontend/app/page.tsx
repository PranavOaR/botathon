'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Sparkles, GitBranch, Search } from 'lucide-react';
import { streamQuery } from '@/lib/sseClient';
import type { AgentEvent } from '@/lib/sseClient';
import type {
  TargetMode,
  IntegrationStatus,
  ZyndPaymentInfo,
  BackendIntegrationsStatus,
} from '@/lib/types';
import StatusBar from '@/components/StatusBar';
import QueryInput from '@/components/QueryInput';
import ChatFeed from '@/components/ChatFeed';
import InvestigationCard from '@/components/InvestigationCard';
import AnswerCard from '@/components/AnswerCard';
import ImportCard from '@/components/ImportCard';
import IntegrationsDrawer from '@/components/IntegrationsDrawer';

const API_URL = process.env.NEXT_PUBLIC_FILEMIND_API_URL ?? 'http://localhost:3001';

type ImportStatus = 'idle' | 'importing' | 'done' | 'error';

const EXAMPLE_PROMPTS = [
  { label: 'How does authentication work?',         icon: 'shield' as const },
  { label: 'Where is JWT validation implemented?',  icon: 'search' as const },
  { label: 'Map the routing structure',             icon: 'tree' as const },
  { label: 'What files change to add RBAC?',        icon: 'edit' as const },
];

function ExampleChipIcon({ kind }: { kind: 'shield' | 'search' | 'tree' | 'edit' }) {
  switch (kind) {
    case 'search': return <Search size={12} aria-hidden="true" />;
    case 'tree':   return <GitBranch size={12} aria-hidden="true" />;
    default:       return <Sparkles size={12} aria-hidden="true" />;
  }
}

function EmptyHero({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <motion.div
      className="empty-hero"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="empty-hero__mark" aria-hidden="true">FM</div>
      <h1 className="empty-hero__title">
        Ask <em>FileMind</em> anything about your codebase
      </h1>
      <p className="empty-hero__sub">
        FileMind walks the file tree, follows imports, and cites the exact path
        it took — no embeddings, no stale RAG.
      </p>
      <div className="empty-hero__chips">
        {EXAMPLE_PROMPTS.map(p => (
          <button
            key={p.label}
            type="button"
            className="example-chip"
            onClick={() => onPick(p.label)}
          >
            <span className="example-chip__icon">
              <ExampleChipIcon kind={p.icon} />
            </span>
            {p.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <motion.div
      className="user-msg"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className="user-msg__bubble">{content}</div>
    </motion.div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <motion.div
      className="inline-error"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      role="alert"
    >
      <ArrowRight size={14} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
      <div>
        <div className="inline-error__title">Investigation failed</div>
        <div className="inline-error__detail">{message}</div>
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    apify: 'unknown',
    zynd: 'demo_mode',
    superplane: 'disabled',
  });
  const [zyndPaymentInfo, setZyndPaymentInfo] = useState<ZyndPaymentInfo | null>(null);

  const streamRef = useRef<{ close: () => void } | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const backendSuperplaneEnabled = useRef(false);

  // Health check
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

  // Integrations status fetch
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
            ? status.zynd.configured ? 'enabled' : 'error'
            : 'demo_mode',
          superplane: status.superplane.enabled ? 'disabled' : 'disabled',
        }));
      } catch {
        // graceful degradation
      }
    };
    fetchIntegrations();
  }, []);

  // Cleanup
  useEffect(() => () => { streamRef.current?.close(); }, []);

  // Auto-scroll feed
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length, importStatus, answer, submittedQuery]);

  // Sync apify badge
  useEffect(() => {
    if (targetMode === 'github' && integrations.apify === 'unknown') {
      setIntegrations(prev => ({ ...prev, apify: 'not_configured' }));
    }
  }, [targetMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildEventHandlers = useCallback(() => ({
    onEvent(event: AgentEvent) {
      setEvents(prev => [...prev, event]);
      if (event.type === 'final' && event.content) setAnswer(event.content);
      if (event.type === 'done') {
        setIterationCount(event.iterationCount ?? null);
        setIsRunning(false);
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
    onClose() { setIsRunning(false); },
    onPaymentRequired(info: ZyndPaymentInfo) {
      setZyndPaymentInfo(info);
      setIntegrations(prev => ({ ...prev, zynd: 'payment_required' }));
      setIsRunning(false);
      setDrawerOpen(true);
    },
    onServiceUnavailable(message: string) {
      setError(message);
      setIsRunning(false);
    },
  }), []);

  const startLocalStream = useCallback(() => {
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

    const handlers = buildEventHandlers();
    streamRef.current = streamQuery({
      baseUrl: API_URL,
      query: query.trim(),
      targetPath: targetPath.trim(),
      ...handlers,
    });
  }, [isRunning, query, targetPath, buildEventHandlers]);

  const startGithubFlow = useCallback(async () => {
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
        body: JSON.stringify({ repoUrl: repoUrl.trim(), branch: branch.trim() || 'main' }),
      });

      if (res.status === 402) {
        const body = (await res.json().catch(() => ({}))) as Record<string, string>;
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
        setDrawerOpen(true);
        return;
      }

      const data = (await res.json()) as {
        targetPath?: string;
        repoUrl?: string;
        branch?: string;
        fileCount?: number;
        error?: string;
      };

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
      setImportMessage(`${fileCount} files from ${importedRepo}`);
      setIntegrations(prev => ({ ...prev, apify: 'imported' }));

      setIsRunning(true);
      const handlers = buildEventHandlers();
      streamRef.current = streamQuery({
        baseUrl: API_URL,
        query: query.trim(),
        targetPath: importedPath,
        ...handlers,
      });
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

  const onSubmit = targetMode === 'github' ? startGithubFlow : startLocalStream;

  const integrationsAlertCount = useMemo(() => {
    let n = 0;
    if (integrations.zynd === 'payment_required' || integrations.zynd === 'error') n += 1;
    if (integrations.apify === 'error') n += 1;
    if (backendStatus === 'error') n += 1;
    return n;
  }, [integrations, backendStatus]);

  const showImportCard = targetMode === 'github' && importStatus !== 'idle';

  return (
    <div className="app-shell">
      <StatusBar
        backendStatus={backendStatus}
        isRunning={isRunning}
        iterationCount={iterationCount}
        onOpenIntegrations={() => setDrawerOpen(true)}
        integrationsAlertCount={integrationsAlertCount}
      />

      <div className="chat-shell">
        <ChatFeed ref={feedRef}>
          {!submittedQuery ? (
            <EmptyHero onPick={setQuery} />
          ) : (
            <>
              <AnimatePresence>
                {showImportCard && importStatus === 'importing' && (
                  <ImportCard key="imp-importing" state="importing" repoUrl={repoUrl} />
                )}
                {showImportCard && importStatus === 'done' && importMessage && (
                  <ImportCard key="imp-done" state="done" repoUrl={repoUrl} message={importMessage} />
                )}
                {showImportCard && importStatus === 'error' && importMessage && (
                  <ImportCard key="imp-error" state="error" repoUrl={repoUrl} message={importMessage} />
                )}
              </AnimatePresence>

              {importStatus !== 'error' && (
                <>
                  <UserMessage content={submittedQuery} />
                  <InvestigationCard events={events} isRunning={isRunning} />
                  {answer && (
                    <AnswerCard
                      answer={answer}
                      iterationCount={iterationCount}
                      events={events}
                    />
                  )}
                  {error && !isRunning && <InlineError message={error} />}
                </>
              )}
            </>
          )}
        </ChatFeed>

        <QueryInput
          query={query}
          targetPath={targetPath}
          isRunning={isRunning}
          onQueryChange={setQuery}
          onTargetPathChange={setTargetPath}
          onSubmit={onSubmit}
          onCancel={handleCancel}
          targetMode={targetMode}
          onTargetModeChange={setTargetMode}
          repoUrl={repoUrl}
          onRepoUrlChange={setRepoUrl}
          branch={branch}
          onBranchChange={setBranch}
        />
      </div>

      <IntegrationsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        backendStatus={backendStatus}
        integrations={integrations}
        zyndPaymentInfo={zyndPaymentInfo}
      />
    </div>
  );
}
