import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ExtractedDocument } from '../types.js';

// Disable the worker entirely — we are running in Node.js (Electron main process
// or CLI), where there is no browser Worker API and the worker is not needed.
GlobalWorkerOptions.workerSrc = '';
// @ts-expect-error — pdfjs-dist checks for a globalThis.Worker; setting it to
// undefined prevents the library from trying to spin up a worker thread.
(GlobalWorkerOptions as Record<string, unknown>).workerPort = null;

/**
 * Extract all text from a PDF file supplied as a Node.js Buffer.
 *
 * Pages are joined with a single newline character. Within each page, text
 * items are joined with a space so that word-wrapped lines are readable.
 */
export async function extractPdf(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractedDocument> {
  // pdfjs-dist expects a Uint8Array (or similar TypedArray), not a Buffer.
  // Buffer extends Uint8Array in Node.js, but we use Uint8Array explicitly to
  // keep the typing clean and avoid any future incompatibilities.
  const data = new Uint8Array(buffer);

  const loadingTask = getDocument({
    data,
    // Suppress the "Setting up fake worker" console warning that pdfjs-dist
    // emits when no worker is configured.
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pageTexts: string[] = [];

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
  }

  return {
    text: pageTexts.join('\n'),
    fileName,
    fileType: 'pdf',
    pageCount,
  };
}
