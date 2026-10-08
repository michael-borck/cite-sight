import { useEffect, useId, useRef, useState } from 'react';
import { HELP_TOPICS, ACKNOWLEDGEMENTS, HELP_FOOTER } from '@michaelborck/cite-sight-core/browser';
import './HelpOverlay.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Section-level "?" popover — a one-screen answer where the question arises,
 *  so nobody has to scroll or go hunting. */
export function SectionHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and a click outside does too — previously the popover only
  // closed via its own × button, so keyboard users had to tab to find it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key !== 'Tab') return;
      // Small enough to treat as a trap: the popover holds one close button.
      if (event.shiftKey && document.activeElement === closeRef.current) {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return <span className="section-help" ref={wrapRef}>
    <button type="button" className="section-help-btn"
      aria-label="What does this mean?"
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen((v) => !v)}>?</button>
    {open && <span className="section-help-pop" id={id} role="note">
      {text}
      <button type="button" ref={closeRef} className="section-help-close" aria-label="Close help" onClick={() => setOpen(false)}>×</button>
    </span>}
  </span>;
}

/** Full help overlay: all topics plus acknowledgements. */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  // aria-modal promises this is the only interactive content, so it has to
  // behave like a dialog: focus moves in, Tab stays inside, Escape closes, and
  // focus returns to whatever opened it. It previously declared aria-modal with
  // none of that, leaving background content keyboard-reachable while AT was
  // told to hide it.
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    const card = cardRef.current;
    const first = card?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !card) return;
      const focusable = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === firstEl || !card.contains(document.activeElement))) {
        event.preventDefault(); lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault(); firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      (returnFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return <div className="help-overlay" role="dialog" aria-modal="true" aria-label="Help and about"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="help-overlay-card" ref={cardRef}>
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