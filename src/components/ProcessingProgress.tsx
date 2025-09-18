import React from 'react';
import './ProcessingProgress.css';

interface ProcessingProgressProps {
  progress: number;
  message: string;
  onCancel?: () => void;
}

export const ProcessingProgress: React.FC<ProcessingProgressProps> = ({
  progress,
  message,
  onCancel,
}) => {
  return (
    <div className="processing-progress">
      <div className="progress-content">
        <div className="progress-header">
          <h3>Processing Documents</h3>
          {onCancel && (
            <button onClick={onCancel} className="cancel-btn">
              Cancel
            </button>
          )}
        </div>
        
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}>
            <span className="progress-text">{progress}%</span>
          </div>
        </div>
        
        <p className="progress-message">{message}</p>
        
        <div className="progress-steps">
          <div className={`step ${progress >= 25 ? 'active' : ''}`}>
            <span className="step-icon">📤</span>
            <span className="step-label">Upload</span>
          </div>
          <div className={`step ${progress >= 50 ? 'active' : ''}`}>
            <span className="step-icon">🔍</span>
            <span className="step-label">Extract</span>
          </div>
          <div className={`step ${progress >= 75 ? 'active' : ''}`}>
            <span className="step-icon">📊</span>
            <span className="step-label">Analyze</span>
          </div>
          <div className={`step ${progress >= 100 ? 'active' : ''}`}>
            <span className="step-icon">✅</span>
            <span className="step-label">Complete</span>
          </div>
        </div>
      </div>
    </div>
  );
};