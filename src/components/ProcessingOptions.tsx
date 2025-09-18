import React from 'react';
import { useStore } from '../store';
import './ProcessingOptions.css';

export const ProcessingOptions: React.FC = () => {
  const { options, updateOptions } = useStore();

  return (
    <div className="processing-options">
      <h3>Analysis Options</h3>
      
      <div className="options-grid">
        <div className="option-group">
          <label htmlFor="citation-style">Citation Style</label>
          <select
            id="citation-style"
            value={options.citationStyle}
            onChange={(e) => updateOptions({ citationStyle: e.target.value as 'auto' | 'apa' | 'mla' | 'chicago' })}
          >
            <option value="auto">Auto-detect</option>
            <option value="apa">APA</option>
            <option value="mla">MLA</option>
            <option value="chicago">Chicago</option>
          </select>
        </div>

        <div className="option-group">
          <label htmlFor="processing-mode">Processing Mode</label>
          <select
            id="processing-mode"
            value={options.processingMode}
            onChange={(e) => updateOptions({ processingMode: e.target.value as 'server' | 'local' })}
          >
            <option value="server">Server</option>
            <option value="local">Local</option>
          </select>
        </div>
      </div>

      <div className="checkboxes">
        <h4>Verification Options</h4>
        
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.checkUrls}
            onChange={(e) => updateOptions({ checkUrls: e.target.checked })}
          />
          <span>Verify URLs</span>
          <span className="option-description">Check if referenced URLs are accessible</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.checkDoi}
            onChange={(e) => updateOptions({ checkDoi: e.target.checked })}
          />
          <span>Resolve DOIs</span>
          <span className="option-description">Verify DOI validity via CrossRef</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.checkWayback}
            onChange={(e) => updateOptions({ checkWayback: e.target.checked })}
            disabled={!options.checkUrls}
          />
          <span>Check Wayback Machine</span>
          <span className="option-description">Find archived versions of broken URLs</span>
        </label>

        <h4>Analysis Options</h4>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.checkInText}
            onChange={(e) => updateOptions({ checkInText: e.target.checked })}
          />
          <span>Check In-Text Citations</span>
          <span className="option-description">Verify citations are referenced in text</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.checkPlagiarism}
            onChange={(e) => updateOptions({ checkPlagiarism: e.target.checked })}
          />
          <span>Self-Plagiarism Detection</span>
          <span className="option-description">Detect repeated text across documents</span>
        </label>
      </div>
    </div>
  );
};