'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { streamQuery } from '@/lib/sseClient';
import type { AgentEvent } from '@/lib/sseClient';
import StatusBar from '@/components/StatusBar';
import LeftRail from '@/components/LeftRail';
import QueryInput from '@/components/QueryInput';
import ReasoningTrace from '@/components/ReasoningTrace';
import AnswerPanel from '@/components/AnswerPanel';

const API_URL = process.env.NEXT_PUBLIC_FILEMIND_API_URL ?? 'http://localhost:3001';

export default function HomePage() {
  const [query, setQuery] = useState('How does authentication work?');
  const [targetPath, setTargetPath] = useState('../demo/sample-repos/nextjs-starter');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [iterationCount, setIterationCount] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => () => { streamRef.current?.close(); }, []);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length]);

  const handleSubmit = useCallback(() => {
    if (isRunning || !query.trim()) return;
    streamRef.current?.close();
    streamRef.current = null;

    setEvents([]);
    setAnswer(null);
    setIterationCount(null);
    setError(null);
    setSubmittedQuery(query.trim());
    setIsRunning(true);

    const stream = streamQuery({
      baseUrl: API_URL,
      query: query.trim(),
      targetPath: targetPath.trim(),
      onEvent(event) {
        setEvents(prev => [...prev, event]);
        if (event.type === 'final' && event.content) setAnswer(event.content);
        if (event.type === 'done') {
          setIterationCount(event.iterationCount ?? null);
          setIsRunning(false);
        }
        if (event.type === 'error') {
          setError(event.error ?? 'Unknown error');
          setIsRunning(false);
        }
      },
      onError(err) {
        setError(err.message);
        setIsRunning(false);
      },
      onClose() {
        setIsRunning(false);
      },
    });

    streamRef.current = stream;
  }, [isRunning, query, targetPath]);

  const handleCancel = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    setIsRunning(false);
  }, []);

  return (
    <div className="app-shell">
      <StatusBar
        backendStatus={backendStatus}
        isRunning={isRunning}
        iterationCount={iterationCount}
      />
      <div className="workbench">
        <LeftRail targetPath={targetPath} events={events} isRunning={isRunning} />
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
                <div className="user-bubble">
                  <div className="user-bubble__content">{submittedQuery}</div>
                </div>
                <ReasoningTrace events={events} isRunning={isRunning} />
              </>
            )}
          </div>
          <QueryInput
            query={query}
            targetPath={targetPath}
            isRunning={isRunning}
            onQueryChange={setQuery}
            onTargetPathChange={setTargetPath}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
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
