import { resolve, join, extname } from 'node:path';
import { readdirSync, statSync, globSync } from 'node:fs';

// Path-argument expansion (files, directories, globs). Kept out of index.ts so
// it can be unit-tested without the CLI parsing argv on import.

// Extensions collected when a directory or glob expands to a tree. Matches the
// desktop app's set. Explicitly-named files bypass this filter — if you name a
// file, we attempt it and let extraction report an unsupported type.
export const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

/** True if a path string looks like a glob pattern rather than a literal path. */
export function looksLikeGlob(p: string): boolean {
  return /[*?[\]{}]/.test(p);
}

/** Recursively collect supported documents from a directory. */
export function collectDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Skip dotfiles/dot-dirs so recursion doesn't wander into .git, node_modules
    // shadows, macOS ._ sidecars, etc.
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDir(full));
    } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Expand the raw CLI path arguments into a concrete, de-duplicated, sorted list
 * of files to analyse.
 *
 * Each argument is resolved independently:
 *   - a glob pattern (contains * ? [ ] { }) → matched with node:fs globSync;
 *     matched files are kept, matched directories are recursed into
 *   - a directory → recursed, keeping only supported extensions
 *   - anything else → taken literally (so an explicitly-named file of any
 *     extension, or a missing path, reaches extraction and reports there)
 */
export function collectInputs(paths: string[]): string[] {
  const out: string[] = [];

  for (const raw of paths) {
    if (looksLikeGlob(raw)) {
      // globSync yields paths relative to cwd; resolve each and classify.
      for (const match of globSync(raw)) {
        const abs = resolve(match);
        let isDir = false;
        try {
          isDir = statSync(abs).isDirectory();
        } catch {
          continue; // vanished between glob and stat — ignore
        }
        if (isDir) out.push(...collectDir(abs));
        else out.push(abs);
      }
      continue;
    }

    const abs = resolve(raw);
    let isDir = false;
    try {
      isDir = statSync(abs).isDirectory();
    } catch {
      out.push(abs); // missing/unstattable — let extraction produce the error
      continue;
    }
    if (isDir) out.push(...collectDir(abs));
    else out.push(abs);
  }

  return [...new Set(out)].sort();
}
