import { useState } from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import type {
  AnalysisResult,
  ReferenceVerification,
  VerificationStatus,
  WritingPattern,
  PatternCategory,
} from '@michaelborck/cite-sight-core';
import 'react-tabs/style/react-tabs.css';
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

function OverviewPanel({ results }: Props) {
  const { readability, references, writingPatterns, processingTime } = results;
  const totalPatterns = writingPatterns.patterns.length;

  return (
    <div className="panel overview-panel">
      <h3>Analysis Overview</h3>

      <div className="stats-grid">
        <div className="stat-card stat-blue">
          <div className="stat-value">{readability.wordCount.toLocaleString()}</div>
          <div className="stat-label">Words</div>
        </div>
        <div className="stat-card stat-green">
          <div className="stat-value">{references.totalReferences}</div>
          <div className="stat-label">References</div>
        </div>
        <div className="stat-card stat-teal">
          <div className="stat-value">{references.verifiedCount}</div>
          <div className="stat-label">Verified</div>
        </div>
        <div className="stat-card stat-orange">
          <div className="stat-value">{references.suspiciousCount}</div>
          <div className="stat-label">Suspicious</div>
        </div>
        <div className="stat-card stat-red">
          <div className="stat-value">{references.notFoundCount}</div>
          <div className="stat-label">Not Found</div>
        </div>
        <div className="stat-card stat-purple">
          <div className="stat-value">{references.brokenUrlCount}</div>
          <div className="stat-label">Broken URLs</div>
        </div>
      </div>

      <div className="overview-metrics">
        <div className="overview-metric-row">
          <span className="oml">Readability (Flesch)</span>
          <div className="ombar-wrap">
            <div className="ombar" style={{ width: `${bar(readability.fleschReadingEase)}%`, background: '#4CAF50' }} />
          </div>
          <span className="omv">{readability.fleschReadingEase.toFixed(1)}</span>
        </div>
        <div className="overview-metric-row">
          <span className="oml">F-K Grade Level</span>
          <div className="ombar-wrap">
            <div className="ombar" style={{ width: `${bar(readability.fleschKincaidGrade, 20)}%`, background: '#667eea' }} />
          </div>
          <span className="omv">{readability.fleschKincaidGrade.toFixed(1)}</span>
        </div>
        <div className="overview-metric-row">
          <span className="oml">Writing Patterns</span>
          <div className="ombar-wrap">
            <div className="ombar" style={{ width: `${bar(totalPatterns, 20)}%`, background: '#667eea' }} />
          </div>
          <span className="omv">{totalPatterns} found</span>
        </div>
      </div>

      <div className="processing-info">
        Analysed {results.fileName} in {(processingTime / 1000).toFixed(2)}s
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
        <td className="ref-doi">{ref.doi ?? '—'}</td>
        <td className="ref-url-status">
          {v.urlCheck ? (
            <span className={`url-status url-${v.urlCheck.status}`}>{v.urlCheck.status}</span>
          ) : '—'}
        </td>
        <td className="ref-confidence">{(v.confidenceScore * 100).toFixed(0)}%</td>
        <td className="ref-expand">{expanded ? '▲' : '▼'}</td>
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
                  {' — '}<em>{v.matchedWork.source}</em>
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
    <div className="panel references-panel">
      <h3>Reference Verification</h3>

      <div className="ref-summary-row">
        <div className="ref-summary-item">
          <span className="ref-summary-num">{references.totalReferences}</span>
          <span className="ref-summary-lbl">Total</span>
        </div>
        <div className="ref-summary-item green">
          <span className="ref-summary-num">{references.verifiedCount}</span>
          <span className="ref-summary-lbl">Verified</span>
        </div>
        <div className="ref-summary-item orange">
          <span className="ref-summary-num">{references.suspiciousCount}</span>
          <span className="ref-summary-lbl">Suspicious</span>
        </div>
        <div className="ref-summary-item red">
          <span className="ref-summary-num">{references.notFoundCount}</span>
          <span className="ref-summary-lbl">Not Found</span>
        </div>
        <div className="ref-summary-item purple">
          <span className="ref-summary-num">{references.brokenUrlCount}</span>
          <span className="ref-summary-lbl">Broken URLs</span>
        </div>
        <div className="ref-summary-item blue">
          <span className="ref-summary-num">{references.detectedStyle}</span>
          <span className="ref-summary-lbl">Style</span>
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
  );
}

function CrossReferencesPanel({ results }: Props) {
  const { crossReference } = results.references;

  return (
    <div className="panel cross-panel">
      <h3>Cross-Reference Check</h3>

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
  );
}

function QualityPanel({ results }: Props) {
  const wq = results.writingQuality;

  const metrics = [
    {
      label: 'Passive Voice',
      value: pct(wq.passiveVoicePercentage),
      barWidth: bar(wq.passiveVoicePercentage),
      color: wq.passiveVoicePercentage > 20 ? '#ff9800' : '#4CAF50',
    },
    {
      label: 'Academic Tone',
      value: `${wq.academicToneScore.toFixed(1)}/10`,
      barWidth: bar(wq.academicToneScore, 10),
      color: '#667eea',
    },
    {
      label: 'Sentence Variety',
      value: `${wq.sentenceVarietyScore.toFixed(1)}/10`,
      barWidth: bar(wq.sentenceVarietyScore, 10),
      color: '#4CAF50',
    },
    {
      label: 'Complex Sentences',
      value: pct(wq.complexSentenceRatio * 100),
      barWidth: bar(wq.complexSentenceRatio * 100),
      color: '#764ba2',
    },
  ];

  return (
    <div className="panel quality-panel">
      <h3>Writing Quality</h3>

      <div className="quality-metrics">
        {metrics.map((m) => (
          <div key={m.label} className="metric-item">
            <span className="metric-label">{m.label}</span>
            <div className="metric-bar">
              <div className="metric-fill" style={{ width: `${m.barWidth}%`, background: m.color }} />
            </div>
            <span className="metric-value">{m.value}</span>
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
  );
}

function WordsPanel({ results }: Props) {
  const wa = results.wordAnalysis;

  return (
    <div className="panel words-panel">
      <h3>Word Analysis</h3>

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
  );
}

function WritingPatternsPanel({ results }: Props) {
  const { writingPatterns } = results;
  const { categoryCounts } = writingPatterns;
  const categories: PatternCategory[] = ['citation_issues', 'completeness', 'style_observations'];

  return (
    <div className="panel patterns-panel">
      <h3>Writing Patterns</h3>

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
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const TAB_NAMES = ['overview', 'references', 'cross', 'quality', 'words', 'patterns'];

export function ResultsDashboard({ results }: Props) {
  const [tabIndex, setTabIndex] = useState(0);
  const totalPatterns = results.writingPatterns.patterns.length;

  return (
    <div className="results-dashboard">
      <Tabs selectedIndex={tabIndex} onSelect={setTabIndex}>
        <TabList>
          <Tab>Overview</Tab>
          <Tab>
            References
            {results.references.suspiciousCount + results.references.notFoundCount > 0 && (
              <span className="tab-badge">
                {results.references.suspiciousCount + results.references.notFoundCount}
              </span>
            )}
          </Tab>
          <Tab>
            Cross-Refs
            {(results.references.crossReference.unmatchedBibliography.length +
              results.references.crossReference.unmatchedInText.length) > 0 && (
              <span className="tab-badge tab-badge-warn">
                {results.references.crossReference.unmatchedBibliography.length +
                  results.references.crossReference.unmatchedInText.length}
              </span>
            )}
          </Tab>
          <Tab>Quality</Tab>
          <Tab>Words</Tab>
          <Tab>
            Writing Patterns
            {totalPatterns > 0 && (
              <span className="tab-badge tab-badge-neutral">
                {totalPatterns}
              </span>
            )}
          </Tab>
        </TabList>

        <TabPanel><OverviewPanel results={results} /></TabPanel>
        <TabPanel><ReferencesPanel results={results} /></TabPanel>
        <TabPanel><CrossReferencesPanel results={results} /></TabPanel>
        <TabPanel><QualityPanel results={results} /></TabPanel>
        <TabPanel><WordsPanel results={results} /></TabPanel>
        <TabPanel><WritingPatternsPanel results={results} /></TabPanel>
      </Tabs>

      <div className="tab-hint">
        Tab: {TAB_NAMES[tabIndex] ?? 'overview'}
      </div>
    </div>
  );
}
