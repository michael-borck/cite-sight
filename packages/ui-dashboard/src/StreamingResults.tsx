import type { ReferenceVerification, VerificationStatus } from '@michaelborck/cite-sight-core';
import './StreamingResults.css';

export interface StreamingResultsProps {
  verifications: ReferenceVerification[];
  total: number;
  /** Core pipeline stage: 'queued' | 'extracting' | 'verifying_references' | 'complete' | … */
  stage: string;
  elapsedMs: number;
  fileName: string;
}

// Mirrors the dashboard's status labels so the live view and the final report
// use identical vocabulary.
const STATUS_LABEL: Record<VerificationStatus, string> = {
  verified: 'Verified',
  likely_valid: 'Likely Valid',
  not_found: 'Not Found',
  unverified: 'Unverified',
  suspicious: 'Needs review',
  format_only: 'Format Only',
};

function titleOf(v: ReferenceVerification): string {
  return v.reference.title || v.reference.raw.slice(0, 80) || '(untitled)';
}

/**
 * Live, filling-in view shown while references stream in — either over SSE
 * (web, from the server) or via IPC (desktop, from the in-process pipeline).
 * A progress bar + per-reference spinner keep the screen moving even when a
 * single slow lookup is in flight, so a long bibliography never feels frozen.
 * Replaced by the full ResultsDashboard once analysis completes.
 */
export function StreamingResults({ verifications, total, stage, elapsedMs, fileName }: StreamingResultsProps) {
  const known = total > 0 ? total : verifications.length;
  const checked = verifications.length;
  const busy = stage !== 'complete' && (known === 0 || checked < known);
  const queued = stage === 'queued';
  const pct = known > 0 ? Math.round((checked / known) * 100) : 0;
  const seconds = Math.floor(elapsedMs / 1000);

  const verified = verifications.filter((v) => v.status === 'verified' || v.status === 'likely_valid').length;
  const flagged = verifications.filter((v) => v.status === 'not_found' || v.status === 'suspicious').length;

  return (
    <div className="streaming-results">
      <div className="sr-head">
        <div>
          <div className="sr-title">Verifying references</div>
          <div className="sr-file">{fileName}</div>
        </div>
        <span className={`sr-live ${busy ? 'is-active' : ''}`}>
          <i className="sr-dot" /> {queued ? 'Queued' : busy ? 'Verifying' : 'Complete'}
        </span>
      </div>

      <div className="sr-progress">
        <div className="sr-progress-info">
          <span>{known > 0 ? `${checked} / ${known} checked` : 'Preparing…'}</span>
          <span className="sr-progress-pct">{known > 0 ? `${pct}%` : ''}</span>
        </div>
        <div className="sr-bar-track">
          <div className="sr-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="sr-progress-meta">
          <span>
            {queued
              ? 'Waiting in queue…'
              : busy
                ? `Checking reference ${checked + 1}${known ? ` of ${known}` : ''} — Crossref · Semantic Scholar · OpenAlex`
                : 'All references checked.'}
          </span>
          <span>{seconds}s</span>
        </div>
      </div>

      <ul className="sr-rows">
        {verifications.map((v, i) => (
          <li key={i} className="sr-ref is-done">
            <span className="sr-ref-title">{titleOf(v)}</span>
            <span className="sr-ref-right">
              <span className={`sr-status sr-status--${v.status}`}>{STATUS_LABEL[v.status]}</span>
              <span className="sr-conf">
                <span className="sr-conf-bar">
                  <span
                    className={`sr-conf-fill sr-conf-fill--${v.status}`}
                    style={{ width: `${v.confidenceScore * 100}%` }}
                  />
                </span>
                <span className="sr-conf-val">{v.confidenceScore.toFixed(2)}</span>
              </span>
            </span>
          </li>
        ))}
        {busy && known > 0 && checked < known && (
          <li className="sr-ref is-checking">
            <span className="sr-ref-title">Reference {checked + 1}</span>
            <span className="sr-ref-right">
              <span className="sr-status sr-status--checking">
                <i className="sr-spinner" /> Checking…
              </span>
            </span>
          </li>
        )}
      </ul>

      <div className="sr-foot">
        <span>
          <b className="sr-score-val">{verified}</b> verified ·{' '}
          <b className="sr-score-flag">{flagged}</b> flagged
        </span>
      </div>
    </div>
  );
}
