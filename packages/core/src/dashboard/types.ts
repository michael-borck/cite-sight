// packages/core/src/dashboard/types.ts

import type { AcademicWork } from '../types.js';

/**
 * Categories surfaced in the "Things to check" priority list (Phase 1: 3 of 4).
 *
 * Naming note: this enum is the user-facing label, deliberately shorter than the
 * internal `VerificationStatus`. In particular, `'suspect'` here maps to the
 * internal status `'suspicious'`. The mapping happens in `priorityList.ts`.
 */
export type PriorityCategory = 'not_found' | 'suspect' | 'orphan';

/** A single row in the "Things to check" priority list. */
export interface PriorityItem {
  /** Stable identifier — used as React key and for dismissals. */
  itemKey: string;
  /** Which category bucket this item belongs to. */
  category: PriorityCategory;
  /** Single-line text shown on the collapsed row. */
  headline: string;
  /** Raw text from the document — shown in the expanded row. */
  sourceText: string;
  /** Optional human-readable reason (e.g. "Crossref returned no match"). */
  reason?: string;
  /**
   * Metadata of the work a verification API returned, when the parser's
   * reference looked suspicious enough to surface but a match existed.
   * Subset of `AcademicWork` — sharing the type preserves the narrow `source`
   * union and avoids duplicating the shape.
   */
  matched?: Pick<AcademicWork, 'title' | 'year' | 'doi' | 'source'>;
}

/** Hero verdict state — drives the pill colour and label. */
export type VerdictState = 'all_clear' | 'caution' | 'issues';

/** Result of computing the verdict + proportion bar segments. */
export interface Verdict {
  state: VerdictState;
  /** Count of refs in 'verified' or 'likely_valid' status. */
  verifiedCount: number;
  /** Count of items needing user attention (suspect + not_found + orphan in-text). */
  toCheckCount: number;
  /** Count of refs where no online check happened ('format_only'). */
  unverifiableCount: number;
  /** Detailed breakdown shown in the one-line text under the bar. */
  breakdown: {
    suspect: number;
    notFound: number;
    orphanInText: number;
    parserUnsure: number; // Always 0 in Phase 1.
  };
}
