import type { ExtractedDocument } from '../types.js';
import { extractPdf } from './pdf.js';
import { extractDocx } from './docx.js';
import { extractText, TEXT_EXTENSIONS } from './text.js';

/**
 * Derive the lower-cased extension (including the dot) from a file name.
 *
 * Deliberately does not use `node:path` — this module is the browser-safe half
 * of extraction, and importing node:path here would pull it into every bundle
 * that touches an extractor. Callers pass a bare file name, not a path.
 */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

/**
 * Extract text from a document already loaded into memory.
 *
 * This is the platform-neutral entry point: it runs unchanged in Node, in a
 * browser, and in a webview. `extract()` in ./fromFile.js is the Node-only
 * convenience wrapper that reads the bytes off disk first.
 *
 * The file type is determined solely from the file name's extension.
 *
 * Supported extensions:
 *   .pdf  — PDF documents (pdfjs-dist)
 *   .docx — Word documents (mammoth)
 *   .txt  — Plain text
 *   .md   — Markdown
 *   .qmd  — Quarto markdown (verifies only if the file contains a rendered
 *           reference list; citekey-only sources have nothing to check)
 *   .json — JSON
 *
 * @param bytes    The document's raw bytes.
 * @param fileName File name (not a path) used for type detection and metadata.
 * @throws `Error` if the file extension is not supported.
 */
export async function extractFromBytes(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractedDocument> {
  const ext = extensionOf(fileName);

  if (ext === '.pdf') {
    return extractPdf(bytes, fileName);
  }

  if (ext === '.docx') {
    return extractDocx(bytes, fileName);
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    // Trim the leading dot so the stored fileType is e.g. "txt", "md", "json".
    return extractText(bytes, fileName, ext.slice(1));
  }

  throw new Error(
    `Unsupported file type "${ext}" for file "${fileName}". ` +
      `Supported types: .pdf, .docx, .txt, .md, .qmd, .json`,
  );
}
