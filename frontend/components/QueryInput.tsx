'use client';

import { useCallback, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Send, X, FolderOpen, Globe, GitBranch } from 'lucide-react';
import type { TargetMode } from '@/lib/types';

const EXAMPLES = [
  'How does authentication work?',
  'Where is JWT validation implemented?',
  'What files would I change to add role-based access?',
];

export interface QueryInputProps {
  query: string;
  targetPath: string;
  isRunning: boolean;
  onQueryChange: (q: string) => void;
  onTargetPathChange: (p: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  targetMode: TargetMode;
  onTargetModeChange: (mode: TargetMode) => void;
  repoUrl: string;
  onRepoUrlChange: (url: string) => void;
  branch: string;
  onBranchChange: (b: string) => void;
}

export default function QueryInput({
  query,
  targetPath,
  isRunning,
  onQueryChange,
  onTargetPathChange,
  onSubmit,
  onCancel,
  targetMode,
  onTargetModeChange,
  repoUrl,
  onRepoUrlChange,
  branch,
  onBranchChange,
}: QueryInputProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  const isSubmitDisabled = isRunning || !query.trim() || (
    targetMode === 'github' ? !repoUrl.trim() : false
  );

  return (
    <div className="composer">
      {/* Mode tabs */}
      <div className="mode-tabs">
        <button
          type="button"
          className={`mode-tab${targetMode === 'local' ? ' mode-tab--active' : ''}`}
          onClick={() => onTargetModeChange('local')}
          disabled={isRunning}
        >
          <FolderOpen size={11} />
          Local path
        </button>
        <button
          type="button"
          className={`mode-tab${targetMode === 'github' ? ' mode-tab--active' : ''}`}
          onClick={() => onTargetModeChange('github')}
          disabled={isRunning}
        >
          <Globe size={11} />
          GitHub repo
        </button>
      </div>

      {/* Target input row — conditional on mode */}
      {targetMode === 'local' ? (
        <div className="composer__path-row">
          <label className="composer__path-label" htmlFor="target-path">
            <FolderOpen size={11} />
            repo
          </label>
          <input
            id="target-path"
            type="text"
            className="composer__path-input"
            value={targetPath}
            onChange={e => onTargetPathChange(e.target.value)}
            disabled={isRunning}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="composer__path-row">
          <label className="composer__path-label" htmlFor="repo-url">
            <Globe size={11} />
            url
          </label>
          <input
            id="repo-url"
            type="url"
            className="composer__path-input composer__path-input--url"
            value={repoUrl}
            onChange={e => onRepoUrlChange(e.target.value)}
            disabled={isRunning}
            placeholder="https://github.com/owner/repo"
            spellCheck={false}
          />
          <label className="composer__path-label" htmlFor="repo-branch" style={{ marginLeft: 6 }}>
            <GitBranch size={11} />
          </label>
          <input
            id="repo-branch"
            type="text"
            className="composer__path-input composer__branch-input"
            value={branch}
            onChange={e => onBranchChange(e.target.value)}
            disabled={isRunning}
            placeholder="main"
            spellCheck={false}
          />
        </div>
      )}

      {/* Query textarea */}
      <textarea
        className="composer__textarea"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isRunning}
        placeholder="Ask FileMind to investigate this codebase…"
        rows={3}
        spellCheck={false}
      />

      {/* Bottom row */}
      <div className="composer__bottom">
        {/* Example prompts */}
        <div className="composer__examples">
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              type="button"
              className="composer__example"
              onClick={() => onQueryChange(ex)}
              disabled={isRunning}
            >
              {ex.length > 38 ? ex.slice(0, 36) + '…' : ex}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="composer__actions">
          <span className="composer__shortcut">⌘↩</span>

          {isRunning ? (
            <motion.button
              type="button"
              className="btn btn--cancel"
              onClick={onCancel}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
            >
              <X size={13} />
              Cancel
            </motion.button>
          ) : (
            <motion.button
              type="button"
              className="btn btn--primary"
              onClick={onSubmit}
              disabled={isSubmitDisabled}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.1 }}
            >
              <Send size={13} />
              Investigate
            </motion.button>
          )}
        </div>
      </div>

      {/* Hint */}
      <div style={{ marginTop: 7, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        FileMind will inspect structure, follow imports, and cite the path it took.
      </div>
    </div>
  );
}
