import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import { referenceContentKey } from '@michaelborck/cite-sight-core/dashboard';
import { DISCLAIMER } from '@michaelborck/cite-sight-core/disclaimer';
import { STATUS_LABELS } from '@michaelborck/cite-sight-core/browser';
import { REVIEW_LABELS, reviewKey } from '@michaelborck/cite-sight-core/review';

/**
 * Shared CSV report builder for every front end.
 *
 * Three copies of this file had drifted into three different column sets and
 * three different escape routines — and the standalone copy had no
 * formula-injection guard at all. Spreadsheet software (Excel, Numbers,
 * LibreOffice, Sheets) evaluates a cell beginning =, +, - or @ as a formula, so
 * an exported citation starting with one of those characters would execute when
 * a marker opened the file. That guard is now here once, applied to every
 * column, including the citation text a student controls.
 */
export function csvEscape(value: unknown): string {
  let text = String(value ?? '');
  // Leading whitespace is stripped by the spreadsheet before it evaluates the
  // formula, so a tab/space in front of "=" still executes — test the trimmed
  // text, not just the first character.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const COLUMNS = [
  'File', 'Ref', 'Citation', 'Title', 'Authors', 'Year', 'DOI', 'URL',
  'Status', 'Match strength', 'URL status', 'Flags',
  'Dismissed', 'Review decision', 'Reviewed at',
] as const;

/**
 * Build the CSV body (header row plus one row per reference).
 *
 * `Status` is always what the databases said and `Dismissed` is the reviewer's
 * triage recorded separately beside it, so a decision never rewrites the
 * evidence. `dismissedKeys` carries dismissals that were never given a named
 * decision, which is how the desktop app records a bare "Mark reviewed".
 */
export function buildCsv(
  results: AnalysisResult[],
  dismissedKeys?: ReadonlySet<string>,
): string {
  const isBatch = results.length > 1;
  const lines: string[] = [
    isBatch ? `# CiteSight Batch Report — ${results.length} files` : `# CiteSight Report — ${results[0].fileName}`,
    `# Date: ${formatDate()}`,
    `# Disclaimer: ${DISCLAIMER}`,
    '',
  ];
  // Single-file exports omit the File column; it would only repeat the filename
  // already on the first line.
  const columns = isBatch ? COLUMNS : COLUMNS.slice(1);
  lines.push(columns.join(','));

  for (const result of results) {
    const ref = result.references;
    for (let i = 0; i < ref.verifications.length; i++) {
      const v = ref.verifications[i];
      const r = v.reference;
      const review = result.reviews?.[reviewKey(result, `ref:${i}`)];
      const row: unknown[] = [
        isBatch ? result.fileName : undefined,
        i + 1,
        // The citation exactly as the student wrote it. All three exports
        // previously shipped only the parsed title, which is empty whenever
        // extraction failed to find one — so the file a marker saves could
        // contain no citation text at all, and no way to tell which reference
        // a row referred to.
        r.raw || '',
        r.title || '',
        r.authors.join('; '),
        r.year ?? '',
        r.doi || '',
        r.url || '',
        STATUS_LABELS[v.status],
        v.confidenceScore.toFixed(2),
        v.urlCheck?.status ?? 'no_url',
        v.flags.join('; '),
        (review ? review.decision !== 'unresolved' : dismissedKeys?.has(referenceContentKey(r.raw))) ? 'yes' : 'no',
        review ? REVIEW_LABELS[review.decision] : '',
        review?.reviewedAt ?? '',
      ];
      // Drop the File slot for single-file exports without shifting the rest.
      const cells = isBatch ? row : row.slice(1);
      lines.push(cells.map(csvEscape).join(','));
    }
  }
  return lines.join('\r\n') + '\r\n';
}

/** Browser download. Kept here so all three apps produce byte-identical CSVs. */
export function downloadCsvReport(results: AnalysisResult[], dismissedKeys?: ReadonlySet<string>): void {
  const isBatch = results.length > 1;
  const blob = new Blob([buildCsv(results, dismissedKeys)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${isBatch
    ? `citesight-batch-${formatDate()}`
    : `citesight-references-${results[0].fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}