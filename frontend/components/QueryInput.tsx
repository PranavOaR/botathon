'use client';

interface QueryInputProps {
  query: string;
  targetPath: string;
  isRunning: boolean;
  onQueryChange: (value: string) => void;
  onTargetPathChange: (value: string) => void;
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
  const canSubmit = query.trim().length > 0 && targetPath.trim().length > 0 && !isRunning;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
      onSubmit();
    }
  }

  return (
    <div className="query-input">
      <div className="query-input__field">
        <label className="query-input__label" htmlFor="target-path">
          Target repository
        </label>
        <input
          id="target-path"
          type="text"
          className="query-input__path"
          value={targetPath}
          onChange={(e) => onTargetPathChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="/path/to/repo"
          disabled={isRunning}
          spellCheck={false}
        />
      </div>
      <div className="query-input__field">
        <label className="query-input__label" htmlFor="query">
          Query
        </label>
        <textarea
          id="query"
          className="query-input__textarea"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the codebase..."
          rows={3}
          disabled={isRunning}
          spellCheck={false}
        />
      </div>
      <div className="query-input__actions">
        {isRunning ? (
          <button className="query-input__btn query-input__btn--cancel" onClick={onCancel} type="button">
            Cancel
          </button>
        ) : (
          <button
            className="query-input__btn query-input__btn--submit"
            onClick={onSubmit}
            disabled={!canSubmit}
            type="button"
          >
            Ask FileMind
          </button>
        )}
        {isRunning && <span className="query-input__status">Exploring...</span>}
        <span className="query-input__hint">
          {isRunning ? '' : '⌘+Enter to submit'}
        </span>
      </div>
    </div>
  );
}
