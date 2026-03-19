import { useStore } from '../store';
import './ProcessingOptions.css';

export function ProcessingOptions() {
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
            onChange={(e) =>
              updateOptions({
                citationStyle: e.target.value as 'auto' | 'apa' | 'mla' | 'chicago',
              })
            }
          >
            <option value="auto">Auto-detect</option>
            <option value="apa">APA</option>
            <option value="mla">MLA</option>
            <option value="chicago">Chicago</option>
          </select>
        </div>

        <div className="option-group">
          <label htmlFor="contact-email">Your email (optional — speeds up reference lookups)</label>
          <input
            id="contact-email"
            type="email"
            placeholder="your@email.com"
            value={options.contactEmail ?? ''}
            onChange={(e) => updateOptions({ contactEmail: e.target.value || undefined })}
          />
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
            checked={options.checkInText}
            onChange={(e) => updateOptions({ checkInText: e.target.checked })}
          />
          <span>Check In-Text Citations</span>
          <span className="option-description">Cross-reference citations with bibliography</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.screenshotUrls}
            onChange={(e) => updateOptions({ screenshotUrls: e.target.checked })}
            disabled={!options.checkUrls}
          />
          <span>Screenshot URLs</span>
          <span className="option-description">Capture screenshots of referenced web pages</span>
        </label>
      </div>
    </div>
  );
}
