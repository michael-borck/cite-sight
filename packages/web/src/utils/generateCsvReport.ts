import type { AnalysisResult } from '../types';

/** Escape a value for CSV (RFC 4180). */
function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadCsvReport(result: AnalysisResult): void {
  const ref = result.references;
  const lines: string[] = [];

  // Header comments
  lines.push(`# CiteSight Report — ${result.fileName}`);
  lines.push(`# Date: ${formatDate()}`);
  lines.push(
    `# Total: ${ref.totalReferences} | Verified: ${ref.verifiedCount} | Suspicious: ${ref.suspiciousCount} | Not Found: ${ref.notFoundCount} | Broken URLs: ${ref.brokenUrlCount}`,
  );
  lines.push('');

  // Column headers
  lines.push('Ref,Title,Authors,Year,DOI,URL,Status,Confidence,URL Status,Flags');

  // Data rows
  for (let i = 0; i < ref.verifications.length; i++) {
    const v = ref.verifications[i];
    const r = v.reference;
    const row = [
      String(i + 1),
      csvEscape(r.title || ''),
      csvEscape(r.authors.join('; ')),
      r.year != null ? String(r.year) : '',
      csvEscape(r.doi || ''),
      csvEscape(r.url || ''),
      v.status,
      v.confidenceScore.toFixed(2),
      v.urlCheck?.status ?? 'no_url',
      csvEscape(v.flags.join('; ')),
    ];
    lines.push(row.join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = result.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  a.download = `citesight-references-${safeName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
