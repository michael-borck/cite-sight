import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, open, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { ClaimProvenance, LocalClaimOptions } from '../types.js';
import { CLAIM_SCHEMA } from './evidence.js';
import { hashFile } from './artifacts.js';
import { CLAIM_MODELS, CLAIM_INFERENCE, CLAIM_PROMPT_VERSION } from './modelCatalog.js';

export async function probeRuntimeVersion(path: string): Promise<string> {
  const { stdout, stderr } = await promisify(execFile)(path, ['--version'], {
    timeout: 30_000, maxBuffer: 64 * 1024, env: runnerEnvironment(tmpdir()), windowsHide: true,
  });
  const match = (stdout + '\n' + stderr).match(/version:\s*(\d+)\s*\(([a-f0-9]+)\)/i);
  if (!match) throw new Error('Could not identify the llama.cpp runtime version.');
  return `b${match[1]} (${match[2]})`;
}

export function localPath(path: string): string {
  if (typeof path !== 'string' || !path.trim() || path.includes('\0') || /^(?:[a-z]+:\/\/|\\\\|\/\/)/i.test(path)) {
    throw new Error('Claim checking requires local file paths, not URLs or network shares.');
  }
  return resolve(path);
}

/** Do not inherit RPC, model-download, prompt-log or cloud configuration. */
export function runnerEnvironment(directory: string): NodeJS.ProcessEnv {
  return {
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.WINDIR ? { WINDIR: process.env.WINDIR } : {}),
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    HOME: directory, USERPROFILE: directory, TMPDIR: directory, TMP: directory, TEMP: directory,
    HF_HUB_OFFLINE: '1', LLAMA_ARG_OFFLINE: '1',
  };
}

export async function createLocalRunner(options: LocalClaimOptions): Promise<{ name: string; provenance: ClaimProvenance; infer: (prompt: string, signal?: AbortSignal) => Promise<string> }> {
  if (options.reasoning !== undefined && !['off', 'on'].includes(options.reasoning)) throw new Error('Reasoning must be on or off.');
  if (options.chatTemplate !== undefined && options.chatTemplate !== 'chatml') throw new Error('Unsupported chat template override.');
  const runner = await realpath(localPath(options.runnerPath));
  const model = await realpath(localPath(options.modelPath));
  if (!(await stat(runner)).isFile() || !(await stat(model)).isFile() || !/\.gguf$/i.test(model)) {
    throw new Error('Select a llama-cli executable and a local .gguf model file.');
  }
  await access(runner, process.platform === 'win32' ? constants.R_OK : constants.X_OK);
  const file = await open(model, 'r');
  try {
    const magic = Buffer.alloc(4);
    await file.read(magic, 0, 4, 0);
    if (magic.toString() !== 'GGUF') throw new Error('The model file is not a GGUF model.');
  } finally { await file.close(); }
  const timeoutMs = options.timeoutMs ?? 180_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new Error('Model timeout must be between 1 and 600000 milliseconds.');
  const [runtimeVersion, runtimeSha256, modelSha256] = await Promise.all([probeRuntimeVersion(runner), hashFile(runner), hashFile(model)]);
  const catalogModel = CLAIM_MODELS.find((entry) => entry.sha256 === modelSha256);
  const reasoning = options.reasoning ?? catalogModel?.inferenceProfile?.reasoning;
  const chatTemplate = options.chatTemplate ?? catalogModel?.inferenceProfile?.chatTemplate;
  const provenance: ClaimProvenance = { runtimeVersion, runtimeSha256, modelSha256,
    modelId: catalogModel?.id, modelRevision: catalogModel?.revision, platform: process.platform, arch: process.arch,
    promptVersion: CLAIM_PROMPT_VERSION, parameters: { ...CLAIM_INFERENCE, reasoning: reasoning ?? 'auto', chatTemplate: chatTemplate ?? 'model-default' },
  };
  return { name: basename(model), provenance, infer: async (prompt, signal) => {
    signal?.throwIfAborted();
    if (prompt.length > 16_000) throw new Error('Claim context is too large for the local model.');
    // Keep submission text out of process arguments, logs and shell history.
    const directory = await mkdtemp(join(tmpdir(), 'cite-sight-claim-'));
    try {
      const promptPath = join(directory, 'prompt.txt');
      await writeFile(promptPath, prompt, { mode: 0o600 });
      signal?.throwIfAborted();
      return await new Promise<string>((resolveOutput, reject) => {
        const child = spawn(runner, [
          '--model', model, '--file', promptPath, '--offline', '--device', 'none',
          '--single-turn', '--simple-io', '--no-display-prompt', '--no-show-timings', '--log-disable',
          '--no-escape', '--no-mmproj', '--ctx-size', '8192', '--n-predict', '1024',
          '--temp', '0', '--seed', '0', '--json-schema', CLAIM_SCHEMA,
          ...(reasoning ? ['--reasoning', reasoning] : []),
          ...(chatTemplate ? ['--chat-template', chatTemplate] : []),
        ], { shell: false, cwd: directory, env: runnerEnvironment(directory), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        let bytes = 0;
        let failure: Error | undefined;
        const stop = (error: Error) => { failure ??= error; child.kill('SIGKILL'); };
        const abort = () => stop(new Error('Claim checking cancelled.'));
        const timer = setTimeout(() => stop(new Error('Local model timed out. Try a smaller model or a longer timeout.')), timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 64 * 1024) stop(new Error('Local model output exceeded the allowed size.'));
          else output += chunk;
        });
        // Never forward native logs: some runners include prompt text in errors.
        child.stderr.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 64 * 1024) stop(new Error('Local model output exceeded the allowed size.'));
        });
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        child.once('error', () => { cleanup(); reject(new Error('Could not start llama-cli. Check the selected executable and its installation.')); });
        child.once('close', (code) => {
          cleanup();
          if (failure) reject(failure);
          else if (code !== 0) reject(new Error(`Local model exited with code ${code}. Check GGUF compatibility, available memory and the installed llama.cpp version.`));
          else resolveOutput(output);
        });
      });
    } finally { await rm(directory, { recursive: true, force: true }); }
  } };
}
