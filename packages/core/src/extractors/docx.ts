import mammoth from 'mammoth';
import type { ExtractedDocument } from '../types.js';

/**
 * Extract plain text from a DOCX file supplied as a Node.js Buffer.
 *
 * We use mammoth's `extractRawText` method rather than `convertToHtml` so the
 * result contains only the document's prose, with no markup that would need
 * stripping afterwards.
 */
export async function extractDocx(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractedDocument> {
  // mammoth accepts an `{ buffer }` option directly; no temporary file needed.
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: result.value,
    fileName,
    fileType: 'docx',
    // DOCX files do not have a reliable concept of pages at the plain-text
    // extraction level, so pageCount is intentionally omitted.
  };
}
