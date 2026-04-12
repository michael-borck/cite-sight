import { useStore } from '../store';
import './ProcessingOptions.css';

export function ProcessingOptions() {
  const { options, updateOptions } = useStore();

  return (
    <details className="options-panel" open>
      <summary>Analysis Options</summary>

      <div className="options-grid">
        <div className="option-group">
          <div className="option-label">Citation Style</div>
          <select className="option-select" id="citation-style" value={options.citationStyle}
            onChange={(e) => updateOptions({ citationStyle: e.target.value as 'auto' | 'apa' | 'mla' | 'chicago' })}>
            <option value="auto">Auto-detect</option>
            <option value="apa">APA 7th Edition</option>
            <option value="mla">MLA 9th Edition</option>
            <option value="chicago">Chicago 17th Edition</option>
          </select>
        </div>
        <div className="option-group">
          <div className="option-label">Contact Email (optional)</div>
          <input className="option-select" id="contact-email" type="email" placeholder="your@email.com"
            value={options.contactEmail ?? ''}
            onChange={(e) => updateOptions({ contactEmail: e.target.value || undefined })} />
        </div>
      </div>

      <div className="checkbox-group">
        <div className="checkbox-row">
          <input type="checkbox" id="check-urls" checked={options.checkUrls} onChange={(e) => updateOptions({ checkUrls: e.target.checked })} />
          <label htmlFor="check-urls">Verify URLs</label>
          <span className="hint">Check if referenced URLs are accessible</span>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="check-doi" checked={options.checkDoi} onChange={(e) => updateOptions({ checkDoi: e.target.checked })} />
          <label htmlFor="check-doi">Resolve DOIs</label>
          <span className="hint">Verify DOI validity via CrossRef</span>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="check-intext" checked={options.checkInText} onChange={(e) => updateOptions({ checkInText: e.target.checked })} />
          <label htmlFor="check-intext">Check In-Text Citations</label>
          <span className="hint">Cross-reference citations with bibliography</span>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="screenshot-urls" checked={options.screenshotUrls} onChange={(e) => updateOptions({ screenshotUrls: e.target.checked })} disabled={!options.checkUrls} />
          <label htmlFor="screenshot-urls">Screenshot URLs</label>
          <span className="hint">Capture screenshots of referenced web pages</span>
        </div>
      </div>
    </details>
  );
}
