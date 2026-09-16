// ============================================================
// In-app help content — single source of truth.
//
// Pure strings, browser-safe. Consumed by the CLI (`about` command), the
// desktop Help menu and help overlay, and the web About page, so the
// wording never drifts between surfaces.
// ============================================================

export interface HelpTopic {
  id: string;
  title: string;
  body: string;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'about',
    title: 'What CiteSight does',
    body: 'CiteSight checks student citations in three steps: (1) it extracts the reference list and in-text citations; (2) it verifies each reference against open scholarly databases and flags mismatches, orphans and typos; (3) optionally, it reviews whether cited statements are supported by the source — abstracts or your own local files — using a local AI model. Every finding is a suggestion for the marker; the final academic judgement is always yours.',
  },
  {
    id: 'verdicts',
    title: 'What the statuses mean',
    body: 'Verified / Likely valid: a real record matched and the cited details agree (or differ only trivially). Needs review: matched, but the details disagree — for hand-typed references this is often a small typo. Not found: every lookup answered cleanly and nothing matched. Unverified: a lookup failed (rate limit, timeout) — not a confirmed miss, re-run to retry. Possible spelling mismatch: an in-text citation is one letter-slip from a bibliography entry.',
  },
  {
    id: 'rate-limits',
    title: 'Rate limits and pacing',
    body: 'Lookups run one reference at a time, paced per provider: about one request per second for Crossref, OpenAlex, Semantic Scholar, DataCite and Europe PMC, longer for arXiv. Results are cached, so repeated references are looked up once. When a provider throttles us, the reference is reported as Unverified with the reason — re-run to retry. Pass a contact email (polite pools) and your own OpenAlex / Semantic Scholar keys to lift most limits. We do not scrape Google Scholar — its Terms of Service prohibit automated access; the Search Scholar buttons open it in your browser instead.',
  },
  {
    id: 'evidence',
    title: 'Where claim evidence comes from',
    body: 'Three layers: (1) Publisher abstracts from the open scholarly APIs — zero setup, but only as strong as the abstract; (2) your own source files — the unit library folder or per-row mapping — full-text evidence, entirely on this machine; (3) your judgement. CiteSight never downloads source PDFs, never scrapes Google Scholar, and never uploads a submission. Claim model runs are offline and CPU-only.',
  },
  {
    id: 'privacy',
    title: 'What leaves your computer',
    body: 'Online reference verification sends extracted reference details only — titles, authors, identifiers, cited URLs — never the essay text. Claim checking runs entirely offline. The desktop app defaults to online reference checks; tick Local-only mode for fully offline runs (statuses then show format-only). Lookups, review sessions and claim checkpoints are stored locally and clearable in Settings.',
  },
];

export const ACKNOWLEDGEMENTS: readonly { name: string; what: string; url?: string }[] = [
  { name: 'Crossref', what: 'DOI metadata, publication notices', url: 'https://www.crossref.org/' },
  { name: 'Retraction Watch (via Crossref)', what: 'retraction and correction notices', url: 'https://retractionwatch.com/' },
  { name: 'OpenAlex', what: 'open scholarly index and abstracts', url: 'https://openalex.org/' },
  { name: 'Semantic Scholar (Allen Institute for AI)', what: 'scholarly index and abstracts', url: 'https://www.semanticscholar.org/' },
  { name: 'Europe PMC', what: 'biomedical literature and abstracts', url: 'https://europepmc.org/' },
  { name: 'DataCite', what: 'datasets, software and repository deposits', url: 'https://datacite.org/' },
  { name: 'arXiv', what: 'preprint lookup', url: 'https://arxiv.org/' },
  { name: 'Open Library (Internet Archive)', what: 'book metadata', url: 'https://openlibrary.org/' },
  { name: 'llama.cpp', what: 'the local claim-review runtime (MIT)', url: 'https://github.com/ggml-org/llama.cpp' },
  { name: 'Qwen, SmolLM2 (Hugging Face) & the open-model community', what: 'the experimental local models', url: 'https://huggingface.co/' },
];

export const HELP_FOOTER =
  'CiteSight is a guide for markers, not a judge. Every finding is a prompt to look — the academic judgement is yours.';
