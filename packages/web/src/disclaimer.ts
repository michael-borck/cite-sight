// ============================================================
// CiteSight Web — accuracy disclaimer
// Mirrored from @michaelborck/cite-sight-core (src/disclaimer.ts) because the
// Node core package cannot be imported in the browser. Keep the wording in
// sync with core so the message is identical across CLI, desktop, and web.
// ============================================================

export const DISCLAIMER =
  'CiteSight helps you find citations worth a second look — it does not certify them. ' +
  'Its checks rely on third-party databases (Crossref, OpenAlex, Semantic Scholar, and others) ' +
  'that can be slow, rate-limited, temporarily unavailable, or simply missing a record, so ' +
  'results can vary between runs. Read “verified” as “looks consistent”, not “guaranteed genuine”, ' +
  'and “not found” as “could not be confirmed”, not “proven fake”. Always check anything that ' +
  'matters against the original source — the final academic judgement is yours, not the tool’s.';

export const DISCLAIMER_SHORT =
  'Automated checks rely on third-party databases that can be unavailable, rate-limited, or ' +
  'incomplete, so results are a guide, not a guarantee — always verify anything important against the original source.';
