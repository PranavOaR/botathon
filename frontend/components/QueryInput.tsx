'use client';

import { useCallback, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Send, X, FolderOpen } from 'lucide-react';

const EXAMPLES = [
  'How does authentication work?',
  'Where is JWT validation implemented?',
  'What files would I change to add role-based access?',
];

interface QueryInputProps {
  query: string;
  targetPath: string;
  isRunning: boolean;
  onQueryChange: (q: string) => void;
  onTargetPathChange: (p: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function QueryInput({
  query,
  targetPath,
  isRunning,
  onQueryChange,
  onTargetPathChange,
  onSubmit,
  onCancel,
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

  return (
    <div className="composer">
      {/* Target path row */}
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
              disabled={!query.trim()}
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
