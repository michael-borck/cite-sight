import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { looksLikeGlob, collectInputs, SUPPORTED_EXTENSIONS } from '../src/inputs.js';

// A temp tree exercised by collectInputs:
//   root/a.md            supported
//   root/b.txt           supported
//   root/notes.xyz       unsupported ext (skipped by dir recursion)
//   root/.hidden.md      dotfile (skipped)
//   root/nested/c.pdf    supported, one level down
//   root/.git/d.md       dot-dir (skipped entirely)
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cite-sight-cli-'));
  writeFileSync(join(root, 'a.md'), '# a');
  writeFileSync(join(root, 'b.txt'), 'b');
  writeFileSync(join(root, 'notes.xyz'), 'x');
  writeFileSync(join(root, '.hidden.md'), 'h');
  mkdirSync(join(root, 'nested'));
  writeFileSync(join(root, 'nested', 'c.pdf'), '%PDF');
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, '.git', 'd.md'), 'd');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const names = (paths: string[]) => paths.map((p) => basename(p)).sort();

describe('looksLikeGlob', () => {
  it('detects glob metacharacters', () => {
    expect(looksLikeGlob('*.pdf')).toBe(true);
    expect(looksLikeGlob('essays/**/*.docx')).toBe(true);
    expect(looksLikeGlob('file[1].md')).toBe(true);
    expect(looksLikeGlob('a{b,c}.md')).toBe(true);
  });

  it('treats plain paths as non-globs', () => {
    expect(looksLikeGlob('./submissions')).toBe(false);
    expect(looksLikeGlob('/abs/path/paper.pdf')).toBe(false);
  });
});

describe('SUPPORTED_EXTENSIONS', () => {
  it('covers the four document types and nothing else', () => {
    expect([...SUPPORTED_EXTENSIONS].sort()).toEqual(['.docx', '.md', '.pdf', '.txt']);
  });
});

describe('collectInputs — directory recursion', () => {
  it('recurses, keeps supported extensions, skips dotfiles/dot-dirs and unsupported types', () => {
    expect(names(collectInputs([root]))).toEqual(['a.md', 'b.txt', 'c.pdf']);
  });

  it('returns absolute, sorted, de-duplicated paths', () => {
    const out = collectInputs([root, root]); // same dir twice
    expect(out).toEqual([...new Set(out)]); // no dupes
    expect(out).toEqual([...out].sort()); // sorted
    expect(out.every((p) => p === resolve(p))).toBe(true); // absolute
  });
});

describe('collectInputs — explicit files', () => {
  it('includes an explicitly named file of any extension', () => {
    // notes.xyz is unsupported for recursion, but naming it directly attempts it.
    expect(names(collectInputs([join(root, 'notes.xyz')]))).toEqual(['notes.xyz']);
  });

  it('passes a missing path through literally (extraction reports the error)', () => {
    const missing = join(root, 'does-not-exist.pdf');
    expect(collectInputs([missing])).toEqual([resolve(missing)]);
  });

  it('merges and de-duplicates across multiple arguments', () => {
    const out = collectInputs([join(root, 'a.md'), root]); // a.md named + found via dir
    expect(names(out)).toEqual(['a.md', 'b.txt', 'c.pdf']); // a.md appears once
  });
});

describe('collectInputs — globs', () => {
  it('expands a recursive glob, keeping only matches', () => {
    const cwd = process.cwd();
    try {
      process.chdir(root);
      expect(names(collectInputs(['**/*.md']))).toEqual(['a.md']); // .hidden.md and .git/d.md excluded by glob's dotfile rules
      expect(names(collectInputs(['**/*.pdf']))).toEqual(['c.pdf']);
    } finally {
      process.chdir(cwd);
    }
  });

  it('yields nothing for a glob that matches no files', () => {
    const cwd = process.cwd();
    try {
      process.chdir(root);
      expect(collectInputs(['**/*.rtf'])).toEqual([]);
    } finally {
      process.chdir(cwd);
    }
  });
});
