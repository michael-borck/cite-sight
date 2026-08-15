import { useEffect, useState } from 'react';
import './ProcessingOptions.css';

interface CacheInfo {
  directory: string;
  cacheFile: string;
  cacheEntries: number;
  cacheBytes: number;
  dismissalsCount: number;
}

interface Props {
  /** Lets the app drop its in-memory dismissal list when the file is cleared. */
  onDismissalsCleared: () => void;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Data & privacy accordion: where the persisted data lives, how big it is,
 * and the two destructive actions — clearing the lookup cache (rebuildable
 * API data; the next scan just runs cold) and clearing dismissals (the
 * user's triage judgements; every previously dismissed flag returns).
 * Destructive buttons use two-click confirmation instead of a modal.
 */
export function DataPrivacyPanel({ onDismissalsCleared }: Props) {
  const [info, setInfo] = useState<CacheInfo | null>(null);
  const [confirming, setConfirming] = useState<'cache' | 'dismissals' | null>(null);

  const refresh = () => {
    window.citeSight?.cacheInfo().then(setInfo).catch(() => setInfo(null));
  };
  useEffect(refresh, []);

  const clearCache = async () => {
    if (confirming !== 'cache') { setConfirming('cache'); return; }
    setConfirming(null);
    await window.citeSight?.clearCache();
    refresh();
  };

  const clearDismissals = async () => {
    if (confirming !== 'dismissals') { setConfirming('dismissals'); return; }
    setConfirming(null);
    await window.citeSight?.clearDismissals();
    onDismissalsCleared();
    refresh();
  };

  return (
    <details className="options-panel" onToggle={refresh}>
      <summary>Data &amp; Privacy</summary>

      <div className="options-grid">
        <div className="option-group full">
          <div className="option-label">Local data location</div>
          <code className="data-path">{info?.directory ?? '…'}</code>
          <span className="hint">
            Everything CiteSight stores lives here, on this machine: the lookup cache
            (results from the citation databases, so re-scans don&apos;t re-spend API
            quota) and your dismissals (flags you marked as reviewed). Documents are
            never stored.
          </span>
        </div>

        <div className="option-group">
          <div className="option-label">Lookup cache</div>
          <span className="hint">
            {info ? `${info.cacheEntries} entries · ${fmtBytes(info.cacheBytes)}` : '…'}
          </span>
        </div>
        <div className="option-group">
          <div className="option-label">Dismissed flags</div>
          <span className="hint">{info ? `${info.dismissalsCount} remembered` : '…'}</span>
        </div>
      </div>

      <div className="data-actions">
        <button type="button" className="data-action" onClick={() => window.citeSight?.revealDataDir()}>
          Reveal in file manager
        </button>
        <button type="button" className="data-action danger" onClick={clearCache}>
          {confirming === 'cache' ? 'Click again to confirm' : 'Clear lookup cache'}
        </button>
        <button type="button" className="data-action danger" onClick={clearDismissals}>
          {confirming === 'dismissals' ? 'Click again to confirm' : 'Clear dismissals'}
        </button>
      </div>
      <span className="hint">
        Clearing the cache just means the next scan runs cold (slower, more API
        calls). Clearing dismissals brings back every flag you previously reviewed.
        To back up, use &quot;Reveal in file manager&quot; and copy the JSON files.
      </span>
    </details>
  );
}
