import { describe, expect, it, vi } from 'vitest';
import { analyzeDocument } from '../src/pipeline.js';

vi.mock('../src/references/verifier.js', () => ({ verifyReferences: vi.fn(async () => []) }));

const references = [
  'Smith, J. (2020). Study of learning. Journal, 1, 1-10.',
  'Jones, A. (2021). Study of teaching. Journal, 2, 11-20.',
  'Brown, B. (2022). Study of reading. Journal, 3, 21-30.',
];
async function run(body: string, refs = references) {
  const text = `${body}\n\nReferences\n\n${refs.join('\n\n')}`;
  return (await analyzeDocument(new TextEncoder().encode(text), 'test.txt', {
    citationStyle: 'auto', checkUrls: false, checkDoi: false, checkInText: true, screenshotUrls: false,
  })).references;
}

describe('pipeline citation matching', () => {
  it('reports a wrong year and preserves the uncited bibliography entry', async () => {
    const result = await run('A claim (Smith, 2024).', [references[0]]);
    expect(result.crossReference.unmatchedInText).toHaveLength(1);
    expect(result.crossReference.unmatchedBibliography).toHaveLength(1);
  });

  it('does not match surnames by substring', async () => {
    const result = await run('A claim (Williamson, 2020).', ['Williams, J. (2020). A study. Journal, 1, 1-10.']);
    expect(result.crossReference.unmatchedInText).toHaveLength(1);
  });

  it('suggests a near match when a hand-typed surname is misspelled', async () => {
    const result = await run('A claim (Smth, 2020).', [references[0]]);
    expect(result.crossReference.unmatchedInText).toHaveLength(0);
    expect(result.crossReference.unmatchedBibliography).toHaveLength(0);
    expect(result.crossReference.nearMatches).toHaveLength(1);
    const { cite, reference } = result.crossReference.nearMatches![0];
    expect(cite.raw).toBe('(Smth, 2020)');
    expect(reference.raw).toBe(references[0]);
  });

  it('keeps year mismatches as orphans rather than near matches', async () => {
    const result = await run('A claim (Smth, 2021).', [references[0]]);
    expect(result.crossReference.unmatchedInText).toHaveLength(1);
    expect(result.crossReference.nearMatches).toBeUndefined();
  });

  it('suggests a near match when the year is one off but the surname is exact', async () => {
    const result = await run('A claim (Wilmot and Ones, 2020).', ['Wilmot, M. (2019). A study. Journal, 1, 1-10.']);
    expect(result.crossReference.unmatchedInText).toHaveLength(0);
    expect(result.crossReference.nearMatches).toHaveLength(1);
    expect(result.crossReference.nearMatches![0].reference.year).toBe(2019);
  });

  it('suggests a near match when a non-first author is cited', async () => {
    const result = await run('A claim (Swailes and Senior, 2007).', [
      'Aritzeta, A., Swailes, S., and Senior, B. (2007). Belbin team roles. Journal, 1, 1-10.',
    ]);
    expect(result.crossReference.unmatchedInText).toHaveLength(0);
    expect(result.crossReference.unmatchedBibliography).toHaveLength(0);
    expect(result.crossReference.nearMatches).toHaveLength(1);
  });

  it('keeps two slips (surname typo and year off by one) as orphans', async () => {
    const result = await run('A claim (Smth, 2021).', [references[0]]);
    expect(result.crossReference.unmatchedInText).toHaveLength(1);
    expect(result.crossReference.nearMatches).toBeUndefined();
  });

  it('keeps distant surnames as orphans rather than near matches', async () => {
    const result = await run('A claim (Williamsen, 2020).', ['Williams, J. (2020). A study. Journal, 1, 1-10.']);
    expect(result.crossReference.unmatchedInText).toHaveLength(1);
    expect(result.crossReference.nearMatches).toBeUndefined();
  });

  it('keeps findings when every in-text citation is orphaned', async () => {
    const result = await run('A claim (Taylor, 2024).');
    expect(result.sourceListLikely).toBe(false);
    expect(result.crossReference.unmatchedInText).toHaveLength(1);
    expect(result.crossReference.unmatchedBibliography).toHaveLength(3);
  });

  it('recognises a bare source list without in-text citations', async () => {
    const result = await run('');
    expect(result.sourceListLikely).toBe(true);
    expect(result.crossReference.unmatchedBibliography).toEqual([]);
  });

  it('matches each author/year pair in grouped citations', async () => {
    const result = await run('Claims (Smith, 2020; Jones, 2021) and (Brown, 2022).');
    expect(result.inTextCitations).toHaveLength(3);
    expect(result.inTextCitations.slice(0, 2).map((cite) => cite.position)).toEqual([7, 7]);
    expect(result.crossReference).toEqual({ unmatchedBibliography: [], unmatchedInText: [] });
  });

  it('keeps different authors in a same-year citation group', async () => {
    const result = await run('Claims (Smith, 2020; Jones, 2020).', [
      references[0], 'Jones, A. (2020). Other work. Journal, 2, 11-20.',
    ]);
    expect(result.inTextCitations).toHaveLength(2);
    expect(result.crossReference).toEqual({ unmatchedBibliography: [], unmatchedInText: [] });
  });

  it('separates same-author years and same-year suffixes', async () => {
    const refs = [
      'Smith, J. (2020a). First work. Journal, 1, 1-10.',
      'Smith, J. (2020b). Second work. Journal, 2, 11-20.',
      'Smith, J. (2021). Later work. Journal, 3, 21-30.',
    ];
    const result = await run('Claims (Smith, 2020a, 2021).', refs);
    expect(result.crossReference.unmatchedInText).toEqual([]);
    expect(result.crossReference.unmatchedBibliography.map((ref) => ref.yearSuffix)).toEqual(['b']);
  });

  it('matches et al. and multi-word corporate authors', async () => {
    const result = await run('Smith et al. (2020) and Russell Group (2023) agree.', [
      references[0], 'Russell Group. (2023). A report. Publisher.',
    ]);
    expect(result.crossReference).toEqual({ unmatchedBibliography: [], unmatchedInText: [] });
  });

  it('matches a possessive narrative surname', async () => {
    const result = await run("Smith's (2020) findings agree.", [references[0]]);
    expect(result.crossReference.unmatchedInText).toEqual([]);
    expect(result.crossReference.unmatchedBibliography).toEqual([]);
  });

  it('does not treat bibliography entries as in-text citations', async () => {
    const result = await run('', ['Russell Group (2023). A report. Publisher.']);
    expect(result.inTextCitations).toEqual([]);
    expect(result.crossReference.unmatchedBibliography).toHaveLength(1);
  });
});
