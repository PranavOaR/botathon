'use client';

import { useEffect, useRef } from 'react';
import type { AgentEvent } from '@/lib/sseClient';

interface ReasoningTraceProps {
  events: AgentEvent[];
  isRunning: boolean;
}

const TOOL_STYLES: Record<string, { label: string; className: string }> = {
  tree: { label: 'MAP', className: 'trace-badge--tree' },
  read: { label: 'READ', className: 'trace-badge--read' },
  grep: { label: 'GREP', className: 'trace-badge--grep' },
  jump: { label: 'JUMP', className: 'trace-badge--jump' },
  summarize: { label: 'SUM', className: 'trace-badge--summarize' },
};

function formatInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      parts.push(`${key}: ${value}`);
    } else if (value !== undefined) {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return parts.join(', ');
}

function TraceEvent({ event, index }: { event: AgentEvent; index: number }) {
  if (event.type === 'tool_call') {
    const tool = event.tool ?? 'unknown';
    const style = TOOL_STYLES[tool] ?? { label: tool.toUpperCase(), className: 'trace-badge--default' };
    return (
      <div className="trace-event trace-event--call">
        <span className="trace-event__index">{index + 1}</span>
        <span className={`trace-badge ${style.className}`}>{style.label}</span>
        <span className="trace-event__detail">
          {event.input ? formatInput(event.input) : tool}
        </span>
      </div>
    );
  }

  if (event.type === 'tool_result') {
    const tool = event.tool ?? 'unknown';
    const style = TOOL_STYLES[tool] ?? { label: tool.toUpperCase(), className: 'trace-badge--default' };
    return (
      <div className="trace-event trace-event--result">
        <span className="trace-event__index" />
        <span className={`trace-badge trace-badge--outline ${style.className}`}>{style.label}</span>
        <span className="trace-event__summary">{event.summary ?? 'No summary'}</span>
      </div>
    );
  }

  if (event.type === 'final') {
    return (
      <div className="trace-event trace-event--final">
        <span className="trace-event__index" />
        <span className="trace-badge trace-badge--final">DONE</span>
        <span className="trace-event__detail">Final answer received</span>
      </div>
    );
  }

  if (event.type === 'done') {
    return (
      <div className="trace-event trace-event--done">
        <span className="trace-event__index" />
        <span className="trace-badge trace-badge--done">END</span>
        <span className="trace-event__detail">
          Completed in {event.iterationCount ?? '?'} iterations
        </span>
      </div>
    );
  }

  if (event.type === 'error') {
    return (
      <div className="trace-event trace-event--error">
        <span className="trace-event__index" />
        <span className="trace-badge trace-badge--error">ERR</span>
        <span className="trace-event__detail">{event.error ?? 'Unknown error'}</span>
      </div>
    );
  }

  return null;
}

export default function ReasoningTrace({ events, isRunning }: ReasoningTraceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div className="reasoning-trace">
      <div className="panel-header">
        <h2 className="panel-header__title">Live exploration</h2>
        {isRunning && <span className="panel-header__pulse" />}
      </div>
      <div className="reasoning-trace__list" ref={scrollRef}>
        {events.length === 0 && (
          <div className="reasoning-trace__empty">
            Waiting for stream...
          </div>
        )}
        {events.map((event, i) => (
          <TraceEvent key={i} event={event} index={i} />
        ))}
      </div>
    </div>
  );
}
