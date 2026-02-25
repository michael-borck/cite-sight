import './LandingPage.css';

interface Props {
  onNavigate: (page: 'landing' | 'tool' | 'about') => void;
}

function detectPlatform(): { label: string; url: string } {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? '';

  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) {
    return { label: 'Download for macOS', url: 'https://github.com/michael-borck/cite-sight/releases/latest' };
  }
  if (platform.includes('win') || ua.includes('windows')) {
    return { label: 'Download for Windows', url: 'https://github.com/michael-borck/cite-sight/releases/latest' };
  }
  if (ua.includes('linux') || platform.includes('linux')) {
    return { label: 'Download for Linux', url: 'https://github.com/michael-borck/cite-sight/releases/latest' };
  }
  return { label: 'Download Desktop App', url: 'https://github.com/michael-borck/cite-sight/releases/latest' };
}

const FEATURES = [
  {
    title: 'Reference Verification',
    description: 'Cross-checks against Crossref, Semantic Scholar, and OpenAlex to confirm referenced sources actually exist.',
    icon: '✓',
  },
  {
    title: 'Citation Format Checking',
    description: 'Validates APA, MLA, and Chicago formatting rules and flags deviations from the detected citation style.',
    icon: '⊞',
  },
  {
    title: 'URL Verification',
    description: 'Checks that referenced URLs are live and accessible, reporting dead links and redirects.',
    icon: '⌖',
  },
  {
    title: 'Cross-Reference Matching',
    description: 'Ensures in-text citations have corresponding bibliography entries and vice versa.',
    icon: '⇄',
  },
  {
    title: 'Readability Analysis',
    description: 'Computes Flesch-Kincaid, Coleman-Liau, Automated Readability Index, and more.',
    icon: '≡',
  },
  {
    title: 'Writing Patterns',
    description: 'Highlights citation issues, incomplete sections, and notable writing style patterns for review.',
    icon: '⚑',
  },
];

export function LandingPage({ onNavigate }: Props) {
  const download = detectPlatform();

  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="hero-inner">
          <h2 className="hero-heading">Verify Academic Citations in Seconds</h2>
          <p className="hero-sub">
            Check references exist, validate formatting, and catch suspicious citations — before submission.
          </p>
          <div className="hero-ctas">
            <button className="cta-primary" onClick={() => onNavigate('tool')}>
              Check Citations Online
            </button>
            <a
              className="cta-secondary"
              href={download.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {download.label}
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-section">
        <h2 className="section-heading">How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h3>Upload Your Document</h3>
              <p>Drop in a PDF, DOCX, or plain text file. CiteSight extracts the full text automatically.</p>
            </div>
          </div>
          <div className="step-connector" aria-hidden="true" />
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h3>Automated Verification</h3>
              <p>CiteSight extracts every reference and verifies it against multiple academic databases using a confidence-weighted cascade.</p>
            </div>
          </div>
          <div className="step-connector" aria-hidden="true" />
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h3>Detailed Report</h3>
              <p>Review a comprehensive report with verification status, format issues, readability scores, and writing pattern observations for each citation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <h2 className="section-heading">What CiteSight Checks</h2>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Download */}
      <section className="download-section">
        <h2 className="section-heading">Get the Desktop App</h2>
        <p className="download-sub">
          Process documents locally with no file uploads. Supports PDF, DOCX, and plain text.
        </p>
        <a
          className="download-btn"
          href={download.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {download.label}
        </a>
        <p className="download-fine">Free and open source</p>
      </section>
    </div>
  );
}
