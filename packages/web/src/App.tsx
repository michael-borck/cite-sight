import { useCallback, useEffect, useRef, useState } from 'react';
import { LandingPage } from './pages/LandingPage';
import { ToolPage } from './pages/ToolPage';
import { AboutPage } from './pages/AboutPage';
import './App.css';

declare const __APP_VERSION__: string;

type Page = 'landing' | 'tool' | 'about';

/**
 * The current page lives in the URL so a refresh lands where the user was.
 * Without this the tool page was only reachable by clicking through from the
 * landing page, which made refresh recovery — reconnecting a queued check or
 * restoring a completed report — unreachable in practice: the restore effect in
 * ToolPage never mounted because a reload dropped the visitor back here.
 *
 * The server serves the SPA for every path (see server routes.ts), so a cold
 * deep link such as /tool loads correctly.
 */
const PATHS: Record<Page, string> = { landing: '/', tool: '/tool', about: '/about' };

function pageFromPath(pathname: string): Page {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return (Object.keys(PATHS) as Page[]).find((page) => PATHS[page] === clean) ?? 'landing';
}

export function App() {
  const [page, setPageState] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [announce, setAnnounce] = useState<Page | null>(null);
  const headingRef = useRef<HTMLParagraphElement>(null);

  const setPage = useCallback((next: Page) => {
    if (window.location.pathname !== PATHS[next]) window.history.pushState(null, '', PATHS[next]);
    setPageState(next);
    setAnnounce(next);
  }, []);

  useEffect(() => {
    const onPopState = () => { setPageState(pageFromPath(window.location.pathname)); setAnnounce(null); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // A page swap replaces the whole subtree of <main>, leaving focus on a button
  // that no longer exists. Move it to the page heading and announce it, so a
  // keyboard or screen-reader user is not dropped at the top of the document
  // with no indication that anything happened.
  useEffect(() => {
    if (!announce) return;
    headingRef.current?.focus();
  }, [announce]);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <h1><button type="button" className="brand-button" onClick={() => setPage('landing')}>CiteSight<span className="dot"></span></button></h1>
            <span className="version">v{__APP_VERSION__}</span>
          </div>
          <nav className="header-nav" aria-label="Primary">
            <button onClick={() => setPage('landing')} className={`nav-link ${page === 'landing' ? 'active' : ''}`} aria-current={page === 'landing' ? 'page' : undefined}>Home</button>
            <button onClick={() => setPage('tool')} className={`nav-link ${page === 'tool' ? 'active' : ''}`} aria-current={page === 'tool' ? 'page' : undefined}>Check Citations</button>
            <button onClick={() => setPage('about')} className={`nav-link ${page === 'about' ? 'active' : ''}`} aria-current={page === 'about' ? 'page' : undefined}>About</button>
          </nav>
        </div>
      </header>

      <main className="app-main" id="main-content">
        <div className="container">
          {/* Each page brings its own visible heading; this exists so a page
              change can be announced and focused, and so <main> is labelled. */}
          <p className="visually-hidden" role="status" aria-live="polite" tabIndex={-1} ref={headingRef}>
            {PAGE_NAMES[page]} page
          </p>
          {page === 'landing' && <LandingPage onNavigate={setPage} />}
          {page === 'tool' && <ToolPage />}
          {page === 'about' && <AboutPage />}
        </div>
      </main>

      <footer className="app-footer">
        <p>CiteSight — Academic Citation Verification Tool</p>
        <p className="footer-contact">Created by Michael Borck | <a href="https://github.com/michael-borck/cite-sight">GitHub</a></p>
      </footer>
    </div>
  );
}

const PAGE_NAMES: Record<Page, string> = { landing: 'Home', tool: 'Check citations', about: 'About' };