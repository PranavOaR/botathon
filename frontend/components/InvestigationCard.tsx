'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderTree,
  FileText,
  Search,
  GitBranch,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Flag,
} from 'lucide-react';
import type { AgentEvent } from '@/lib/sseClient';

type IconComp = React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

interface ToolMeta {
  label: string;
  Icon: IconComp;
}

const TOOL_META: Record<string, ToolMeta> = {
  tree:      { label: 'Map repository',     Icon: FolderTree as IconComp },
  read:      { label: 'Read file',          Icon: FileText as IconComp },
  grep:      { label: 'Search symbols',     Icon: Search as IconComp },
  jump:      { label: 'Follow import',      Icon: GitBranch as IconComp },
  summarize: { label: 'Summarize file',     Icon: Sparkles as IconComp },
  final:     { label: 'Answer synthesized', Icon: CheckCircle2 as IconComp },
  error:     { label: 'Investigation failed', Icon: AlertTriangle as IconComp },
  done:      { label: 'Complete',           Icon: Flag as IconComp },
};

interface InvestigationCardProps {
  events: AgentEvent[];
  isRunning: boolean;
}

function formatInputAsDetail(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      parts.push(k === 'pattern' || k === 'symbol' ? v : v);
    } else if (typeof v === 'number') {
      parts.push(String(v));
    }
  }
  return parts.join(' · ');
}

function eventToDetail(event: AgentEvent): string {
  if (event.type === 'tool_call') return formatInputAsDetail(event.input);
  if (event.type === 'tool_result') return event.summary ?? '';
  if (event.type === 'done') return `${event.iterationCount ?? '?'} iterations`;
  if (event.type === 'error') return event.error ?? 'Unknown error';
  if (event.type === 'final' && event.content) {
    return event.content.length > 100 ? `${event.content.slice(0, 100)}…` : event.content;
  }
  return '';
}

function ElapsedTimer({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 100) / 10), 100);
    return () => clearInterval(id);
  }, [running]);
  if (!running) return null;
  return <span className="assistant-card__elapsed">{elapsed.toFixed(1)}s</span>;
}

interface StepProps {
  event: AgentEvent;
  index: number;
  isActive: boolean;
}

function Step({ event, index, isActive }: StepProps) {
  const tool = event.tool ?? event.type;
  const meta = TOOL_META[tool] ?? { label: tool, Icon: FileText as IconComp };
  const { Icon } = meta;
  const detail = eventToDetail(event);
  const cls = `step step--${tool}${isActive ? ' step--active' : ''}`;

  return (
    <motion.div
      className={cls}
      initial={{ opacity: 0, x: -6, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.24, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="step__icon">
        <Icon size={14} aria-hidden={true} />
      </div>
      <div className="step__body">
        <div className="step__row">
          <span className="step__label">{meta.label}</span>
          {detail && (
            <span className="step__detail" title={detail}>
              {detail}
            </span>
          )}
          <span className="step__step-num">#{index + 1}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function InvestigationCard({ events, isRunning }: InvestigationCardProps) {
  const visibleEvents = events.filter(
    e => e.type === 'tool_call' || e.type === 'final' || e.type === 'error'
  );

  if (visibleEvents.length === 0 && !isRunning) return null;

  // Apply staggered delay relative to total visible count for late-arriving events
  return (
    <motion.div
      className="assistant-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="assistant-card__header">
        {isRunning ? (
          <>
            <div className="spinner" aria-hidden="true" />
            <span className="assistant-card__title">Investigating</span>
            <ElapsedTimer running={isRunning} />
          </>
        ) : (
          <>
            <CheckCircle2 size={16} aria-hidden="true" style={{ color: 'var(--success)' }} />
            <span className="assistant-card__title">{visibleEvents.length} steps traced</span>
          </>
        )}
      </div>

      <div className="steps">
        <AnimatePresence initial={false}>
          {visibleEvents.map((event, i) => (
            <Step
              key={`${event.type}-${event.tool ?? 'unknown'}-${i}`}
              event={event}
              index={i}
              isActive={isRunning && i === visibleEvents.length - 1}
            />
          ))}
        </AnimatePresence>
        {!isRunning && visibleEvents.length > 0 && (
          <motion.div
            className="steps-terminal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <CheckCircle2 size={11} />
            Synthesized — see answer below
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
