import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeClaimsFile } from '../src/claims/checkClaims.js';
import { createLocalRunner } from '../src/claims/localRunner.js';
import { abstractFromInvertedIndex } from '../src/references/openAlex.js';
import { setFetch } from '../src/httpClient.js';
import type { AnalysisResult, ClaimProvenance } from '../src/types.js';

vi.mock('../src/claims/localRunner.js', async (original) => ({ ...await original<object>(), createLocalRunner: vi.fn() }));
vi.mock('../src/pipelineFromFile.js', () => ({ analyzePipeline: vi.fn() }));
import { analyzePipeline } from '../src/pipelineFromFile.js';

const provenance: ClaimProvenance = { runtimeVersion: 'b8680 (test)', runtimeSha256: 'a'.repeat(64), modelSha256: 'b'.repeat(64), platform: 'test', arch: 'test', promptVersion: 'v2', parameters: { temperature: 0, seed: 0, contextSize: 8192, maxTokens: 1024, device: 'cpu' } };
const abstract = 'In a randomised trial of 120 adults, spaced practice improved delayed recall relative to massed practice. Effect sizes were moderate. University students participated; no clinical population was studied.';
const documentText = 'Spaced practice improved delayed recall (Smith, 2020).\n\nReferences\n\nSmith, J. (2020). Spacing and recall. Journal, 1, 1-10.';

let directory: string;
let infer: ReturnType<typeof vi.fn>;
let network: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cite-abstract-'));
  infer = vi.fn();
  vi.mocked(createLocalRunner).mockResolvedValue({ name: 'model.gguf', provenance, infer });
  network = vi.fn(); setFetch(network);
  const verification = {
    reference: { raw: 'Smith, J. (2020). Spacing and recall. Journal, 1, 1-10.', title: 'Spacing and recall', authors: ['Smith, J.'], year: 2020, detectedStyle: 'apa' as const },
    status: 'verified' as const, flags: [], formatIssues: [], matchCategory: 'exact' as const, confidenceScore: 0.9,
    matchedWork: { title: 'Spacing and recall', authors: ['Smith, J.'], year: 2020, source: 'openalex' as const, abstract },
  };
  vi.mocked(analyzePipeline).mockResolvedValue({
    fileName: 'essay.txt', extractedText: documentText, processingTime: 1, inputSha256: 'c'.repeat(64), offline: true,
    references: {
      references: [verification.reference], inTextCitations: [{ raw: '(Smith, 2020)', authors: ['Smith'], year: 2020, position: documentText.indexOf('(Smith') }],
      verifications: [verification], crossReference: { unmatchedBibliography: [], unmatchedInText: [] },
      detectedStyle: 'apa', totalReferences: 1, verifiedCount: 1, suspiciousCount: 0, notFoundCount: 0, unverifiedCount: 0, brokenUrlCount: 0, sourceListLikely: false,
    },
  } as AnalysisResult);
  await writeFile(join(directory, 'essay.txt'), documentText);
});
afterEach(async () => { expect(network).not.toHaveBeenCalled(); setFetch(undefined); await rm(directory, { recursive: true, force: true }); });

describe('abstract-level claim evidence', () => {
  it('checks unmapped claims against the publisher abstract and labels the source', async () => {
    infer.mockResolvedValue(JSON.stringify({ status: 'partially_supported', reason: 'The abstract reports improved recall but not the causal framing.', evidence: [{ passageId: 'p0', quote: 'spaced practice improved delayed recall relative to massed practice' }] }));
    const result = await analyzeClaimsFile(join(directory, 'essay.txt'), { runnerPath: '/r', modelPath: '/m.gguf', sources: [] }, { citationStyle: 'apa', checkUrls: false, checkDoi: false, checkInText: true, screenshotUrls: false });
    const finding = result.claims!.findings[0];
    expect(finding.status).toBe('partially_supported');
    expect(finding.source?.fileName).toBe('Publisher abstract (openalex)');
    expect(finding.evidence[0].start).toBeLessThan(abstract.length);
    expect(result.claims!.warnings.join(' ')).toContain('publisher abstracts only');
    expect(result.extractedText).toBe('');
  });

  it('reports a retrieval miss on the abstract without inventing a contradiction', async () => {
    const unrelated = 'The tutor gave detailed feedback on presentation formatting (Smith, 2020).\n\nReferences\n\nSmith, J. (2020). Spacing and recall. Journal, 1, 1-10.';
    vi.mocked(analyzePipeline).mockResolvedValue({
      fileName: 'essay.txt', extractedText: unrelated, processingTime: 1, inputSha256: 'd'.repeat(64), offline: true,
      references: {
        references: [{ raw: 'Smith, J. (2020). Spacing and recall. Journal, 1, 1-10.', title: 'Spacing and recall', authors: ['Smith, J.'], year: 2020, detectedStyle: 'apa' as const }],
        inTextCitations: [{ raw: '(Smith, 2020)', authors: ['Smith'], year: 2020, position: unrelated.indexOf('(Smith') }],
        verifications: [{
          reference: { raw: 'Smith, J. (2020). Spacing and recall. Journal, 1, 1-10.', title: 'Spacing and recall', authors: ['Smith, J.'], year: 2020, detectedStyle: 'apa' as const },
          status: 'verified' as const, flags: [], formatIssues: [], matchCategory: 'exact' as const, confidenceScore: 0.9,
          matchedWork: { title: 'Spacing and recall', authors: ['Smith, J.'], year: 2020, source: 'openalex' as const, abstract },
        }],
        crossReference: { unmatchedBibliography: [], unmatchedInText: [] },
        detectedStyle: 'apa', totalReferences: 1, verifiedCount: 1, suspiciousCount: 0, notFoundCount: 0, unverifiedCount: 0, brokenUrlCount: 0, sourceListLikely: false,
      },
    } as AnalysisResult);
    const result = await analyzeClaimsFile(join(directory, 'essay.txt'), { runnerPath: '/r', modelPath: '/m.gguf', sources: [] }, { citationStyle: 'apa', checkUrls: false, checkDoi: false, checkInText: true, screenshotUrls: false });
    const finding = result.claims!.findings[0];
    expect(finding.status).toBe('insufficient_evidence');
    expect(finding.reason).toContain('abstract does not mention');
    expect(infer).not.toHaveBeenCalled();
  });
});

describe('abstractFromInvertedIndex', () => {
  it('rebuilds reading order from OpenAlex positions', () => {
    expect(abstractFromInvertedIndex({ recall: [3], spaced: [0], practice: [1], improved: [2] })).toBe('spaced practice improved recall');
    expect(abstractFromInvertedIndex(undefined)).toBeUndefined();
    expect(abstractFromInvertedIndex({})).toBeUndefined();
  });
});
