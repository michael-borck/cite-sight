import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// End-to-end tests: spawn the actual built binary as a subprocess and assert on
// its exit code and output. The network is stubbed via a preloaded mock (see
// test/e2e/mock-fetch.mjs), so these are deterministic and offline — they test
// the CLI *wiring* (arg parsing, input expansion, report rendering, JSON shape,
// exit-code policy), not the live citation APIs, which core unit-tests cover.

const CLI_ROOT = resolve(import.meta.dirname, '..');
const BIN = join(CLI_ROOT, 'dist', 'index.js');
const MOCK_URL = pathToFileURL(join(CLI_ROOT, 'test', 'e2e', 'mock-fetch.mjs')).href;
const CORE_FIXTURES = resolve(CLI_ROOT, '..', 'core', 'test', 'fixtures');
const SAMPLE_MD = join(CORE_FIXTURES, 'sample-paper.md');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the built CLI with the network mock preloaded. Never throws. */
function run(args: string[]): RunResult {
  try {
    const stdout = execFileSync('node', ['--import', MOCK_URL, BIN, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

let batchDir: string;

beforeAll(() => {
  // Build the binary so the subprocess runs current source, regardless of order.
  execSync('npm run build', { cwd: CLI_ROOT, stdio: 'ignore' });
  expect(existsSync(BIN)).toBe(true);

  // A two-file tree (one nested) to exercise recursion and the batch envelope.
  batchDir = mkdtempSync(join(tmpdir(), 'cite-sight-e2e-'));
  copyFileSync(SAMPLE_MD, join(batchDir, 'paper-a.md'));
  mkdirSync(join(batchDir, 'nested'));
  copyFileSync(join(CORE_FIXTURES, 'style-apa.md'), join(batchDir, 'nested', 'paper-b.md'));
}, 120_000);

describe('cite-sight CLI e2e — wiring (no analysis)', () => {
  it('--help documents exit codes and --fail-on', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--fail-on');
    expect(r.stdout).toContain('Exit codes:');
  });

  it('manifest prints valid JSON', () => {
    const r = run(['manifest']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toBeTypeOf('object');
    expect(parsed).not.toBeNull();
  });

  it('exits 1 on a missing file', () => {
    const r = run([join(batchDir, 'does-not-exist.pdf')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/error/i);
  });

  it('exits 1 on an empty/unsupported directory', () => {
    const empty = mkdtempSync(join(tmpdir(), 'cite-sight-e2e-empty-'));
    const r = run([empty]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no supported documents/i);
  });

  it('exits 1 on an invalid --fail-on level', () => {
    const r = run([SAMPLE_MD, '--fail-on', 'bogus']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/fail-on/i);
  });
});

describe('cite-sight CLI e2e — single file', () => {
  it('renders a human report and exits 0 under --fail-on none', () => {
    const r = run([SAMPLE_MD, '--minimal', '--fail-on', 'none']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('CiteSight Analysis Report');
    expect(r.stdout).toContain('Total references:');
  });

  it('--json emits the single-object shape (no batch envelope)', () => {
    const r = run([SAMPLE_MD, '--json', '--fail-on', 'none']);
    expect(r.status).toBe(0);
    const d = JSON.parse(r.stdout);
    expect(d.fileName).toBeDefined();
    expect(d.references).toBeDefined();
    expect(d.disclaimer).toBeDefined();
    expect(d.files).toBeUndefined(); // not the batch envelope
  });

  it('exits 2 under --fail-on any when findings are present', () => {
    // Under the mock every reference resolves to "not found", so findings exist
    // deterministically regardless of the live databases.
    const r = run([SAMPLE_MD, '--minimal', '--fail-on', 'any']);
    expect(r.status).toBe(2);
  });
});

describe('cite-sight CLI e2e — batch', () => {
  it('--json emits the {files, summary} envelope with one entry per document', () => {
    const r = run([batchDir, '--json', '--fail-on', 'none']);
    expect(r.status).toBe(0); // --fail-on none never trips
    const d = JSON.parse(r.stdout);
    expect(Array.isArray(d.files)).toBe(true);
    expect(d.files).toHaveLength(2); // recursed into nested/
    expect(d.summary.filesAnalyzed).toBe(2);
    expect(d.files.every((f: { fileName?: string }) => f.fileName !== undefined)).toBe(true);
  });

  it('prints a Batch Summary and exits 2 under --fail-on any', () => {
    const r = run([batchDir, '--minimal', '--fail-on', 'any']);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('Batch Summary');
    expect(r.stdout).toContain('Files analyzed:');
  });
});
