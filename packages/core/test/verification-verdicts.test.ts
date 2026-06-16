import { describe, it, expect, vi } from 'vitest';
import type { AcademicWork, ParsedReference } from '../src/types.js';

// A small fake "academic database": what the live APIs would contain. The
// mocks below return candidates from here, and the verifier does its own
// matching/scoring on top — so this exercises the real decision logic.
const DB: Record<string, AcademicWork> = {
  aiayn: {
    title: 'Attention Is All You Need',
    authors: ['Vaswani, Ashish', 'Shazeer, Noam'],
    year: 2017,
    source: 'crossref',
  },
  bert: {
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    authors: ['Devlin, Jacob'],
    year: 2019,
    doi: '10.18653/v1/N19-1423',
    source: 'crossref',
  },
  // A real but UNRELATED paper that a fabricated "quantum-resistant transformer"
  // reference will partially word-overlap with.
  qrauth: {
    title: 'Quantum-Resistant Authentication and Key Exchange Protocols',
    authors: ['Nguyen, Tran'],
    year: 2019,
    source: 'crossref',
  },
  // A real but UNRELATED paper a fabricated "moral reasoning in LLMs" reference
  // will partially overlap with.
  moral: {
    title: 'Moral Reasoning and Synthetic Judgment in Large Language Models',
    authors: ['Park, Soo'],
    year: 2024,
    source: 'crossref',
  },
  // A real work that Crossref will "fail" on (simulated rate-limit) but that
  // Semantic Scholar still returns — to prove a later success overrides an
  // earlier failure.
  fallback: {
    title: 'Crossreffail but findable via fallback',
    authors: ['Adeyemi, K.'],
    year: 2020,
    source: 'semantic_scholar',
  },
};

function crossrefFor(query: string): AcademicWork[] {
  const q = query.toLowerCase();
  if (q.includes('attention')) return [DB.aiayn];
  if (q.includes('quantum')) return [DB.qrauth];
  if (q.includes('moral reasoning')) return [DB.moral];
  if (q.includes('bert')) return [DB.bert];
  return [];
}

vi.mock('../src/references/crossref.js', async () => {
  const { LookupError } = await import('../src/references/lookupError.js');
  return {
    // The "crossreffail" sentinel simulates Crossref being rate-limited.
    searchCrossref: vi.fn(async (query: string) => {
      if (query.toLowerCase().includes('crossreffail')) {
        throw new LookupError('crossref', 'rate_limited');
      }
      return crossrefFor(query);
    }),
  };
});
vi.mock('../src/references/semanticScholar.js', async () => {
  const { LookupError } = await import('../src/references/lookupError.js');
  return {
    // "ratelimited" simulates Semantic Scholar's keyless pool throttling us;
    // "crossreffail" lets S2 supply the match Crossref could not. Otherwise no
    // results.
    searchSemanticScholar: vi.fn(async (query: string) => {
      const q = query.toLowerCase();
      if (q.includes('ratelimited')) {
        throw new LookupError('semantic_scholar', 'rate_limited');
      }
      if (q.includes('crossreffail')) return [DB.fallback];
      return [];
    }),
  };
});
vi.mock('../src/references/openAlex.js', () => ({
  searchOpenAlex: vi.fn(async () => []),
}));
vi.mock('../src/references/doiResolver.js', () => ({
  resolveDoi: vi.fn(async (doi: string) => {
    if (doi === DB.bert.doi) return DB.bert; // real DOI, full metadata
    if (doi === 'doi-no-metadata') {
      return { title: '', authors: [], year: null, doi, url: 'https://doi.org/x', source: 'crossref' };
    }
    return null; // fabricated DOIs don't resolve
  }),
}));
vi.mock('../src/references/urlChecker.js', () => ({
  checkUrl: vi.fn(async () => ({ url: '', status: 'no_url' })),
}));
vi.mock('../src/references/webSourceVerifier.js', () => ({
  verifyWebSource: vi.fn(async () => null),
}));

// Import AFTER mocks are registered.
const { verifyReferences } = await import('../src/references/verifier.js');

const ref = (o: Partial<ParsedReference>): ParsedReference => ({
  raw: o.raw ?? '',
  authors: o.authors ?? [],
  title: o.title ?? '',
  year: o.year ?? null,
  doi: o.doi,
  url: o.url,
  detectedStyle: 'apa',
  ...o,
});

const opts = { mailto: 'test@example.com', citationStyle: 'apa' as const };
const run = (r: ParsedReference) => verifyReferences([r], opts).then((v) => v[0]);

describe('verification verdicts — real references pass', () => {
  it('verifies a real paper matched by title+author (no DOI)', async () => {
    const v = await run(ref({ authors: ['Vaswani'], title: 'Attention is all you need', year: 2017 }));
    expect(v.status).toBe('verified');
    expect(v.matchedWork?.title).toBe('Attention Is All You Need');
  });

  it('verifies a real paper whose DOI resolves with matching metadata', async () => {
    const v = await run(ref({
      authors: ['Devlin'],
      title: 'BERT: Pre-training of deep bidirectional transformers for language understanding',
      year: 2019,
      doi: '10.18653/v1/N19-1423',
    }));
    expect(v.status).toBe('verified');
  });

  it('does NOT over-trust a DOI that resolves without metadata', async () => {
    const v = await run(ref({
      authors: ['Someone'], title: 'A genuine but unconfirmable work', year: 2020, doi: 'doi-no-metadata',
    }));
    // The DOI is registered, but we could not confirm the title — must not be
    // 'verified', and confidence must be below the old hard-coded 0.85.
    expect(v.status).not.toBe('verified');
    expect(v.confidenceScore).toBeLessThan(0.85);
    expect(v.flags).toContain('doi_unconfirmed');
  });
});

describe('verification verdicts — fabricated references are caught', () => {
  it('flags a fabricated paper that word-overlaps an unrelated real paper', async () => {
    const v = await run(ref({
      authors: ['Henderson'],
      title: 'Transformer architectures for quantum-resistant cryptographic key exchange',
      year: 2021,
    }));
    expect(v.status).toBe('suspicious');
    expect(v.matchedWork?.title).toContain('Quantum-Resistant'); // matched the wrong paper
  });

  it('flags a fabricated paper with an unresolvable DOI', async () => {
    const v = await run(ref({
      authors: ['Okonkwo'],
      title: 'Self-supervised learning of moral reasoning in large language models',
      year: 2023,
      doi: '10.1145/3999999.4000001',
    }));
    expect(v.status).toBe('suspicious');
  });

  it('flags the real-author / fake-title hallucination pattern', async () => {
    const v = await run(ref({
      authors: ['Vaswani'],
      title: 'Attention is not all you need: a critical re-examination of self-attention in low-resource settings',
      year: 2017,
    }));
    // Author + year corroborate, but the claimed title does not match the real
    // work — this must NOT pass as valid.
    expect(v.status).toBe('suspicious');
  });

  it('flags a real DOI grafted onto a mismatched citation', async () => {
    const v = await run(ref({
      authors: ['Okonkwo'],
      title: 'Self-supervised learning of moral reasoning in large language models',
      year: 2023,
      doi: '10.18653/v1/N19-1423', // BERT's real DOI on an unrelated claim
    }));
    expect(v.status).toBe('suspicious');
    expect(v.flags).toContain('doi_title_mismatch');
  });
});

describe('verification verdicts — nothing matches', () => {
  it('returns not_found when no database has the work', async () => {
    const v = await run(ref({ authors: ['Zzyzx'], title: 'An entirely unindexed treatise on nothing', year: 2010 }));
    expect(v.status).toBe('not_found');
  });
});

describe('verification verdicts — lookup unavailable', () => {
  it('reports unverified with the rate-limit reason rather than not_found', async () => {
    // Crossref and OpenAlex return nothing; Semantic Scholar 429s. The work may
    // well exist — we just could not check — so it must NOT be "not found".
    const v = await run(ref({
      authors: ['Mensah'],
      title: 'A ratelimited study that no service could confirm',
      year: 2022,
    }));
    expect(v.status).toBe('unverified');
    expect(v.unavailable).toEqual({ service: 'semantic_scholar', reason: 'rate_limited' });
    expect(v.flags).toContain('verification_unavailable');
    expect(v.flags).toContain('rate_limited:semantic_scholar');
  });

  it('stays verified — no unavailable leak — when one service fails but another matches', async () => {
    // Crossref is rate-limited, but Semantic Scholar returns the work. One
    // method succeeding means the reference is verified; the earlier failure
    // must not surface as `unavailable`.
    const v = await run(ref({
      authors: ['Adeyemi'],
      title: 'Crossreffail but findable via fallback',
      year: 2020,
    }));
    expect(v.status).toBe('verified');
    expect(v.unavailable).toBeUndefined();
    expect(v.flags).not.toContain('verification_unavailable');
  });
});
