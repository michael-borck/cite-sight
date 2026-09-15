import { analyzePipeline } from '../pipelineFromFile.js';
import { withoutExternalRequests } from '../httpClient.js';
import { extractClaims } from './evidence.js';
import { unitEstimate } from './timing.js';
import type { BatchPlan } from '../types.js';

/** Local preflight only. It never looks up references or starts a model. */
export async function planFiles(paths: string[], options: { offline: boolean; claims?: boolean; maxClaims?: number; observedMs?: number }, progress?: (index: number, total: number) => void): Promise<BatchPlan> {
  if (!Array.isArray(paths) || paths.length > 1000 || paths.some((path) => typeof path !== 'string')) throw new Error('Plan at most 1000 local documents at a time.');
  if (!paths.length) throw new Error('No supported documents were found to estimate.');
  if (options.observedMs !== undefined && (!Number.isFinite(options.observedMs) || options.observedMs <= 0)) throw new Error('A measured speed must be a positive number.');
  const limit = options.maxClaims ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Claim limit must be 1-200.');
  return withoutExternalRequests(async () => {
    const start = Date.now();
    const files: BatchPlan['files'] = [];
    const unique = new Set<string>();
    for (const [index, path] of [...new Set(paths)].entries()) {
      try {
        const result = await analyzePipeline(path, { offline: true, citationStyle: 'auto', checkUrls: false, checkDoi: false, checkInText: true, screenshotUrls: false });
        for (const ref of result.references.references) unique.add((ref.doi || [ref.authors[0], ref.title].join(' ')).toLowerCase().replace(/\s+/g, ' ').trim());
        files.push({ path, references: result.references.totalReferences, claims: Math.min(limit, extractClaims(result).length) });
      } catch (error) { files.push({ path, references: 0, claims: 0, error: error instanceof Error ? error.message : 'Could not read document.' }); }
      progress?.(index + 1, paths.length);
    }
    const references = files.reduce((sum, file) => sum + file.references, 0);
    const claims = files.reduce((sum, file) => sum + file.claims, 0);
    const scanMs = Date.now() - start;
    const estimate = !options.claims && options.offline ? { minMs: scanMs * 0.7, maxMs: Math.max(1000, scanMs * 2), basis: 'observed' as const }
      : unitEstimate(options.claims ? claims : unique.size, options.claims ? 'claims' : 'references', options.observedMs);
    if (options.claims || !options.offline) { estimate.minMs += scanMs; estimate.maxMs += scanMs * 2 + files.length * 3000; }
    return { offline: options.claims === true || options.offline, mode: options.claims ? 'claims' : 'references', files, references, uniqueReferences: unique.size, claims, scanMs, estimate };
  });
}
