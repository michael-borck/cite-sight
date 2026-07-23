import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const SRC = resolve(import.meta.dirname, '../src');

/**
 * Walk the static import graph from an entry module, staying inside src/.
 * Returns every first-party module reachable from the entry point.
 */
async function reachableModules(entry: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = await readFile(file, 'utf-8');
    // Matches `from '...'` in both static imports and re-exports.
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue; // third-party or node: — not ours to walk
      // Source is authored as ESM with .js specifiers pointing at .ts files.
      queue.push(resolve(dirname(file), spec.replace(/\.js$/, '.ts')));
    }
  }

  return [...seen];
}

async function nodeBuiltinImports(file: string): Promise<string[]> {
  const source = await readFile(file, 'utf-8');
  return [...source.matchAll(/\bfrom\s+['"](node:[^'"]+)['"]/g)].map((m) => m[1]);
}

describe('browser entry point', () => {
  // Regression guard. `extract()` and `analyzePipeline()` take paths and so
  // reach node:fs. They used to sit in the same modules as the byte-taking
  // extractors and the analysis pipeline, which made core impossible to bundle
  // for a browser or a webview: the bundler externalises node:fs and then fails
  // on its missing named exports. Tree-shaking does not help — a re-export in
  // the same module keeps the import alive.
  it('reaches no node: builtins', async () => {
    const modules = await reachableModules(resolve(SRC, 'browser.ts'));
    const offenders: Record<string, string[]> = {};

    for (const file of modules) {
      const builtins = await nodeBuiltinImports(file);
      if (builtins.length > 0) {
        offenders[file.slice(SRC.length + 1)] = builtins;
      }
    }

    expect(offenders).toEqual({});
  });

  it('still reaches the analysis pipeline and the extractors', async () => {
    const modules = (await reachableModules(resolve(SRC, 'browser.ts'))).map((f) =>
      f.slice(SRC.length + 1),
    );

    expect(modules).toContain('pipeline.ts');
    expect(modules).toContain('extractors/fromBytes.ts');
    expect(modules).toContain('references/verifier.ts');
  });

  it('keeps the path-taking helpers out of the browser graph', async () => {
    const modules = (await reachableModules(resolve(SRC, 'browser.ts'))).map((f) =>
      f.slice(SRC.length + 1),
    );

    expect(modules).not.toContain('extractors/fromFile.ts');
    expect(modules).not.toContain('pipelineFromFile.ts');
  });
});
