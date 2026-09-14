import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extract } from '../src/extractors/fromFile.js';
import { extractPdf, extractDocx } from '../src/extractors/index.js';
import { repairSplitDois } from '../src/extractors/pdf.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

describe('text extraction', () => {
  it('extracts text from .md file', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.md'));
    expect(doc.text).toContain('Scaffolding');
    expect(doc.text).toContain('References');
    expect(doc.text).toContain('Vygotsky');
    expect(doc.fileType).toBe('md');
  });

  it('extracts text from .txt file', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.txt'));
    expect(doc.text).toContain('Scaffolding');
    expect(doc.text).toContain('References');
    expect(doc.text).toContain('Vygotsky');
    expect(doc.fileType).toBe('txt');
  });

  it('extracts text from .docx file', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.docx'));
    expect(doc.text).toContain('Scaffolding');
    expect(doc.text).toContain('References');
    expect(doc.text).toContain('Vygotsky');
    expect(doc.fileType).toBe('docx');
  });

  it('extracts text from .pdf file', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.pdf'));
    expect(doc.text).toContain('Scaffolding');
    expect(doc.text).toContain('References');
    expect(doc.text).toContain('Vygotsky');
    expect(doc.fileType).toBe('pdf');
  });

  it('produces consistent content across all four formats', async () => {
    const md = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const txt = await extract(resolve(FIXTURES, 'sample-paper.txt'));
    const docx = await extract(resolve(FIXTURES, 'sample-paper.docx'));
    const pdf = await extract(resolve(FIXTURES, 'sample-paper.pdf'));

    // All formats should contain every author surname from the references
    const expectedAuthors = ['Borck', 'Kasneci', 'Laurillard', 'Mollick', 'Stojanov', 'Thaler', 'Vygotsky'];
    for (const doc of [md, txt, docx, pdf]) {
      for (const author of expectedAuthors) {
        expect(doc.text, `${doc.fileType} should contain "${author}"`).toContain(author);
      }
    }
  });

  it('throws on unsupported file types', async () => {
    // Write a dummy file so the error is about file type, not file existence
    const { writeFile } = await import('node:fs/promises');
    const tmpPath = resolve(FIXTURES, '_tmp_test.xlsx');
    await writeFile(tmpPath, 'dummy');
    try {
      await expect(extract(tmpPath)).rejects.toThrow('Unsupported file type');
    } finally {
      const { unlink } = await import('node:fs/promises');
      await unlink(tmpPath).catch(() => {});
    }
  });
});

describe('repairSplitDois', () => {
  it('rejoins DOIs split across PDF text items', () => {
    // EDUPIJ PDF: the DOI arrives as "https://doi.org/1 0.1186/s40561 - 023 - 00269 - 3"
    expect(
      repairSplitDois('see https://doi.org/1 0.1186/s40561 - 023 - 00269 - 3 Cong - Lem, N. (2024)'),
    ).toBe('see https://doi.org/10.1186/s40561-023-00269-3 Cong - Lem, N. (2024)');
    expect(
      repairSplitDois('doi: https://doi.org/10.1007/978 - 3 - 658 - 29297 - 3 Ennis, R. H.'),
    ).toBe('doi: https://doi.org/10.1007/978-3-658-29297-3 Ennis, R. H.');
  });

  it('leaves intact DOIs and following prose untouched', () => {
    expect(
      repairSplitDois('https://doi.org/10.1016/j.tsc.2023.101356 Next, A. (2024)'),
    ).toBe('https://doi.org/10.1016/j.tsc.2023.101356 Next, A. (2024)');
  });
});
