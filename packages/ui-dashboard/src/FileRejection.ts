// Shared file-rejection copy for the desktop and standalone dropzones.
//
// Both used to print react-dropzone's messages verbatim — "File is larger than
// 52428800 bytes" and a raw MIME/extension list. The web app already translated
// these into sentences, so the same mistake read differently per surface. The
// wording lives here so all three say the same thing.

export interface RejectionLimits {
  /** Largest accepted upload, in bytes. */
  maxBytes: number;
  /** Human-readable supported extensions, e.g. 'PDF, DOCX, TXT, MD'. */
  extensions: string;
}

/**
 * One sentence per rejection reason. Unknown codes fall back to the library
 * message rather than showing nothing, so a new rejection type is never silent.
 */
export function describeRejection(code: string, message: string, limits: RejectionLimits): string {
  const mb = (limits.maxBytes / 1024 / 1024).toFixed(0);
  switch (code) {
    case 'file-too-large':
      return `This file is over the ${mb} MB limit.`;
    case 'too-many-files':
      return 'Choose one document at a time.';
    case 'file-invalid-type':
      return `Choose a ${limits.extensions} file.`;
    case 'file-too-many-files':
      return 'Choose one document at a time.';
    default:
      return message;
  }
}