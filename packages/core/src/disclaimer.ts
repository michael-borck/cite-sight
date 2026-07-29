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

// ---------------------------------------------------------------------------
// Hosted-demo notice
//
// The public web app queries the citation databases anonymously, on lookups
// paced across every visitor at once. The desktop app makes the same calls from
// the user's own machine and can carry their contact email (and an optional
// free Semantic Scholar key), which earns polite-pool treatment from the
// providers — measurably fewer references come back unconfirmed. Only the web
// frontend renders these, but the wording lives here with the rest of the
// user-facing caveats so there is one place to edit it.
// ---------------------------------------------------------------------------

/** Shown on the online checker before upload — why the hosted version finds less. */
export const HOSTED_LIMITS_NOTICE =
  'The online checker is a free taster. It queries Crossref, OpenAlex and Semantic Scholar ' +
  'anonymously and paces those lookups across everyone using the site, so at busy times checks ' +
  'run slower and more references come back “not found”. The desktop app runs the same analysis ' +
  'on your own machine and lets you supply a contact email — and, optionally, a free Semantic ' +
  'Scholar API key — which lifts those limits. The same document usually verifies more references there.';

/** One-line version — shown alongside results, where a low verified count prompts the question. */
export const HOSTED_LIMITS_SHORT =
  'Fewer references verified than you expected? The online checker shares one anonymous, rate-limited ' +
  'connection to the citation databases; adding your contact email in the desktop app lifts that limit.';
