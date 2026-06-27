import type { ProgressUpdate } from '@michaelborck/cite-sight-core';
import './ProcessingProgress.css';

interface ProcessingProgressProps {
  progress: ProgressUpdate;
  batchIndex: number;
  batchTotal: number;
  currentFileName: string;
  onCancel: () => void;
}

const STAGES = [
  // Thresholds mirror the real progress % emitted by core's pipeline:
  // extracting(5) → extracting_references(55) → verifying_references(65)
  // → cross_referencing(90) → complete(100). A stage flips to "done" once the
  // reported progress reaches its threshold, so the dots track reality.
  { label: 'Extract',    threshold: 55 },
  { label: 'References', threshold: 65 },
  { label: 'Verify',     threshold: 90 },
  { label: 'Cross-ref',  threshold: 100 },
];

export function ProcessingProgress({ progress, batchIndex, batchTotal, currentFileName, onCancel }: ProcessingProgressProps) {
  const pct = Math.round(progress.progress);
  const isBatch = batchTotal > 1;

  // Determine which stage is active and how many are done
  let activeIndex = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (pct >= STAGES[i].threshold) {
      activeIndex = i + 1;
    }
  }
  // Calculate the connecting line progress percentage
  const progressWidth = STAGES.length > 1
    ? Math.min(100, (activeIndex / (STAGES.length - 1)) * 100)
    : 0;

  return (
    <div className="progress-inline">
      <div className="progress-card">
        <div className="progress-card-header">
          <span className="progress-filename">
            {currentFileName}
            {isBatch && ` \u2014 File ${batchIndex + 1} of ${batchTotal}`}
          </span>
          <button onClick={onCancel} className="btn btn-secondary cancel-btn">Cancel</button>
        </div>

        <div className="progress-stepper" style={{ '--progress-width': `${progressWidth}%` } as React.CSSProperties}>
          {STAGES.map((s, i) => {
            const isDone = i < activeIndex;
            const isActive = i === activeIndex;
            return (
              <div key={s.label} className={`step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
                <div className="step-dot">
                  {isDone ? '\u2713' : i + 1}
                </div>
                <div className="step-label">{s.label}</div>
              </div>
            );
          })}
        </div>

        <div className="progress-current">
          <div className="progress-current-step">{progress.message || 'Processing...'}</div>
          <div className="progress-bar-wrapper">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
