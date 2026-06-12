import mammoth from 'mammoth';
import type { ExtractedDocument } from '../types.js';
import { assertInputSize, clampText } from './limits.js';

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
  // A DOCX is a zip; this bounds the *compressed* input. (Note: mammoth/jszip
  // decompress in memory, so a high-ratio zip bomb can still expand beyond this
  // during parsing — the upload-size limit on the server is the primary guard;
  // here we cap the input and the extracted text.)
  assertInputSize(buffer.byteLength, fileName);

  // mammoth accepts an `{ buffer }` option directly; no temporary file needed.
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: clampText(result.value),
    fileName,
    fileType: 'docx',
    // DOCX files do not have a reliable concept of pages at the plain-text
    // extraction level, so pageCount is intentionally omitted.
  };
}
