'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FileText, BookOpen } from 'lucide-react';
import type { AgentEvent } from '@/lib/sseClient';

interface AnswerPanelProps {
  answer: string | null;
  iterationCount: number | null;
  isRunning: boolean;
  error: string | null;
  events: AgentEvent[];
}

function renderContent(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(<pre key={key++}><code>{codeLines.join('\n')}</code></pre>);
      i++;
      continue;
    }

    // Heading
    if (line.startsWith('## ') || line.startsWith('### ')) {
      const text = line.replace(/^#{2,3}\s*/, '');
      nodes.push(<h2 key={key++}>{text}</h2>);
      i++;
      continue;
    }

    // Empty line — paragraph break
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph with inline bold / code
    nodes.push(<p key={key++}>{renderInline(line)}</p>);
    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith('**')) {
      parts.push(<strong key={k++}>{raw.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={k++}>{raw.slice(1, -1)}</code>);
    }
    last = m.index + raw.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function AnswerPanel({ answer, iterationCount, isRunning, error, events }: AnswerPanelProps) {
  const filesRead = new Set<string>();
  for (const e of events) {
    if (e.type === 'tool_call' && (e.tool === 'read' || e.tool === 'jump') && e.input?.path) {
      filesRead.add(String(e.input.path));
    }
  }

  const toolCount = events.filter(e => e.type === 'tool_call').length;

  return (
    <aside className="answer-panel">
      <div className="panel-header">
        <span className="panel-header__title">Investigation Report</span>
        {iterationCount !== null && (
          <span className="panel-header__meta">{iterationCount} iter · {toolCount} calls</span>
        )}
      </div>

      <div className="answer-panel__body">
        <AnimatePresence mode="wait">

          {/* Error */}
          {error && !isRunning && (
            <motion.div
              key="error"
              className="answer-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {error}
            </motion.div>
          )}

          {/* Running skeleton */}
          {isRunning && !answer && (
            <motion.div
              key="skeleton"
              className="answer-skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              {[85, 95, 70, 90, 60, 80, 45].map((w, i) => (
                <div key={i} className="skeleton-line" style={{ width: `${w}%` }} />
              ))}
            </motion.div>
          )}

          {/* Answer */}
          {answer && (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="report-meta">
                <span className="report-badge report-badge--success">complete</span>
                {iterationCount !== null && (
                  <span className="report-badge report-badge--neutral">{iterationCount} iterations</span>
                )}
                {toolCount > 0 && (
                  <span className="report-badge report-badge--neutral">{toolCount} tool calls</span>
                )}
              </div>
              <div className="report-content">
                {renderContent(answer)}
              </div>

              {filesRead.size > 0 && (
                <div className="evidence-section">
                  <div className="evidence-label">Files navigated</div>
                  <div className="evidence-files">
                    {Array.from(filesRead).map(f => (
                      <div key={f} className="evidence-file">
                        <FileText size={10} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Empty */}
          {!answer && !isRunning && !error && (
            <motion.div
              key="empty"
              className="answer-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <BookOpen size={24} className="answer-empty__icon" />
              <div className="answer-empty__text">
                No report yet.<br />
                Start an investigation to generate<br />
                a cited answer.
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </aside>
  );
}
