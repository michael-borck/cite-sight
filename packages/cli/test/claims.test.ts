import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

let directory: string;
const cli = resolve(import.meta.dirname, '../dist/index.js');
beforeAll(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'cite-cli-claims-')));
  writeFileSync(join(directory, 'paper.txt'), 'Practice improved recall (Smith, 2020).\n\nReferences\n\nSmith, J. (2020). Practice and recall. Journal, 1, 1-10.');
  writeFileSync(join(directory, 'source.txt'), 'Practice improved recall in adults.');
  writeFileSync(join(directory, 'model.gguf'), 'GGUFfixture');
  writeFileSync(join(directory, 'sources.json'), JSON.stringify({ version: 1, sources: [{ reference: 1, path: 'source.txt' }] }));
  writeFileSync(join(directory, 'llama-cli'), `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('version: 8680 (15f786e65)'); process.exit(0); }
console.log(JSON.stringify({status:'supported', reason:'The source states the finding.', evidence:[{passageId:'p0', quote:'Practice improved recall in adults.'}]}));
`, { mode: 0o700 });
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe.skipIf(process.platform === 'win32')('CLI local claims workflow', () => {
  const run = (args: string[]) => spawnSync(process.execPath, [cli, 'claims', 'paper.txt', '--sources', 'sources.json', '--runner', join(directory, 'llama-cli'), '--model', join(directory, 'model.gguf'), ...args], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
  it('runs the complete local file/runner pipeline and returns evidence in JSON', () => {
    const output = run(['--json']);
    expect(output.status, output.stderr).toBe(0);
    const result = JSON.parse(output.stdout);
    expect(result.offline).toBe(true);
    expect(result.extractedText).toBe('');
    expect(result.references.verifications[0].status).toBe('format_only');
    expect(result.claims.findings[0].evidence[0].quote).toBe('Practice improved recall in adults.');
  });
  it('exports readable claim evidence in HTML without outbound links', () => {
    const output = run(['--format', 'html', '--output', 'claims.html']);
    expect(output.status, output.stderr).toBe(0);
    const html = readFileSync(join(directory, 'claims.html'), 'utf8');
    expect(html).toContain('Local claim checks'); expect(html).toContain('Practice improved recall in adults.');
    expect(html).not.toMatch(/href="https?:/);
  });
  it('resumes within a document after the CLI process is terminated', () => {
    const paper = join(directory, 'resume-paper.txt');
    writeFileSync(paper, 'Practice improved recall (Smith, 2020). Practice improved recall in adults (Smith, 2020).\n\nReferences\n\nSmith, J. (2020). Practice and recall. Journal, 1, 1-10.');
    const calls = join(directory, 'runner-calls.txt');
    const runner = join(directory, 'resume-runner');
    writeFileSync(runner, `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('version: 8680 (15f786e65)'); process.exit(0); }
const fs = require('node:fs');
const path = ${JSON.stringify(calls)};
const count = fs.existsSync(path) ? Number(fs.readFileSync(path, 'utf8')) + 1 : 1;
fs.writeFileSync(path, String(count));
if (count === 2) { process.kill(process.ppid, 'SIGKILL'); process.exit(0); }
console.log(JSON.stringify({status:'supported', reason:'The source states the finding.', evidence:[{passageId:'p0', quote:'Practice improved recall in adults.'}]}));
`, { mode: 0o700 });
    const args = [cli, 'claims', paper, '--sources', 'sources.json', '--runner', runner, '--model', join(directory, 'model.gguf'), '--json'];
    const interrupted = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', timeout: 15_000 });
    expect(interrupted.signal).toBe('SIGKILL');
    const saved = JSON.parse(readFileSync(paper + '.claims-checkpoint.json', 'utf8'));
    expect(saved.analysis.progress).toMatchObject({ state: 'partial', completed: 1, total: 2 });
    const resumed = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', timeout: 15_000 });
    expect(resumed.status, resumed.stderr).toBe(0);
    expect(JSON.parse(resumed.stdout).claims.progress).toEqual({ state: 'complete', completed: 2, total: 2, reused: 1 });
    expect(readFileSync(calls, 'utf8')).toBe('3');
  });
});

it('exports BibTeX and plans a unit shopping list without network', () => {
  const bib = spawnSync(process.execPath, [cli, 'check', 'paper.txt', '--offline', '--bibtex', 'refs.bib'], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
  expect(bib.status, bib.stderr).toBe(0);
  expect(readFileSync(join(directory, 'refs.bib'), 'utf8')).toContain('exported by CiteSight');
  const plan = spawnSync(process.execPath, [cli, 'library', 'plan', 'paper.txt', '--output', 'unit-sources.json', '--json'], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
  expect(plan.status, plan.stderr).toBe(0);
  const list = JSON.parse(readFileSync(join(directory, 'unit-sources.json'), 'utf8'));
  expect(list.submissions).toBe(1);
  expect(Array.isArray(list.entries)).toBe(true);
});

it('exposes a real offline reference-check command independently of claim inference', () => {
  const output = spawnSync(process.execPath, [cli, 'check', 'paper.txt', '--offline', '--json'], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
  expect(output.status, output.stderr).toBe(0);
  const result = JSON.parse(output.stdout);
  expect(result.offline).toBe(true);
  expect(result.references.verifications[0].flags).toContain('offline');
});
it('plans a folder on CPU without running the model or reference providers', () => {
  const output = spawnSync(process.execPath, [cli, 'plan', 'paper.txt', '--claims', '--seconds-per-claim', '10', '--json'], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
  expect(output.status, output.stderr).toBe(0);
  const plan = JSON.parse(output.stdout);
  expect(plan).toMatchObject({ offline: true, mode: 'claims', references: 1, claims: 1 });
  expect(plan.estimate.basis).toBe('observed');
});
