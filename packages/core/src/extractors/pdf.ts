import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ExtractedDocument } from '../types.js';
import { assertInputSize, clampText, MAX_PDF_PAGES, MAX_TEXT_CHARS } from './limits.js';

/**
 * Point pdfjs at the worker script.
 *
 * Bundled hosts (browser, webview) must call this with a URL their bundler
 * emitted — e.g. in Vite:
 *
 *   import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
 *   setPdfWorkerSrc(workerUrl);
 */
export function setPdfWorkerSrc(src: string): void {
  GlobalWorkerOptions.workerSrc = src;
}

// Point workerSrc at the bundled worker file so pdfjs-dist doesn't throw
// "No GlobalWorkerOptions.workerSrc specified". In Node the worker won't
// actually be spawned, but the path must resolve for the check to pass.
// import.meta.resolve returns a file:// URL which is what the ESM loader
// expects. Do NOT convert to a native path — on Windows, a bare "C:\..."
// path is rejected by the ESM loader as an invalid URL scheme.
//
// Outside Node this THROWS at module-evaluation time: a browser or webview
// cannot resolve a bare specifier without an import map, so the whole module
// (and everything importing it) would fail to load. Guard it, and leave those
// hosts to call setPdfWorkerSrc() themselves.
try {
  GlobalWorkerOptions.workerSrc = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
} catch {
  /* bundled host — setPdfWorkerSrc() supplies the URL instead */
}

/**
 * pdfjs splits long DOIs across text items at arbitrary glyph runs, leaving
 * spaces inside the address ("https://doi.org/1 0.1186/s40561 - 023 - ...").
 * Rejoin the fragments: after "doi.org/", keep swallowing tokens while they
 * look like DOI fragments (digits/dots/hyphens/slashes/letters and carrying a
 * digit, or a bare hyphen) so the first real word after the DOI ends the
 * repair. Exported for unit tests.
 */
export function repairSplitDois(text: string): string {
  return text.replace(
    /(https?:\/\/doi\.org\/)([\w.\-/]+)((?:\s+[\w.\-/]+)+)/g,
    (_all, prefix: string, head: string, tail: string) => {
      const frags = tail.trim().split(/\s+/);
      const kept: string[] = [];
      for (const frag of frags) {
        if (frag === '-' || /\d/.test(frag)) kept.push(frag);
        else break;
      }
      const rest = frags.slice(kept.length).join(' ');
      return prefix + head + kept.join('') + (rest ? ` ${rest}` : '');
    },
  );
}

/**
 * Extract all text from a PDF file supplied as raw bytes.
 *
 * Pages are joined with a single newline character. Within each page, text
 * items are joined with a space so that word-wrapped lines are readable.
 */
export async function extractPdf(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractedDocument> {
  assertInputSize(bytes.byteLength, fileName);

  // pdfjs-dist expects a Uint8Array (or similar TypedArray). Copy rather than
  // pass through: pdfjs transfers ownership of the buffer it is given, which
  // would detach a caller's array.
  const data = new Uint8Array(bytes);

  const loadingTask = getDocument({
    data,
    // Suppress the "Setting up fake worker" console warning that pdfjs-dist
    // emits when no worker is configured.
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  // Bound the page walk: a crafted PDF can declare a vast page count to exhaust
  // CPU/memory in this loop.
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pageTexts: string[] = [];
  let charCount = 0;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    // Each item in `items` may be a TextItem (has a `str` property) or a
    // TextMarkedContent marker (no `str`).  We filter to TextItem only.
    const pageText = textContent.items
      .filter((item): item is (typeof item & { str: string }) => 'str' in item)
      .map((item) => item.str)
      .join(' ')
      .replace(/ {2,}/g, ' ')  // collapse runs of spaces left by kerning data
      .trim();

    pageTexts.push(pageText);
    // Stop early once we have more text than analysis will keep — avoids
    // building a multi-GB string from a text-bomb PDF.
    charCount += pageText.length + 1;
    if (charCount > MAX_TEXT_CHARS) break;
  }

  return {
    text: clampText(repairSplitDois(pageTexts.join('\n'))),
    fileName,
    fileType: 'pdf',
    pageCount: pdf.numPages,
  };
}
