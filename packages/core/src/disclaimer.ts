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
// Data-source attribution + pacing
//
// The S2 API licence asks for attribution wherever S2 data is displayed; the
// other providers request (arXiv) or appreciate (Crossref, OpenAlex) credit.
// One line, shown beside the disclaimer under results and on about screens.
// The pacing note renders on the processing screen — the moment users wonder
// why verification is slow is the moment to say it is deliberate.
// ---------------------------------------------------------------------------

/** One-line data-source credit — render wherever results are displayed. */
export const ATTRIBUTION =
  'Bibliographic data from Crossref, OpenAlex, Semantic Scholar (Allen Institute for AI), ' +
  'arXiv, DataCite, Europe PMC, and Open Library. Publication notices from Crossref and Retraction Watch. ' +
  'Thank you to arXiv for use of its open access interoperability.';

/** Why verification takes time — shown while checks run. */
export const PACING_NOTE =
  'Checks are deliberately paced to each database\u2019s requested rate limits (arXiv, for ' +
  'example, asks for one request every three seconds), so long reference lists take a few ' +
  'minutes. Slow here means polite to the free services that make the checking possible.';

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
  'The online checker sends your upload to this server and reference metadata to citation databases. ' +
  'Lookups share the server\'s rate limits. Unavailable checks can be retried. ' +
  'The desktop app processes files locally and supports personal OpenAlex and Semantic Scholar API keys, ' +
  'but still sends reference metadata to external services.';

/** One-line version — shown alongside results, where a low verified count prompts the question. */
export const HOSTED_LIMITS_SHORT =
  'The online checker shares server-side API quotas. Desktop supports personal OpenAlex and Semantic Scholar keys.';

// ---------------------------------------------------------------------------
// Standalone (single-file) build notice
//
// The downloadable HTML file runs the whole analysis in the user's browser tab.
// That is a privacy win — the document never leaves the machine — but a web
// page cannot make cross-origin probes the way Node and Electron can, so two
// checks behave differently. The wording here explains both, and points at the
// manual escape hatches (opening the DOI/URL in a tab) that replace them.
// ---------------------------------------------------------------------------

/** Shown on the standalone build's upload screen — what changes in a browser. */
export const STANDALONE_LIMITS_NOTICE =
  'This standalone file processes the submission in your browser. It sends extracted reference titles, authors, ' +
  'identifiers and URLs to external services for verification. It is not a zero-network mode. ' +
  'Two checks work differently here: cited URLs are not probed automatically (browsers block ' +
  'cross-site requests), and arXiv preprints can\u2019t be looked up (arXiv\u2019s API refuses ' +
  'browser requests), so those references may come back \u201cunverified\u201d. Expand any row and ' +
  'use the Open DOI / Open cited URL buttons to eyeball the source in a new tab — that manual ' +
  'check is the right call for anything that matters anyway.';

/** One-line version — shown under standalone results. */
export const STANDALONE_LIMITS_SHORT =
  'URLs were not probed and arXiv lookups are unavailable in a browser file — expand a row and ' +
  'open the DOI or cited URL in a tab to check it yourself.';
