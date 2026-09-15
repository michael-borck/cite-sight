import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeClaimsFile, readClaimSources } from '../src/claims/checkClaims.js';
import { createLocalRunner } from '../src/claims/localRunner.js';
import { extractClaims, sourcePassages, validateClaimResponse } from '../src/claims/evidence.js';
import { analyzeDocument } from '../src/pipeline.js';
import { setFetch, httpFetch, withoutExternalRequests } from '../src/httpClient.js';
import { makeReviewSession, parseReviewSession } from '../src/session.js';
import { reviewCount } from '../src/review.js';

vi.mock('../src/claims/localRunner.js', async (original) => ({ ...await original<object>(), createLocalRunner: vi.fn() }));
const options = { citationStyle: 'auto' as const, checkDoi: true, checkUrls: true, checkInText: true, screenshotUrls: true };
const document = 'Practice improved recall (Smith, 2020).\n\nReferences\n\nSmith, J. (2020). Practice and recall. Journal of Learning, 1, 1-10.';
const source = 'Practice improved recall in adults after two weeks. Children were not studied.';
const response = (quote = source, status = 'supported') => JSON.stringify({ status, reason: 'The passage addresses the statement.', evidence: [{ passageId: 'p0', quote }] });
let directory: string;
let infer: ReturnType<typeof vi.fn>;
let fetch: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cite-claims-test-'));
  await writeFile(join(directory, 'essay.txt'), document);
  await writeFile(join(directory, 'source.txt'), source);
  infer = vi.fn(async () => response());
  vi.mocked(createLocalRunner).mockResolvedValue({ name: 'local-test.gguf', infer });
  fetch = vi.fn(async () => { throw new Error('Unexpected external request'); });
  setFetch(fetch);
});
afterEach(async () => { expect(fetch).not.toHaveBeenCalled(); setFetch(undefined); await rm(directory, { recursive: true, force: true }); });
const config = () => ({ runnerPath: '/local/llama-cli', modelPath: '/local/model.gguf', sources: [{ reference: 1, path: join(directory, 'source.txt') }] });
const run = () => analyzeClaimsFile(join(directory, 'essay.txt'), config(), options);

describe('on-device claim checking', () => {
  it('forces offline references and checks quotes against local source offsets', async () => {
    const result = await run();
    expect(result.offline).toBe(true);
    expect(result.references.verifications[0].status).toBe('format_only');
    expect(result.claims?.findings).toHaveLength(1);
    const finding = result.claims!.findings[0];
    expect(finding.status).toBe('supported');
    expect(finding.evidence[0]).toMatchObject({ quote: source, start: 0, end: source.length });
    expect(finding.source?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(infer).toHaveBeenCalledOnce();
  });

  it('keeps the request boundary blocked even inside the inference callback', async () => {
    infer.mockImplementation(async () => {
      await expect(httpFetch('https://example.org/leak')).rejects.toThrow(/disabled/);
      return response();
    });
    await run();
  });

  it('refuses invented evidence rather than returning a confident verdict', async () => {
    infer.mockResolvedValue(response('The researchers proved a twenty percent improvement.'));
    expect((await run()).claims?.findings[0]).toMatchObject({ status: 'unavailable', evidence: [] });
  });
  it('does not accept a supported verdict without any quoted evidence', async () => {
    infer.mockResolvedValue(JSON.stringify({ status: 'supported', reason: 'Trust me.', evidence: [] }));
    expect((await run()).claims?.findings[0].status).toBe('unavailable');
  });

  it('keeps unmapped sources as insufficient evidence without calling the model', async () => {
    const result = await analyzeClaimsFile(join(directory, 'essay.txt'), { ...config(), sources: [] }, options);
    expect(result.claims?.findings[0].status).toBe('insufficient_evidence');
    expect(infer).not.toHaveBeenCalled();
    expect(reviewCount(result)).toBeGreaterThan(0);
  });

  it('reports missing files and retrieval misses separately', async () => {
    await rm(join(directory, 'source.txt'));
    expect((await run()).claims?.findings[0].status).toBe('unavailable');
    await writeFile(join(directory, 'source.txt'), 'Volcanoes erupt when magma rises.');
    expect((await run()).claims?.findings[0].status).toBe('insufficient_evidence');
    expect(infer).not.toHaveBeenCalled();
  });

  it('rejects stale source mappings and changed submissions before inference', async () => {
    await expect(analyzeClaimsFile(join(directory, 'essay.txt'), { ...config(), expectedDocumentHash: '0'.repeat(64) }, options)).rejects.toThrow(/submission changed/);
    await expect(analyzeClaimsFile(join(directory, 'essay.txt'), { ...config(), sources: [{ ...config().sources[0], referenceText: 'Old citation' }] }, options)).rejects.toThrow(/no longer matches/);
    expect(infer).not.toHaveBeenCalled();
  });

  it('splits grouped citations without assigning both claims to the first source', async () => {
    const text = document.replace('(Smith, 2020)', '(Smith, 2020; Jones, 2021)') + '\n\nJones, A. (2021). Further learning. Journal, 2, 11-20.';
    const result = await analyzeDocument(new TextEncoder().encode(text), 'essay.txt', { ...options, offline: true });
    expect(extractClaims(result).map((finding) => finding.referenceIndex)).toEqual([0, 1]);
  });

  it('does not assume footnote numbers identify bibliography rows', async () => {
    const result = await analyzeDocument(new TextEncoder().encode(document), 'essay.txt', { ...options, offline: true });
    result.references.inTextCitations = [{ raw: '[1]', position: 20, authors: [], year: null }];
    expect(extractClaims(result)[0].referenceIndex).toBeUndefined();
  });

  it('preserves PDF page numbers without trusting the model to supply them', () => {
    const passages = sourcePassages({ text: 'First page\n' + source, fileName: 'source.pdf', fileType: 'pdf', pages: [{ page: 1, text: 'First page' }, { page: 2, text: source }] });
    const result = validateClaimResponse(JSON.stringify({ status: 'contradicted', reason: 'Opposing evidence', evidence: [{ passageId: 'p1', quote: source, page: 999 }] }), passages);
    expect(result.evidence[0].page).toBe(2);
  });

  it('persists evidence but excludes full submission text and model paths', async () => {
    const result = await run();
    const session = makeReviewSession([{ path: join(directory, 'essay.txt'), status: 'complete', result }], { ...options, offline: true });
    const saved = parseReviewSession(JSON.parse(JSON.stringify(session)));
    expect(saved.files[0].result?.extractedText).toBe('');
    expect(saved.files[0].result?.claims).toEqual(result.claims);
    expect(JSON.stringify(session)).not.toContain(config().modelPath);
    const unsupported = JSON.parse(JSON.stringify(session));
    unsupported.files[0].result.claims.findings[0].evidence = [];
    expect(() => parseReviewSession(unsupported)).toThrow(/invalid/);
    const bad = JSON.parse(JSON.stringify(session));
    bad.files[0].result.claims.findings[0].evidence[0].end = -1;
    expect(() => parseReviewSession(bad)).toThrow(/invalid/);
  });

  it('uses manifest-relative source paths and rejects remote paths or duplicate bindings', async () => {
    const path = join(directory, 'sources.json');
    await writeFile(path, JSON.stringify({ version: 1, sources: [{ reference: 1, path: 'source.txt' }] }));
    expect((await readClaimSources(path))[0].path).toBe(join(directory, 'source.txt'));
    await writeFile(path, JSON.stringify({ version: 1, sources: [{ reference: 1, path: 'https://example.org/source.pdf' }] }));
    await expect(readClaimSources(path)).rejects.toThrow(/local file paths/);
    await writeFile(path, JSON.stringify({ version: 1, sources: [config().sources[0], config().sources[0]] }));
    await expect(readClaimSources(path)).rejects.toThrow(/unique/);
  });

  it('keeps nested local-only request guards active until the outer run finishes', async () => {
    await withoutExternalRequests(async () => {
      await withoutExternalRequests(async () => undefined);
      await expect(httpFetch('https://example.org/test')).rejects.toThrow(/disabled/);
    });
    setFetch(async () => new Response('ok'));
    expect(await (await httpFetch('https://example.org/test')).text()).toBe('ok');
  });
});
