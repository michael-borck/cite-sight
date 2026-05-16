import { Fragment, useEffect, useState } from 'react';
import type {
  AnalysisResult,
  ReferenceVerification,
  VerificationStatus,
  WritingPattern,
  PatternCategory,
} from '@michaelborck/cite-sight-core';
import { OverviewPanel } from './Overview/index.js';
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
    case 'format_only': return 'Format Only';
  }
}

function statusClass(s: VerificationStatus): string {
  switch (s) {
    case 'verified': return 'status-verified';
    case 'likely_valid': return 'status-likely-valid';
    case 'suspicious': return 'status-suspicious';
    case 'not_found': return 'status-not-found';
    case 'format_only': return 'status-format-only';
  }
}

function severityClass(s: WritingPattern['severity']): string {
  return `severity-${s}`;
}

function categoryLabel(c: PatternCategory): string {
  switch (c) {
    case 'citation_issues': return 'Citation Issues';
    case 'completeness': return 'Completeness';
    case 'style_observations': return 'Style Observations';
  }
}

function pct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

function bar(value: number, max = 100): number {
  return Math.min(100, Math.max(0, (value / max) * 100));
}

// ─── sub-panels ───────────────────────────────────────────────────────────────

function ScreenshotThumbnail({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    window.citeSight?.readScreenshot(path).then((dataUrl) => {
      if (dataUrl) setSrc(dataUrl);
    });
  }, [path]);

  if (!src) return null;

  return (
    <div className="ref-screenshot">
      <img src={src} alt="Page screenshot" className="screenshot-img" />
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
              {v.urlCheck?.screenshotPath && (
                <ScreenshotThumbnail path={v.urlCheck.screenshotPath} />
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

function QualityPanel({ results }: Props) {
  const wq = results.writingQuality;

  const metrics = [
    {
      label: 'Passive Voice',
      value: pct(wq.passiveVoicePercentage),
      barWidth: bar(wq.passiveVoicePercentage),
      level: wq.passiveVoicePercentage > 20 ? 'warning' : 'good',
    },
    {
      label: 'Academic Tone',
      value: `${wq.academicToneScore.toFixed(1)}/10`,
      barWidth: bar(wq.academicToneScore, 10),
      level: wq.academicToneScore >= 7 ? 'good' : 'warning',
    },
    {
      label: 'Sentence Variety',
      value: `${wq.sentenceVarietyScore.toFixed(1)}/10`,
      barWidth: bar(wq.sentenceVarietyScore, 10),
      level: 'good',
    },
    {
      label: 'Complex Sentences',
      value: pct(wq.complexSentenceRatio * 100),
      barWidth: bar(wq.complexSentenceRatio * 100),
      level: 'good',
    },
  ];

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>Writing Quality</h3>
      </div>
      <div className="panel-body">
        <div className="metrics-grid">
          {metrics.map((m) => (
            <div key={m.label} className="metric-item">
              <div className="metric-label-row">
                <span>{m.label}</span>
                <span className="metric-val">{m.value}</span>
              </div>
              <div className="metric-bar">
                <div className={`metric-bar-fill ${m.level}`} style={{ width: `${m.barWidth}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="quality-details">
          <h4>Details</h4>
          <ul>
            <li>Avg sentence length: {wq.avgSentenceLength.toFixed(1)} words</li>
            <li>Transition words: {wq.transitionWordCount}</li>
            <li>Hedging phrases: {wq.hedgingPhraseCount}</li>
          </ul>

          {wq.hedgingPhrases.length > 0 && (
            <>
              <h4>Top Hedging Phrases</h4>
              <div className="word-items">
                {wq.hedgingPhrases.slice(0, 10).map((h) => (
                  <span key={h.phrase} className="word-tag word-tag-orange">
                    {h.phrase} ({h.count})
                  </span>
                ))}
              </div>
            </>
          )}

          {wq.passiveVoiceSentences.length > 0 && (
            <>
              <h4>Sample Passive Voice Sentences</h4>
              <ul className="passive-list">
                {wq.passiveVoiceSentences.slice(0, 5).map((s, i) => (
                  <li key={i} className="passive-item">{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WordsPanel({ results }: Props) {
  const wa = results.wordAnalysis;

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>Word Analysis</h3>
      </div>
      <div className="panel-body">
        <div className="word-stats-grid">
          <div className="stat-card stat-blue">
            <div className="stat-value">{wa.totalWords.toLocaleString()}</div>
            <div className="stat-label">Total Words</div>
          </div>
          <div className="stat-card stat-teal">
            <div className="stat-value">{wa.uniqueWords.toLocaleString()}</div>
            <div className="stat-label">Unique Words</div>
          </div>
          <div className="stat-card stat-purple">
            <div className="stat-value">{(wa.vocabularyRichness * 100).toFixed(1)}%</div>
            <div className="stat-label">Vocabulary Richness</div>
          </div>
        </div>

        <div className="word-lists">
          <div className="word-section">
            <h4>Most Frequent Words</h4>
            <div className="word-items">
              {wa.topWords.slice(0, 20).map((w) => (
                <span key={w.word} className="word-tag">
                  {w.word} ({w.count})
                </span>
              ))}
            </div>
          </div>

          <div className="word-section">
            <h4>Top Bigrams</h4>
            <div className="word-items">
              {wa.bigrams.slice(0, 15).map((b) => (
                <span key={b.phrase} className="word-tag word-tag-green">
                  {b.phrase} ({b.count})
                </span>
              ))}
            </div>
          </div>

          <div className="word-section">
            <h4>Top Trigrams</h4>
            <div className="word-items">
              {wa.trigrams.slice(0, 10).map((t) => (
                <span key={t.phrase} className="word-tag word-tag-purple">
                  {t.phrase} ({t.count})
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WritingPatternsPanel({ results }: Props) {
  const { writingPatterns } = results;
  const { categoryCounts } = writingPatterns;
  const categories: PatternCategory[] = ['citation_issues', 'completeness', 'style_observations'];

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>Writing Patterns</h3>
      </div>
      <div className="panel-body">
        <div className="category-counts">
          {categories.map((cat) => (
            <div key={cat} className="category-count-item">
              <div className="category-count-num">{categoryCounts[cat]}</div>
              <div className="category-count-label">{categoryLabel(cat)}</div>
            </div>
          ))}
        </div>

        {writingPatterns.patterns.length > 0 ? (
          <div className="patterns-list">
            {categories.map((cat) => {
              const catPatterns = writingPatterns.patterns.filter(p => p.category === cat);
              if (catPatterns.length === 0) return null;
              return (
                <div key={cat} className="patterns-category-group">
                  <h4>{categoryLabel(cat)} ({catPatterns.length})</h4>
                  {catPatterns.map((p, i) => (
                    <div key={i} className={`pattern-card ${severityClass(p.severity)}`}>
                      <div>
                        <div className="pattern-header">
                          <span className="pattern-type">{p.type}</span>
                          <span className={`severity-badge ${p.severity}`}>{p.severity}</span>
                        </div>
                        <p className="pattern-description">{p.description}</p>
                        {p.evidence && (
                          <div className="pattern-evidence">
                            <strong>Evidence:</strong> {p.evidence}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="no-patterns">
            <p>No notable writing patterns detected.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── sidebar sections ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'overview',    label: 'Overview',    icon: '\u25C6', group: 'primary' as const },
  { id: 'references',  label: 'References',  icon: '\uD83D\uDCDA', group: 'primary' as const },
  { id: 'crossrefs',   label: 'Cross-refs',  icon: '\u21C4', group: 'primary' as const },
  { id: 'quality',     label: 'Quality',     icon: '\u270E', group: 'bonus' as const },
  { id: 'words',       label: 'Words',       icon: '\uD83D\uDD22', group: 'bonus' as const },
  { id: 'patterns',    label: 'Patterns',    icon: '\uD83D\uDD0D', group: 'bonus' as const },
];

// ─── main component ───────────────────────────────────────────────────────────

export function ResultsDashboard({ results }: Props) {
  const [activeSection, setActiveSection] = useState('overview');
  const refs = results.references;
  const crossRefCount =
    refs.crossReference.unmatchedBibliography.length +
    refs.crossReference.unmatchedInText.length;
  const issueCount = refs.suspiciousCount + refs.notFoundCount;
  const patternCount = results.writingPatterns.patterns.length;

  const getBadge = (id: string): { count: number | null; warn: boolean } => {
    switch (id) {
      case 'references': return { count: refs.totalReferences, warn: issueCount > 0 };
      case 'crossrefs':  return { count: crossRefCount > 0 ? crossRefCount : null, warn: crossRefCount > 0 };
      case 'patterns':   return { count: patternCount > 0 ? patternCount : null, warn: patternCount > 0 };
      default:           return { count: null, warn: false };
    }
  };

  return (
    <div className="results-shell">
      <aside className="results-sidebar">
        <div className="sidebar-filename">{results.fileName}</div>
        <nav className="sidebar-nav">
          {SECTIONS.map((s, idx) => {
            const prev = SECTIONS[idx - 1];
            const showDivider = prev && prev.group === 'primary' && s.group === 'bonus';
            const badge = getBadge(s.id);
            return (
              <Fragment key={s.id}>
                {showDivider && <div className="sidebar-divider">Bonus signals</div>}
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
            <span className="value">{results.readability.wordCount.toLocaleString()}</span>
            <span className="label">Words</span>
          </div>
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
        {activeSection === 'quality'     && <QualityPanel results={results} />}
        {activeSection === 'words'       && <WordsPanel results={results} />}
        {activeSection === 'patterns'    && <WritingPatternsPanel results={results} />}
      </main>
    </div>
  );
}
