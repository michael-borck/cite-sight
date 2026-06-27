import type { Verdict } from '@michaelborck/cite-sight-core';

interface Props {
  fileName: string;
  pages?: number;
  processingTimeMs: number;
  verdict: Verdict;
}

const PILL_LABEL: Record<Verdict['state'], string> = {
  all_clear: 'All clear',
  caution: 'Caution',
  issues: 'Issues',
};

function pillSuffix(v: Verdict): string {
  if (v.state === 'all_clear') return ' \u2014 all checks pass';
  return ` \u2014 ${v.toCheckCount} to check`;
}

export function VerdictHero({ fileName, pages, processingTimeMs, verdict }: Props) {
  const total = verdict.verifiedCount + verdict.toCheckCount + verdict.unverifiableCount;
  const verifiedPct = total === 0 ? 0 : (verdict.verifiedCount / total) * 100;
  const toCheckPct = total === 0 ? 0 : (verdict.toCheckCount / total) * 100;
  const unverifiablePct = total === 0 ? 0 : (verdict.unverifiableCount / total) * 100;

  const breakdownParts = [
    verdict.breakdown.suspect > 0 && `${verdict.breakdown.suspect} to review`,
    verdict.breakdown.notFound > 0 && `${verdict.breakdown.notFound} not found`,
    verdict.breakdown.orphanInText > 0 && `${verdict.breakdown.orphanInText} orphan citations`,
  ].filter(Boolean);

  return (
    <div className="hero-card">
      <div className="hero-header">
        <div>
          <div className="hero-filename">{fileName}</div>
          <div className="hero-meta">
            {pages != null && <>{pages} pages · </>}
            analysed in {(processingTimeMs / 1000).toFixed(1)}s
          </div>
        </div>
        <div className={`verdict-pill verdict-${verdict.state}`}>
          {PILL_LABEL[verdict.state]}{pillSuffix(verdict)}
        </div>
      </div>

      <div className="proportion-bar">
        {verifiedPct > 0 && (
          <div className="proportion-segment seg-verified" style={{ width: `${verifiedPct}%` }}>
            {verifiedPct > 12 ? `${verdict.verifiedCount} verified` : ''}
          </div>
        )}
        {toCheckPct > 0 && (
          <div className="proportion-segment seg-tocheck" style={{ width: `${toCheckPct}%` }}>
            {toCheckPct > 12 ? `${verdict.toCheckCount} to check` : ''}
          </div>
        )}
        {unverifiablePct > 0 && (
          <div className="proportion-segment seg-unverifiable" style={{ width: `${unverifiablePct}%` }}>
            {unverifiablePct > 12 ? `${verdict.unverifiableCount} unverifiable` : ''}
          </div>
        )}
      </div>

      {breakdownParts.length > 0 && (
        <div className="hero-breakdown">{breakdownParts.join(' · ')}</div>
      )}
    </div>
  );
}
