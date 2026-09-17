import { chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { downloadArtifact, hashFile } from './artifacts.js';
import { CLAIM_RUNTIME_VERSION } from './modelCatalog.js';

// Pinned llama.cpp release, per platform. Same table the desktop packer uses
// (packages/desktop/runtime-lock.json is generated from this).
export const RUNTIME_LOCK = {
  version: CLAIM_RUNTIME_VERSION,
  repository: 'ggml-org/llama.cpp',
  artifacts: {
    'darwin-arm64': { file: 'llama-b8680-bin-macos-arm64.tar.gz', bytes: 40251991, sha256: '4ccfb4bdacb8d90b166e3636f2eee71dd682e9487a1b0c14cf79f25310552920' },
    'darwin-x64': { file: 'llama-b8680-bin-macos-x64.tar.gz', bytes: 104235447, sha256: '686067309a57d689124fbe1b1692f158a61aa4c9189c9fa880e276f46dbddeb6' },
    'linux-x64': { file: 'llama-b8680-bin-ubuntu-x64.tar.gz', bytes: 31668148, sha256: '53d2dc06358ca83a71fd65eeb345942f4fc581d2b64c56c7077c97da8cd87882' },
    'linux-arm64': { file: 'llama-b8680-bin-ubuntu-arm64.tar.gz', bytes: 27847014, sha256: 'dd57e2acd4c5d46273ae26ba661460c3ca52bf651f83ad9a18d706acc156995e' },
    'win32-x64': { file: 'llama-b8680-bin-win-cpu-x64.zip', bytes: 39397140, sha256: '0ee1cfd410a1d9efa9df584c712f3b471ddce13240995f3965ff52fd4fb2086c' },
    'win32-arm64': { file: 'llama-b8680-bin-win-cpu-arm64.zip', bytes: 32176538, sha256: 'd6007c3b90f1753f0c39f0a648f9dc842acac08504b108d94356d9d07501bdf9' },
  },
} as const;

export interface InstalledRuntime { runtimePath: string; executable: string; version: string }

function platformKey(platform = process.platform, arch = process.arch): string {
  return `${platform}-${arch}`;
}

/** Download (checksum-verified), unpack and register the pinned runtime.
 *  Re-running with an existing valid install is a no-op. */
export async function installCliRuntime(
  configRoot: string,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<InstalledRuntime> {
  const key = platformKey();
  const artifact = (RUNTIME_LOCK.artifacts as Record<string, { file: string; bytes: number; sha256: string }>)[key];
  if (!artifact) throw new Error(`No pinned claim runtime for ${key}.`);
  const runtimeDir = join(configRoot, 'runtime', process.arch);
  const receiptPath = join(runtimeDir, 'runtime.json');
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    const exePath = join(runtimeDir, receipt.executable);
    if (receipt.version === RUNTIME_LOCK.version && (await stat(exePath)).isFile()) {
      onProgress?.('Pinned runtime already installed.');
      return { runtimePath: runtimeDir, executable: exePath, version: receipt.version };
    }
  } catch { /* first install */ }

  const archiveDir = join(configRoot, 'downloads');
  await mkdir(archiveDir, { recursive: true });
  const archive = join(archiveDir, artifact.file);
  let valid = false;
  try { valid = (await hashFile(archive)) === artifact.sha256; } catch { /* first download */ }
  if (!valid) {
    await downloadArtifact(
      { ...artifact, url: `https://github.com/${RUNTIME_LOCK.repository}/releases/download/${RUNTIME_LOCK.version}/${artifact.file}` },
      archive,
      ({ received, total }) => onProgress?.(`Downloading runtime: ${Math.floor(received / total * 100)}%`),
      signal,
    );
  }

  const unpacked = join(archiveDir, `${key}-unpacked`);
  await rm(unpacked, { recursive: true, force: true });
  await mkdir(unpacked, { recursive: true });
  try {
    const tar = process.platform === 'win32'
      ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
    const entries = execFileSync(tar, ['-tf', archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
    if (entries.some((entry) => /^(\/|\\|[a-z]:)/i.test(entry) || entry.split(/[\\/]/).includes('..'))) {
      throw new Error('Unsafe runtime archive entry.');
    }
    execFileSync(tar, ['-xf', archive, '-C', unpacked]);
    const executableName = process.platform === 'win32' ? 'llama-cli.exe' : 'llama-cli';
    const all: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else all.push(full);
      }
    }
    await walk(unpacked);
    const candidates = all.filter((path) => path.endsWith('/' + executableName) || path.endsWith('\\' + executableName));
    if (candidates.length !== 1) throw new Error('Runtime archive does not contain exactly one llama-cli.');
    await rm(runtimeDir, { recursive: true, force: true });
    await mkdir(runtimeDir, { recursive: true });
    await cp(unpacked, runtimeDir, { recursive: true, verbatimSymlinks: true,
      filter: async (path) => !basename(path).startsWith('._') && ((await stat(path)).isDirectory() ||
        basename(path) === executableName || /\.(dll|dylib|so(?:\.\d+)*)$/i.test(path) || /^LICENSE/i.test(basename(path))),
    });
    const executable = candidates[0].slice(unpacked.length + 1).replaceAll('\\', '/');
    if (process.platform !== 'win32') await chmod(join(runtimeDir, executable), 0o755);
    await writeFile(join(runtimeDir, 'runtime.json'), JSON.stringify({ version: RUNTIME_LOCK.version, platform: process.platform, arch: process.arch, executable, archiveSha256: artifact.sha256 }, null, 2));
    onProgress?.('Runtime installed and checksum-verified.');
    return { runtimePath: runtimeDir, executable: join(runtimeDir, executable), version: RUNTIME_LOCK.version };
  } finally {
    await rm(unpacked, { recursive: true, force: true });
  }
}

export interface InstalledModel { modelId: string; modelPath: string; sha256: string }

/** Register a catalog model in the CLI's model folder (download or copy). */
export async function installCliModel(
  configRoot: string,
  model: { id: string; fileName: string; url: string; sha256: string; bytes: number; revision: string },
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<InstalledModel> {
  const modelsDir = join(configRoot, 'models');
  await mkdir(modelsDir, { recursive: true });
  const destination = join(modelsDir, model.fileName);
  let valid = false;
  try { valid = (await hashFile(destination)) === model.sha256; } catch { /* not installed */ }
  if (!valid) {
    await downloadArtifact(model, destination, ({ received, total }) =>
      onProgress?.(`Downloading model: ${Math.floor(received / total * 100)}%`), signal);
  }
  const receiptPath = join(modelsDir, 'installed.json');
  let receipt: Record<string, InstalledModel> = {};
  try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')); } catch { /* first model */ }
  receipt[model.id] = { modelId: model.id, modelPath: destination, sha256: model.sha256 };
  const pending = receiptPath + '.tmp';
  await writeFile(pending, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  // Atomicity of the receipt matters less than the model bytes; rename is fine.
  await (await import('node:fs/promises')).rename(pending, receiptPath);
  onProgress?.(`Model ${model.id} installed.`);
  return receipt[model.id];
}

/** Resolve the managed runtime + model for claim runs, or undefined when not
 *  installed. Never probes system llama-cli or Ollama installs — managed
 *  only, so behaviour is identical everywhere. */
export async function resolveManagedClaimSetup(configRoot: string): Promise<{ runnerPath: string; modelPath: string; modelId: string } | undefined> {
  try {
    const receipt = JSON.parse(await readFile(join(configRoot, 'runtime', process.arch, 'runtime.json'), 'utf8'));
    if (receipt.version !== RUNTIME_LOCK.version) return undefined;
    const models = JSON.parse(await readFile(join(configRoot, 'models', 'installed.json'), 'utf8')) as Record<string, InstalledModel>;
    const modelId = Object.keys(models)[0];
    if (!modelId) return undefined;
    const model = models[modelId];
    return { runnerPath: join(configRoot, 'runtime', process.arch, receipt.executable), modelPath: model.modelPath, modelId };
  } catch {
    return undefined;
  }
}
