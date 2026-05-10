'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import type { AgentEvent } from '@/lib/sseClient';

interface AnswerCardProps {
  answer: string;
  iterationCount: number | null;
  events: AgentEvent[];
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith('**')) {
      parts.push(<strong key={key++}>{raw.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={key++}>{raw.slice(1, -1)}</code>);
    }
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const UL_RE = /^(\s*)([-*])\s+(.*)$/;
const OL_RE = /^(\s*)(\d+)\.\s+(.*)$/;
const BQ_RE = /^>\s?(.*)$/;

function renderMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      out.push(
        <pre key={key++}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      i += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      out.push(<h3 key={key++}>{line.slice(4)}</h3>);
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(<h2 key={key++}>{line.slice(3)}</h2>);
      i += 1;
      continue;
    }

    // Unordered list — group consecutive `- ` / `* ` lines
    const ulMatch = line.match(UL_RE);
    if (ulMatch) {
      const items: string[] = [ulMatch[3]];
      i += 1;
      while (i < lines.length) {
        const next = lines[i].match(UL_RE);
        if (!next) break;
        items.push(next[3]);
        i += 1;
      }
      out.push(
        <ul key={key++}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list — group consecutive `1. ` / `2. ` lines
    const olMatch = line.match(OL_RE);
    if (olMatch) {
      const items: string[] = [olMatch[3]];
      i += 1;
      while (i < lines.length) {
        const next = lines[i].match(OL_RE);
        if (!next) break;
        items.push(next[3]);
        i += 1;
      }
      out.push(
        <ol key={key++}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Blockquote — group consecutive `> ` lines
    const bqMatch = line.match(BQ_RE);
    if (bqMatch) {
      const quoteLines: string[] = [bqMatch[1]];
      i += 1;
      while (i < lines.length) {
        const next = lines[i].match(BQ_RE);
        if (!next) break;
        quoteLines.push(next[1]);
        i += 1;
      }
      out.push(
        <blockquote key={key++}>{renderInline(quoteLines.join(' '))}</blockquote>,
      );
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    out.push(<p key={key++}>{renderInline(line)}</p>);
    i += 1;
  }

  return out;
}

function extractFilesNavigated(events: AgentEvent[]): string[] {
  const seen = new Set<string>();
  for (const e of events) {
    if (e.type === 'tool_call' && (e.tool === 'read' || e.tool === 'jump' || e.tool === 'summarize')) {
      const path = e.input?.path;
      if (typeof path === 'string') seen.add(path);
    }
  }
  return Array.from(seen);
}

export default function AnswerCard({ answer, iterationCount, events }: AnswerCardProps) {
  const [showEvidence, setShowEvidence] = useState(true);

  const files = useMemo(() => extractFilesNavigated(events), [events]);
  const toolCount = useMemo(() => events.filter(e => e.type === 'tool_call').length, [events]);
  const rendered = useMemo(() => renderMarkdown(answer), [answer]);

  return (
    <motion.div
      className="assistant-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="assistant-card__header">
        <span className="check-icon" aria-hidden="true">
          <CheckCircle2 size={13} />
        </span>
        <span className="assistant-card__title">Answer</span>
        {iterationCount !== null && (
          <span className="assistant-card__meta">
            {iterationCount} {iterationCount === 1 ? 'iteration' : 'iterations'} · {toolCount} tool calls
          </span>
        )}
      </div>

      <div className="answer-body">{rendered}</div>

      {files.length > 0 && (
        <div className="evidence">
          <button
            type="button"
            className="evidence__toggle"
            onClick={() => setShowEvidence(v => !v)}
            aria-expanded={showEvidence}
            aria-controls="evidence-chips"
          >
            <ChevronRight
              size={12}
              aria-hidden="true"
              className={`evidence__chevron${showEvidence ? ' evidence__chevron--open' : ''}`}
            />
            Files navigated
            <span className="evidence__count">({files.length})</span>
          </button>

          {showEvidence && (
            <motion.div
              id="evidence-chips"
              className="evidence__chips"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
            >
              {files.map(f => (
                <span key={f} className="file-chip" title={f}>
                  <FileText size={11} className="file-chip__icon" aria-hidden="true" />
                  <span className="file-chip__name">{f}</span>
                </span>
              ))}
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}
