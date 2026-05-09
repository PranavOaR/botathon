'use client';

interface AnswerPanelProps {
  answer: string | null;
  error: string | null;
  iterationCount: number | null;
  isRunning: boolean;
}

export default function AnswerPanel({ answer, error, iterationCount, isRunning }: AnswerPanelProps) {
  return (
    <div className="answer-panel">
      <div className="panel-header">
        <h2 className="panel-header__title">Final answer</h2>
        {iterationCount !== null && (
          <span className="panel-header__meta">{iterationCount} iterations</span>
        )}
      </div>
      <div className="answer-panel__body">
        {error && (
          <div className="answer-panel__error">
            <span className="answer-panel__error-label">Error</span>
            {error}
          </div>
        )}
        {answer ? (
          <div className="answer-panel__content">{answer}</div>
        ) : !error ? (
          <div className="answer-panel__empty">
            {isRunning
              ? 'FileMind is exploring the codebase...'
              : 'Ask a question to watch FileMind explore the codebase.'}
          </div>
        ) : null}
      </div>
    </div>
  );
}
