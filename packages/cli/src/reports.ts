import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { AnalysisResult, ProcessingOptions } from '@michaelborck/cite-sight-core';
import { ATTRIBUTION, DISCLAIMER, explainVerification, REVIEW_LABELS, reviewKey } from '@michaelborck/cite-sight-core';
import { isAnalysisResult } from '@michaelborck/cite-sight-core/session';
import { reviewEntries } from '@michaelborck/cite-sight-core/review';

export interface FileOutcome { file: string; result?: AnalysisResult; error?: string }
export type ReportFormat = 'text' | 'json' | 'html';

export function reportEnvelope(outcomes: FileOutcome[], options?: ProcessingOptions) {
  const { semanticScholarApiKey: _key, ...safeOptions } = options ?? {};
  return {
    version: 1, createdAt: new Date().toISOString(), processingOptions: safeOptions,
    files: outcomes.map((outcome) => outcome.error ? { file: outcome.file, error: outcome.error } : { file: outcome.file, ...outcome.result }),
    summary: {
      filesAnalyzed: outcomes.filter((outcome) => outcome.result).length,
      filesErrored: outcomes.filter((outcome) => outcome.error).length,
      unavailable: outcomes.reduce((sum, outcome) => sum + (outcome.result?.references.unverifiedCount ?? 0), 0),
    },
    disclaimer: DISCLAIMER, attribution: ATTRIBUTION,
  };
}

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
function sourceLink(url: string | undefined, label: string): string {
  try { if (url && ['https:', 'http:'].includes(new URL(url).protocol)) return `<a href="${escape(url)}" rel="noreferrer">${label}</a>`; } catch { /* No clickable invalid URLs. */ }
  return '';
}

export function htmlReport(outcomes: FileOutcome[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CiteSight citation report</title><style>
body{font:16px/1.6 system-ui,sans-serif;color:#172b3a;background:#f8fafc;max-width:1000px;margin:auto;padding:24px}article,details{background:white;padding:20px;border:1px solid #cbd5e1;border-radius:8px;margin:16px 0}h1,h2{line-height:1.2}summary{cursor:pointer;font-weight:600}.comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}a{color:#0f766e;margin-right:16px}p,li{overflow-wrap:anywhere}.unverified{color:#475569}.suspicious,.not_found{color:#92400e}.error{color:#991b1b}@media print{body{background:white}details{break-inside:avoid}}
</style></head><body><h1>CiteSight citation report</h1><p>${outcomes.length} document${outcomes.length === 1 ? '' : 's'} · ${escape(new Date().toISOString().slice(0, 10))}</p>
${outcomes.map((outcome) => {
    if (!outcome.result) return `<article><h2>${escape(outcome.file)}</h2><p class="error">Could not check: ${escape(outcome.error)}</p></article>`;
    const result = outcome.result; const refs = result.references;
    return `<article><h2>${escape(result.fileName)}</h2><p>${refs.suspiciousCount + refs.notFoundCount} references need review · ${refs.verifiedCount} verified or likely valid · ${refs.unverifiedCount} couldn’t be checked</p>
${refs.verifications.map((v, i) => {
      const decision = result.reviews?.[reviewKey(result, `ref:${i}`)]?.decision;
      return `<details open><summary class="${escape(v.status)}">${i + 1}. ${escape(v.reference.title || v.reference.raw)} · ${escape(v.status.replaceAll('_', ' '))}</summary>
<div class="comparison"><div><h3>Your citation</h3><p>${escape(v.reference.raw)}</p></div>${v.matchedWork ? `<div><h3>Matched record</h3><p>${escape(v.matchedWork.title)} (${escape(v.matchedWork.year)})</p><p>${escape(v.matchedWork.authors.join('; '))}</p></div>` : ''}</div>
<ul>${explainVerification(v).map((issue) => `<li>${escape(issue.label)}${issue.detail ? `: ${escape(issue.detail)}` : ''}</li>`).join('')}${v.formatIssues.map((issue) => `<li>${escape(issue.field)}: ${escape(issue.message)}</li>`).join('')}</ul>
${decision ? `<p>Review decision: <strong>${escape(REVIEW_LABELS[decision])}</strong></p>` : ''}
${sourceLink(v.reference.doi ? `https://doi.org/${encodeURIComponent(v.reference.doi)}` : undefined, 'Open DOI')}${sourceLink(v.reference.url, 'Open cited URL')}</details>`;
    }).join('')}
<h3>In-text matching</h3>${refs.inTextCheckSkipped ? '<p>Skipped for this run.</p>' : `<ul>${refs.crossReference.unmatchedInText.map((cite) => `<li>No bibliography match: ${escape(cite.raw)}</li>`).join('')}${refs.crossReference.unmatchedBibliography.map((ref) => `<li>Not cited in the text: ${escape(ref.raw)}</li>`).join('')}</ul>`}
${reviewEntries(result).length ? `<h3>Review decisions</h3><ul>${reviewEntries(result).map((review) => `<li>${escape(review.label)}: ${escape(review.source)}</li>`).join('')}</ul>` : ''}</article>`;
  }).join('')}<footer><p>${escape(DISCLAIMER)}</p><p>${escape(ATTRIBUTION)}</p></footer></body></html>`;
}

function textReport(outcomes: FileOutcome[]): string {
  return outcomes.map((outcome) => {
    if (!outcome.result) return `${outcome.file}\nCould not check: ${outcome.error}\n`;
    const refs = outcome.result.references;
    return `${outcome.file}\n${refs.verifiedCount} verified or likely valid; ${refs.suspiciousCount + refs.notFoundCount} need review; ${refs.unverifiedCount} unavailable\n` +
      refs.verifications.map((v) => `[${v.status}] ${v.reference.raw}\n${explainVerification(v).map((issue) => `  ${issue.label}: ${issue.detail ?? ''}`).join('\n')}\n${v.formatIssues.map((issue) => `  ${issue.field}: ${issue.message}`).join('\n')}`).join('\n') + '\n' +
      refs.crossReference.unmatchedInText.map((cite) => `No bibliography match: ${cite.raw}`).join('\n') + '\n' +
      refs.crossReference.unmatchedBibliography.map((ref) => `Not cited in the text: ${ref.raw}`).join('\n') + '\n' +
      reviewEntries(outcome.result).map((review) => `Review decision: ${review.label}: ${review.source}`).join('\n') + '\n';
  }).join('\n') + `\n${DISCLAIMER}\n${ATTRIBUTION}\n`;
}

export function renderReport(outcomes: FileOutcome[], format: ReportFormat, options?: ProcessingOptions): string {
  return format === 'html' ? htmlReport(outcomes) : format === 'json' ? JSON.stringify(reportEnvelope(outcomes, options), null, 2) + '\n' : textReport(outcomes);
}

export function isOutputDirectory(path: string): boolean {
  return /[\\/]$/.test(path) || existsSync(path) && statSync(path).isDirectory() || !extname(path);
}

export function writeReports(outcomes: FileOutcome[], output: string, format: ReportFormat, options: ProcessingOptions): string[] {
  const path = resolve(output); const written: string[] = [];
  const extension = format === 'text' ? 'txt' : format;
  const write = (file: string, text: string) => {
    if (outcomes.some((outcome) => resolve(outcome.file) === file)) throw new Error('The report output would overwrite an input document. Choose another path.');
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text, 'utf8'); written.push(file);
  };
  if (!isOutputDirectory(output)) { write(path, renderReport(outcomes, format, options)); return written; }
  for (const [index, outcome] of outcomes.entries()) {
    const name = `${String(index + 1).padStart(3, '0')}-${basename(outcome.file).replace(/[^a-zA-Z0-9._-]/g, '_')}.${extension}`;
    write(join(path, name), renderReport([outcome], format, options));
  }
  write(join(path, `index.${extension}`), renderReport(outcomes, format, options));
  if (format !== 'json') write(join(path, 'results.json'), renderReport(outcomes, 'json', options));
  return written;
}

export function readReport(path: string): { outcomes: FileOutcome[]; options: Partial<ProcessingOptions> } {
  if (statSync(path).size > 50 * 1024 * 1024) throw new Error('Report is larger than 50 MB.');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const files = Array.isArray(data.files) ? data.files : [data];
  if (!files.length || files.length > 10_000) throw new Error('The report contains no files or too many files.');
  const outcomes = files.map((entry: unknown): FileOutcome => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid report entry.');
    const item = entry as Record<string, unknown>;
    if (typeof item.file !== 'string' && typeof item.fileName !== 'string') throw new Error('The report does not identify its source file.');
    const file = resolve(dirname(resolve(path)), String(item.file ?? item.fileName));
    if (typeof item.error === 'string') return { file, error: item.error };
    const result = item as unknown as AnalysisResult;
    if (!isAnalysisResult(result)) throw new Error('Invalid citation report.');
    return { file, result };
  });
  const source = data.processingOptions ?? {};
  const options: Partial<ProcessingOptions> = {};
  if (['auto', 'apa', 'mla', 'chicago'].includes(source.citationStyle)) options.citationStyle = source.citationStyle;
  for (const name of ['checkUrls', 'checkDoi', 'checkInText'] as const) if (typeof source[name] === 'boolean') options[name] = source[name];
  if (['assignment', 'reference-list'].includes(source.documentType)) options.documentType = source.documentType;
  return { outcomes, options };
}
