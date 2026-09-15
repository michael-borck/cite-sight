import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalRunner, runnerEnvironment } from '../src/claims/localRunner.js';
import type { LocalClaimOptions } from '../src/types.js';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cite-runner-test-'));
  await writeFile(join(directory, 'model.gguf'), 'GGUFtest');
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

it('excludes cloud, RPC and logging configuration from the child environment', () => {
  vi.stubEnv('LLAMA_ARG_RPC', 'remote.invalid:5000');
  vi.stubEnv('LLAMA_ARG_MODEL_URL', 'https://remote.invalid/model');
  vi.stubEnv('LLAMA_ARG_LOG_FILE', '/tmp/sensitive-prompts');
  vi.stubEnv('HF_TOKEN', 'secret');
  const env = runnerEnvironment(directory);
  expect(env.LLAMA_ARG_RPC).toBeUndefined(); expect(env.HF_TOKEN).toBeUndefined();
  expect(env.LLAMA_ARG_MODEL_URL).toBeUndefined(); expect(env.LLAMA_ARG_LOG_FILE).toBeUndefined();
  expect(env.LLAMA_ARG_OFFLINE).toBe('1');
});

describe.skipIf(process.platform === 'win32')('local subprocess lifecycle', () => {
  async function runner(timeoutMs = 3000, profile: Pick<LocalClaimOptions, 'reasoning' | 'chatTemplate'> = {}) {
    const executable = join(directory, 'llama-cli');
    await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('version: 8680 (15f786e65)'); process.exit(0); }
const promptPath = args[args.indexOf('--file') + 1];
const prompt = fs.readFileSync(promptPath, 'utf8');
if (prompt === 'hang') setInterval(() => {}, 1000);
else console.log(JSON.stringify({ args, prompt, home: process.env.HOME, env: Object.keys(process.env) }));
`, { mode: 0o700 });
    return createLocalRunner({ runnerPath: executable, modelPath: join(directory, 'model.gguf'), sources: [], timeoutMs, ...profile });
  }
  it('keeps private text out of arguments and cleans up its private prompt file', async () => {
    const local = await runner();
    const output = JSON.parse(await local.infer('PRIVATE STUDENT CLAIM'));
    expect(output.args).not.toContain('PRIVATE STUDENT CLAIM');
    expect(output.args).toContain('--offline'); expect(output.args).toContain('--single-turn');
    expect(output.args[output.args.indexOf('--device') + 1]).toBe('none');
    expect(output.prompt).toBe('PRIVATE STUDENT CLAIM');
    expect(existsSync(output.home)).toBe(false);
  });
  it('terminates a hung runner on timeout', async () => {
    const local = await runner(100);
    await expect(local.infer('hang')).rejects.toThrow(/timed out/);
  });
  it('records and applies explicit JSON-compatible template and reasoning controls', async () => {
    const local = await runner(3000, { chatTemplate: 'chatml', reasoning: 'off' });
    const output = JSON.parse(await local.infer('A synthetic compatibility check.'));
    expect(output.args[output.args.indexOf('--chat-template') + 1]).toBe('chatml');
    expect(output.args[output.args.indexOf('--reasoning') + 1]).toBe('off');
    expect(output.args[output.args.indexOf('--device') + 1]).toBe('none');
    expect(local.provenance.parameters).toMatchObject({ chatTemplate: 'chatml', reasoning: 'off', device: 'cpu', temperature: 0, seed: 0 });
  });
  it('keeps the previous model-default configuration when no override is requested', async () => {
    const local = await runner();
    const output = JSON.parse(await local.infer('A synthetic compatibility check.'));
    expect(output.args).not.toContain('--chat-template');
    expect(output.args).not.toContain('--reasoning');
    expect(local.provenance.parameters).toMatchObject({ chatTemplate: 'model-default', reasoning: 'auto' });
  });
  it('rejects arbitrary template files and invalid reasoning values', async () => {
    await expect(runner(3000, { chatTemplate: '/remote/template.jinja' as never })).rejects.toThrow(/Unsupported chat template/);
    await expect(runner(3000, { reasoning: 'external' as never })).rejects.toThrow(/Reasoning must/);
  });
  it('cancels a running model without falling back to another backend', async () => {
    const local = await runner();
    await expect(local.infer('hang', AbortSignal.timeout(100))).rejects.toThrow(/cancelled/);
  });
});
