'use client';

import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import {
  FolderOpen,
  Globe,
  GitBranch,
  ArrowUp,
  Square,
} from 'lucide-react';
import type { TargetMode } from '@/lib/types';

const QUICK_CHIPS = [
  'auth flow?',
  'where is JWT?',
  'add RBAC?',
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + Enter or plain Enter (no shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  const isSubmitDisabled =
    isRunning ||
    !query.trim() ||
    (targetMode === 'github' ? !repoUrl.trim() : !targetPath.trim());

  return (
    <div className="composer-region">
      <div className="composer">
        {/* Top row: mode + repo input */}
        <div className="composer__row-top">
          <div className="mode-segment" role="tablist" aria-label="Target source">
            <button
              type="button"
              role="tab"
              aria-selected={targetMode === 'local'}
              className={`mode-segment__btn${targetMode === 'local' ? ' mode-segment__btn--active' : ''}`}
              onClick={() => onTargetModeChange('local')}
              disabled={isRunning}
            >
              <FolderOpen size={11} aria-hidden="true" />
              Local
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={targetMode === 'github'}
              className={`mode-segment__btn${targetMode === 'github' ? ' mode-segment__btn--active' : ''}`}
              onClick={() => onTargetModeChange('github')}
              disabled={isRunning}
            >
              <Globe size={11} aria-hidden="true" />
              GitHub
            </button>
          </div>

          {targetMode === 'local' ? (
            <div className="repo-input">
              <FolderOpen size={12} className="repo-input__icon" aria-hidden="true" />
              <input
                type="text"
                className="repo-input__field"
                value={targetPath}
                onChange={e => onTargetPathChange(e.target.value)}
                disabled={isRunning}
                placeholder="./path/to/repo"
                spellCheck={false}
                aria-label="Local repository path"
              />
            </div>
          ) : (
            <div className="repo-input">
              <Globe size={12} className="repo-input__icon" aria-hidden="true" />
              <input
                type="url"
                className="repo-input__field"
                value={repoUrl}
                onChange={e => onRepoUrlChange(e.target.value)}
                disabled={isRunning}
                placeholder="github.com/owner/repo"
                spellCheck={false}
                aria-label="GitHub repository URL"
              />
              <span className="repo-input__divider" aria-hidden="true" />
              <GitBranch size={11} className="repo-input__icon" aria-hidden="true" />
              <input
                type="text"
                className="repo-input__field repo-input--branch"
                value={branch}
                onChange={e => onBranchChange(e.target.value)}
                disabled={isRunning}
                placeholder="main"
                spellCheck={false}
                aria-label="Branch name"
                style={{ flex: '0 0 auto', width: 60 }}
              />
            </div>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="composer__textarea"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder="Ask FileMind to investigate this codebase…"
          rows={1}
          spellCheck={false}
          aria-label="Investigation question"
        />

        {/* Bottom row: chips + actions */}
        <div className="composer__row-bottom">
          <div className="composer__inline-chips" aria-label="Quick prompts">
            {QUICK_CHIPS.map(chip => (
              <button
                key={chip}
                type="button"
                className="composer__inline-chip"
                onClick={() => onQueryChange(chip === 'auth flow?'
                  ? 'How does authentication work?'
                  : chip === 'where is JWT?'
                  ? 'Where is JWT validation implemented?'
                  : 'What files would I change to add role-based access?')}
                disabled={isRunning}
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="composer__actions">
            <span className="composer__shortcut">
              <kbd>↵</kbd> send
            </span>

            {isRunning ? (
              <motion.button
                type="button"
                className="btn btn--cancel"
                onClick={onCancel}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15 }}
                aria-label="Cancel investigation"
              >
                <Square size={11} fill="currentColor" aria-hidden="true" />
                Stop
              </motion.button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                onClick={onSubmit}
                disabled={isSubmitDisabled}
                aria-label="Investigate codebase"
              >
                <span>Investigate</span>
                <ArrowUp size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
