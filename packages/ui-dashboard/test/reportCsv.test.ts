import { describe, expect, it } from 'vitest';
import { buildCsv, csvEscape } from '../src/reportCsv';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';

function result(raw: string, fileName = 'essay.pdf'): AnalysisResult {
  return {
    fileName,
    references: {
      totalReferences: 1,
      verifications: [{
        status: 'not_found',
        reference: { raw, title: '', authors: ['Smith, J.'], year: 2020 },
        flags: [],
        formatIssues: [],
        confidenceScore: 0.42,
      }],
    },
  } as unknown as AnalysisResult;
}

describe('csvEscape', () => {
  // A citation is student-controlled text. Excel, Numbers, LibreOffice and
  // Sheets all evaluate a cell starting with =, +, - or @ as a formula, so an
  // unescaped value executes when a marker opens the export. The standalone
  // build shipped with no guard at all on any column.
  it.each(['=1+1', '+1', '-1+1', '@SUM(A1)', '  =cmd'])('neutralises a leading formula character in %s', (value) => {
    expect(csvEscape(value).startsWith("'")).toBe(true);
  });

  it('neutralises a formula hidden behind leading whitespace', () => {
    // Spreadsheets trim whitespace before evaluating, so " =1+1" is a formula
    // too — the guard has to test the trimmed value, not just the first char.
    // Safe means the apostrophe lands before any formula character: either
    // directly at the front, or after an opening quote (which a newline forces).
    for (const value of ['\t=1+1', '\r=1+1', '\n=1+1', '   =cmd']) {
      const out = csvEscape(value);
      const formulaAt = out.search(/[=+\-@]/);
      expect(formulaAt === -1 || out.indexOf("'") < formulaAt, `${JSON.stringify(value)} -> ${JSON.stringify(out)}`).toBe(true);
    }
  });

  it('quotes embedded commas, quotes and newlines', () => {
    expect(csvEscape('Smith, J. (2020). A study.')).toBe('"Smith, J. (2020). A study."');
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
    // A newline must be inside the quotes, or the row splits in the spreadsheet.
    expect(csvEscape('line one\nline two').startsWith('"')).toBe(true);
  });

  it('leaves ordinary text unquoted and unmodified', () => {
    expect(csvEscape('Smith J 2020')).toBe('Smith J 2020');
    expect(csvEscape('10.1016/j.learn.2020.01.001')).toBe('10.1016/j.learn.2020.01.001');
  });
});

describe('buildCsv', () => {
  // The citation as the student wrote it is the only column they control, so it
// is both the injection risk and the one column that must always be present.
it('guards the citation text, not just the metadata columns', () => {
    const csv = buildCsv([result('=HYPERLINK("http://evil","click")')]);
    expect(csv).toContain("'=HYPERLINK");
  });

  it('exports the citation even when the title could not be parsed', () => {
    const csv = buildCsv([result('Smith, J. (2020). A study of learning.')]);
    expect(csv).toContain('Citation');
    expect(csv).toContain('Smith, J. (2020). A study of learning.');
  });

  it('uses the canonical status wording', () => {
    expect(buildCsv([result('Smith, J. (2020). A study.')])).toContain('Not Found');
  });

  it('includes review columns and the disclaimer', () => {
    const csv = buildCsv([result('Smith, J. (2020). A study.')]);
    expect(csv).toContain('Review decision');
    expect(csv).toContain('Dismissed');
    expect(csv).toMatch(/# Disclaimer:/);
  });

  it('omits the File column for a single file and includes it for a batch', () => {
    const single = buildCsv([result('Smith, J. (2020). A study.')]);
    expect(single.split('\r\n')[4].startsWith('File,')).toBe(false);
    expect(single.split('\r\n')[4].startsWith('Ref,')).toBe(true);

    const batch = buildCsv([result('Smith, J. (2020). A study.', 'a.pdf'), result('Jones, A. (2021). Book.', 'b.pdf')]);
    expect(batch).toContain('File,Ref,Citation,Title');
    expect(batch).toContain('a.pdf');
    expect(batch).toContain('b.pdf');
  });
});