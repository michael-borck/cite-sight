import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import type { ExtractedDocument } from '../types.js';
import { extractFromBytes } from './fromBytes.js';

/**
 * Read a file from disk and extract its text content.
 *
 * Node-only: this is the one extraction module that touches the filesystem, so
 * it is kept out of ./index.js. Browser and webview callers load the bytes
 * themselves and use `extractFromBytes` directly.
 *
 * The file type is determined solely from the file extension; the caller is
 * responsible for ensuring the file exists and is readable.
 *
 * Supported extensions:
 *   .pdf  — PDF documents (pdfjs-dist)
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
  const bytes = await readFile(filePath);
  return extractFromBytes(bytes, basename(filePath));
}
