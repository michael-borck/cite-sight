import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildLibraryIndex, matchLibraryEntry, scoreLibraryFile } from '../src/claims/library.js';
import { unitSourceList, claimOverlap } from '../src/claims/unitSources.js';
import type { ParsedReference } from '../src/types.js';

const ref = (over: Partial<ParsedReference>): ParsedReference => ({
  raw: `${over.authors?.[0] ?? ''} (${over.year}). ${over.title}.`,
  authors: [], year: null, title: '', detectedStyle: 'apa', ...over,
});

describe('unit source library', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cite-library-'));
    await mkdir(join(directory, 'sources'));
    await writeFile(join(directory, 'sources', 'wilmot-2019.txt'),
      'A Century of Research on Conscientiousness at Work. Wilmot and Ones conducted a meta-analysis of conscientiousness and job performance in 2019.');
    await writeFile(join(directory, 'sources', 'notes.txt'), 'Completely unrelated marker notes about volcanoes and recipes.');
    await writeFile(join(directory, 'sources', 'skip-me.docx'), 'unsupported placeholder'); // extension filtered only by name in buildLibraryIndex
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it('indexes the folder and content-matches a reference without any filename convention', async () => {
    const library = await buildLibraryIndex(join(directory, 'sources'));
    // The bogus .docx (plain text mislabelled) is skipped, not a crash.
    expect(library).toHaveLength(2);
    const reference = ref({ authors: ['Wilmot, M.'], year: 2019, title: 'A Century of Research on Conscientiousness at Work' });
    const match = matchLibraryEntry(library, reference);
    expect(match?.fileName).toBe('wilmot-2019.txt');
    expect(scoreLibraryFile(library.find((f) => f.fileName === 'notes.txt')!, reference)).toBeLessThan(6);
  });

  it('refuses near-identical different people (Williams vs Williamson)', async () => {
    const library = await buildLibraryIndex(join(directory, 'sources'));
    expect(matchLibraryEntry(library, ref({ authors: ['Williamson, T.'], year: 2019, title: 'A study of volcanoes' }))).toBeUndefined();
  });
});

describe('unitSourceList', () => {
  it('aggregates common works first and keeps unique listings', () => {
    const files = [
      { file: 'a.txt', references: [ref({ authors: ['Smith, J.'], year: 2020, title: 'Shared reading' }), ref({ authors: ['Unique, U.'], year: 2021, title: 'Only A cited this' })] },
      { file: 'b.txt', references: [ref({ authors: ['Smith, J.'], year: 2020, title: 'shared reading' })] },
      { file: 'c.txt', references: [ref({ authors: ['Smith, J.'], year: 2020, title: 'Shared  Reading' })] },
    ];
    const entries = unitSourceList(files);
    expect(entries[0]).toMatchObject({ title: 'Shared reading', count: 3 });
    expect(entries.map((e) => e.count)).toEqual([3, 1]);
    expect(entries[1].title).toContain('Only A');
  });
});

describe('claimOverlap', () => {
  it('surfaces similar claims on the same shared reference as a signal, not proof', () => {
    const files = [
      { file: 'a', claims: [{ claim: 'Practice improved delayed recall in adults', referenceKey: 'smith2020' }] },
      { file: 'b', claims: [{ claim: 'Practice improved delayed recall for adult learners', referenceKey: 'smith2020' }] },
      { file: 'c', claims: [{ claim: 'The intervention targeted working memory capacity', referenceKey: 'jones2021' }] },
    ];
    const pairs = claimOverlap(files);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ fileA: 'a', fileB: 'b' });
    expect(pairs[0].similarity).toBeGreaterThan(0.5);
  });
  it('ignores claims about different references', () => {
    const files = [
      { file: 'a', claims: [{ claim: 'Practice improved delayed recall in adults', referenceKey: 'smith2020' }] },
      { file: 'b', claims: [{ claim: 'Practice improved delayed recall in adults', referenceKey: 'jones2021' }] },
    ];
    expect(claimOverlap(files)).toHaveLength(0);
  });
});
