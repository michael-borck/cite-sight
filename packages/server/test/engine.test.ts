/**
 * Engine-selection tests: delegation to cite-analyser over HTTP, response
 * mapping, and the auto-mode fallback to the bundled engine.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@michaelborck/cite-sight-core', () => ({
  analyzePipeline: vi.fn(async () => ({
    offline: false,
    fileName: 'local.md',
    extractedText: 'local text',
    processingTime: 1,
    references: {
      references: [],
      inTextCitations: [],
      verifications: [],
      crossReference: { unmatchedBibliography: [], unmatchedInText: [] },
      detectedStyle: 'unknown',
      totalReferences: 0,
      verifiedCount: 0,
      suspiciousCount: 0,
      notFoundCount: 0,
      unverifiedCount: 0,
      brokenUrlCount: 0,
      sourceListLikely: false,
    },
  })),
}));

const { analyseDocument } = await import('../src/engine.js');
const core = await import('@michaelborck/cite-sight-core');

const ANALYSER_BODY = {
  fileName: 'essay.md',
  extractedText: 'Vygotsky, L. S. (1978). Mind in Society.',
  references: [
    { raw: 'Vygotsky, L. S. (1978). Mind in Society.', authors: ['Vygotsky, L. S.'], title: 'Mind in Society.', year: 1978, detectedStyle: 'apa' },
  ],
  inTextCitations: [{ raw: '(Vygotsky, 1978)', authors: ['Vygotsky'], year: 1978, position: 10 }],
  verifications: [
    { reference: {}, status: 'verified', matchCategory: 'exact', formatIssues: [], flags: [], confidenceScore: 0.92, evidence: { existence: 'found', metadata: 'match' } },
  ],
  crossReference: { unmatchedBibliography: [], unmatchedInText: [] },
  detectedStyle: 'apa',
  totalReferences: 1,
  verifiedCount: 1,
  suspiciousCount: 0,
  notFoundCount: 0,
  unverifiedCount: 0,
  brokenUrlCount: 0,
  sourceListLikely: false,
  inTextCheckSkipped: false,
};

async function tempDoc(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cs-engine-'));
  const path = join(dir, 'essay.md');
  await writeFile(path, '# Essay\n\n## References\n\nVygotsky, L. S. (1978). *Mind in Society.*');
  return path;
}

const OPTIONS = {
  citationStyle: 'auto' as const,
  checkUrls: true,
  checkDoi: true,
  checkInText: true,
  screenshotUrls: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.mocked(core.analyzePipeline).mockClear();
});

describe('analyseDocument', () => {
  it('delegates to cite-analyser and maps the response', async () => {
    vi.stubEnv('CITE_ANALYSER_URL', 'http://analyser:8006');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(ANALYSER_BODY), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const progress: string[] = [];
    const seen: string[] = [];
    const result = await analyseDocument(
      await tempDoc(),
      'essay-original.md',
      OPTIONS,
      (p) => progress.push(p.stage),
      (v) => seen.push(v.status),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://analyser:8006/analyse');
    expect(result.fileName).toBe('essay.md');
    expect(result.extractedText).toContain('Vygotsky');
    expect(result.references.totalReferences).toBe(1);
    expect(result.references.verifiedCount).toBe(1);
    expect(result.references.detectedStyle).toBe('apa');
    expect(seen).toEqual(['verified']);
    expect(progress).toContain('extracting');
    expect(core.analyzePipeline).not.toHaveBeenCalled();
  });

  it('falls back to the bundled engine in auto mode when the analyser is down', async () => {
    vi.stubEnv('CITE_ANALYSER_URL', 'http://analyser:8006');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const result = await analyseDocument(await tempDoc(), 'essay.md', OPTIONS);
    expect(core.analyzePipeline).toHaveBeenCalledTimes(1);
    expect(result.fileName).toBe('local.md');
  });

  it('fails hard in analyser-only mode', async () => {
    vi.stubEnv('CITE_ANALYSER_URL', 'http://analyser:8006');
    vi.stubEnv('CITE_ANALYSIS_ENGINE', 'analyser');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    await expect(analyseDocument(await tempDoc(), 'essay.md', OPTIONS)).rejects.toThrow('ECONNREFUSED');
    expect(core.analyzePipeline).not.toHaveBeenCalled();
  });

  it('never calls the analyser in local mode', async () => {
    vi.stubEnv('CITE_ANALYSER_URL', 'http://analyser:8006');
    vi.stubEnv('CITE_ANALYSIS_ENGINE', 'local');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await analyseDocument(await tempDoc(), 'essay.md', OPTIONS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(core.analyzePipeline).toHaveBeenCalledTimes(1);
  });

  it('surfaces analyser HTTP errors in auto mode via the fallback', async () => {
    vi.stubEnv('CITE_ANALYSER_URL', 'http://analyser:8006');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));

    const result = await analyseDocument(await tempDoc(), 'essay.md', OPTIONS);
    expect(result.fileName).toBe('local.md'); // fell back
  });
});
