#!/usr/bin/env node

import { program, type Command } from 'commander';
import chalk from 'chalk';
import { analyzePipeline, MANIFEST, explainVerification, DISCLAIMER, ATTRIBUTION } from '@michaelborck/cite-sight-core';
import type { AnalysisResult, ProcessingOptions, ProgressCallback } from '@michaelborck/cite-sight-core';
import { readFileSync } from 'node:fs';
import { SUPPORTED_EXTENSIONS, collectInputs } from './inputs.js';
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
        `  Unmatched in bibliography (no in-text citation): ` +
        chalk.yellow(String(references.crossReference.unmatchedBibliography.length))
      );
    }
    if (references.crossReference.unmatchedInText.length > 0) {
      console.log(
        `  Unmatched in-text citations (no bibliography entry): ` +
        chalk.yellow(String(references.crossReference.unmatchedInText.length))
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

  // Unmatched in-text citations: a citation in the prose with no bibliography
  // entry. Show the surrounding words so the grader can find it in the document.
  for (const cite of references.crossReference.unmatchedInText) {
    issues.push({
      label: 'Unmatched in-text citation',
      detail: `${cite.raw} — no matching bibliography entry`,
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
      detail: `"${title}"${year} — in the bibliography but never cited in the text`,
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
      console.log(chalk.gray(`[${pct}%] ${update.message}`));
    } else if (update.stage !== 'complete') {
      process.stdout.write(chalk.gray(`\r  ${update.message.padEnd(55)}`));
    } else {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }
  };
}

// -------------------------------------------------------
// Run analysis
// -------------------------------------------------------

interface AnalysisOpts {
  style: string;
  urls: boolean;
  doi: boolean;
  inText: boolean;
  sourceList?: boolean;
  email?: string;
  s2Key?: string;
  json: boolean;
  verbose: boolean;
  minimal: boolean;
  failOn: string;
}

/** A single file's outcome, as carried through a batch run. */
interface FileOutcome {
  file: string;
  result?: AnalysisResult;
  error?: string;
}

function toProcessingOptions(opts: AnalysisOpts): ProcessingOptions {
  return {
    citationStyle: opts.style as ProcessingOptions['citationStyle'],
    checkUrls: opts.urls,
    checkDoi: opts.doi,
    // --source-list forces the in-text cross-reference off: a bare source list
    // / bibliography has no manuscript body to cross-reference against.
    checkInText: opts.inText && !opts.sourceList,
    screenshotUrls: false,
    contactEmail: opts.email,
    semanticScholarApiKey: opts.s2Key ?? process.env.SEMANTIC_SCHOLAR_API_KEY,
  };
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
  const level = parseFailOn(opts.failOn);
  const files = collectInputs(paths);

  if (files.length === 0) {
    console.error(chalk.red(`Error: no supported documents found in: ${paths.join(', ')}`));
    console.error(chalk.gray(`Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`));
    process.exit(EXIT_ERROR);
  }

  const options = toProcessingOptions(opts);
  const batch = files.length > 1;
  const outcomes: FileOutcome[] = [];

  for (const file of files) {
    if (!opts.json) {
      console.log(chalk.cyan(`\nAnalyzing: ${file}`));
    }
    // Live progress only in human mode; JSON stays clean for piping.
    const onProgress = opts.json ? undefined : makeProgressCallback(opts.verbose);
    const outcome = await analyzeOne(file, options, onProgress);
    outcomes.push(outcome);

    if (!opts.json) {
      if (outcome.error) {
        console.error(chalk.red(`\nError: ${outcome.error}`));
      } else {
        printReport(outcome.result!, opts.minimal);
      }
    }
  }

  // --- JSON output ---
  if (opts.json) {
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
  const hadError = outcomes.some((o) => o.error);
  const tripped = outcomes.some((o) => o.result && meetsThreshold(fileFindings(o.result), level));
  process.exit(hadError ? EXIT_ERROR : tripped ? EXIT_FINDINGS : EXIT_OK);
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
    .option('--style <style>', 'Citation style (auto|apa|mla|chicago)', 'auto')
    .option('--no-urls', 'Skip URL checking')
    .option('--no-doi', 'Skip DOI verification')
    .option('--no-in-text', 'Skip in-text citation cross-referencing')
    .option('--source-list', 'Treat the input as a bare source list / bibliography (skips the in-text cross-reference)', false)
    .option('--email <email>', 'Contact email for API polite pool')
    .option('--s2-key <key>', 'Semantic Scholar API key (or set SEMANTIC_SCHOLAR_API_KEY) to avoid rate-limiting')
    .option('--fail-on <level>', `Exit ${EXIT_FINDINGS} when findings are present — for CI (none|suspicious|broken-url|any)`, 'none')
    .option('--json', 'Output result as JSON', false)
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
).action(async (paths: string[], opts: AnalysisOpts) => {
  if (!paths || paths.length === 0) {
    program.help();
    return;
  }
  await runAnalysis(paths, opts);
});

// Explicit sub-command: cite-sight check <paths...>
addAnalysisOptions(
  program
    .command('check [paths...]')
    .description('Check documents (files, folders, or globs) for citation and writing pattern issues'),
).action(async (paths: string[], opts: AnalysisOpts) => {
  if (!paths || paths.length === 0) {
    console.error(chalk.red('Error: provide at least one file, folder, or glob to check.'));
    process.exit(EXIT_ERROR);
  }
  await runAnalysis(paths, opts);
});

// Family contract: cite-sight manifest
program
  .command('manifest')
  .description('Print the capability manifest as JSON (lens analyser family)')
  .action(() => {
    console.log(JSON.stringify(MANIFEST, null, 2));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${message}`));
  process.exit(1);
});
