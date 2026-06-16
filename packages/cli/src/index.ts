#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { resolve } from 'path';
import { analyzePipeline, MANIFEST, explainVerification, DISCLAIMER } from '@michaelborck/cite-sight-core';
import type { AnalysisResult, ProcessingOptions, ProgressCallback } from '@michaelborck/cite-sight-core';
import { readFileSync } from 'node:fs';

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
    case 'suspicious':   return chalk.red('✖ suspicious');
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
  const { references, writingPatterns, processingTime } = result;

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
    console.log(`  Suspicious:        ${references.suspiciousCount > 0 ? chalk.red(String(references.suspiciousCount)) : chalk.green('0')}`);
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
        label: 'Suspicious reference',
        detail: `"${title}"`,
        severity: 'error',
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

  for (const p of writingPatterns.patterns) {
    issues.push({
      label: `Pattern: ${p.type}`,
      detail: p.description + (p.evidence ? ` (e.g. "${p.evidence.slice(0, 60)}")` : ''),
      severity: p.severity === 'high' ? 'error' : p.severity === 'medium' ? 'warn' : 'info',
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

  // Writing patterns summary
  printSectionHeader('Writing Patterns');
  const { categoryCounts } = writingPatterns;
  console.log(`  Citation Issues:     ${categoryCounts.citation_issues}`);
  console.log(`  Completeness:        ${categoryCounts.completeness}`);
  console.log(`  Style Observations:  ${categoryCounts.style_observations}`);
  const totalPatterns = writingPatterns.patterns.length;
  if (totalPatterns === 0) {
    console.log(`  ${chalk.green('No notable writing patterns detected.')}`);
  } else {
    console.log(`  ${chalk.cyan(`${totalPatterns} pattern(s) detected — review recommended.`)}`);
  }

  // Accuracy disclaimer — always shown, even under --minimal, so a report is
  // never mistaken for a guarantee.
  printSectionHeader('Please note');
  for (const line of wrapText(DISCLAIMER, 78)) {
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

async function runAnalysis(filePath: string, opts: {
  style: string;
  urls: boolean;
  doi: boolean;
  inText: boolean;
  email?: string;
  s2Key?: string;
  json: boolean;
  verbose: boolean;
  minimal: boolean;
}): Promise<void> {
  const absolutePath = resolve(filePath);

  if (!opts.json) {
    console.log(chalk.cyan(`Analyzing: ${absolutePath}`));
  }

  const options: ProcessingOptions = {
    citationStyle: opts.style as ProcessingOptions['citationStyle'],
    checkUrls: opts.urls,
    checkDoi: opts.doi,
    checkInText: opts.inText,
    screenshotUrls: false,
    contactEmail: opts.email,
    semanticScholarApiKey: opts.s2Key ?? process.env.SEMANTIC_SCHOLAR_API_KEY,
  };

  const onProgress = opts.json ? undefined : makeProgressCallback(opts.verbose);

  let result: AnalysisResult;
  try {
    result = await analyzePipeline(absolutePath, options, onProgress);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!opts.json) {
      console.error(chalk.red(`\nError: ${message}`));
    } else {
      process.stdout.write(JSON.stringify({ error: message }) + '\n');
    }
    process.exit(1);
  }

  if (opts.json) {
    // Carry the disclaimer in machine output too, so downstream consumers can
    // surface it rather than presenting results as authoritative.
    process.stdout.write(JSON.stringify({ ...result, disclaimer: DISCLAIMER }, null, 2) + '\n');
  } else {
    printReport(result, opts.minimal);
  }
}

// -------------------------------------------------------
// CLI definition
// -------------------------------------------------------

program
  .name('cite-sight')
  .description('Academic integrity and citation checker')
  .version(pkgVersion);

// Top-level default command: cite-sight <file>
program
  .argument('[file]', 'Document to analyze (PDF, DOCX, or plain text)')
  .option('--style <style>', 'Citation style (auto|apa|mla|chicago)', 'auto')
  .option('--no-urls', 'Skip URL checking')
  .option('--no-doi', 'Skip DOI verification')
  .option('--no-in-text', 'Skip in-text citation cross-referencing')
  .option('--email <email>', 'Contact email for API polite pool')
  .option('--s2-key <key>', 'Semantic Scholar API key (or set SEMANTIC_SCHOLAR_API_KEY) to avoid rate-limiting')
  .option('--json', 'Output result as JSON', false)
  .option('--verbose', 'Log progress line by line', false)
  .option('--minimal', 'Condensed report: summary and verdicts only, no per-issue detail', false)
  .action(async (file: string | undefined, opts: {
    style: string;
    urls: boolean;
    doi: boolean;
    inText: boolean;
    email?: string;
    s2Key?: string;
    json: boolean;
    verbose: boolean;
    minimal: boolean;
  }) => {
    if (!file) {
      program.help();
      return;
    }
    await runAnalysis(file, opts);
  });

// Explicit sub-command: cite-sight check <file>
program
  .command('check <file>')
  .description('Check a document for citation and writing pattern issues')
  .option('--style <style>', 'Citation style (auto|apa|mla|chicago)', 'auto')
  .option('--no-urls', 'Skip URL checking')
  .option('--no-doi', 'Skip DOI verification')
  .option('--no-in-text', 'Skip in-text citation cross-referencing')
  .option('--email <email>', 'Contact email for API polite pool')
  .option('--s2-key <key>', 'Semantic Scholar API key (or set SEMANTIC_SCHOLAR_API_KEY) to avoid rate-limiting')
  .option('--json', 'Output result as JSON', false)
  .option('--verbose', 'Log progress line by line', false)
  .option('--minimal', 'Condensed report: summary and verdicts only, no per-issue detail', false)
  .action(async (file: string, opts: {
    style: string;
    urls: boolean;
    doi: boolean;
    inText: boolean;
    email?: string;
    s2Key?: string;
    json: boolean;
    verbose: boolean;
    minimal: boolean;
  }) => {
    await runAnalysis(file, opts);
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
