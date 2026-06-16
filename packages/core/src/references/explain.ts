import type { ReferenceVerification } from '../types.js';

// ============================================================
// Human-readable explanations for verification flags
//
// The verifier records *why* a reference is suspicious as terse machine flags
// ("author_mismatch", "year_mismatch", "doi_title_mismatch"). On their own
// those tell a grader something is wrong but not *what* — so this module turns
// each flag into a short label plus a "cited X — record says Y" detail, drawing
// the two sides from the reference itself and the work it matched. Presentation
// layers (CLI, desktop, web) render these instead of dumping raw flag strings.
// ============================================================

export interface FlagExplanation {
  /** The raw machine flag this explanation corresponds to. */
  flag: string;
  /** Short human label, e.g. "Year mismatch". */
  label: string;
  /** What was cited vs. what the record holds, when the flag is a mismatch. */
  detail?: string;
}

function fmtAuthors(authors: string[]): string {
  return authors.length > 0 ? authors.join(', ') : 'none listed';
}

const SERVICE_NAMES: Record<string, string> = {
  crossref: 'Crossref',
  semantic_scholar: 'Semantic Scholar',
  openalex: 'OpenAlex',
  doi: 'the DOI resolver',
};

/** Turn a lookup failure (service + reason) into a readable phrase. */
function reasonPhrase(reason: string, service: string): string {
  const name = SERVICE_NAMES[service] ?? service;
  switch (reason) {
    case 'rate_limited': return `rate-limited on ${name}`;
    case 'timeout':      return `timed out contacting ${name}`;
    case 'server_error': return `${name} returned a server error`;
    case 'network':      return `could not reach ${name}`;
    default:             return `lookup failed on ${name}`;
  }
}

// Compact reason tokens (e.g. "rate_limited:semantic_scholar") are emitted
// alongside 'verification_unavailable' so the reason rides along in raw flag
// lists; they are rendered via the structured field, not as standalone flags.
const REASON_TOKEN_RE = /^(?:rate_limited|timeout|server_error|network|unknown):/;

/**
 * Expand a verification's flags into human-readable explanations. Low-signal
 * flags that only matter in aggregate (`no_doi`) or are already surfaced
 * elsewhere (`format_issues` → the format-issue list) are omitted so the
 * per-reference detail stays focused on what a grader needs to act on.
 */
export function explainVerification(v: ReferenceVerification): FlagExplanation[] {
  const ref = v.reference;
  const work = v.matchedWork;
  const out: FlagExplanation[] = [];

  for (const flag of v.flags) {
    if (REASON_TOKEN_RE.test(flag)) continue; // surfaced via 'verification_unavailable'
    switch (flag) {
      case 'author_mismatch':
        out.push({
          flag,
          label: 'Author mismatch',
          detail: `cited "${fmtAuthors(ref.authors)}" — record lists "${work ? fmtAuthors(work.authors) : 'unknown'}"`,
        });
        break;

      case 'year_mismatch':
        out.push({
          flag,
          label: 'Year mismatch',
          detail: `cited ${ref.year ?? 'no year'} — record says ${work?.year ?? 'unknown'}`,
        });
        break;

      case 'doi_title_mismatch':
        out.push({
          flag,
          label: 'DOI points to a different work',
          detail: `cited title "${ref.title || '(none)'}" — the DOI resolves to "${work?.title ?? 'unknown'}"`,
        });
        break;

      case 'weak_match':
        out.push({
          flag,
          label: 'Closest match is weak',
          detail: `cited title "${ref.title || '(none)'}" — closest record found is "${work?.title ?? 'unknown'}"`,
        });
        break;

      case 'doi_unconfirmed':
        out.push({
          flag,
          label: 'DOI registered but unconfirmed',
          detail: 'the DOI exists but its metadata could not be fetched to confirm the title or authors',
        });
        break;

      case 'future_date':
        out.push({
          flag,
          label: 'Future publication date',
          detail: `cited year ${ref.year} is later than the current year`,
        });
        break;

      case 'broken_url':
        out.push({
          flag,
          label: 'Broken URL',
          detail: v.urlCheck
            ? `${v.urlCheck.url} (${v.urlCheck.status}${v.urlCheck.statusCode ? ` ${v.urlCheck.statusCode}` : ''})`
            : undefined,
        });
        break;

      case 'verification_unavailable':
        out.push({
          flag,
          label: 'Could not verify',
          detail: v.unavailable
            ? `${reasonPhrase(v.unavailable.reason, v.unavailable.service)} — this is not a confirmed miss, re-run to retry`
            : 'a database lookup failed (rate-limit, timeout, or network) — this is not a confirmed miss',
        });
        break;

      case 'web_source':
        out.push({
          flag,
          label: 'Non-academic web source',
          detail: work?.url ? `matched ${work.source}: ${work.url}` : `matched as ${work?.source ?? 'web source'}`,
        });
        break;

      // Surfaced via the dedicated format-issue list; aggregate-only signal.
      case 'format_issues':
      case 'no_doi':
        break;

      default:
        // Unknown flag: keep it visible rather than silently dropping it.
        out.push({ flag, label: flag });
    }
  }

  return out;
}
