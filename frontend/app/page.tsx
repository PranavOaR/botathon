'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import QueryInput from '@/components/QueryInput';
import ReasoningTrace from '@/components/ReasoningTrace';
import AnswerPanel from '@/components/AnswerPanel';
import { streamQuery, type AgentEvent } from '@/lib/sseClient';

const API_BASE = process.env.NEXT_PUBLIC_FILEMIND_API_URL ?? 'http://localhost:3001';

type HealthStatus = 'checking' | 'connected' | 'unavailable';

export default function Home() {
  const [query, setQuery] = useState('How does authentication work?');
  const [targetPath, setTargetPath] = useState('../demo/sample-repos/nextjs-starter');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iterationCount, setIterationCount] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthStatus>('checking');

  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHealth('checking');
    fetch(`${API_BASE}/health`)
      .then((res) => {
        if (!cancelled) setHealth(res.ok ? 'connected' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setHealth('unavailable');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      closeRef.current?.();
    };
  }, []);

  const handleSubmit = useCallback(() => {
    if (isRunning || !query.trim() || !targetPath.trim()) return;

    setEvents([]);
    setAnswer(null);
    setError(null);
    setIterationCount(null);
    setIsRunning(true);

    const handle = streamQuery({
      baseUrl: API_BASE,
      query: query.trim(),
      targetPath: targetPath.trim(),
      onEvent(event: AgentEvent) {
        setEvents((prev) => [...prev, event]);
        if (event.type === 'final' && event.content) {
          setAnswer(event.content);
        }
        if (event.type === 'done') {
          setIterationCount(event.iterationCount ?? null);
          setIsRunning(false);
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
        closeRef.current = null;
      },
    });

    closeRef.current = handle.close;
  }, [isRunning, query, targetPath]);

  const handleCancel = useCallback(() => {
    closeRef.current?.();
    closeRef.current = null;
    setIsRunning(false);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">FM</span>
          <div className="topbar__text">
            <h1 className="topbar__title">FileMind</h1>
            <span className="topbar__subtitle">Structure-aware codebase navigation</span>
          </div>
        </div>
        <div className={`topbar__status topbar__status--${health}`}>
          <span className="topbar__dot" />
          {health === 'checking' && 'Checking backend...'}
          {health === 'connected' && 'Backend connected'}
          {health === 'unavailable' && 'Backend unavailable'}
        </div>
      </header>

      <div className="workbench">
        <aside className="workbench__input">
          <QueryInput
            query={query}
            targetPath={targetPath}
            isRunning={isRunning}
            onQueryChange={setQuery}
            onTargetPathChange={setTargetPath}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </aside>
        <main className="workbench__panels">
          <div className="workbench__trace">
            <ReasoningTrace events={events} isRunning={isRunning} />
          </div>
          <div className="workbench__answer">
            <AnswerPanel
              answer={answer}
              error={error}
              iterationCount={iterationCount}
              isRunning={isRunning}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
