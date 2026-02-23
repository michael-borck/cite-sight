import type { ExtractedDocument } from '../types.js';

/** File extensions that this extractor handles. */
export const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json']);

/**
 * Decode a plain-text, Markdown, or JSON file from a Node.js Buffer.
 *
 * No transformation is applied — the raw UTF-8 string is returned as-is so
 * downstream analysers receive the original content.
 */
export function extractText(
  buffer: Buffer,
  fileName: string,
  fileType: string,
): ExtractedDocument {
  return {
    text: buffer.toString('utf-8'),
    fileName,
    fileType,
    // Plain-text formats have no inherent page structure.
  };
}
