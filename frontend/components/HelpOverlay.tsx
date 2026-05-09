'use client';

import { useState } from 'react';

const TOOLS = [
  { key: 'tree', badge: 'MAP', color: '#4a9eff', desc: 'Scans directory structure to understand project layout' },
  { key: 'read', badge: 'READ', color: '#3ddc84', desc: 'Reads file contents and parses imports/exports' },
  { key: 'grep', badge: 'GREP', color: '#f5a623', desc: 'Searches across files for patterns and symbols' },
  { key: 'jump', badge: 'JUMP', color: '#a78bfa', desc: 'Follows import chains to trace dependencies' },
  { key: 'summarize', badge: 'SUM', color: '#22d3ee', desc: 'Generates concise summaries of explored files' },
];

const STEPS = [
  { num: '1', title: 'Point to a codebase', desc: 'Enter the path to any local repository you want to explore.' },
  { num: '2', title: 'Ask a question', desc: 'Ask about architecture, auth flows, data models, or any structural question.' },
  { num: '3', title: 'Watch it explore', desc: 'FileMind navigates the codebase live — reading files, following imports, searching for patterns.' },
  { num: '4', title: 'Get a grounded answer', desc: 'The final answer is backed by the actual files explored, not hallucinated knowledge.' },
];

export default function HelpOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="help-trigger"
        onClick={() => setIsOpen(true)}
        type="button"
        aria-label="How to use FileMind"
        title="How to use FileMind"
      >
        ?
      </button>

      {isOpen && (
        <div className="help-backdrop" onClick={() => setIsOpen(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal__header">
              <h2 className="help-modal__title">How FileMind works</h2>
              <button
                className="help-modal__close"
                onClick={() => setIsOpen(false)}
                type="button"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="help-modal__body">
              <section className="help-section">
                <h3 className="help-section__title">Getting started</h3>
                <div className="help-steps">
                  {STEPS.map((step) => (
                    <div key={step.num} className="help-step">
                      <span className="help-step__num">{step.num}</span>
                      <div>
                        <div className="help-step__title">{step.title}</div>
                        <div className="help-step__desc">{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="help-section">
                <h3 className="help-section__title">Agent tools</h3>
                <p className="help-section__intro">
                  FileMind explores codebases using five primitive tools, just like a senior developer would:
                </p>
                <div className="help-tools">
                  {TOOLS.map((tool) => (
                    <div key={tool.key} className="help-tool">
                      <span
                        className="help-tool__badge"
                        style={{ background: `${tool.color}20`, color: tool.color }}
                      >
                        {tool.badge}
                      </span>
                      <span className="help-tool__desc">{tool.desc}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="help-section">
                <h3 className="help-section__title">Example queries</h3>
                <div className="help-examples">
                  <code>How does authentication work?</code>
                  <code>What is the data flow from API to database?</code>
                  <code>Where are environment variables validated?</code>
                  <code>How are routes organized in this project?</code>
                  <code>What testing patterns does this codebase use?</code>
                </div>
              </section>

              <div className="help-footer">
                <span className="help-footer__kbd">Tip:</span> Press <kbd>Cmd</kbd>+<kbd>Enter</kbd> to submit a query quickly
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
