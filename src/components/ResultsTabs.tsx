import React from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import { useStore } from '../store';
import type { Pattern, WordFrequency, PhraseCount } from '../types';
import 'react-tabs/style/react-tabs.css';
import './ResultsTabs.css';

export const ResultsTabs: React.FC = () => {
  const { results, activeTab, setActiveTab } = useStore();

  if (!results) {
    return null;
  }

  const tabIndex = ['overview', 'references', 'patterns', 'quality', 'words'].indexOf(activeTab);

  return (
    <div className="results-tabs">
      <Tabs
        selectedIndex={tabIndex >= 0 ? tabIndex : 0}
        onSelect={(index) => {
          const tabs = ['overview', 'references', 'patterns', 'quality', 'words'];
          setActiveTab(tabs[index]);
        }}
      >
        <TabList>
          <Tab>Overview</Tab>
          <Tab>
            References
            {results.references.issues.length > 0 && (
              <span className="tab-badge">{results.references.issues.length}</span>
            )}
          </Tab>
          <Tab>
            Patterns
            {results.suspicious_patterns.patterns.length > 0 && (
              <span className="tab-badge warning">{results.suspicious_patterns.patterns.length}</span>
            )}
          </Tab>
          <Tab>Quality</Tab>
          <Tab>Words</Tab>
        </TabList>

        <TabPanel>
          <div className="overview-panel">
            <h3>Analysis Overview</h3>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{results.document_analysis.word_count}</div>
                <div className="stat-label">Words</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{results.document_analysis.sentence_count}</div>
                <div className="stat-label">Sentences</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{results.references.total}</div>
                <div className="stat-label">References</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{results.document_analysis.flesch_score.toFixed(1)}</div>
                <div className="stat-label">Readability</div>
              </div>
            </div>

            <div className="summary-section">
              <h4>Document Metrics</h4>
              <ul>
                <li>Average words per sentence: {results.document_analysis.avg_words_per_sentence}</li>
                <li>Paragraphs: {results.document_analysis.paragraph_count}</li>
                <li>Flesch-Kincaid Grade: {results.document_analysis.flesch_kincaid_grade.toFixed(1)}</li>
              </ul>
            </div>

            <div className="processing-info">
              <p>Processed {results.file_count} file(s) in {results.processing_time.toFixed(2)} seconds</p>
            </div>
          </div>
        </TabPanel>

        <TabPanel>
          <div className="references-panel">
            <h3>References Analysis</h3>
            
            <div className="reference-stats">
              <div className="stat-item">
                <span className="stat-label">Total References:</span>
                <span className="stat-value">{results.references.total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Broken URLs:</span>
                <span className="stat-value error">{results.references.broken_urls}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Unresolved DOIs:</span>
                <span className="stat-value warning">{results.references.unresolved_dois}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Missing in Text:</span>
                <span className="stat-value warning">{results.references.missing_in_text}</span>
              </div>
            </div>

            {results.references.issues.length > 0 && (
              <div className="issues-list">
                <h4>Issues Found</h4>
                {results.references.issues.map((issue, index) => (
                  <div key={index} className={`issue-item ${issue.severity}`}>
                    <span className="issue-type">{issue.type}</span>
                    <span className="issue-message">{issue.message}</span>
                    {issue.suggestion && (
                      <span className="issue-suggestion">💡 {issue.suggestion}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel>
          <div className="patterns-panel">
            <h3>Suspicious Patterns</h3>
            
            <div className="pattern-summary">
              <p>Detected {results.suspicious_patterns.patterns.length} suspicious pattern(s)</p>
              <p>Overall risk score: {results.suspicious_patterns.risk_score.toFixed(1)}/100</p>
            </div>

            {results.suspicious_patterns.patterns.length > 0 && (
              <div className="patterns-list">
                {results.suspicious_patterns.patterns.map((pattern: Pattern, index: number) => (
                  <div key={index} className={`pattern-item severity-${pattern.severity}`}>
                    <div className="pattern-header">
                      <span className="pattern-type">{pattern.type}</span>
                      <span className={`severity-badge ${pattern.severity}`}>
                        {pattern.severity}
                      </span>
                    </div>
                    <p className="pattern-description">{pattern.description}</p>
                    {pattern.location && (
                      <span className="pattern-location">📍 {pattern.location}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel>
          <div className="quality-panel">
            <h3>Writing Quality</h3>
            
            <div className="quality-metrics">
              <div className="metric-item">
                <span className="metric-label">Passive Voice:</span>
                <div className="metric-bar">
                  <div 
                    className="metric-fill"
                    style={{ width: `${results.writing_quality.passive_voice_percentage}%` }}
                  />
                </div>
                <span className="metric-value">{results.writing_quality.passive_voice_percentage}%</span>
              </div>
              
              <div className="metric-item">
                <span className="metric-label">Sentence Variety:</span>
                <div className="metric-bar">
                  <div 
                    className="metric-fill good"
                    style={{ width: `${results.writing_quality.sentence_variety_score * 10}%` }}
                  />
                </div>
                <span className="metric-value">{results.writing_quality.sentence_variety_score.toFixed(1)}/10</span>
              </div>
              
              <div className="metric-item">
                <span className="metric-label">Academic Tone:</span>
                <div className="metric-bar">
                  <div 
                    className="metric-fill good"
                    style={{ width: `${results.writing_quality.academic_tone_score * 10}%` }}
                  />
                </div>
                <span className="metric-value">{results.writing_quality.academic_tone_score.toFixed(1)}/10</span>
              </div>
            </div>

            <div className="quality-details">
              <h4>Details</h4>
              <ul>
                <li>Transition words: {results.writing_quality.transition_words}</li>
                <li>Hedging phrases: {results.writing_quality.hedging_phrases}</li>
                <li>Complex sentences: {results.writing_quality.complex_sentences}</li>
                <li>Average sentence length variation: Good</li>
              </ul>
            </div>
          </div>
        </TabPanel>

        <TabPanel>
          <div className="words-panel">
            <h3>Word Analysis</h3>
            
            <div className="word-stats">
              <div className="stat-card">
                <div className="stat-value">{results.word_analysis.unique_words}</div>
                <div className="stat-label">Unique Words</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{results.word_analysis.vocabulary_richness.toFixed(2)}</div>
                <div className="stat-label">Vocabulary Richness</div>
              </div>
            </div>

            <div className="word-lists">
              <div className="word-section">
                <h4>Most Frequent Words</h4>
                <div className="word-items">
                  {results.word_analysis.top_words.slice(0, 10).map((word: WordFrequency, index: number) => (
                    <span key={index} className="word-tag">
                      {word.word} ({word.count})
                    </span>
                  ))}
                </div>
              </div>

              <div className="word-section">
                <h4>Top Bigrams</h4>
                <div className="word-items">
                  {results.word_analysis.bigrams.slice(0, 10).map((bigram: PhraseCount, index: number) => (
                    <span key={index} className="word-tag">
                      {bigram.phrase} ({bigram.count})
                    </span>
                  ))}
                </div>
              </div>

              <div className="word-section">
                <h4>Top Trigrams</h4>
                <div className="word-items">
                  {results.word_analysis.trigrams.slice(0, 10).map((trigram: PhraseCount, index: number) => (
                    <span key={index} className="word-tag">
                      {trigram.phrase} ({trigram.count})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
};