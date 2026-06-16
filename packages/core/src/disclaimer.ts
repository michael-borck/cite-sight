// ============================================================
// Accuracy disclaimer — shared across every interface
//
// CiteSight's checks depend on third-party databases that can be slow,
// rate-limited, temporarily unavailable, or simply missing a record, so a
// report is a guide for where to look, never a certificate of authenticity.
// The CLI, desktop app, and server all import these strings; the web frontend
// mirrors them (it cannot import this Node package in the browser). Keeping the
// wording in one place means the message a student sees is the same everywhere.
// ============================================================

/** Full disclaimer — shown where there is room to read it (reports, exports, about screens). */
export const DISCLAIMER =
  'CiteSight helps you find citations worth a second look — it does not certify them. ' +
  'Its checks rely on third-party databases (Crossref, OpenAlex, Semantic Scholar, and others) ' +
  'that can be slow, rate-limited, temporarily unavailable, or simply missing a record, so ' +
  'results can vary between runs. Read “verified” as “looks consistent”, not “guaranteed genuine”, ' +
  'and “not found” as “could not be confirmed”, not “proven fake”. Always check anything that ' +
  'matters against the original source — the final academic judgement is yours, not the tool’s.';

/** One-line disclaimer — for tight spaces such as footers and status bars. */
export const DISCLAIMER_SHORT =
  'Automated checks rely on third-party databases that can be unavailable, rate-limited, or ' +
  'incomplete, so results are a guide, not a guarantee — always verify anything important against the original source.';
