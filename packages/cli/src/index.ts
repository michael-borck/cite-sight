#!/usr/bin/env node

import { program, type Command } from 'commander';
import chalk from 'chalk';
import { analyzePipeline, analyzeClaimsFile, readClaimSources, planFiles, unitSourceList, claimOverlapFromResults, durationRange, claimSuggestionLabel, MANIFEST, explainVerification, DISCLAIMER, ATTRIBUTION, HELP_TOPICS, ACKNOWLEDGEMENTS, HELP_FOOTER,
  exportBibtex, installCliRuntime, installCliModel, resolveManagedClaimSetup, CLAIM_MODELS } from '@michaelborck/cite-sight-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { AnalysisResult, ProcessingOptions, ProgressCallback } from '@michaelborck/cite-sight-core';
import { readFileSync } from 'node:fs';
import { SUPPORTED_EXTENSIONS, collectInputs } from './inputs.js';
import { configPath, readConfig, resetConfig, updateConfig } from './config.js';
import { isOutputDirectory, readReport, renderReport, writeReports, type FileOutcome, type ReportFormat } from './reports.js';
import { retryOutcomes } from './retry.js';
import { resolve, sep, dirname, basename, join } from 'node:path';
import {
  type FailOnLevel,
  type Findings,
  FAIL_ON_LEVELS,
  fileFindings,
  meetsThreshold,
  findingsSummary,
  isFailOnLevel,
} from './findings.js';

// Exit codes (documented in --help so CI can branch on them):
//   0  success, no findings (or --fail-on none)
//   1  execution error (unreadable file, extraction failure, bad usage)
//   2  analysis succeeded but findings met the --fail-on threshold
const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_FINDINGS = 2;

// Read the real version from this package's package.json (relative to the
// built dist/index.js → ../package.json), instead of hardcoding it.
const pkgVersion: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'verified':     return chalk.green('✔ verified');
    case 'likely_valid': return chalk.green('~ likely valid');
    case 'suspicious':   return chalk.yellow('⚠ needs review');
    case 'not_found':    return chalk.yellow('? not found');
    case 'unverified':   return chalk.gray('⚠ unverified (lookup failed)');
    case 'format_only':  return chalk.cyan('f format only');
    default:             return chalk.gray(status);
  }
}

function urlStatusBadge(status: string): string {
  switch (status) {
    case 'live':     return chalk.green('live');
    case 'dead':     return chalk.red('dead');
    case 'blocked':  return chalk.yellow('blocked (access restricted)');
    case 'redirect': return chalk.yellow('redirect');
    case 'timeout':  return chalk.yellow('timeout');
    default:         return chalk.gray(status);
  }
}

function printSectionHeader(title: string): void {
  console.log('');
  console.log(chalk.bold.underline(title));
}

/**
 * Pull a short window of words around an in-text citation so a grader can see
 * *where* in the document it sits. `position` is the citation's character offset
 * in the extracted text; the citation itself is highlighted between brackets.
 */
function contextSnippet(text: string, position: number, rawLength: number, words = 6): string {
  const before = text.slice(Math.max(0, position - 120), position);
  const match = text.slice(position, position + rawLength);
  const after = text.slice(position + rawLength, position + rawLength + 120);

  const beforeWords = before.split(/\s+/).filter(Boolean).slice(-words).join(' ');
  const afterWords = after.split(/\s+/).filter(Boolean).slice(0, words).join(' ');

  const lead = beforeWords ? `…${beforeWords} ` : '';
  const trail = afterWords ? ` ${afterWords}…` : '';
  return `${lead}${chalk.bold(match)}${trail}`.replace(/\s+/g, ' ').trim();
}

interface ReportIssue {
  label: string;
  detail: string;
  severity: 'error' | 'warn' | 'info';
  // Indented sub-lines (the "cited X — found Y" detail, context snippets, etc.)
  // shown by default and suppressed under --minimal.
  lines?: string[];
}

function printReport(result: AnalysisResult, minimal: boolean): void {
  const { references, processingTime } = result;

  // Header
  console.log('');
  console.log(chalk.bold.cyan('CiteSight Analysis Report'));
  console.log(chalk.gray(`File: ${result.fileName}`));
  console.log(chalk.gray(`Processed in ${formatDuration(processingTime)}`));
  if (result.offline) console.log('Local-only run. External citation services were disabled.');
  if (result.claims) {
    printSectionHeader('Claim evidence review: model suggestions');
    console.log(`Model: ${result.claims.model}`);
    if (result.claims.provenance) {
      console.log(`Runtime: ${result.claims.provenance.runtimeVersion}. Model SHA-256: ${result.claims.provenance.modelSha256}`);
      console.log(`Runtime SHA-256: ${result.claims.provenance.runtimeSha256}. Prompt: ${result.claims.provenance.promptVersion}. Parameters: ${JSON.stringify(result.claims.provenance.parameters)}`);
    }
    for (const warning of result.claims.warnings) console.log(warning);
    for (const finding of result.claims.findings) {
      console.log(`[${claimSuggestionLabel(finding.status)}] ${finding.claim}\n  ${finding.reason}`);
      if (!minimal) for (const evidence of finding.evidence) console.log(`  ${finding.source?.fileName ?? 'Source'}${evidence.page ? `, PDF page ${evidence.page}` : ''}: "${evidence.quote}"`);
    }
  }

  // Reference verification summary
  printSectionHeader('Reference Verification');
  const total = references.totalReferences;
  console.log(`  Total references:  ${total}`);
  if (total > 0) {
    console.log(`  Verified:          ${chalk.green(String(references.verifiedCount))}`);
    console.log(`  Needs review:      ${references.suspiciousCount > 0 ? chalk.yellow(String(references.suspiciousCount)) : chalk.green('0')}`);
    console.log(`  Not found:         ${references.notFoundCount > 0 ? chalk.yellow(String(references.notFoundCount)) : chalk.green('0')}`);
    if (references.unverifiedCount > 0) {
      console.log(`  Unverified:        ${chalk.gray(String(references.unverifiedCount))} (lookup failed — not a miss)`);
    }
    console.log(`  Broken URLs:       ${references.brokenUrlCount > 0 ? chalk.red(String(references.brokenUrlCount)) : chalk.green('0')}`);
    console.log(`  Citation style:    ${references.detectedStyle}`);

    if (references.crossReference.unmatchedBibliography.length > 0) {
      console.log(
        `  Reference list entries never cited in the text: ` +
        chalk.yellow(String(references.crossReference.unmatchedBibliography.length))
      );
    }
    if (references.crossReference.unmatchedInText.length > 0) {
      console.log(
        `  In-text citations with no reference list entry: ` +
        chalk.yellow(String(references.crossReference.unmatchedInText.length))
      );
    }
    if (references.crossReference.nearMatches?.length) {
      console.log(
        `  Possible spelling mismatches: ${chalk.cyan(String(references.crossReference.nearMatches.length))} ` +
        chalk.gray('(citation ≈ reference list entry within a couple of letters — common for hand-typed references)')
      );
    }
    if (references.sourceListLikely) {
      console.log(
        `  ${chalk.cyan('Note:')} no reference is cited in the body — this looks like a source list, ` +
        `not a manuscript, so the in-text cross-reference check was skipped.`
      );
    }
  } else {
    console.log(`  ${chalk.gray('No references detected.')}`);
  }

  // Issues found. Each issue carries optional `lines` — the indented
  // "cited X — record says Y" detail and in-text context — shown by default and
  // collapsed under --minimal so the section stays a terse checklist.
  const issues: ReportIssue[] = [];

  for (const v of references.verifications) {
    if (v.status === 'suspicious') {
      const title = v.reference.title || v.reference.raw.slice(0, 60);
      const explanations = explainVerification(v).filter((e) => e.flag !== 'broken_url');
      issues.push({
        label: 'Reference needs review',
        detail: `"${title}"`,
        severity: 'warn',
        lines: explanations.map((e) => (e.detail ? `${e.label} — ${e.detail}` : e.label)),
      });
    }
    if (v.urlCheck && (v.urlCheck.status === 'dead' || v.urlCheck.status === 'timeout')) {
      issues.push({
        label: 'Broken URL',
        detail: `${v.urlCheck.url} [${urlStatusBadge(v.urlCheck.status)}]`,
        severity: 'error',
      });
    }
    if (v.formatIssues.length > 0) {
      for (const fi of v.formatIssues) {
        const title = v.reference.title || v.reference.raw.slice(0, 40);
        // Surface the concrete expected/actual values when the validator
        // recorded them, so "wrong format" says exactly what to change.
        const lines: string[] = [];
        if (fi.expected !== undefined || fi.actual !== undefined) {
          const parts: string[] = [];
          if (fi.actual !== undefined) parts.push(`found: ${fi.actual}`);
          if (fi.expected !== undefined) parts.push(`expected: ${fi.expected}`);
          lines.push(parts.join('   '));
        }
        issues.push({
          label: 'Format issue',
          detail: `"${title}" — ${fi.message}`,
          severity: 'warn',
          lines,
        });
      }
    }
  }

  // Near matches: cited with a likely spelling slip. Hand-typed references
  // (no EndNote) make these common — informational, not a finding.
  for (const { cite, reference } of references.crossReference.nearMatches ?? []) {
    issues.push({
      label: 'Possible spelling mismatch',
      detail: `${cite.raw} ↔ "${reference.title || reference.raw.slice(0, 60)}"`,
      severity: 'info',
      lines: [`cited “${cite.raw}” — reference list entry: ${reference.raw}`],
    });
  }

  // Unmatched in-text citations: a citation in the prose with no bibliography
  // entry. Show the surrounding words so the grader can find it in the document.
  for (const cite of references.crossReference.unmatchedInText) {
    issues.push({
      label: 'Unmatched in-text citation',
      detail: `${cite.raw} — no matching reference list entry`,
      severity: 'warn',
      lines: [`context: ${contextSnippet(result.extractedText, cite.position, cite.raw.length)}`],
    });
  }

  // Unmatched bibliography entries: listed in references but never cited.
  for (const ref of references.crossReference.unmatchedBibliography) {
    const title = ref.title || ref.raw.slice(0, 60);
    const year = ref.year ? ` (${ref.year})` : '';
    issues.push({
      label: 'Uncited reference',
      detail: `"${title}"${year} — in the reference list but never cited in the text`,
      severity: 'warn',
    });
  }

  printSectionHeader('Issues Found');
  if (issues.length > 0) {
    for (const issue of issues) {
      const prefix =
        issue.severity === 'error'
          ? chalk.red('  [ERROR]')
          : issue.severity === 'warn'
            ? chalk.yellow('  [WARN] ')
            : chalk.cyan('  [INFO] ');
      console.log(`${prefix} ${chalk.bold(issue.label)}: ${issue.detail}`);
      if (!minimal && issue.lines) {
        for (const line of issue.lines) {
          console.log(`            ${chalk.gray('·')} ${chalk.gray(line)}`);
        }
      }
    }
  } else {
    console.log(`  ${chalk.green('No issues detected.')}`);
  }

  // Per-reference verdicts — so the summary counts above are traceable to
  // specific references. By default each flagged reference also shows a short
  // tag list; --minimal collapses to just the verdict line.
  if (references.verifications.length > 0) {
    printSectionHeader('References');
    for (const v of references.verifications) {
      const title = v.reference.title
        ? v.reference.title.slice(0, 60) + (v.reference.title.length > 60 ? '…' : '')
        : v.reference.raw.slice(0, 60) + '…';
      const year = v.reference.year ? ` (${v.reference.year})` : '';
      const tags = minimal ? [] : explainVerification(v).map((e) => e.label);
      const tagStr = tags.length > 0 ? `  ${chalk.gray(`[${tags.join(', ')}]`)}` : '';
      console.log(`  ${statusBadge(v.status)} — ${title}${year}${tagStr}`);
    }
  }

  // Accuracy disclaimer — always shown, even under --minimal, so a report is
  // never mistaken for a guarantee.
  printSectionHeader('Please note');
  for (const line of wrapText(DISCLAIMER + ' ' + ATTRIBUTION, 78)) {
    console.log(chalk.gray(`  ${line}`));
  }

  console.log('');
}

/** Greedy word-wrap to a column width, for the terminal disclaimer footer. */
function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// -------------------------------------------------------
// Progress output
// -------------------------------------------------------

function makeProgressCallback(verbose: boolean): ProgressCallback {
  return (update) => {
    if (verbose) {
      const pct = String(update.progress).padStart(3, ' ');
      process.stderr.write(chalk.gray(`[${pct}%] ${update.message}`) + '\n');
    } else if (process.stderr.isTTY && update.stage !== 'complete') {
      process.stderr.write(chalk.gray(`\r  ${update.message.padEnd(55)}`));
    } else if (process.stderr.isTTY) {
      process.stderr.write('\r' + ' '.repeat(60) + '\r');
    }
  };
}

// -------------------------------------------------------
// Run analysis
// -------------------------------------------------------

interface AnalysisOpts {
  offline?: boolean;
  library?: string;
  bibtex?: string;
  screenshots?: boolean;
  style?: string;
  urls?: boolean;
  doi?: boolean;
  inText?: boolean;
  sourceList?: boolean;
  email?: string;
  s2Key?: string;
  openalexKey?: string;
  json: boolean;
  verbose: boolean;
  minimal: boolean;
  failOn: string;
  format?: ReportFormat;
  output?: string;
  only?: 'all' | 'failed' | 'unavailable';
}

function explicitOptions<T extends object>(opts: T, command: Command): T {
  // The default command and subcommands share flags. Commander may consume a
  // flag at the parent, so child defaults must not hide explicitly supplied ones.
  const chain: Command[] = [];
  for (let current: Command | null = command; current; current = current.parent) chain.unshift(current);
  const explicit: Record<string, unknown> = {};
  for (const current of chain) for (const [key, value] of Object.entries(current.opts())) {
    if (current.getOptionValueSource(key) === 'cli') explicit[key] = value;
  }
  return { ...opts, ...explicit, urls: explicit.urls as boolean | undefined,
    doi: explicit.doi as boolean | undefined, inText: explicit.inText as boolean | undefined };
}

function toProcessingOptions(opts: AnalysisOpts, defaults: Partial<ProcessingOptions> = {}): ProcessingOptions {
  const saved = readConfig();
  const style = opts.style ?? defaults.citationStyle ?? saved.style ?? 'auto';
  if (!['auto', 'apa', 'mla', 'chicago'].includes(style)) throw new Error('Citation style must be auto, apa, mla or chicago.');
  return {
    offline: opts.offline ?? defaults.offline ?? false,
    citationStyle: style as ProcessingOptions['citationStyle'],
    documentType: opts.sourceList ? 'reference-list' : defaults.documentType,
    checkUrls: opts.urls ?? defaults.checkUrls ?? true,
    checkDoi: opts.doi ?? defaults.checkDoi ?? true,
    // --source-list forces the in-text cross-reference off: a bare source list
    // / bibliography has no manuscript body to cross-reference against.
    checkInText: (opts.inText ?? defaults.checkInText ?? true) && !opts.sourceList,
    screenshotUrls: false,
    contactEmail: opts.email ?? process.env.CITESIGHT_EMAIL ?? saved.email,
    semanticScholarApiKey: opts.s2Key ?? process.env.SEMANTIC_SCHOLAR_API_KEY,
    openAlexApiKey: opts.openalexKey ?? process.env.OPENALEX_API_KEY,
  };
}

/** Optional Playwright screenshots for live URLs (CLI `--screenshots`).
 *  Playwright is deliberately not a dependency — loaded dynamically and
 *  skipped with guidance when absent. */
async function captureScreenshots(file: string, result: AnalysisResult, outputRoot: string): Promise<number> {
  let chromium: NonNullable<Awaited<ReturnType<typeof import('playwright')>>['chromium']> | undefined;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error(chalk.gray('  --screenshots: Playwright is not installed. Install with: npm install -g playwright && npx playwright install chromium'));
    return 0;
  }
  if (!chromium) return 0;
  const dir = resolve(outputRoot, 'screenshots');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  let saved = 0;
  try {
    const page = await browser.newPage();
    for (const [index, v] of result.references.verifications.entries()) {
      if (v.urlCheck?.status !== 'live' || !v.urlCheck.url) continue;
      try {
        await page.goto(v.urlCheck.url, { timeout: 20_000 });
        const path = join(dir, `${basename(file).replace(/\.[^.]+$/, '')}-${index + 1}.png`);
        await page.screenshot({ path, fullPage: false });
        v.urlCheck.screenshotPath = path;
        saved++;
      } catch { /* skip this URL */ }
    }
  } finally {
    await browser.close();
  }
  return saved;
}

/** Analyse one file. Never throws — failures come back on `error`. */
async function analyzeOne(
  filePath: string,
  options: ProcessingOptions,
  onProgress: ProgressCallback | undefined,
): Promise<FileOutcome> {
  try {
    const result = await analyzePipeline(filePath, options, onProgress);
    return { file: filePath, result };
  } catch (err: unknown) {
    return { file: filePath, error: err instanceof Error ? err.message : String(err) };
  }
}

function parseFailOn(value: string): FailOnLevel {
  if (!isFailOnLevel(value)) {
    console.error(
      chalk.red(`Error: --fail-on must be one of: ${FAIL_ON_LEVELS.join(', ')} (got "${value}")`),
    );
    process.exit(EXIT_ERROR);
  }
  return value;
}

/** Print the roll-up shown after a multi-file run. */
function printAggregate(outcomes: FileOutcome[], level: FailOnLevel): void {
  const analysed = outcomes.filter((o) => o.result);
  const errored = outcomes.filter((o) => o.error);

  let totalRefs = 0, verified = 0, review = 0, notFound = 0, broken = 0;
  const flagged: { file: string; findings: Findings }[] = [];

  for (const o of analysed) {
    const r = o.result!.references;
    totalRefs += r.totalReferences;
    verified += r.verifiedCount;
    review += r.suspiciousCount;
    notFound += r.notFoundCount;
    broken += r.brokenUrlCount;
    const f = fileFindings(o.result!);
    if (f.any > 0) flagged.push({ file: o.file, findings: f });
  }

  printSectionHeader('Batch Summary');
  console.log(`  Files analyzed:     ${analysed.length}${errored.length ? chalk.red(`  (${errored.length} errored)`) : ''}`);
  console.log(`  Total references:   ${totalRefs}`);
  console.log(`  Verified:           ${chalk.green(String(verified))}`);
  console.log(`  Needs review:       ${review > 0 ? chalk.yellow(String(review)) : chalk.green('0')}`);
  console.log(`  Not found:          ${notFound > 0 ? chalk.yellow(String(notFound)) : chalk.green('0')}`);
  console.log(`  Broken URLs:        ${broken > 0 ? chalk.red(String(broken)) : chalk.green('0')}`);
  console.log(`  Files with issues:  ${flagged.length > 0 ? chalk.yellow(String(flagged.length)) : chalk.green('0')}`);

  for (const { file, findings } of flagged) {
    console.log(`    ${chalk.yellow('•')} ${file} ${chalk.gray(`— ${findingsSummary(findings)}`)}`);
  }
  for (const o of errored) {
    console.log(`    ${chalk.red('✗')} ${o.file} ${chalk.gray(`— ${o.error}`)}`);
  }
  if (errored.length || analysed.some((outcome) => outcome.result!.references.unverifiedCount > 0)) {
    console.log('  Retry saved results with: cite-sight retry reports/results.json --only failed|unavailable');
    console.log('  Use --format json --output results.json to save a retryable report.');
  }

  if (level !== 'none') {
    const tripped = analysed.some((o) => meetsThreshold(fileFindings(o.result!), level));
    console.log('');
    if (errored.length > 0) {
      console.log(chalk.red(`  Exit ${EXIT_ERROR}: ${errored.length} file(s) failed to analyze.`));
    } else if (tripped) {
      console.log(chalk.yellow(`  Exit ${EXIT_FINDINGS}: findings met --fail-on ${level}.`));
    } else {
      console.log(chalk.green(`  Exit ${EXIT_OK}: no findings at --fail-on ${level}.`));
    }
  }
}

/**
 * Drive analysis over one or more path arguments (files, directories, globs),
 * print reports, and exit with a code reflecting findings and errors.
 */
async function runAnalysis(paths: string[], opts: AnalysisOpts): Promise<void> {
  parseFailOn(opts.failOn);
  const output = opts.output ? resolve(opts.output) : undefined;
  const files = collectInputs(paths).filter((file) => !output || file !== output && !(isOutputDirectory(opts.output!) && file.startsWith(output + sep)));

  if (files.length === 0) {
    console.error(chalk.red(`Error: no supported documents found in: ${paths.join(', ')}`));
    console.error(chalk.gray(`Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`));
    process.exit(EXIT_ERROR);
  }

  const options = toProcessingOptions(opts);
  const outcomes: FileOutcome[] = [];
  const human = outputFormat(opts) === 'text' && !opts.output;

  for (const file of files) {
    if (human) {
      console.log(chalk.cyan(`\nAnalyzing: ${file}`));
    }
    // Live progress only in human mode; JSON stays clean for piping.
    const onProgress = human ? makeProgressCallback(opts.verbose) : undefined;
    const outcome = await analyzeOne(file, options, onProgress);
    outcomes.push(outcome);

    if (opts.screenshots && outcome.result) {
      const saved = await captureScreenshots(outcome.file, outcome.result, output ?? process.cwd());
      if (saved > 0) console.error(chalk.gray(`  Saved ${saved} URL screenshot(s) to ${resolve(output ?? process.cwd(), 'screenshots')}`));
    }

    if (human) {
      if (outcome.error) {
        console.error(chalk.red(`\nError: ${outcome.error}`));
      } else {
        printReport(outcome.result!, opts.minimal);
      }
    }
  }

  finishAnalysis(outcomes, opts, options);
}

function outputFormat(opts: AnalysisOpts): ReportFormat {
  if (opts.json && opts.format && opts.format !== 'json') throw new Error('--json cannot be combined with a different --format.');
  return opts.format ?? (opts.json || opts.output?.endsWith('.json') ? 'json' : opts.output?.endsWith('.html') ? 'html' : 'text');
}

function finishAnalysis(outcomes: FileOutcome[], opts: AnalysisOpts, options: ProcessingOptions): void {
  const level = parseFailOn(opts.failOn);
  const batch = outcomes.length > 1;
  const format = outputFormat(opts);

  // --- JSON output ---
  if (opts.bibtex) {
    const verifications = outcomes.flatMap((o) => o.result?.references.verifications ?? []);
    const bib = exportBibtex(verifications);
    mkdirSync(resolve(opts.bibtex, '..'), { recursive: true });
    writeFileSync(resolve(opts.bibtex), bib, 'utf8');
    process.stderr.write(`BibTeX exported to ${resolve(opts.bibtex)}\n`);
  }

  if (opts.output) {
    const written = writeReports(outcomes, opts.output, format, options);
    process.stderr.write(`Saved ${written.length} report file${written.length === 1 ? '' : 's'} to ${resolve(opts.output)}\n`);
    const failures = outcomes.filter((outcome) => outcome.error);
    for (const failure of failures) process.stderr.write(`Failed: ${failure.file}: ${failure.error}\n`);
    if (isOutputDirectory(opts.output)) process.stderr.write(`Retry later: cite-sight retry "${resolve(opts.output, format === 'json' ? 'index.json' : 'results.json')}"\n`);
  } else if (format === 'html') {
    process.stdout.write(renderReport(outcomes, format, options));
  } else if (format === 'json') {
    if (batch) {
      // Batch envelope: per-file results plus a roll-up. Distinct from the
      // single-file shape below, which is preserved for existing consumers.
      const analysed = outcomes.filter((o) => o.result);
      const summary = {
        filesAnalyzed: analysed.length,
        filesErrored: outcomes.length - analysed.length,
        totalReferences: analysed.reduce((n, o) => n + o.result!.references.totalReferences, 0),
        verified: analysed.reduce((n, o) => n + o.result!.references.verifiedCount, 0),
        needsReview: analysed.reduce((n, o) => n + o.result!.references.suspiciousCount, 0),
        notFound: analysed.reduce((n, o) => n + o.result!.references.notFoundCount, 0),
        brokenUrls: analysed.reduce((n, o) => n + o.result!.references.brokenUrlCount, 0),
        filesWithIssues: analysed.filter((o) => fileFindings(o.result!).any > 0).length,
      };
      process.stdout.write(
        JSON.stringify(
          {
            files: outcomes.map((o) => (o.error ? { file: o.file, error: o.error } : { file: o.file, ...o.result })),
            summary,
            disclaimer: DISCLAIMER,
            attribution: ATTRIBUTION,
          },
          null,
          2,
        ) + '\n',
      );
    } else {
      const only = outcomes[0];
      if (only.error) {
        process.stdout.write(JSON.stringify({ error: only.error }) + '\n');
      } else {
        // Single-file shape unchanged: the bare result plus the disclaimer.
        process.stdout.write(JSON.stringify({ ...only.result, disclaimer: DISCLAIMER }, null, 2) + '\n');
      }
    }
  } else if (batch) {
    printAggregate(outcomes, level);
  }

  // --- Exit code ---
  const hadError = outcomes.some((o) => o.error || o.result?.claims?.findings.some((finding) => finding.status === 'unavailable'));
  const tripped = outcomes.some((o) => o.result && meetsThreshold(fileFindings(o.result), level));
  process.exit(hadError ? EXIT_ERROR : tripped ? EXIT_FINDINGS : EXIT_OK);
}

async function runRetry(path: string, opts: AnalysisOpts): Promise<void> {
  parseFailOn(opts.failOn);
  outputFormat(opts);
  const saved = readReport(path);
  const options = toProcessingOptions(opts, saved.options);
  const outcomes = await retryOutcomes(saved.outcomes, options, opts.only ?? 'all');
  if (outputFormat(opts) === 'text' && !opts.output) {
    for (const outcome of outcomes) {
      if (outcome.result) printReport(outcome.result, opts.minimal);
      else console.error(`Failed: ${outcome.file}: ${outcome.error}`);
    }
  }
  finishAnalysis(outcomes, opts, options);
}

// -------------------------------------------------------
// CLI definition
// -------------------------------------------------------

program
  .name('cite-sight')
  .description('Academic integrity and citation checker')
  .version(pkgVersion);

/**
 * Attach the analysis options shared by the default command and `check`, so the
 * two never drift apart. Path arguments are variadic: each may be a file, a
 * directory (recursed for supported documents), or a glob.
 */
function addAnalysisOptions(cmd: Command): Command {
  return cmd
    .option('--offline', 'Keep reference checks local; disable all external API and URL requests')
    .option('--style <style>', 'Citation style (auto|apa|mla|chicago); defaults to saved style or auto')
    .option('--no-urls', 'Skip URL checking')
    .option('--no-doi', 'Skip DOI verification')
    .option('--no-in-text', 'Skip in-text citation cross-referencing')
    .option('--source-list', 'Treat the input as a bare source list / bibliography (skips the in-text cross-reference)', false)
    .option('--email <email>', 'Contact email for API polite pool')
    .option('--s2-key <key>', 'Semantic Scholar API key (or set SEMANTIC_SCHOLAR_API_KEY) to avoid rate-limiting')
    .option('--openalex-key <key>', 'OpenAlex API key (or set OPENALEX_API_KEY) for the larger free daily allowance')
    .option('--fail-on <level>', `Exit ${EXIT_FINDINGS} when findings are present — for CI (none|suspicious|broken-url|any)`, 'none')
    .option('--json', 'Output result as JSON', false)
    .option('--format <format>', 'Report format: text, json or html', (value: string) => {
      if (!['text', 'json', 'html'].includes(value)) throw new Error('Format must be text, json or html.');
      return value;
    })
    .option('--output <path>', 'Save to a report file or directory; directories include a retryable JSON report')
    .option('--bibtex <file>', 'Also export verified references as a BibTeX (.bib) file')
    .option('--screenshots', 'Capture page screenshots for live URLs. Requires the optional Playwright package: npm install -g playwright && npx playwright install chromium', false)
    .option('--verbose', 'Log progress line by line', false)
    .option('--minimal', 'Condensed report: summary and verdicts only, no per-issue detail', false);
}

// Top-level default command: cite-sight <paths...>
addAnalysisOptions(
  program
    .argument('[paths...]', 'Documents, folders, or globs to analyze (PDF, DOCX, TXT, MD)')
    .addHelpText(
      'after',
      '\nExit codes:\n' +
        `  ${EXIT_OK}  success (or no findings under --fail-on)\n` +
        `  ${EXIT_ERROR}  execution error (unreadable file, bad usage)\n` +
        `  ${EXIT_FINDINGS}  findings met the --fail-on threshold\n` +
        '\nExamples:\n' +
        '  cite-sight paper.pdf\n' +
        '  cite-sight ./submissions --fail-on suspicious\n' +
        "  cite-sight 'essays/**/*.docx' --minimal --json",
    ),
).action(async (paths: string[], opts: AnalysisOpts, command: Command) => {
  if (!paths || paths.length === 0) {
    program.help();
    return;
  }
  await runAnalysis(paths, explicitOptions(opts, command));
});

// Explicit sub-command: cite-sight check <paths...>
addAnalysisOptions(
  program
    .command('check [paths...]')
    .description('Check documents, folders or globs for citation integrity issues')
    .addHelpText('after', '\nExamples:\n  cite-sight check paper.pdf\n  cite-sight check papers/ --format html --output reports/\n  cite-sight check sources.md --source-list\n  cite-sight check papers/ --fail-on suspicious --json\n  cite-sight config set email lecturer@example.edu\n\nExit codes: 0 success, 1 execution error, 2 findings met --fail-on.\n'),
).action(async (paths: string[], opts: AnalysisOpts, command: Command) => {
  if (!paths || paths.length === 0) {
    console.error(chalk.red('Error: provide at least one file, folder, or glob to check.'));
    process.exit(EXIT_ERROR);
  }
  await runAnalysis(paths, explicitOptions(opts, command));
});

addAnalysisOptions(program.command('retry <report>').description('Retry failed files or unavailable lookups from a saved JSON report'))
  .option('--only <kind>', 'Retry all, failed files, or unavailable lookups', (value: string) => {
    if (!['all', 'failed', 'unavailable'].includes(value)) throw new Error('--only must be all, failed or unavailable.');
    return value;
  }, 'all')
  .addHelpText('after', '\nExamples:\n  cite-sight retry reports/results.json --only failed --output retry.json\n  cite-sight retry results.json --only unavailable --format html --output retried.html\n')
  .action(async (path: string, opts: AnalysisOpts, command: Command) => runRetry(path, explicitOptions(opts, command)));

addAnalysisOptions(program.command('claims <document>').description('Check cited statements against mapped local source files using a local GGUF model'))
  .requiredOption('--sources <manifest>', 'JSON source mappings with version 1 and sources [{reference: 1, path: "source.pdf"}]')
  .option('--model <path>', 'Local GGUF model; defaults to the managed install from `cite-sight model install`')
  .option('--runner <path>', 'Expert override: path to your own llama-cli (must support --offline/--single-turn/--json-schema/--device none)')
  .option('--max-claims <count>', 'Maximum cited statements to check, 1-200', '50')
  .option('--library <dir>', 'Unit source folder: entries without a mapped source are content-matched against these files')
  .option('--model-timeout <seconds>', 'Timeout per local inference, at most 600 seconds', '180')
  .option('--checkpoint <path>', 'Per-claim checkpoint; default: <document>.claims-checkpoint.json. Reuse it to resume')
  .option('--restart-claims', 'Explicitly replace an old checkpoint and run every claim again')
  .action(async (document: string, raw: AnalysisOpts & { sources: string; model: string; runner: string; maxClaims: string; modelTimeout: string; checkpoint?: string; restartClaims?: boolean }, command: Command) => {
    const opts = explicitOptions(raw, command);
    outputFormat(opts); parseFailOn(opts.failOn);
    const options = { ...toProcessingOptions(opts), offline: true, screenshotUrls: false, checkUrls: false, checkDoi: false };
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error('Claim checking cancelled.'));
    const checkpointPath = resolve(opts.checkpoint ?? `${resolve(document)}.claims-checkpoint.json`);
    if (opts.output && resolve(opts.output) === checkpointPath || resolve(raw.sources) === checkpointPath) throw new Error('Checkpoint path must differ from report output and source manifest paths.');
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    process.stderr.write(`Per-claim resume checkpoint: ${checkpointPath}\n`);
    let runnerPath = raw.runner;
    let modelPath = raw.model;
    if (!runnerPath || !modelPath) {
      const managed = await resolveManagedClaimSetup(configPath());
      if (!managed) {
        console.error(chalk.red('No managed claim runtime/model installed, and no --runner/--model given.'));
        console.error('Install them once with:  cite-sight runtime install && cite-sight model install qwen3.5-4b-q4km');
        process.exit(EXIT_ERROR);
      }
      runnerPath ??= managed.runnerPath;
      modelPath ??= managed.modelPath;
      process.stderr.write(`Using managed runtime ${managed.runnerPath} and model ${managed.modelId}\n`);
    }
    let result: AnalysisResult;
    try {
      result = await analyzeClaimsFile(resolve(document), {
        sources: await readClaimSources(raw.sources), modelPath, runnerPath,
        maxClaims: Number(raw.maxClaims), timeoutMs: Number(raw.modelTimeout) * 1000,
        libraryPath: raw.library ? resolve(raw.library) : undefined,
      }, options, (update) => {
        if (opts.verbose || update.stage === 'checking_claims') process.stderr.write(update.message + (update.eta ? ` Remaining: ${durationRange(update.eta)} (${update.eta.basis}).` : '') + '\n');
      }, controller.signal, { path: checkpointPath, restart: opts.restartClaims });
    } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
    if (outputFormat(opts) === 'text' && !opts.output) printReport(result, opts.minimal);
    finishAnalysis([{ file: resolve(document), result }], opts, options);
  });

program.command('plan <paths...>').description('Estimate batch size and CPU/API runtime with a local-only preflight')
  .option('--claims', 'Estimate CPU claim review, capped at 50 statements per document')
  .option('--offline', 'Estimate reference parsing without online verification')
  .option('--seconds-per-claim <seconds>', 'Use a measured CPU speed sample')
  .option('--json', 'Print the full plan as JSON')
  .action(async (paths: string[], opts: { claims?: boolean; offline?: boolean; secondsPerClaim?: string; json?: boolean }, command: Command) => {
    opts = explicitOptions(opts, command);
    const plan = await planFiles(collectInputs(paths), { offline: opts.offline === true, claims: opts.claims,
      observedMs: opts.secondsPerClaim ? Number(opts.secondsPerClaim) * 1000 : undefined });
    if (opts.json) console.log(JSON.stringify(plan, null, 2));
    else {
      console.log(`${plan.files.length} documents; ${plan.references} references (${plan.uniqueReferences} distinct lookup queries); ${plan.claims} cited statements.`);
      console.log(`Estimated runtime: ${durationRange(plan.estimate)}. Basis: ${plan.estimate.basis}.`);
      console.log('Planning range, not a deadline. API retries and rate limits can extend it. Claim estimates assume mapped sources for the detected statements.');
      for (const file of plan.files) if (file.error) console.error(`${file.path}: ${file.error}`);
    }
  });

const config = program.command('config').description('Save contact email and default citation style on this device');
config.command('set <key> <value>').description('Set email or style').action((key: string, value: string) => { updateConfig(key, value); console.log(`Saved ${key}.`); });
config.command('unset <key>').description('Remove a saved setting').action((key: string) => { updateConfig(key); console.log(`Removed ${key}.`); });
config.command('list').description('Show saved settings').action(() => console.log(JSON.stringify(readConfig(), null, 2)));
config.command('path').description('Show the settings file location').action(() => console.log(configPath()));
config.command('reset').description('Remove saved settings').action(() => { resetConfig(); console.log('Settings reset.'); });

// Family contract: cite-sight manifest
const claimSetup = program.command('setup-claims').description('One-time setup of the local claim-review engine (managed runtime + model; offline, CPU-only)');

claimSetup.command('runtime').description('Download the pinned llama.cpp runtime, checksum-verified, into the CiteSight config folder')
  .action(async () => {
    const installed = await installCliRuntime(resolve(dirname(configPath())), (message) => process.stderr.write(message + '\n'));
    console.log(`Runtime ${installed.version} installed at ${installed.runtimePath}`);
  });

claimSetup.command('model <catalogId>').description('Download an approved experimental GGUF model (e.g. qwen3.5-4b-q4km)')
  .option('--list', 'List catalog models with their synthetic smoke results')
  .action(async (catalogId: string | undefined, opts: { list?: boolean }) => {
    if (opts.list) {
      for (const model of CLAIM_MODELS) {
        console.log(`${model.id.padEnd(22)} ${model.name} · ${(model.bytes / 1e9).toFixed(2)} GB · experimental`);
        if (model.smokeResult) console.log(`  smoke: ${model.smokeResult.correct}/${model.smokeResult.total} label agreement (synthetic, not validation)`);
      }
      return;
    }
    const model = CLAIM_MODELS.find((entry) => entry.id === catalogId);
    if (!model) {
      console.error(chalk.red(`Unknown model "${catalogId}". Available: ${CLAIM_MODELS.map((m) => m.id).join(', ')}`));
      process.exit(EXIT_ERROR);
    }
    console.log(`${model.name} — ${model.license}. Download ${(model.bytes / 1e9).toFixed(2)} GB; verified against a pinned SHA-256.`);
    console.log('Experimental: synthetic smoke results do not justify grading use — pilot with human review.');
    const installed = await installCliModel(resolve(dirname(configPath())), model, (message) => process.stderr.write(message + '\n'));
    console.log(`Installed at ${installed.modelPath}`);
  });

program.command('about [topic]').description('What CiteSight does, statuses, rate limits, evidence sources, privacy — plus acknowledgements')
  .option('--list', 'List available topic ids')
  .action(async (topic: string | undefined, opts: { list?: boolean }) => {
    if (opts.list) { for (const t of HELP_TOPICS) console.log(`${t.id.padEnd(12)} ${t.title}`); return; }
    const selected = topic ? HELP_TOPICS.filter((t) => t.id === topic) : HELP_TOPICS;
    if (topic && !selected.length) {
      console.error(chalk.red(`Unknown topic "${topic}". Available: ${HELP_TOPICS.map((t) => t.id).join(', ')}`));
      process.exit(EXIT_ERROR);
    }
    for (const t of selected) {
      console.log(chalk.bold.underline(t.title));
      for (const line of wrapText(t.body, 78)) console.log(`  ${line}`);
      console.log('');
    }
    console.log(chalk.bold.underline('Acknowledgements'));
    for (const a of ACKNOWLEDGEMENTS) console.log(`  ${a.name} — ${a.what}`);
    console.log('');
    for (const line of wrapText(HELP_FOOTER, 78)) console.log(chalk.gray(line));
  });

program
  .command('manifest')
  .description('Print the capability manifest as JSON (lens analyser family)')
  .action(() => {
    console.log(JSON.stringify(MANIFEST, null, 2));
  });

const library = program.command('library').description('Unit source tools — collect the unit\'s readings once, reuse them everywhere');

library.command('plan <paths...>').description('Scan submissions and list common vs unique references — the shopping list of sources to collect for the unit')
  .option('--output <file>', 'Write the shopping list as JSON (e.g. unit-sources.json)')
  .option('--offline', 'Skip online verification while scanning', true)
  .action(async (paths: string[], opts: { output?: string; offline?: boolean }) => {
    const options = toProcessingOptions({ offline: opts.offline !== false } as AnalysisOpts);
    const outcomes: { file: string; references: Parameters<typeof unitSourceList>[0][number]['references'] }[] = [];
    for (const file of collectInputs(paths)) {
      try {
        const result = await analyzePipeline(file, { ...options, offline: true, checkUrls: false, checkDoi: false, screenshotUrls: false });
        outcomes.push({ file, references: result.references.references });
      } catch (err) { console.error(chalk.red(`${file}: ${err instanceof Error ? err.message : String(err)}`)); }
    }
    const entries = unitSourceList(outcomes);
    const outputFile = opts.output ?? program.opts().output as string | undefined;
    if (outputFile) {
      mkdirSync(resolve(outputFile, '..'), { recursive: true });
      writeFileSync(resolve(outputFile), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), submissions: outcomes.length, entries }, null, 2));
      console.log(`Shopping list written to ${resolve(outputFile)}`);
    }
    console.log(`${outcomes.length} submissions · ${entries.length} distinct works · ${entries.filter((e) => e.count > 1).length} cited by more than one submission.`);
    console.log('Common works (collect these first):');
    for (const entry of entries.filter((e) => e.count > 1)) console.log(`  ${chalk.yellow(String(entry.count) + '×')} ${entry.title}${entry.year ? ` (${entry.year})` : ''}`);
    const uniques = entries.filter((e) => e.count === 1);
    console.log(`Unique to one submission: ${uniques.length}${uniques.length ? chalk.gray(' — see the JSON output for the full list') : ''}`);
  });

program.command('claim-overlap <report>').description('Flag similar claims on shared references across submissions (a signal, not proof)')
  .option('--threshold <similarity>', '0-1 word-overlap threshold for "similar" (default 0.6)', '0.6')
  .action(async (report: string, opts: { threshold?: string }) => {
    const saved = readReport(report);
    const withClaims = saved.outcomes.filter((o) => o.result?.claims);
    if (withClaims.length < 2) { console.log('Need at least two submissions with claim results in this report (run `cite-sight claims` with --output first).'); process.exit(EXIT_OK); }
    const pairs = claimOverlapFromResults(withClaims.filter((o) => o.result).map((o) => ({ file: o.file, result: o.result! })), Number(opts.threshold));
    if (!pairs.length) { console.log(`No similar claim pairs found across ${withClaims.length} submissions (threshold ${opts.threshold}).`); return; }
    console.log(`${pairs.length} similar claim pair(s) across shared references — a signal to assess, not proof of collusion:`);
    for (const pair of pairs) {
      console.log(`\n  ${chalk.yellow(pair.fileA.split(/[\\/]/).pop())} ↔ ${pair.fileB.split(/[\\/]/).pop()} (similarity ${pair.similarity.toFixed(2)})`);
      console.log(`  A: ${pair.claimA}`);
      console.log(`  B: ${pair.claimB}`);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${message}`));
  process.exit(1);
});
