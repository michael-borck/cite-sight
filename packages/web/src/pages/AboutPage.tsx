import './AboutPage.css';

export function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-content">

        <section className="about-section">
          <h2>What is CiteSight?</h2>
          <p>
            CiteSight is an academic integrity tool that helps educators and students verify the
            accuracy of citations and references in academic work. It automatically checks whether
            referenced sources actually exist, validates citation formatting, and flags potential
            issues.
          </p>
        </section>

        <section className="about-section">
          <h2>How Reference Verification Works</h2>
          <p>For each reference in your bibliography, CiteSight runs a verification cascade:</p>
          <ol className="verification-steps">
            <li>If the reference has a DOI, it is resolved directly via the Crossref API.</li>
            <li>The reference is searched in Crossref using title and author information.</li>
            <li>If not found, Semantic Scholar is searched as a fallback.</li>
            <li>If still not found, OpenAlex provides a third verification attempt.</li>
            <li>Any URLs in the reference are checked for accessibility.</li>
            <li>In-text citations are matched against bibliography entries.</li>
          </ol>
          <p>
            Each reference receives a confidence score and one of four statuses:
            <strong> Verified</strong>, <strong>Likely Valid</strong>,
            <strong> Suspicious</strong>, or <strong>Not Found</strong>.
          </p>
        </section>

        <section className="about-section">
          <h2>Understanding Readability Scores</h2>
          <div className="score-list">
            <div className="score-item">
              <dt>Flesch Reading Ease (0–100, higher = easier)</dt>
              <dd>Scores of 60–70 are considered standard for academic writing. Higher scores indicate simpler prose.</dd>
            </div>
            <div className="score-item">
              <dt>Flesch-Kincaid Grade Level</dt>
              <dd>Estimates the US school grade level required to understand the text. Academic writing typically scores 12–16.</dd>
            </div>
            <div className="score-item">
              <dt>Coleman-Liau Index</dt>
              <dd>Similar to Flesch-Kincaid but uses character counts instead of syllable counts, making it more consistent across languages.</dd>
            </div>
            <div className="score-item">
              <dt>Automated Readability Index</dt>
              <dd>A character-based grade level estimate that closely correlates with the other indices for English text.</dd>
            </div>
          </div>
        </section>

        <section className="about-section">
          <h2>Writing Quality Metrics</h2>
          <div className="score-list">
            <div className="score-item">
              <dt>Passive Voice</dt>
              <dd>Percentage of sentences using passive constructions. High passive voice (&gt;20%) can reduce clarity in academic writing.</dd>
            </div>
            <div className="score-item">
              <dt>Academic Tone</dt>
              <dd>A 0–10 score that penalises informal language and rewards academic vocabulary and register.</dd>
            </div>
            <div className="score-item">
              <dt>Hedging Phrases</dt>
              <dd>Words and phrases such as "might", "perhaps", and "it seems" that weaken assertions. Some hedging is appropriate in academic writing, but excessive hedging can undermine credibility.</dd>
            </div>
            <div className="score-item">
              <dt>Sentence Variety</dt>
              <dd>A 0–10 measure of variation in sentence length. High variety generally improves readability and engagement.</dd>
            </div>
          </div>
        </section>

        <section className="about-section">
          <h2>Integrity Checks</h2>
          <p>CiteSight looks for patterns that may indicate issues with academic integrity:</p>
          <ul className="integrity-list">
            <li>Citation anomalies such as future dates or unusual year clusters</li>
            <li>Mixed citation styles within the same document</li>
            <li>AI-typical writing patterns including repetitive sentence starters and formulaic transitions</li>
            <li>Placeholder text and self-referencing issues</li>
          </ul>
          <p>
            Each detected pattern is assigned a severity level (High, Medium, or Low) and contributes
            to an overall risk score from 0 to 100.
          </p>
        </section>

        <section className="about-section about-section-alt">
          <h2>Privacy</h2>
          <p>
            CiteSight processes your documents locally in the desktop app — nothing leaves your machine.
            When using the online tool, files are uploaded, processed immediately, and then deleted.
            No document data is stored on our servers at any point. The source code is open and
            available on GitHub for independent verification.
          </p>
        </section>

        <section className="about-section about-section-alt">
          <h2>Open Source</h2>
          <p>
            CiteSight is free and open source software. Contributions, bug reports, and feature
            requests are welcome on GitHub.
          </p>
          <a
            className="github-link"
            href="https://github.com/michael-borck/cite-sight"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </section>

      </div>
    </div>
  );
}
