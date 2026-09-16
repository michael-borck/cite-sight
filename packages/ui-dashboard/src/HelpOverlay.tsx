import { useState } from 'react';
import { HELP_TOPICS, ACKNOWLEDGEMENTS, HELP_FOOTER } from '@michaelborck/cite-sight-core/browser';
import './HelpOverlay.css';

/** Section-level "?" popover — a one-screen answer where the question arises,
 *  so nobody has to scroll or go hunting. */
export function SectionHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return <span className="section-help">
    <button type="button" className="section-help-btn" aria-label="What does this mean?"
      onClick={() => setOpen((v) => !v)}>?</button>
    {open && <span className="section-help-pop" role="note">
      {text}
      <button type="button" className="section-help-close" aria-label="Close help" onClick={() => setOpen(false)}>×</button>
    </span>}
  </span>;
}

/** Full help overlay: all topics plus acknowledgements. */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return <div className="help-overlay" role="dialog" aria-modal="true" aria-label="Help and about">
    <div className="help-overlay-card">
      <div className="help-overlay-header">
        <h3>Help &amp; about</h3>
        <button type="button" className="help-overlay-close" onClick={onClose} aria-label="Close help">×</button>
      </div>
      <div className="help-overlay-body">
        {HELP_TOPICS.map((topic) => (
          <details key={topic.id} open={topic.id === 'about'} className="help-topic">
            <summary>{topic.title}</summary>
            <p>{topic.body}</p>
          </details>
        ))}
        <details className="help-topic">
          <summary>Acknowledgements</summary>
          <ul>
            {ACKNOWLEDGEMENTS.map((a) => (
              <li key={a.name}>
                {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name} — {a.what}
              </li>
            ))}
          </ul>
          <p>{HELP_FOOTER}</p>
        </details>
      </div>
    </div>
  </div>;
}
