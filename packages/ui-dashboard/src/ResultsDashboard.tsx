import { Fragment, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AnalysisResult,
  ParsedReference,
  ReferenceVerification,
  VerificationStatus,
} from '@michaelborck/cite-sight-core';
import { ATTRIBUTION, DISCLAIMER } from '@michaelborck/cite-sight-core/disclaimer';
import { referenceContentKey } from '@michaelborck/cite-sight-core/dashboard';
import { OverviewPanel } from './Overview';
import { ScreenshotContext, ScreenshotThumbnail } from './Screenshot';
import './ResultsDashboard.css';

export interface ResultsDashboardProps {
  results: AnalysisResult;
  /**
   * Optional screenshot reader. Desktop passes its Electron preload bridge
   * (`window.citeSight.readScreenshot`) so URL-evidence screenshots render in
   * expanded rows. Web omits it — and the server never sets
   * `urlCheck.screenshotPath`, so the thumbnail never appears there. Injecting
   * this keeps the shared component free of any Electron/global coupling.
   */
  readScreenshot?: (path: string) => Promise<string | null>;
  /**
   * Optional single-reference re-verifier — the recovery path for
   * 'unverified' verdicts (transient rate-limit/timeout). Hosts that supply
   * it get per-row "Re-check" buttons and a bulk re-check in the strip;
   * hosts that don't render neither.
   */
  reverify?: (ref: ParsedReference) => Promise<ReferenceVerification | null>;
  /**
   * Previously persisted dismissal content-keys (see referenceContentKey).
   * Rows whose reference matches a key start dismissed, so triage decisions
   * survive re-scans and app restarts.
   */
  persistedDismissals?: string[];
  /** Called per change so a host can persist triage decisions. */
  onDismissalChange?: (contentKey: string, dismissed: boolean) => void;
}

// ─── screenshot capability (context) ──────────────────────────────────────────
//
// Defaults to a resolver that always yields null, so consumers that don't
// supply `readScreenshot` (web) render nothing without any special-casing.

const noScreenshot = (): Promise<string | null> => Promise.resolve(null);


// ─── helpers ──────────────────────────────────────────────────────────────────

function statusLabel(s: VerificationStatus): string {
  switch (s) {
    case 'verified': return 'Verified';
    case 'likely_valid': return 'Likely Valid';
    case 'suspicious': return 'Needs review';
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
    case 'unverified': return 'status-unverified';
    case 'format_only': return 'status-format-only';
  }
}

// ─── sub-panels ───────────────────────────────────────────────────────────────


function scholarSearchUrl(text: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(text)}`;
}
function webSearchUrl(text: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

// Sort order for the Status column: most-worrying first when descending.
const STATUS_SEVERITY: Record<string, number> = {
  suspicious: 5, not_found: 4, unverified: 3, format_only: 2, likely_valid: 1, verified: 0,
};

interface ReferenceRowProps {
  v: ReferenceVerification;
  index: number;
  isDismissed: boolean;
  onToggleDismiss: (index: number) => void;
  onReverify?: (idx: number) => Promise<void>;
  isRechecking?: boolean;
}

function ReferenceRow({ v, index, isDismissed, onToggleDismiss, onReverify, isRechecking }: ReferenceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const ref = v.reference;
  const title = ref.title || ref.raw.slice(0, 80);

  return (
    <>
      <tr
        className={`ref-row ${index % 2 === 0 ? 'even' : 'odd'} ${isDismissed ? 'dismissed' : ''}`}
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
                  {v.matchedWork.doi && <>{' \u2014 DOI: '}{v.matchedWork.doi}</>}
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
              {/* Same escape hatches as the Overview — on every row, verified
                  included: "the tool says verified, let me check anyway" is a
                  legitimate manual-verification workflow. Dismiss only where
                  there is something to dismiss. */}
              <div className="priority-row-actions ref-detail-actions" onClick={(e) => e.stopPropagation()}>
                {ref.doi && (
                  <a
                    className="priority-action priority-action-search"
                    href={`https://doi.org/${encodeURIComponent(ref.doi)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open DOI
                  </a>
                )}
                {ref.url && (
                  <a className="priority-action priority-action-search" href={ref.url} target="_blank" rel="noreferrer">
                    Open cited URL
                  </a>
                )}
                <a className="priority-action priority-action-search" href={scholarSearchUrl(ref.raw)} target="_blank" rel="noreferrer">
                  Search Scholar
                </a>
                <a className="priority-action priority-action-search" href={webSearchUrl(ref.raw)} target="_blank" rel="noreferrer">
                  Search web
                </a>
                {v.status === 'unverified' && onReverify && (
                  <button
                    type="button"
                    className="priority-action priority-action-search"
                    onClick={() => onReverify(index)}
                    disabled={isRechecking}
                  >
                    {isRechecking ? 'Re-checking…' : 'Re-check'}
                  </button>
                )}
                {v.urlCheck?.screenshotPath && (
                  <button
                    type="button"
                    className="priority-action priority-action-search"
                    onClick={() => setShowSnapshot((x) => !x)}
                  >
                    {showSnapshot ? 'Hide snapshot' : 'Page snapshot'}
                  </button>
                )}
                {(v.status === 'suspicious' || v.status === 'not_found' || v.status === 'unverified') && (
                  <button
                    type="button"
                    className="priority-action priority-action-dismiss"
                    onClick={() => onToggleDismiss(index)}
                  >
                    {isDismissed ? 'Restore' : 'Dismiss'}
                  </button>
                )}
              </div>
              {showSnapshot && v.urlCheck?.screenshotPath && (
                <ScreenshotThumbnail path={v.urlCheck.screenshotPath} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface PanelProps {
  results: AnalysisResult;
}

type SortKey = 'index' | 'title' | 'status' | 'doi' | 'url' | 'confidence';

function ReferencesPanel({ results, dismissed, onDismissedChange, onReverify, rechecking }: PanelProps & {
  dismissed: Set<string>;
  onDismissedChange: (next: Set<string>) => void;
  onReverify?: (idx: number) => Promise<void>;
  rechecking: Set<number>;
}) {
  const { references } = results;
  // A row's display kind: "dismissed" is an overlay that wins over status for
  // counting and filtering — a dismissed needs-review row belongs to the
  // Dismissed bucket, not the Needs-review one, so counts and pills agree
  // with what the table shows.
  const kindOf = (v: ReferenceVerification, idx: number): string =>
    dismissed.has(`ref:${idx}`) ? 'dismissed' : v.status;
  const live = (kind: string) =>
    references.verifications.filter((v, idx) => kindOf(v, idx) === kind).length;

  // Chip filters: clicking a status chip toggles that status's rows.
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set());
  const toggleStatus = (status: string) => {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  // Column sorting: click a header to sort, click again to flip direction.
  const [sortKey, setSortKey] = useState<SortKey>('index');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };
  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 1 ? ' \u25B4' : ' \u25BE') : '');

  const rows = useMemo(() => {
    const withIndex = references.verifications.map((v, idx) => ({ v, idx }));
    const filtered = withIndex.filter(({ v, idx }) => !hiddenStatuses.has(kindOf(v, idx)));
    const keyOf = ({ v, idx }: { v: ReferenceVerification; idx: number }): string | number => {
      switch (sortKey) {
        case 'title':      return (v.reference.title || v.reference.raw).toLowerCase();
        case 'status':     return STATUS_SEVERITY[v.status] ?? 0;
        case 'doi':        return v.reference.doi ? `0${v.reference.doi}` : '1';
        case 'url':        return v.urlCheck?.status ?? '\uffff';
        case 'confidence': return v.confidenceScore;
        default:           return idx;
      }
    };
    return filtered.sort((a, b) => {
      const ka = keyOf(a); const kb = keyOf(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sortDir;
    });
  }, [references.verifications, hiddenStatuses, sortKey, sortDir, dismissed]);

  const toggleDismiss = (idx: number) => {
    const key = `ref:${idx}`;
    const next = new Set(dismissed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onDismissedChange(next);
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>Reference Verification</h3>
        <span className="meta">{references.detectedStyle} style</span>
      </div>
      <div className="panel-body">
        <div className="status-summary">
          {([
            ['verified', 'Verified', 'verified', live('verified')],
            ['likely_valid', 'Likely Valid', 'likely', live('likely_valid')],
            ['suspicious', 'Needs review', 'suspicious', live('suspicious')],
            ['not_found', 'Not Found', 'notfound', live('not_found')],
            ['unverified', 'Unverified', 'unverified', live('unverified')],
            ['dismissed', 'Dismissed', 'dismissed-chip', live('dismissed')],
          ] as const).map(([status, label, cls, count]) => (
            <button
              key={status}
              type="button"
              className={`status-chip ${cls} ${hiddenStatuses.has(status) ? 'off' : ''}`}
              onClick={() => toggleStatus(status)}
              aria-pressed={!hiddenStatuses.has(status)}
              title={hiddenStatuses.has(status) ? `Show ${label} rows` : `Hide ${label} rows`}
            >
              <span className="count">{count}</span> {label}
            </button>
          ))}
        </div>
        <p className="status-legend">
          <strong>Not found</strong> = searched, no record &middot;{' '}
          <strong>Unverified</strong> = database unreachable, re-run to retry &middot;{' '}
          <strong>Needs review</strong> = found but metadata disagrees &middot;{' '}
          <strong>struck-through</strong> = dismissed (you marked it reviewed) — expand the row and
          use Restore to undo
        </p>

        {references.verifications.length > 0 ? (
          <div className="ref-table-wrap">
            <table className="ref-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => setSort('index')}>#{sortIndicator('index')}</th>
                  <th className="sortable" onClick={() => setSort('title')}>Reference{sortIndicator('title')}</th>
                  <th className="sortable" onClick={() => setSort('status')}>Status{sortIndicator('status')}</th>
                  <th className="sortable" onClick={() => setSort('doi')}>DOI{sortIndicator('doi')}</th>
                  <th className="sortable" onClick={() => setSort('url')}>URL{sortIndicator('url')}</th>
                  <th className="sortable" onClick={() => setSort('confidence')}>Confidence{sortIndicator('confidence')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, idx }) => (
                  <ReferenceRow
                    key={idx}
                    v={v}
                    index={idx}
                    isDismissed={dismissed.has(`ref:${idx}`)}
                    onToggleDismiss={toggleDismiss}
                    onReverify={onReverify}
                    isRechecking={rechecking.has(idx)}
                  />
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

function CrossReferencesPanel({ results }: PanelProps) {
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

export function ResultsDashboard({ results, readScreenshot, reverify, persistedDismissals, onDismissalChange }: ResultsDashboardProps) {
  const [activeSection, setActiveSection] = useState('overview');
  // Re-verified rows override the original run's verdicts in place.
  const [overrides, setOverrides] = useState<Map<number, ReferenceVerification>>(new Map());
  const [rechecking, setRechecking] = useState<Set<number>>(new Set());

  const effectiveResults = useMemo(() => {
    if (overrides.size === 0) return results;
    const verifications = results.references.verifications.map((v, i) => overrides.get(i) ?? v);
    return { ...results, references: { ...results.references, verifications } };
  }, [results, overrides]);

  const handleReverify = async (idx: number) => {
    if (!reverify || rechecking.has(idx)) return;
    const v = effectiveResults.references.verifications[idx];
    if (!v) return;
    setRechecking((prev) => new Set(prev).add(idx));
    try {
      const fresh = await reverify(v.reference);
      if (fresh) {
        setOverrides((prev) => new Map(prev).set(idx, fresh));
      }
    } finally {
      setRechecking((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  };

  const unverifiedIdx = effectiveResults.references.verifications
    .map((v, i) => (v.status === 'unverified' ? i : -1))
    .filter((i) => i >= 0);

  const handleReverifyAll = async () => {
    // Sequential on purpose: the whole point is recovering from rate limits.
    for (const idx of unverifiedIdx) {
      // eslint-disable-next-line no-await-in-loop
      await handleReverify(idx);
    }
  };
  // Dismissal state lives HERE (not in the Overview) so every surface that
  // shows counts — summary strip, sidebar badges, per-panel chips — reflects
  // a dismissal the moment it happens. Item keys mirror the priority list
  // (`ref:<idx>`, `intext:<idx>`). Session-only, like before.
  // Rows matching a persisted content-key start dismissed (triage decisions
  // are about WHAT is cited, not which row it landed in this run's order).
  const [dismissed, setDismissedRaw] = useState<Set<string>>(() => {
    const init = new Set<string>();
    if (persistedDismissals?.length) {
      const persisted = new Set(persistedDismissals);
      results.references.verifications.forEach((v, idx) => {
        if (persisted.has(referenceContentKey(v.reference.raw))) init.add(`ref:${idx}`);
      });
    }
    return init;
  });
  // Diff each change against the previous set and report per-reference
  // deltas to the host for persistence.
  const setDismissed = (next: Set<string>) => {
    if (onDismissalChange) {
      const all = new Set([...dismissed, ...next]);
      for (const key of all) {
        const was = dismissed.has(key);
        const is = next.has(key);
        if (was === is || !key.startsWith('ref:')) continue;
        const idx = Number(key.slice(4));
        const v = results.references.verifications[idx];
        if (v) onDismissalChange(referenceContentKey(v.reference.raw), is);
      }
    }
    setDismissedRaw(next);
  };
  const refs = effectiveResults.references;

  const adjusted = useMemo(() => {
    let suspicious = 0;
    let notFound = 0;
    refs.verifications.forEach((v, idx) => {
      if (dismissed.has(`ref:${idx}`)) return;
      if (v.status === 'suspicious') suspicious++;
      if (v.status === 'not_found') notFound++;
    });
    const orphanInText = refs.crossReference.unmatchedInText.filter(
      (_c, idx) => !dismissed.has(`intext:${idx}`),
    ).length;
    return { suspicious, notFound, orphanInText };
  }, [refs, dismissed]);

  const crossRefCount =
    refs.crossReference.unmatchedBibliography.length + adjusted.orphanInText;
  const issueCount = adjusted.suspicious + adjusted.notFound;

  const getBadge = (id: string): { count: number | null; warn: boolean } => {
    switch (id) {
      case 'references': return { count: refs.totalReferences, warn: issueCount > 0 };
      case 'crossrefs':  return { count: crossRefCount > 0 ? crossRefCount : null, warn: crossRefCount > 0 };
      default:           return { count: null, warn: false };
    }
  };

  const body: ReactNode = (
    <div className="results-shell">
      <aside className="results-sidebar">
        <div className="sidebar-filename">{results.fileName}</div>
        <nav className="sidebar-nav">
          {SECTIONS.map((s) => {
            const badge = getBadge(s.id);
            return (
              <Fragment key={s.id}>
                <button
                  className={`sidebar-link ${activeSection === s.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(s.id)}
                >
                  <span><span className="icon">{s.icon}</span> {s.label}</span>
                  {badge.count !== null && (
                    <span className={`sidebar-badge ${badge.warn ? 'warn' : ''}`}>{badge.count}</span>
                  )}
                </button>
              </Fragment>
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
            <span className="value">{refs.verifications.filter((v) => v.status === 'verified' || v.status === 'likely_valid').length}</span>
            <span className="label">Verified</span>
          </div>
          <div className="summary-stat amber">
            <span className="value">{adjusted.suspicious}</span>
            <span className="label">Needs review</span>
          </div>
          <div className="summary-stat rose">
            <span className="value">{adjusted.notFound}</span>
            <span className="label">Not Found</span>
          </div>
          {dismissed.size > 0 && (
            <div className="summary-stat muted">
              <span className="value">{dismissed.size}</span>
              <span className="label">Dismissed</span>
            </div>
          )}
          <div className="summary-stat muted">
            <span className="value">{unverifiedIdx.length}</span>
            <span className="label">Unverified</span>
          </div>
          {reverify && unverifiedIdx.length > 0 && (
            <button type="button" className="summary-recheck" onClick={handleReverifyAll} disabled={rechecking.size > 0}>
              {rechecking.size > 0 ? `Re-checking… (${rechecking.size})` : `Re-check ${unverifiedIdx.length} unverified`}
            </button>
          )}
          <div className="summary-stat muted">
            <span className="value">{crossRefCount}</span>
            <span className="label">Orphaned</span>
          </div>
        </div>

        {activeSection === 'overview'    && (
          <OverviewPanel
            results={effectiveResults}
            dismissed={dismissed}
            onDismissedChange={setDismissed}
            onReverify={reverify ? handleReverify : undefined}
            rechecking={rechecking}
          />
        )}
        {activeSection === 'references'  && (
          <ReferencesPanel
            results={effectiveResults}
            dismissed={dismissed}
            onDismissedChange={setDismissed}
            onReverify={reverify ? handleReverify : undefined}
            rechecking={rechecking}
          />
        )}
        {activeSection === 'crossrefs'   && <CrossReferencesPanel results={effectiveResults} />}

        <p className="results-disclaimer">{DISCLAIMER}</p>
        <p className="results-attribution">{ATTRIBUTION}</p>
      </main>
    </div>
  );

  // Provide the screenshot capability once, at the top, so descendants can
  // read it via context without prop-drilling through every panel.
  return (
    <ScreenshotContext.Provider value={readScreenshot ?? noScreenshot}>
      {body}
    </ScreenshotContext.Provider>
  );
}
