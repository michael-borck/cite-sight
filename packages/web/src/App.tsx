import { useState } from 'react';
import { LandingPage } from './pages/LandingPage';
import { ToolPage } from './pages/ToolPage';
import { AboutPage } from './pages/AboutPage';
import './App.css';

export function App() {
  const [page, setPage] = useState<'landing' | 'tool' | 'about'>('landing');

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1 onClick={() => setPage('landing')} style={{ cursor: 'pointer' }}>CiteSight</h1>
          <nav className="header-nav">
            <button onClick={() => setPage('landing')} className={`nav-link ${page === 'landing' ? 'active' : ''}`}>Home</button>
            <button onClick={() => setPage('tool')} className={`nav-link ${page === 'tool' ? 'active' : ''}`}>Check Citations</button>
            <button onClick={() => setPage('about')} className={`nav-link ${page === 'about' ? 'active' : ''}`}>About</button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
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
