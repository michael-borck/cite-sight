import { useId } from 'react';
import type { ProcessingOptions } from '@michaelborck/cite-sight-core';
import './Workflow.css';

interface Props {
  options: ProcessingOptions;
  onChange: (options: Partial<ProcessingOptions>) => void;
  disabled?: boolean;
  screenshots?: boolean;
  credentials?: boolean;
}

export function AnalysisSetup({ options, onChange, disabled, screenshots, credentials }: Props) {
  const id = useId();
  const documentType = options.documentType ?? (options.checkInText ? 'assignment' : 'reference-list');
  return <fieldset className="analysis-setup" disabled={disabled}>
    <legend>Check settings</legend>
    <div className="setup-grid">
      <label htmlFor={`${id}-type`}>Document type
        <select id={`${id}-type`} value={documentType} onChange={(e) => onChange({
          documentType: e.target.value as ProcessingOptions['documentType'], checkInText: e.target.value === 'assignment',
        })}>
          <option value="assignment">Assignment</option><option value="reference-list">Reference list</option>
        </select>
      </label>
      <label htmlFor={`${id}-style`}>Citation style
        <select id={`${id}-style`} value={options.citationStyle} onChange={(e) => onChange({ citationStyle: e.target.value as ProcessingOptions['citationStyle'] })}>
          <option value="auto">Auto-detect</option><option value="apa">APA</option><option value="mla">MLA</option><option value="chicago">Chicago</option>
        </select>
      </label>
    </div>
    <p className="setup-hint">{documentType === 'reference-list'
      ? 'Checks the references themselves. In-text citation matching is skipped.'
      : 'Checks references and matches them against citations in the assignment.'}</p>
    <details className="advanced-options"><summary>Advanced options</summary>
      <label><input type="checkbox" checked={!options.offline && options.checkUrls} disabled={options.offline} onChange={(e) => onChange({ checkUrls: e.target.checked })} /> Check linked pages</label>
      <label><input type="checkbox" checked={!options.offline && options.checkDoi} disabled={options.offline} onChange={(e) => onChange({ checkDoi: e.target.checked })} /> Verify DOIs</label>
      {screenshots && <label><input type="checkbox" checked={!options.offline && options.screenshotUrls} disabled={options.offline || !options.checkUrls} onChange={(e) => onChange({ screenshotUrls: e.target.checked })} /> Capture page screenshots</label>}
      {credentials && !options.offline && <div className="setup-grid">
        <label>Contact email, optional<input type="email" value={options.contactEmail ?? ''} onChange={(e) => onChange({ contactEmail: e.target.value || undefined })} placeholder="you@university.edu" /></label>
        <label>Semantic Scholar API key, optional<input type="password" autoComplete="off" value={options.semanticScholarApiKey ?? ''} onChange={(e) => onChange({ semanticScholarApiKey: e.target.value || undefined })} /></label>
        <label>OpenAlex API key, optional<input type="password" autoComplete="off" value={options.openAlexApiKey ?? ''} onChange={(e) => onChange({ openAlexApiKey: e.target.value || undefined })} /></label>
        <p className="setup-hint">An email and a personal API key can reduce rate limits during large batches.</p>
      </div>}
    </details>
  </fieldset>;
}
