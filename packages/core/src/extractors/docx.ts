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
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractedDocument> {
  // A DOCX is a zip; this bounds the *compressed* input. (Note: mammoth/jszip
  // decompress in memory, so a high-ratio zip bomb can still expand beyond this
  // during parsing — the upload-size limit on the server is the primary guard;
  // here we cap the input and the extracted text.)
  assertInputSize(bytes.byteLength, fileName);

  // mammoth resolves its input differently per build: the Node entry point
  // accepts { path | buffer | file } while the browser entry point accepts
  // only { arrayBuffer }. Supplying both keys lets one call site serve Node,
  // the browser, and a webview — each build reads the key it understands and
  // ignores the other. No temporary file is needed either way.
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const result = await mammoth.extractRawText({
    buffer: bytes,
    arrayBuffer,
  } as unknown as Parameters<typeof mammoth.extractRawText>[0]);

  return {
    text: clampText(result.value),
    fileName,
    fileType: 'docx',
    // DOCX files do not have a reliable concept of pages at the plain-text
    // extraction level, so pageCount is intentionally omitted.
  };
}
