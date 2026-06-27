import { useEffect, useState } from 'react';
import './AnalysisProgress.css';

type Phase = 'uploading' | 'processing';

interface Props {
  phase: Phase;
  /** Polled server status when the async queue path is used ('queued' | 'processing' | …). */
  serverStatus?: string;
}

// Real analysis stages, in core-pipeline order. Verify is the slow one — core
// paces external lookups to ~one request per second to respect the citation
// databases' polite-pool limits, so a large bibliography spends most of its
// time there. The stepper reflects that reality rather than a fake percentage.
const STAGES = [
  { label: 'Extract', detail: 'Reading the document text' },
  { label: 'References', detail: 'Splitting out the bibliography' },
  { label: 'Verify', detail: 'Checking each reference' },
  { label: 'Cross-ref', detail: 'Matching in-text citations' },
];

export function AnalysisProgress({ phase, serverStatus }: Props) {
  // Begin on Extract; advance through the two fast setup stages on a timer, then
  // dwell on Verify (the long stage) until the parent swaps to the result view.
  // We deliberately never invent a percentage: the server exposes only coarse
  // status, so the Verify step uses an indeterminate shimmer + plain-language
  // explanation instead of a misleading number.
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (phase !== 'processing') {
      setActiveStage(0);
      return;
    }
    const timers = [
      setTimeout(() => setActiveStage(1), 1500),
      setTimeout(() => setActiveStage(2), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const queued = serverStatus === 'queued';

  if (phase === 'uploading') {
    return (
      <div className="analysis-progress">
        <div className="ap-upload">
          <div className="ap-spinner" />
          <span className="ap-text">Uploading your document…</span>
        </div>
      </div>
    );
  }

  const dwellMessage =
    'Verifying each reference against Crossref, Semantic Scholar & OpenAlex — about one per second, so larger bibliographies take longer.';

  return (
    <div className="analysis-progress">
      <div className="ap-stepper">
        {STAGES.map((s, i) => {
          const done = i < activeStage;
          const active = i === activeStage;
          return (
            <div
              key={s.label}
              className={`ap-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}
            >
              <div className="ap-dot">{done ? '\u2713' : i + 1}</div>
              <div className="ap-step-label">{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="ap-bar-track">
        <div className="ap-bar-fill" />
      </div>

      <div className="ap-message">
        {queued
          ? 'Waiting in queue…'
          : activeStage < 2
            ? `${STAGES[activeStage].detail}…`
            : dwellMessage}
      </div>
    </div>
  );
}
