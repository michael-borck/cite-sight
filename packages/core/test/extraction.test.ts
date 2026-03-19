import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extract, extractPdf, extractDocx } from '../src/extractors/index.js';

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
