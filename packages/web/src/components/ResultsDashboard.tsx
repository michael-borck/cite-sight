import { useState } from 'react';
import type {
  AnalysisResult,
  ReferenceVerification,
  VerificationStatus,
} from '../types';
import { DISCLAIMER } from '../disclaimer';
import './ResultsDashboard.css';

interface Props {
  results: AnalysisResult;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function statusLabel(s: VerificationStatus): string {
  switch (s) {
    case 'verified': return 'Verified';
    case 'likely_valid': return 'Likely Valid';
    case 'suspicious': return 'Suspicious';
    case 'not_found': return 'Not Found';
    case 'unverified': return 'Unverified';
    case 'format_only': return 'Format Only';
  }
}

function statusClass(s: VerificationStatus): string {
  switch (s) {
    case 'verified': return 'status-verified';
    case 'likely_valid': return 'status-likely-valid';
    case 'suspicious': return 'status-suspicious';
    case 'not_found': return 'status-not-found';
    case 'unverified': return 'status-format-only';
    case 'format_only': return 'status-format-only';
  }
}

function bar(value: number, max = 100): number {
  return Math.min(100, Math.max(0, (value / max) * 100));
}

// ─── sub-panels ───────────────────────────────────────────────────────────────

function OverviewPanel({ results }: Props) {
  const { references, processingTime } = results;

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>Analysis Overview</h3>
      </div>
      <div className="panel-body">
        <div className="overview-metrics">
          <div className="overview-metric-row">
            <span className="oml">References Verified</span>
            <div className="ombar-wrap">
              <div className="ombar" style={{ width: `${bar(references.verifiedCount, references.totalReferences || 1)}%`, background: 'var(--verified)' }} />
            </div>
            <span className="omv">{references.verifiedCount}/{references.totalReferences}</span>
          </div>
          <div className="overview-metric-row">
            <span className="oml">Citation Style</span>
            <div className="ombar-wrap">
              <div className="ombar" style={{ width: '100%', background: 'var(--accent)' }} />
            </div>
            <span className="omv">{references.detectedStyle}</span>
          </div>
        </div>

        <div className="processing-info">
          Analysed {results.fileName} in {(processingTime / 1000).toFixed(2)}s
        </div>
      </div>
    </div>
  );
}

function ReferenceRow({ v, index }: { v: ReferenceVerification; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const ref = v.reference;
  const title = ref.title || ref.raw.slice(0, 80);

  return (
    <>
      <tr
        className={`ref-row ${index % 2 === 0 ? 'even' : 'odd'}`}
        onClick={() => setExpanded((x) => !x)}
      >
        <td className="ref-index">{index + 1}</td>
        <td className="ref-title" title={ref.raw}>{title}</td>
        <td><span className={`status-badge ${statusClass(v.status)}`}>{statusLabel(v.status)}</span></td>
        <td className="ref-doi">{ref.doi ?? '\u2014'}</td>
        <td className="ref-url-status">
          {v.urlCheck ? (
            <span className={`url-status url-${v.urlCheck.status}`}>{v.urlCheck.status}</span>
          ) : '\u2014'}
        </td>
        <td>
          <div className="confidence-meter">
            <div className="confidence-bar">
              <div
                className={`confidence-fill ${v.confidenceScore >= 0.7 ? 'high' : v.confidenceScore >= 0.4 ? 'medium' : 'low'}`}
                style={{ width: `${v.confidenceScore * 100}%` }}
              />
            </div>
            <span className={`confidence-value ${v.confidenceScore >= 0.7 ? 'high' : v.confidenceScore >= 0.4 ? 'medium' : 'low'}`}>
              {v.confidenceScore.toFixed(2)}
            </span>
          </div>
        </td>
        <td className="ref-expand">{expanded ? '\u25B2' : '\u25BC'}</td>
      </tr>
      {expanded && (
        <tr className="ref-detail-row">
          <td colSpan={7}>
            <div className="ref-detail">
              <div className="ref-detail-raw"><strong>Raw:</strong> {ref.raw}</div>
              {v.matchedWork && (
                <div className="ref-detail-matched">
                  <strong>Matched:</strong> {v.matchedWork.title}
                  {v.matchedWork.year ? ` (${v.matchedWork.year})` : ''}
                  {' \u2014 '}<em>{v.matchedWork.source}</em>
                  {v.matchedWork.doi && <> &mdash; DOI: {v.matchedWork.doi}</>}
                </div>
              )}
              {v.formatIssues.length > 0 && (
                <div className="ref-detail-issues">
                  <strong>Format issues:</strong>
                  <ul>
                    {v.formatIssues.map((fi, i) => (
                      <li key={i}>{fi.field}: {fi.message}{fi.expected ? ` (expected: ${fi.expected})` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
              {v.flags.length > 0 && (
                <div className="ref-detail-flags">
                  <strong>Flags:</strong> {v.flags.join(', ')}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ReferencesPanel({ results }: Props) {
  const { references } = results;

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>Reference Verification</h3>
        <span className="meta">{references.detectedStyle} style</span>
      </div>
      <div className="panel-body">
        <div className="status-summary">
          <div className="status-chip verified">
            <span className="count">{references.verifiedCount}</span> Verified
          </div>
          <div className="status-chip likely">
            <span className="count">{references.verifications.filter(v => v.status === 'likely_valid').length}</span> Likely Valid
          </div>
          <div className="status-chip suspicious">
            <span className="count">{references.suspiciousCount}</span> Suspicious
          </div>
          <div className="status-chip notfound">
            <span className="count">{references.notFoundCount}</span> Not Found
          </div>
        </div>

        {references.verifications.length > 0 ? (
          <div className="ref-table-wrap">
            <table className="ref-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>DOI</th>
                  <th>URL</th>
                  <th>Confidence</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {references.verifications.map((v, i) => (
                  <ReferenceRow key={i} v={v} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">No references found in this document.</p>
        )}
      </div>
    </div>
  );
}

function CrossReferencesPanel({ results }: Props) {
  const { crossReference } = results.references;

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>Cross-Reference Check</h3>
      </div>
      <div className="panel-body">
        <div className="cross-section">
          <h4>
            Unmatched Bibliography Entries
            <span className="count-badge">{crossReference.unmatchedBibliography.length}</span>
          </h4>
          {crossReference.unmatchedBibliography.length > 0 ? (
            <ul className="cross-list">
              {crossReference.unmatchedBibliography.map((ref, i) => (
                <li key={i} className="cross-item cross-biblio">
                  <span className="cross-icon">B</span>
                  <span>{ref.raw}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-issues">All bibliography entries have corresponding in-text citations.</p>
          )}
        </div>

        <div className="cross-section">
          <h4>
            Orphaned In-Text Citations
            <span className="count-badge">{crossReference.unmatchedInText.length}</span>
          </h4>
          {crossReference.unmatchedInText.length > 0 ? (
            <ul className="cross-list">
              {crossReference.unmatchedInText.map((cite, i) => (
                <li key={i} className="cross-item cross-intext">
                  <span className="cross-icon">C</span>
                  <span>
                    {cite.raw}
                    {cite.year ? ` (${cite.year})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-issues">All in-text citations have corresponding bibliography entries.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── sidebar sections ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'overview',    label: 'Overview',    icon: '\u25C6' },
  { id: 'references',  label: 'References',  icon: '\uD83D\uDCDA' },
  { id: 'crossrefs',   label: 'Cross-refs',  icon: '\u21C4' },
];

// ─── main component ───────────────────────────────────────────────────────────

export function ResultsDashboard({ results }: Props) {
  const [activeSection, setActiveSection] = useState('overview');
  const refs = results.references;
  const crossRefCount =
    refs.crossReference.unmatchedBibliography.length +
    refs.crossReference.unmatchedInText.length;
  const issueCount = refs.suspiciousCount + refs.notFoundCount;

  const getBadge = (id: string): { count: number | null; warn: boolean } => {
    switch (id) {
      case 'references': return { count: refs.totalReferences, warn: issueCount > 0 };
      case 'crossrefs':  return { count: crossRefCount > 0 ? crossRefCount : null, warn: crossRefCount > 0 };
      default:           return { count: null, warn: false };
    }
  };

  return (
    <div className="results-shell">
      <aside className="results-sidebar">
        <div className="sidebar-filename">{results.fileName}</div>
        <nav className="sidebar-nav">
          {SECTIONS.map(s => {
            const badge = getBadge(s.id);
            return (
              <button
                key={s.id}
                className={`sidebar-link ${activeSection === s.id ? 'active' : ''}`}
                onClick={() => setActiveSection(s.id)}
              >
                <span><span className="icon">{s.icon}</span> {s.label}</span>
                {badge.count !== null && (
                  <span className={`sidebar-badge ${badge.warn ? 'warn' : ''}`}>{badge.count}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="results-content">
        {/* Summary strip — always visible */}
        <div className="summary-strip">
          <div className="summary-stat teal">
            <span className="value">{refs.totalReferences}</span>
            <span className="label">References</span>
          </div>
          <div className="summary-stat">
            <span className="value">{refs.verifiedCount}</span>
            <span className="label">Verified</span>
          </div>
          <div className="summary-stat amber">
            <span className="value">{refs.suspiciousCount}</span>
            <span className="label">Suspicious</span>
          </div>
          <div className="summary-stat rose">
            <span className="value">{refs.notFoundCount}</span>
            <span className="label">Not Found</span>
          </div>
          <div className="summary-stat muted">
            <span className="value">{crossRefCount}</span>
            <span className="label">Orphaned</span>
          </div>
        </div>

        {activeSection === 'overview'    && <OverviewPanel results={results} />}
        {activeSection === 'references'  && <ReferencesPanel results={results} />}
        {activeSection === 'crossrefs'   && <CrossReferencesPanel results={results} />}

        <p className="results-disclaimer">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
