import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { htmlReport } from '../src/reports.js';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';

let directory: string;
const cli = resolve(import.meta.dirname, '../dist/index.js');
function run(args: string[]) {
  return execFileSync(process.execPath, [cli, ...args], { cwd: directory, encoding: 'utf8', env: { ...process.env, CITESIGHT_CONFIG_HOME: join(directory, 'config') } });
}
beforeAll(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), 'cite-cli-ux-'))); writeFileSync(join(directory, 'paper.txt'), 'An ordinary document without references.'); });
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('CLI saved settings and reports', () => {
  it('uses saved settings and lets explicit command options override them', () => {
    run(['config', 'set', 'email', 'teacher@example.edu']);
    run(['config', 'set', 'style', 'mla']);
    expect(JSON.parse(run(['config', 'list']))).toEqual({ email: 'teacher@example.edu', style: 'mla' });
    expect(JSON.parse(run(['check', 'paper.txt', '--json'])).references.detectedStyle).toBe('mla');
    expect(JSON.parse(run(['check', 'paper.txt', '--style', 'apa', '--json'])).references.detectedStyle).toBe('apa');
  });

  it('writes shareable HTML and a retry manifest without API keys', () => {
    run(['check', 'paper.txt', '--format', 'html', '--output', 'reports/', '--s2-key', 'test-secret-value', '--openalex-key', 'openalex-secret-value']);
    expect(readFileSync(join(directory, 'reports/index.html'), 'utf8')).toContain('<!doctype html>');
    const text = readFileSync(join(directory, 'reports/results.json'), 'utf8');
    expect(text).not.toContain('test-secret-value');
    expect(text).not.toContain('openalex-secret-value');
    expect(JSON.parse(text).files[0].file).toBe(join(directory, 'paper.txt'));
  });

  it('retries only failed files from a report and keeps previous successes', () => {
    const initial = spawnSync(process.execPath, [cli, 'check', 'paper.txt', 'missing.txt', '--output', 'failures.json'], { cwd: directory, env: { ...process.env, CITESIGHT_CONFIG_HOME: join(directory, 'config') } });
    expect(initial.status).toBe(1);
    writeFileSync(join(directory, 'missing.txt'), 'A recovered document.');
    rmSync(join(directory, 'paper.txt'));
    run(['retry', 'failures.json', '--only', 'failed', '--output', 'recovered.json']);
    const recovered = JSON.parse(readFileSync(join(directory, 'recovered.json'), 'utf8'));
    expect(recovered.summary).toMatchObject({ filesAnalyzed: 2, filesErrored: 0 });
  });

  it('escapes citation content and refuses executable report links', () => {
    const result = {
      fileName: '<script>alert(1)</script>', extractedText: '', processingTime: 0,
      references: { verifiedCount: 0, suspiciousCount: 1, notFoundCount: 0, unverifiedCount: 0,
        crossReference: { unmatchedBibliography: [], unmatchedInText: [] },
        verifications: [{ reference: { raw: '<img src=x onerror=alert(1)>', title: 'Bad', authors: [], year: 2020, url: 'javascript:alert(1)', detectedStyle: 'apa' }, status: 'suspicious', flags: [], formatIssues: [], confidenceScore: 0, matchCategory: 'none' }],
      },
    } as AnalysisResult;
    const html = htmlReport([{ file: 'test.txt', result }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<img src=x');
  });
});
