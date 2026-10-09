import { useState, useEffect } from 'react';
import './LandingPage.css';

interface Props {
  onNavigate: (page: 'landing' | 'tool' | 'about') => void;
}

type Platform = 'mac' | 'windows' | 'linux';

const PLATFORM_LABELS: Record<Platform, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

const FALLBACK_URL = 'https://github.com/michael-borck/cite-sight/releases/latest';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? '';

  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) return 'mac';
  if (platform.includes('win') || ua.includes('windows')) return 'windows';
  if (ua.includes('linux') || platform.includes('linux')) return 'linux';
  return 'mac';
}

type MacArch = 'arm64' | 'x64';

const MAC_ARCH_LABELS: Record<MacArch, string> = {
  arm64: 'Apple silicon',
  x64: 'Intel',
};

/**
 * Best-effort chip detection.
 *
 * Browsers cannot reliably distinguish Apple silicon from Intel: Safari and
 * Chrome on an M-series Mac deliberately report "Macintosh; Intel Mac OS X" so
 * that sites keep working. The strongest signal available to a page is that
 * Apple silicon exposes a touch-capable trackpad (navigator.maxTouchPoints > 1)
 * while an Intel Mac does not. That is correct in practice and wrong only for
 * the rare Intel Mac with a touch display — so it selects a *default*, never
 * locks out the other option, and the result is shown so a wrong guess is
 * obvious and one click from being fixed.
 */
function detectMacArch(): MacArch {
  return (navigator.maxTouchPoints ?? 0) > 1 ? 'arm64' : 'x64';
}

const MAC_ARCH_KEY = 'cite-sight-mac-arch';

function readStoredArch(): MacArch | null {
  try {
    const stored = localStorage.getItem(MAC_ARCH_KEY);
    return stored === 'arm64' || stored === 'x64' ? stored : null;
  } catch {
    return null; // Storage can be blocked; detection still works.
  }
}

type ReleaseAsset = { name: string; browser_download_url: string };

/**
 * One primary download plus a chip switcher.
 *
 * The button always names the chip it will fetch, so nobody has to guess which
 * of two similar-looking files is theirs, and switching is a single click. When
 * the chip came from detection rather than a deliberate choice we say so — a
 * wrong guess then explains itself instead of silently handing someone the
 * wrong build.
 */
function MacDownload({
  assets,
  arch,
  detected,
  onArch,
  className,
}: {
  assets: ReleaseAsset[];
  arch: MacArch;
  detected: boolean;
  onArch: (next: MacArch) => void;
  className?: string;
}) {
  return (
    <>
      <a className={className} href={matchAsset(assets, 'mac', arch) ?? FALLBACK_URL}>
        Download for Mac ({MAC_ARCH_LABELS[arch]})
      </a>
      <div className="arch-picker">
        <div className="arch-toggle" role="group" aria-label="Which Mac do you have?">
          {(['arm64', 'x64'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`arch-option ${option === arch ? 'arch-option--active' : ''}`}
              aria-pressed={option === arch}
              onClick={() => onArch(option)}
            >
              {MAC_ARCH_LABELS[option]}
            </button>
          ))}
        </div>
        <span className="arch-hint">
          {detected ? `Detected ${MAC_ARCH_LABELS[arch]}` : `Downloading the ${MAC_ARCH_LABELS[arch]} build`}
        </span>
      </div>
    </>
  );
}

function matchAsset(assets: ReleaseAsset[], platform: Platform, macArch?: MacArch): string | null {
  for (const asset of assets) {
    const name = asset.name.toLowerCase();
    if (platform === 'mac' && name.endsWith('.dmg')) {
      // Since the arch-suffixed naming, prefer the requested chip explicitly.
      // Older releases without suffixes still match the bare .dmg fallback.
      if (macArch === 'arm64' && name.includes('arm64')) return asset.browser_download_url;
      if (macArch === 'x64' && name.includes('x64')) return asset.browser_download_url;
      // No arch requested: prefer the Apple silicon build, and say so, rather
      // than relying on release order.
      if (!macArch && !name.includes('x64')) return asset.browser_download_url;
    }
    if (platform === 'windows' && name.endsWith('.exe')) return asset.browser_download_url;
    if (platform === 'linux' && name.endsWith('.appimage')) return asset.browser_download_url;
  }
  return null;
}

function useReleaseAssets() {
  const [assets, setAssets] = useState<{ name: string; browser_download_url: string }[]>([]);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    fetch('https://api.github.com/repos/michael-borck/cite-sight/releases/latest')
      .then((r) => r.json())
      .then((data) => {
        if (data.assets) setAssets(data.assets);
        if (data.tag_name) setVersion(data.tag_name);
      })
      .catch(() => {});
  }, []);

  return { assets, version };
}

const FEATURES = [
  {
    title: 'Reference Verification',
    description: 'Cross-checks against Crossref, Semantic Scholar, and OpenAlex to confirm referenced sources actually exist.',
    icon: '✓',
    iconClass: 'feature-icon--teal',
  },
  {
    title: 'Citation Format Checking',
    description: 'Validates APA, MLA, and Chicago formatting rules and flags deviations from the detected citation style.',
    icon: '⊞',
    iconClass: 'feature-icon--amber',
  },
  {
    title: 'URL Verification',
    description: 'Checks that referenced URLs are live and accessible, reporting dead links and redirects.',
    icon: '⌖',
    iconClass: 'feature-icon--rose',
  },
  {
    title: 'Cross-Reference Matching',
    description: 'Ensures in-text citations have corresponding bibliography entries and vice versa.',
    icon: '⇄',
    iconClass: 'feature-icon--teal',
  },
  {
    title: 'Citation Issue Detection',
    description: 'Flags future-dated references, unusual year clusters, mixed citation styles, and placeholder text.',
    icon: '⚑',
    iconClass: 'feature-icon--amber',
  },
];

// ─── Hero animated report mock ───────────────────────────────────────────────
// Decorative only (aria-hidden). Cycles through references as if verifying
// them live, mirroring the real ResultsDashboard: status badges + confidence
// meters rendered in the project palette.

type MockStatus = 'checking' | 'verified' | 'likely_valid' | 'suspicious' | 'not_found';

interface MockRef {
  title: string;
  final: Exclude<MockStatus, 'checking'>;
  confidence: number;
}

const MOCK_REFS: MockRef[] = [
  { title: 'Smith, J. et al. (2021). Neural scaling laws in vision…', final: 'verified', confidence: 0.96 },
  { title: 'Chen, L. & Park, K. (2019). Adaptive sampling under drift…', final: 'likely_valid', confidence: 0.74 },
  { title: 'Okafor, A. (2023). The reproducibility crisis revisited…', final: 'not_found', confidence: 0.11 },
  { title: 'Vargas, R. & Schmidt, H. (2020). Long-horizon planning…', final: 'suspicious', confidence: 0.38 },
  { title: 'Tanaka, Y. et al. (2022). Few-shot generalisation limits…', final: 'verified', confidence: 0.91 },
];

const MOCK_STATUS_LABEL: Record<MockStatus, string> = {
  checking: 'Checking',
  verified: 'Verified',
  likely_valid: 'Likely Valid',
  suspicious: 'Needs review',
  not_found: 'Not Found',
};

const MOCK_STEP_MS = 820;

function HeroMock() {
  const [revealed, setRevealed] = useState(0);
  const [cycle, setCycle] = useState(0);

  // Reveal one verdict per tick until every reference has been checked.
  useEffect(() => {
    setRevealed(0);
    const id = setInterval(() => {
      setRevealed((n) => {
        if (n >= MOCK_REFS.length) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, MOCK_STEP_MS);
    return () => clearInterval(id);
  }, [cycle]);

  // After completion, pause briefly then loop from the top.
  useEffect(() => {
    if (revealed !== MOCK_REFS.length) return;
    const id = setTimeout(() => setCycle((c) => c + 1), 4400);
    return () => clearTimeout(id);
  }, [revealed]);

  const done = revealed;
  const busy = done < MOCK_REFS.length;
  const verified = MOCK_REFS.slice(0, done).filter((r) => r.final === 'verified').length;
  const flagged = MOCK_REFS.slice(0, done).filter(
    (r) => r.final === 'not_found' || r.final === 'suspicious',
  ).length;

  return (
    <div className="report-mock" aria-hidden="true">
      <div className="report-mock-head">
        <span className="report-mock-title">Citation Report</span>
        <span className={`report-mock-live ${busy ? 'is-active' : ''}`}>
          <i className="live-dot" /> {busy ? 'Verifying' : 'Complete'}
        </span>
      </div>
      <div className="report-mock-progress">
        <div className="report-mock-progress-fill" style={{ width: `${(done / MOCK_REFS.length) * 100}%` }} />
      </div>
      <ul className="report-mock-rows">
        {MOCK_REFS.map((r, i) => {
          const checked = i < done;
          const checking = busy && i === done;
          return (
            <li
              key={i}
              className={[
                'mock-ref',
                checked ? 'is-done' : '',
                checking ? 'is-checking' : '',
                !checked && !checking ? 'is-pending' : '',
              ].join(' ')}
            >
              <span className="mock-ref-title">{r.title}</span>
              <span className="mock-ref-right">
                {checked && (
                  <>
                    <span className={`mock-status mock-status--${r.final}`}>{MOCK_STATUS_LABEL[r.final]}</span>
                    <span className="mock-conf">
                      <span className="mock-conf-bar">
                        <span
                          className={`mock-conf-fill mock-conf-fill--${r.final}`}
                          style={{ width: `${r.confidence * 100}%` }}
                        />
                      </span>
                      <span className="mock-conf-val">{r.confidence.toFixed(2)}</span>
                    </span>
                  </>
                )}
                {checking && <span className="mock-status mock-status--checking">{MOCK_STATUS_LABEL.checking}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="report-mock-foot">
        <span>{done}/{MOCK_REFS.length} checked</span>
        <span className="report-mock-stats">
          <b className="mock-st mock-st--verified">{verified}</b> verified ·{' '}
          <b className="mock-st mock-st--flagged">{flagged}</b> flagged
        </span>
      </div>
    </div>
  );
}
export function LandingPage({ onNavigate }: Props) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(detectPlatform);
  const { assets, version } = useReleaseAssets();

  // macOS ships two builds and the browser cannot be trusted to know which, so
  // detection picks a default that the visitor can change in one click. An
  // explicit choice is remembered and never overridden.
  const storedArch = readStoredArch();
  const [macArch, setMacArch] = useState<MacArch>(() => storedArch ?? detectMacArch());
  const [archIsDetected, setArchIsDetected] = useState(() => storedArch === null);
  function chooseArch(next: MacArch) {
    setMacArch(next);
    setArchIsDetected(false);
    try { localStorage.setItem(MAC_ARCH_KEY, next); } catch { /* Storage can be blocked. */ }
  }

  const downloadUrl = selectedPlatform === 'mac'
    ? matchAsset(assets, 'mac', macArch) ?? FALLBACK_URL
    : matchAsset(assets, selectedPlatform) ?? FALLBACK_URL;
  // Single-file build: matched by exact artifact name so it never collides
  // with the platform matchers above. Falls back to the releases page until
  // a release ships the artifact.
  const standaloneUrl =
    assets.find((a) => a.name === 'cite-sight-standalone.html')?.browser_download_url ?? FALLBACK_URL;
  const label = `Download for ${PLATFORM_LABELS[selectedPlatform]}`;
  // The primary button auto-detects; visitors on the "wrong" machine (or
  // fetching for a colleague) get a one-line escape hatch instead of having
  // to discover the platform selector at the bottom of the page.
  const otherPlatforms = (['mac', 'windows', 'linux'] as Platform[]).filter(
    (p) => p !== selectedPlatform,
  );

  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-text">
            <span className="hero-pill">
              <span className="hero-pill-dot" /> Automated citation verification
            </span>
            <h2 className="hero-heading">
              Verify Academic <em>Citations</em> in Seconds
            </h2>
            <p className="hero-sub">
              Check references exist, validate formatting, and catch suspicious citations — before submission.
            </p>
            <div className="hero-ctas">
              <button className="btn btn-primary" onClick={() => onNavigate('tool')}>
                Check Citations Online
              </button>
              {selectedPlatform === 'mac' ? (
                <MacDownload assets={assets} arch={macArch} detected={archIsDetected} onArch={chooseArch} className="btn btn-secondary" />
              ) : (
                <a className="btn btn-secondary" href={downloadUrl}>{label}</a>
              )}
            </div>
            {/* Only worth saying while the chip is a guess — once someone has
                picked deliberately they know which machine they have. */}
            {selectedPlatform === 'mac' && archIsDetected && (
              <p className="hero-note hero-alt-platforms">
                Not sure? Apple menu → About This Mac → check the Chip line.
              </p>
            )}
            <p className="hero-note hero-alt-platforms">
              Also for{' '}
              {otherPlatforms.map((p, i) => (
                <span key={p}>
                  {i > 0 && ' and '}
                  <a href={matchAsset(assets, p) ?? FALLBACK_URL}>{PLATFORM_LABELS[p]}</a>
                </span>
              ))}
              .
            </p>
            <p className="hero-note hero-alt-platforms">
              No install? <a href={standaloneUrl}>Get the standalone HTML</a> — one file,
              double-click to run.
            </p>
            <p className="hero-note">
              PDF · DOCX · TXT — verified against Crossref, Semantic Scholar &amp; OpenAlex.
            </p>
            {/* The only privacy copy on this page used to promote the offline
                products, while the hero CTA — the one product that uploads the
                document to a server — said nothing about what leaves your
                machine. */}
            <p className="hero-note hero-privacy">
              <strong>Checking online uploads your document to our server</strong> and sends
              reference titles, authors and identifiers to citation databases. The desktop app
              keeps files on your machine. Either way CiteSight is a guide for markers, not a
              judge: “not found” means a database returned no record, not that a source is fake.
            </p>
          </div>
          <HeroMock />
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
              <p>Review a comprehensive report with verification status, format issues, and citation issue observations for each reference.</p>
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
              <div className={`feature-icon ${f.iconClass}`}>{f.icon}</div>
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
          {/*
            This used to claim "everything the web version offers", which the
            tool's own HOSTED_LIMITS_NOTICE contradicts: the hosted checker
            shares server-side API quotas and supports no personal OpenAlex or
            Semantic Scholar keys, so it returns more "unverified". Say what is
            actually different.
          */}
          Everything the web version offers, plus powerful extras that run entirely on your
          machine — including personal API keys and URL screenshots, which is why it verifies
          more references with fewer “unavailable” results.
        </p>

        <div className="comparison">
          <div className="comparison-col">
            <h3 className="comparison-heading">Shared Features</h3>
            <ul className="comparison-list">
              <li><span className="check-icon">✓</span> Reference verification</li>
              <li><span className="check-icon">✓</span> Citation format checking</li>
              <li><span className="check-icon">✓</span> URL checking</li>
              <li><span className="check-icon">✓</span> Cross-reference matching</li>
              <li><span className="check-icon">✓</span> Citation issue detection</li>
              <li><span className="check-icon">✓</span> PDF &amp; CSV reports</li>
            </ul>
          </div>
          <div className="comparison-col">
            <h3 className="comparison-heading">Desktop Only</h3>
            <ul className="comparison-list comparison-list--desktop">
              <li><span className="check-icon desktop-icon">★</span> Fully offline — no file uploads</li>
              <li><span className="check-icon desktop-icon">★</span> Screenshot verification of URLs</li>
              <li><span className="check-icon desktop-icon">★</span> Bulk document processing</li>
              <li><span className="check-icon desktop-icon">★</span> No file size limits</li>
            </ul>
          </div>
        </div>

        <div className="download-actions">
          {selectedPlatform === 'mac' ? (
            <MacDownload assets={assets} arch={macArch} detected={archIsDetected} onArch={chooseArch} className="download-btn" />
          ) : (
            <a className="download-btn" href={downloadUrl}>{label}</a>
          )}
        </div>

        <div className="platform-selector">
          {(['mac', 'windows', 'linux'] as Platform[]).map((p) => (
            <button
              key={p}
              className={`platform-option ${p === selectedPlatform ? 'platform-option--active' : ''}`}
              onClick={() => setSelectedPlatform(p)}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>

        {version && <p className="download-version">Latest: {version}</p>}
        <p className="download-fine">Free and open source</p>

        <div className="standalone-offer">
          <p className="standalone-offer-text">
            Rather not install anything? The <strong>standalone HTML</strong> is a single file —
            download it, double-click it, and the whole analysis runs in your browser tab with the
            document never leaving your device.
          </p>
          <a className="standalone-offer-link" href={standaloneUrl}>
            Download cite-sight-standalone.html
          </a>
        </div>
      </section>
    </div>
  );
}
