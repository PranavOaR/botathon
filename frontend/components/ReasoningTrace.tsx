'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderTree,
  FileText,
  Search,
  GitBranch,
  ScrollText,
  CheckCircle2,
  AlertTriangle,
  Flag,
} from 'lucide-react';
import type { AgentEvent } from '@/lib/sseClient';

interface ReasoningTraceProps {
  events: AgentEvent[];
  isRunning: boolean;
}

type IconComponent = React.ComponentType<{ size?: number }>;

const TOOL_META: Record<string, { label: string; Icon: IconComponent }> = {
  tree:      { label: 'Map repository',       Icon: FolderTree as IconComponent },
  read:      { label: 'Read file',            Icon: FileText as IconComponent },
  grep:      { label: 'Search symbols',       Icon: Search as IconComponent },
  jump:      { label: 'Follow import',        Icon: GitBranch as IconComponent },
  summarize: { label: 'Summarize file',       Icon: ScrollText as IconComponent },
  final:     { label: 'Answer synthesized',   Icon: CheckCircle2 as IconComponent },
  error:     { label: 'Investigation failed', Icon: AlertTriangle as IconComponent },
  done:      { label: 'Complete',             Icon: Flag as IconComponent },
};

function formatInput(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const parts: string[] = [];
  for (const [, v] of Object.entries(input)) {
    if (typeof v === 'string') parts.push(v);
  }
  return parts.join(' · ');
}

function TraceItem({
  event,
  index,
  isActive,
}: {
  event: AgentEvent;
  index: number;
  isActive: boolean;
}) {
  const tool = event.tool ?? event.type;
  const meta = TOOL_META[tool] ?? { label: tool, Icon: FileText as IconComponent };
  const { Icon } = meta;
  const cls = `trace-item trace-item--${tool}${isActive ? ' trace-item--active' : ''}`;

  let detail = '';
  if (event.type === 'tool_call') {
    detail = formatInput(event.input);
  } else if (event.type === 'tool_result') {
    detail = event.summary ?? '';
  } else if (event.type === 'done') {
    detail = `${event.iterationCount ?? '?'} iterations`;
  } else if (event.type === 'error') {
    detail = event.error ?? 'Unknown error';
  } else if (event.type === 'final' && event.content) {
    detail = event.content.slice(0, 80) + (event.content.length > 80 ? '…' : '');
  }

  return (
    <motion.div
      className={cls}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="trace-item__icon-wrap">
        <Icon size={13} />
      </div>
      <div className="trace-item__body">
        <div className="trace-item__row">
          <span className="trace-item__label">{meta.label}</span>
          <span className="trace-item__step">#{index + 1}</span>
        </div>
        {detail && (
          <div className="trace-item__detail" title={detail}>
            {detail}
          </div>
        )}
        {event.type === 'tool_result' && event.summary && (
          <div className="trace-item__summary">{event.summary}</div>
        )}
      </div>
    </motion.div>
  );
}

export default function ReasoningTrace({ events, isRunning }: ReasoningTraceProps) {
  const visibleEvents = events.filter(
    e => e.type === 'tool_call' || e.type === 'tool_result' || e.type === 'final' || e.type === 'done' || e.type === 'error'
  );

  if (visibleEvents.length === 0 && !isRunning) return null;

  return (
    <div className="trace-container">
      <div className="trace-header">
        {isRunning && <div className="trace-spinner" />}
        <span>{isRunning ? 'Investigating…' : `${visibleEvents.length} steps`}</span>
      </div>
      <div className="trace-timeline">
        <AnimatePresence initial={false}>
          {visibleEvents.map((event, i) => (
            <TraceItem
              key={i}
              event={event}
              index={i}
              isActive={isRunning && i === visibleEvents.length - 1}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
