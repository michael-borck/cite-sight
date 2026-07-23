// Extraction barrel — deliberately platform-neutral.
//
// Nothing reachable from here may import node:* . This module is pulled in by
// every consumer that touches an extractor, so a single `node:fs` import makes
// core unbundleable for the browser and for a webview: the bundler externalises
// the module and then fails on its missing named exports. Tree-shaking does not
// rescue it, because the re-exports below sit in the same module.
//
// The Node-only convenience wrapper lives next door, in ./fromFile.js.
export { extractPdf, setPdfWorkerSrc } from './pdf.js';
export { extractDocx } from './docx.js';
export { extractText, TEXT_EXTENSIONS } from './text.js';
export { extractFromBytes } from './fromBytes.js';
