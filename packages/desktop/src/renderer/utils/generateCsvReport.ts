import type { AnalysisResult } from '@michaelborck/cite-sight-core';

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildCsvLines(result: AnalysisResult, includeFileColumn: boolean): string[] {
  const ref = result.references;
  const lines: string[] = [];

  for (let i = 0; i < ref.verifications.length; i++) {
    const v = ref.verifications[i];
    const r = v.reference;
    const row: string[] = [];
    if (includeFileColumn) row.push(csvEscape(result.fileName));
    row.push(
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
    );
    lines.push(row.join(','));
  }

  return lines;
}

export function downloadCsvReport(results: AnalysisResult[]): void {
  const isBatch = results.length > 1;
  const lines: string[] = [];

  if (isBatch) {
    lines.push(`# CiteSight Batch Report — ${results.length} files`);
  } else {
    lines.push(`# CiteSight Report — ${results[0].fileName}`);
  }
  lines.push(`# Date: ${formatDate()}`);
  lines.push('');

  // Column headers
  const headers = isBatch
    ? 'File,Ref,Title,Authors,Year,DOI,URL,Status,Confidence,URL Status,Flags'
    : 'Ref,Title,Authors,Year,DOI,URL,Status,Confidence,URL Status,Flags';
  lines.push(headers);

  for (const result of results) {
    lines.push(...buildCsvLines(result, isBatch));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = isBatch
    ? `citesight-batch-${formatDate()}`
    : `citesight-references-${results[0].fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  a.download = `${safeName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
