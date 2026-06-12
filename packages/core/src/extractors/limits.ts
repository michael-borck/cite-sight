/**
 * Resource limits for ingesting untrusted documents.
 *
 * Uploaded files are adversarial input: a "zip bomb" DOCX or a PDF with a vast
 * page count can exhaust memory/CPU, and unbounded extracted text flows into
 * every downstream analyser (readability, word frequency, reference regexes).
 * These caps bound that blast radius. They are deliberately generous — far
 * above any genuine paper — so legitimate documents are never truncated in
 * practice; when a cap does bite, we truncate rather than fail.
 */

/** Max raw bytes we will hand to a parser (compressed, for DOCX). */
export const MAX_INPUT_BYTES = 50 * 1024 * 1024; // 50 MB

/** Max characters of extracted text retained for analysis. */
export const MAX_TEXT_CHARS = 8 * 1024 * 1024; // ~8M chars (a 2000-page book is ~5M)

/** Max PDF pages we will walk. */
export const MAX_PDF_PAGES = 3000;

/** Reject an input buffer that is implausibly large before parsing it. */
export function assertInputSize(byteLength: number, fileName: string): void {
  if (byteLength > MAX_INPUT_BYTES) {
    throw new Error(
      `File "${fileName}" is too large to process ` +
        `(${Math.round(byteLength / 1024 / 1024)} MB > ${MAX_INPUT_BYTES / 1024 / 1024} MB limit).`,
    );
  }
}

/** Clamp extracted text to a safe length (truncating, not failing). */
export function clampText(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}
