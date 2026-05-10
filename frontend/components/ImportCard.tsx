'use client';

import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, GitBranch } from 'lucide-react';

type ImportState = 'importing' | 'done' | 'error';

interface ImportCardProps {
  state: ImportState;
  repoUrl: string;
  message?: string | null;
  importMode?: 'apify' | 'github_fallback';
}

const META: Record<ImportState, { label: string; modifier: string }> = {
  importing: { label: 'Importing repository', modifier: 'import-card--importing' },
  done:      { label: 'Import complete',      modifier: 'import-card--done' },
  error:     { label: 'Import failed',        modifier: 'import-card--error' },
};

function StateIcon({ state }: { state: ImportState }) {
  if (state === 'importing') return <Loader2 size={15} className="spinner-svg" style={{ animation: 'spin 0.8s linear infinite' }} aria-hidden="true" />;
  if (state === 'done')      return <CheckCircle2 size={16} aria-hidden="true" />;
  return <XCircle size={16} aria-hidden="true" />;
}

const IMPORT_MODE_LABEL: Record<'apify' | 'github_fallback', string> = {
  apify: 'via Apify',
  github_fallback: 'via GitHub API',
};

export default function ImportCard({ state, repoUrl, message, importMode }: ImportCardProps) {
  const meta = META[state];
  const modeLabel = state === 'done' && importMode ? ` — ${IMPORT_MODE_LABEL[importMode]}` : '';
  const detail = message ? `${message}${modeLabel}` : repoUrl;

  return (
    <motion.div
      className={`import-card ${meta.modifier}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      role="status"
      aria-live="polite"
    >
      <div className="import-card__icon">
        <StateIcon state={state} />
      </div>
      <div className="import-card__body">
        <div className="import-card__label">{meta.label}</div>
        <div className="import-card__detail" title={detail}>
          {state === 'importing' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <GitBranch size={11} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
              {detail}
            </span>
          ) : (
            detail
          )}
        </div>
      </div>
    </motion.div>
  );
}
