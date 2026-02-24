#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { resolve } from 'path';
import { analyzePipeline } from '@michaelborck/cite-sight-core';
import type { AnalysisResult, ProcessingOptions, ProgressCallback } from '@michaelborck/cite-sight-core';

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function riskColor(score: number): string {
  if (score >= 70) return chalk.red(score.toFixed(0));
  if (score >= 40) return chalk.yellow(score.toFixed(0));
  return chalk.green(score.toFixed(0));
}

function statusBadge(status: string): string {
  switch (status) {
    case 'verified':     return chalk.green('✔ verified');
    case 'likely_valid': return chalk.green('~ likely valid');
    case 'suspicious':   return chalk.red('✖ suspicious');
    case 'not_found':    return chalk.yellow('? not found');
    case 'format_only':  return chalk.cyan('f format only');
    default:             return chalk.gray(status);
  }
}

function urlStatusBadge(status: string): string {
  switch (status) {
    case 'live':     return chalk.green('live');
    case 'dead':     return chalk.red('dead');
    case 'redirect': return chalk.yellow('redirect');
    case 'timeout':  return chalk.yellow('timeout');
    default:         return chalk.gray(status);
  }
}

function printSectionHeader(title: string): void {
  console.log('');
  console.log(chalk.bold.underline(title));
}

function printReport(result: AnalysisResult, verbose: boolean): void {
  const { readability, writingQuality, references, integrity, processingTime } = result;

  // Header
  console.log('');
  console.log(chalk.bold.cyan('CiteSight Analysis Report'));
  console.log(chalk.gray(`File: ${result.fileName}`));
  console.log(chalk.gray(`Processed in ${formatDuration(processingTime)}`));

  // Document stats
  printSectionHeader('Document Statistics');
  console.log(`  Words:           ${readability.wordCount.toLocaleString()}`);
  console.log(`  Sentences:       ${readability.sentenceCount.toLocaleString()}`);
  console.log(`  Paragraphs:      ${readability.paragraphCount.toLocaleString()}`);
  console.log(`  Readability:     Flesch-Kincaid Grade ${readability.fleschKincaidGrade.toFixed(1)}`);
  console.log(`  Reading Ease:    ${readability.fleschReadingEase.toFixed(1)} / 100`);

  // Reference verification summary
  printSectionHeader('Reference Verification');
  const total = references.totalReferences;
  console.log(`  Total references:  ${total}`);
  if (total > 0) {
    console.log(`  Verified:          ${chalk.green(String(references.verifiedCount))}`);
    console.log(`  Suspicious:        ${references.suspiciousCount > 0 ? chalk.red(String(references.suspiciousCount)) : chalk.green('0')}`);
    console.log(`  Not found:         ${references.notFoundCount > 0 ? chalk.yellow(String(references.notFoundCount)) : chalk.green('0')}`);
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

  // Issues found
  const issues: Array<{ label: string; detail: string; severity: 'error' | 'warn' | 'info' }> = [];

  for (const v of references.verifications) {
    if (v.status === 'suspicious') {
      const title = v.reference.title || v.reference.raw.slice(0, 60);
      issues.push({
        label: 'Suspicious reference',
        detail: `"${title}" — ${v.flags.join('; ')}`,
        severity: 'error',
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
        issues.push({
          label: 'Format issue',
          detail: `"${title}" — ${fi.message}`,
          severity: 'warn',
        });
      }
    }
  }

  for (const p of integrity.patterns) {
    issues.push({
      label: `Integrity: ${p.type}`,
      detail: p.description + (p.evidence ? ` (e.g. "${p.evidence.slice(0, 60)}")` : ''),
      severity: p.severity === 'high' ? 'error' : p.severity === 'medium' ? 'warn' : 'info',
    });
  }

  if (issues.length > 0) {
    printSectionHeader('Issues Found');
    for (const issue of issues) {
      const prefix =
        issue.severity === 'error'
          ? chalk.red('  [ERROR]')
          : issue.severity === 'warn'
            ? chalk.yellow('  [WARN] ')
            : chalk.cyan('  [INFO] ');
      console.log(`${prefix} ${chalk.bold(issue.label)}: ${issue.detail}`);
    }
  } else {
    printSectionHeader('Issues Found');
    console.log(`  ${chalk.green('No issues detected.')}`);
  }

  // Verbose: individual reference statuses
  if (verbose && references.verifications.length > 0) {
    printSectionHeader('Reference Details');
    for (const v of references.verifications) {
      const title = v.reference.title
        ? v.reference.title.slice(0, 60) + (v.reference.title.length > 60 ? '…' : '')
        : v.reference.raw.slice(0, 60) + '…';
      const year = v.reference.year ? ` (${v.reference.year})` : '';
      console.log(`  ${statusBadge(v.status)} — ${title}${year}`);
      if (v.flags.length > 0 && verbose) {
        for (const flag of v.flags) {
          console.log(`    ${chalk.gray('·')} ${chalk.gray(flag)}`);
        }
      }
    }
  }

  // Writing quality summary
  printSectionHeader('Writing Quality');
  console.log(`  Passive voice:     ${writingQuality.passiveVoicePercentage.toFixed(1)}%`);
  console.log(`  Academic tone:     ${(writingQuality.academicToneScore * 100).toFixed(0)} / 100`);
  console.log(`  Sentence variety:  ${(writingQuality.sentenceVarietyScore * 100).toFixed(0)} / 100`);
  console.log(`  Hedging phrases:   ${writingQuality.hedgingPhraseCount}`);

  if (verbose && writingQuality.hedgingPhrases.length > 0) {
    for (const hp of writingQuality.hedgingPhrases.slice(0, 5)) {
      console.log(`    ${chalk.gray('·')} "${hp.phrase}" (${hp.count}x)`);
    }
  }

  // Integrity risk score
  printSectionHeader('Integrity Risk Score');
  const score = integrity.riskScore;
  const bar = buildBar(score);
  console.log(`  Score: ${riskColor(score)} / 100  ${bar}`);
  if (score >= 70) {
    console.log(`  ${chalk.red.bold('High risk')} — manual review strongly recommended.`);
  } else if (score >= 40) {
    console.log(`  ${chalk.yellow('Moderate risk')} — some patterns detected, review advised.`);
  } else {
    console.log(`  ${chalk.green('Low risk')} — no significant integrity concerns detected.`);
  }

  console.log('');
}

function buildBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = score >= 70 ? chalk.red : score >= 40 ? chalk.yellow : chalk.green;
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
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
  json: boolean;
  verbose: boolean;
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
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    printReport(result, opts.verbose);
  }
}

// -------------------------------------------------------
// CLI definition
// -------------------------------------------------------

program
  .name('cite-sight')
  .description('Academic integrity and citation checker')
  .version('1.0.0');

// Top-level default command: cite-sight <file>
program
  .argument('[file]', 'Document to analyze (PDF, DOCX, or plain text)')
  .option('--style <style>', 'Citation style (auto|apa|mla|chicago)', 'auto')
  .option('--no-urls', 'Skip URL checking')
  .option('--no-doi', 'Skip DOI verification')
  .option('--no-in-text', 'Skip in-text citation cross-referencing')
  .option('--email <email>', 'Contact email for API polite pool')
  .option('--json', 'Output result as JSON', false)
  .option('--verbose', 'Verbose output', false)
  .action(async (file: string | undefined, opts: {
    style: string;
    urls: boolean;
    doi: boolean;
    inText: boolean;
    email?: string;
    json: boolean;
    verbose: boolean;
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
  .description('Check a document for citation and integrity issues')
  .option('--style <style>', 'Citation style (auto|apa|mla|chicago)', 'auto')
  .option('--no-urls', 'Skip URL checking')
  .option('--no-doi', 'Skip DOI verification')
  .option('--no-in-text', 'Skip in-text citation cross-referencing')
  .option('--email <email>', 'Contact email for API polite pool')
  .option('--json', 'Output result as JSON', false)
  .option('--verbose', 'Verbose output', false)
  .action(async (file: string, opts: {
    style: string;
    urls: boolean;
    doi: boolean;
    inText: boolean;
    email?: string;
    json: boolean;
    verbose: boolean;
  }) => {
    await runAnalysis(file, opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${message}`));
  process.exit(1);
});
