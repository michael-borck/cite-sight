import { readFile } from 'node:fs/promises';
import { extname, basename } from 'node:path';

import type { ExtractedDocument } from '../types.js';
import { extractPdf } from './pdf.js';
import { extractDocx } from './docx.js';
import { extractText, TEXT_EXTENSIONS } from './text.js';

// Re-export individual extractors so consumers can call them directly with a
// Buffer when they have already loaded the file themselves (e.g. from an IPC
// drag-and-drop payload in Electron).
export { extractPdf } from './pdf.js';
export { extractDocx } from './docx.js';
export { extractText, TEXT_EXTENSIONS } from './text.js';

/**
 * Read a file from disk and extract its text content.
 *
 * The file type is determined solely from the file extension; the caller is
 * responsible for ensuring the file exists and is readable.
 *
 * Supported extensions:
 *   .pdf  — PDF documents (pdfjs-dist, Node.js context)
 *   .docx — Word documents (mammoth)
 *   .txt  — Plain text
 *   .md   — Markdown
 *   .json — JSON
 *
 * @param filePath Absolute (or resolvable) path to the file on disk.
 * @returns A resolved `ExtractedDocument` containing the extracted text and
 *          metadata derived from the file.
 * @throws  `Error` if the file extension is not supported.
 */
export async function extract(filePath: string): Promise<ExtractedDocument> {
  const ext = extname(filePath).toLowerCase();
  const fileName = basename(filePath);

  const buffer = await readFile(filePath);

  if (ext === '.pdf') {
    return extractPdf(buffer, fileName);
  }

  if (ext === '.docx') {
    return extractDocx(buffer, fileName);
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    // Trim the leading dot so the stored fileType is e.g. "txt", "md", "json".
    return extractText(buffer, fileName, ext.slice(1));
  }

  throw new Error(
    `Unsupported file type "${ext}" for file "${fileName}". ` +
      `Supported types: .pdf, .docx, .txt, .md, .json`,
  );
}
