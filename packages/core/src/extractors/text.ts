import type { ExtractedDocument } from '../types.js';
import { assertInputSize, clampText } from './limits.js';

/** File extensions that this extractor handles. */
export const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.qmd', '.json']);

/**
 * Decode a plain-text, Markdown, or JSON file from its raw bytes.
 *
 * No transformation is applied — the raw UTF-8 string is returned as-is so
 * downstream analysers receive the original content. (TextDecoder strips a
 * leading byte-order mark, which `Buffer.toString('utf-8')` used to leave in
 * place; a stray U+FEFF would otherwise show up at the head of the text.)
 */
export function extractText(
  bytes: Uint8Array,
  fileName: string,
  fileType: string,
): ExtractedDocument {
  assertInputSize(bytes.byteLength, fileName);
  return {
    text: clampText(new TextDecoder('utf-8').decode(bytes)),
    fileName,
    fileType,
    // Plain-text formats have no inherent page structure.
  };
}
