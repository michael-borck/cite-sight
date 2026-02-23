import type { ProgressUpdate } from '@cite-sight/core';
import './ProcessingProgress.css';

interface ProcessingProgressProps {
  progress: ProgressUpdate;
  onCancel?: () => void;
}

const STAGES = [
  { label: 'Extract', threshold: 10 },
  { label: 'Readability', threshold: 25 },
  { label: 'Writing', threshold: 40 },
  { label: 'References', threshold: 65 },
  { label: 'Verify', threshold: 90 },
  { label: 'Complete', threshold: 100 },
];

export function ProcessingProgress({ progress, onCancel }: ProcessingProgressProps) {
  const pct = Math.round(progress.progress);

  return (
    <div className="processing-progress">
      <div className="progress-content">
        <div className="progress-header">
          <h3>Analyzing Document</h3>
          {onCancel && (
            <button onClick={onCancel} className="cancel-btn">
              Cancel
            </button>
          )}
        </div>

        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${pct}%` }}>
            <span className="progress-text">{pct}%</span>
          </div>
        </div>

        <p className="progress-message">{progress.message}</p>

        <div className="progress-steps">
          {STAGES.map((s) => (
            <div key={s.label} className={`step ${pct >= s.threshold ? 'active' : ''}`}>
              <span className="step-dot" />
              <span className="step-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
