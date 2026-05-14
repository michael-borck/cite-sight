import type { ReferenceAnalysisResult, VerificationStatus } from '../types.js';
import type { Verdict } from './types.js';

const VERIFIED_STATUSES: VerificationStatus[] = ['verified', 'likely_valid'];
const TO_CHECK_STATUSES: VerificationStatus[] = ['suspicious', 'not_found'];

/**
 * Heuristic threshold for the "issues" verdict pill:
 *   not_found count exceeds max(5, 10% of total references).
 * Tunable after Phase 3 ships parser-confidence and we have real data.
 */
function isIssuesLevel(notFound: number, total: number): boolean {
  const floor = 5;
  const tenPct = Math.ceil(total * 0.1);
  return notFound > Math.max(floor, tenPct);
}

export function computeVerdict(
  refs: ReferenceAnalysisResult,
  dismissed: ReadonlySet<string>,
): Verdict {
  let verified = 0;
  let unverifiable = 0;
  let suspect = 0;
  let notFound = 0;

  refs.verifications.forEach((v, idx) => {
    const itemKey = `ref:${idx}`;
    const isDismissed = dismissed.has(itemKey);

    if (VERIFIED_STATUSES.includes(v.status)) {
      verified++;
    } else if (v.status === 'format_only') {
      unverifiable++;
    } else if (!isDismissed && TO_CHECK_STATUSES.includes(v.status)) {
      if (v.status === 'suspicious') suspect++;
      if (v.status === 'not_found') notFound++;
    }
  });

  let orphanInText = 0;
  refs.crossReference.unmatchedInText.forEach((_c, idx) => {
    const itemKey = `intext:${idx}`;
    if (!dismissed.has(itemKey)) orphanInText++;
  });

  const toCheckCount = suspect + notFound + orphanInText;
  const total = refs.totalReferences;

  let state: Verdict['state'];
  if (toCheckCount === 0) state = 'all_clear';
  else if (isIssuesLevel(notFound, total)) state = 'issues';
  else state = 'caution';

  return {
    state,
    verifiedCount: verified,
    toCheckCount,
    unverifiableCount: unverifiable,
    breakdown: {
      suspect,
      notFound,
      orphanInText,
      parserUnsure: 0,
    },
  };
}
