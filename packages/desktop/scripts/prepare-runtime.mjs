import { readFile, mkdir, readdir, cp, rm, writeFile, chmod, lstat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { downloadArtifact, hashFile } from '../../core/dist/claims/artifacts.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(join(root, 'runtime-lock.json'), 'utf8'));
const platform = process.argv[2] ?? process.platform;
const arch = process.argv[3] ?? process.arch;
const artifact = lock.artifacts[`${platform}-${arch}`];
if (!artifact) throw new Error(`No pinned claim runtime for ${platform}-${arch}`);
const destination = join(root, 'resources', 'runtime', arch);
const archiveDir = join(root, 'resources', 'runtime-downloads');
await mkdir(archiveDir, { recursive: true });
const archive = join(archiveDir, artifact.file);
let valid = false;
try { valid = await hashFile(archive) === artifact.sha256; } catch { /* First build. */ }
if (!valid) await downloadArtifact({ ...artifact, url: `https://github.com/${lock.repository}/releases/download/${lock.version}/${artifact.file}` }, archive);
const unpacked = join(archiveDir, `${platform}-${arch}-unpacked`);
await rm(unpacked, { recursive: true, force: true }); await mkdir(unpacked, { recursive: true });
try {
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
  if (entries.some((entry) => /^(\/|\\|[a-z]:)/i.test(entry) || entry.split(/[\\/]/).includes('..'))) throw new Error('Unsafe runtime archive entry.');
  execFileSync('tar', ['-xf', archive, '-C', unpacked]);
  async function files(path) {
    return (await Promise.all((await readdir(path, { withFileTypes: true })).map(async (entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]))).flat();
  }
  const executableName = platform === 'win32' ? 'llama-cli.exe' : 'llama-cli';
  const candidates = (await files(unpacked)).filter((path) => path.endsWith('/' + executableName) || path.endsWith('\\' + executableName));
  if (candidates.length !== 1) throw new Error('Runtime archive does not contain exactly one llama-cli.');
  await rm(destination, { recursive: true, force: true }); await mkdir(destination, { recursive: true });
  // Preserve the upstream layout so shared libraries and relative loader paths work.
  await cp(unpacked, destination, { recursive: true, dereference: false, verbatimSymlinks: true,
    filter: async (path) => !basename(path).startsWith('._') && ((await lstat(path)).isDirectory() ||
      basename(path) === executableName || /\.(dll|dylib|so(?:\.\d+)*)$/i.test(path) || /^LICENSE/i.test(basename(path))),
  });
  const executable = relative(unpacked, candidates[0]).replaceAll('\\', '/');
  if (platform !== 'win32') await chmod(join(destination, executable), 0o755);
  await writeFile(join(destination, 'runtime.json'), JSON.stringify({ version: lock.version, platform, arch, executable, archiveSha256: artifact.sha256 }, null, 2));
  console.log(`Prepared ${lock.version} for ${platform}-${arch}: ${executable}`);
} finally { await rm(unpacked, { recursive: true, force: true }); }
