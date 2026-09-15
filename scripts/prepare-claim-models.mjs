import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLAIM_MODELS } from '../packages/core/dist/claims/modelCatalog.js';
import { downloadArtifact, hashFile } from '../packages/core/dist/claims/artifacts.js';

const background = process.argv.includes('--background');
const [directory, ...ids] = process.argv.slice(2).filter((arg) => arg !== '--background');
if (!directory || !ids.length) throw new Error('Usage: node scripts/prepare-claim-models.mjs <directory> <catalog-id> [...]');
await mkdir(directory, { recursive: true });
if (background) {
  const log = join(directory, 'downloads.log');
  const fd = openSync(log, 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), directory, ...ids], { detached: true, stdio: ['ignore', fd, fd] });
  child.unref(); closeSync(fd);
  console.log(`Downloading approved benchmark models in background. PID ${child.pid}. Progress: ${log}`);
  process.exit(0);
}
for (const id of ids) {
  const model = CLAIM_MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown catalog model: ${id}`);
  const path = join(directory, model.fileName);
  let verified = false;
  try { verified = await hashFile(path) === model.sha256; } catch { /* Not installed. */ }
  if (!verified) {
    let last = -1;
    await downloadArtifact(model, path, ({ received, total }) => {
      const progress = Math.floor(received / total * 10) * 10;
      if (progress > last) { console.log(`${id}: ${progress}%`); last = progress; }
    });
  }
  console.log(`${id}: SHA-256 verified. ${path}`);
}
