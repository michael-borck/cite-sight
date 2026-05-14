# Citation Dashboard — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Overview tab in `ResultsDashboard.tsx` with the new two-hero layout (verdict pill + proportion bar; flat priority list with inline-expand rows) using only existing analysis data — no data-model changes, session-only dismissals, no source-span page/line, no parser-confidence category. Reorder the sidebar tabs so References is primary and the NLP tabs sit under a "Bonus signals" divider.

**Architecture:** Pure dashboard logic (verdict computation, priority list assembly) lives in a new `packages/core/src/dashboard/` module — testable in isolation, importable by both desktop and the future web app. The desktop UI is presentational: a new `Overview/` directory under `components/` holds the hero blocks. Session-only dismissals live as React state in the new `OverviewPanel`, recomputed against the analysis result each render. No persistence layer in this phase.

**Tech Stack:** TypeScript, React 19 (function components + hooks), plain CSS files alongside `.tsx`, Vitest for core unit tests. No new dependencies.

**Reference:** The full design lives at `docs/superpowers/specs/2026-05-14-citation-signals-dashboard-design.md`. This plan covers Phase 1 of that document only. Subsequent phases get their own plans when ready.

---

## Pre-flight

- [ ] **Step 0a: Confirm clean working tree on `main`**

```bash
git status
git rev-parse --abbrev-ref HEAD
```

Expected: working tree clean, branch `main`. If not, stop and resolve before continuing.

- [ ] **Step 0b: Confirm core tests pass at baseline**

```bash
npx vitest --root /Users/michael/Projects/lens/cite-sight/packages/core run
```

Expected: all tests pass (currently 39).

---

## File structure

**New files (core):**
- `packages/core/src/dashboard/types.ts` — `PriorityItem`, `PriorityCategory`, `Verdict`, `VerdictState`
- `packages/core/src/dashboard/verdict.ts` — `computeVerdict()` pure function
- `packages/core/src/dashboard/priorityList.ts` — `gatherPriorityItems()` pure function
- `packages/core/src/dashboard/index.ts` — barrel
- `packages/core/test/dashboard.test.ts` — unit tests for both pure functions

**New files (desktop):**
- `packages/desktop/src/renderer/components/Overview/OverviewPanel.tsx` — top-level component combining the two heroes
- `packages/desktop/src/renderer/components/Overview/VerdictHero.tsx` — verdict pill + proportion bar
- `packages/desktop/src/renderer/components/Overview/ThingsToCheckHero.tsx` — filter chips + priority list container
- `packages/desktop/src/renderer/components/Overview/PriorityListRow.tsx` — single collapsed/expanded row
- `packages/desktop/src/renderer/components/Overview/UndoToast.tsx` — 5-second dismissal undo toast
- `packages/desktop/src/renderer/components/Overview/Overview.css` — all styles for the new components
- `packages/desktop/src/renderer/components/Overview/index.ts` — barrel re-exporting `OverviewPanel`

**Modified files:**
- `packages/core/src/index.ts` — add `export * from './dashboard/index.js';`
- `packages/desktop/src/renderer/components/ResultsDashboard.tsx` — delete inline `OverviewPanel` function; import new one from `./Overview`; reorder `SECTIONS` array; add "Bonus signals" divider markup in the sidebar
- `packages/desktop/src/renderer/components/ResultsDashboard.css` — add `.sidebar-divider` style

---

## Task 1: Core — Dashboard types

**Files:**
- Create: `packages/core/src/dashboard/types.ts`

- [ ] **Step 1.1: Create types file**

```typescript
// packages/core/src/dashboard/types.ts

/** Categories surfaced in the "Things to check" priority list (Phase 1: 3 of 4). */
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
  /** Optional matched-work metadata, for the suspect category. */
  matched?: {
    title?: string;
    year?: number;
    doi?: string;
    source?: string;
  };
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
```

- [ ] **Step 1.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project /Users/michael/Projects/lens/cite-sight/packages/core
```

Expected: no output (clean compile).

- [ ] **Step 1.3: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/core/src/dashboard/types.ts
git commit -m "feat(core): add dashboard module types

Defines PriorityItem, PriorityCategory, Verdict, VerdictState for the
new Overview tab. Pure types, no logic yet."
```

---

## Task 2: Core — Verdict computation (TDD)

**Files:**
- Create: `packages/core/src/dashboard/verdict.ts`
- Create: `packages/core/test/dashboard.test.ts`

- [ ] **Step 2.1: Write the failing tests first**

```typescript
// packages/core/test/dashboard.test.ts
import { describe, it, expect } from 'vitest';
import { computeVerdict } from '../src/dashboard/verdict.js';
import type { ReferenceAnalysisResult } from '../src/types.js';

function makeRefs(overrides: Partial<ReferenceAnalysisResult> = {}): ReferenceAnalysisResult {
  return {
    references: [],
    inTextCitations: [],
    verifications: [],
    crossReference: { unmatchedBibliography: [], unmatchedInText: [] },
    detectedStyle: 'apa',
    totalReferences: 0,
    verifiedCount: 0,
    suspiciousCount: 0,
    notFoundCount: 0,
    brokenUrlCount: 0,
    ...overrides,
  };
}

describe('computeVerdict', () => {
  it('returns all_clear when nothing is flagged', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(result.state).toBe('all_clear');
    expect(result.verifiedCount).toBe(2);
    expect(result.toCheckCount).toBe(0);
    expect(result.unverifiableCount).toBe(0);
  });

  it('returns caution when 1+ items need attention but none are confirmed fabricated', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
          { reference: {} as any, status: 'suspicious', formatIssues: [], confidenceScore: 0.5, flags: [] },
          { reference: {} as any, status: 'not_found', formatIssues: [], confidenceScore: 0.4, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(result.state).toBe('caution');
    expect(result.toCheckCount).toBe(2);
    expect(result.breakdown.suspect).toBe(1);
    expect(result.breakdown.notFound).toBe(1);
  });

  it('returns issues when not_found exceeds default threshold of max(5, 10%)', () => {
    // 6 not_found, 4 verified — exceeds the floor of 5.
    const verifications = [
      ...Array(4).fill({ reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] }),
      ...Array(6).fill({ reference: {} as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] }),
    ];
    const result = computeVerdict(makeRefs({ verifications }), new Set());
    expect(result.state).toBe('issues');
  });

  it('counts likely_valid as verified', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
          { reference: {} as any, status: 'likely_valid', formatIssues: [], confidenceScore: 0.8, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(result.verifiedCount).toBe(2);
    expect(result.toCheckCount).toBe(0);
  });

  it('counts format_only as unverifiable, not verified or to_check', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
          { reference: {} as any, status: 'format_only', formatIssues: [], confidenceScore: 0.5, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(result.verifiedCount).toBe(1);
    expect(result.unverifiableCount).toBe(1);
    expect(result.toCheckCount).toBe(0);
  });

  it('counts orphan in-text citations toward to_check', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
        ],
        crossReference: {
          unmatchedBibliography: [],
          unmatchedInText: [
            { raw: '(Smith, 2024)', authors: ['Smith'], year: 2024, position: 100 },
            { raw: '(Jones, 2023)', authors: ['Jones'], year: 2023, position: 200 },
          ],
        },
      }),
      new Set(),
    );
    expect(result.toCheckCount).toBe(2);
    expect(result.breakdown.orphanInText).toBe(2);
  });

  it('subtracts dismissed itemKeys from toCheckCount', () => {
    // 2 not_found refs, one dismissed. toCheck drops to 1.
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: { raw: 'Ref A' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
          { reference: { raw: 'Ref B' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
        ],
      }),
      new Set(['ref:0']), // dismissed first one by its itemKey
    );
    expect(result.toCheckCount).toBe(1);
    expect(result.breakdown.notFound).toBe(1);
  });
});
```

- [ ] **Step 2.2: Run the tests, verify they fail**

```bash
npx vitest --root /Users/michael/Projects/lens/cite-sight/packages/core run test/dashboard.test.ts
```

Expected: all 7 tests fail with "Cannot find module '../src/dashboard/verdict.js'" or similar.

- [ ] **Step 2.3: Implement `computeVerdict`**

```typescript
// packages/core/src/dashboard/verdict.ts
import type { ReferenceAnalysisResult, VerificationStatus } from '../types.js';
import type { Verdict } from './types.js';

/** Statuses that contribute to "verified" (no user action needed). */
const VERIFIED_STATUSES: VerificationStatus[] = ['verified', 'likely_valid'];

/** Statuses that surface as flagged items in the priority list. */
const TO_CHECK_STATUSES: VerificationStatus[] = ['suspicious', 'not_found'];

/**
 * Heuristic threshold for the "issues" verdict pill:
 *   `not_found` count exceeds max(5, 10% of total references).
 * Tunable after Phase 3 ships parser-confidence and we have real data.
 */
function isIssuesLevel(notFound: number, total: number): boolean {
  const floor = 5;
  const tenPct = Math.ceil(total * 0.1);
  return notFound > Math.max(floor, tenPct);
}

/**
 * Compute the verdict pill state and proportion-bar counts.
 *
 * @param refs The full reference analysis result from the pipeline.
 * @param dismissed Set of itemKeys the user has dismissed in this session.
 *                  Dismissed items are subtracted from the to-check breakdown.
 */
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
  refs.crossReference.unmatchedInText.forEach((c, idx) => {
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
```

- [ ] **Step 2.4: Run the tests, verify they pass**

```bash
npx vitest --root /Users/michael/Projects/lens/cite-sight/packages/core run test/dashboard.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/core/src/dashboard/verdict.ts packages/core/test/dashboard.test.ts
git commit -m "feat(core): add verdict computation for dashboard hero

computeVerdict() maps the existing ReferenceAnalysisResult into the
three-state pill + proportion-bar counts the new Overview needs.
Treats verified + likely_valid as 'verified', format_only as
'unverifiable', and subtracts session-dismissed items from to-check."
```

---

## Task 3: Core — Priority list assembly (TDD)

**Files:**
- Create: `packages/core/src/dashboard/priorityList.ts`
- Modify: `packages/core/test/dashboard.test.ts`

- [ ] **Step 3.1: Add failing tests to existing test file**

Append to `packages/core/test/dashboard.test.ts`:

```typescript
import { gatherPriorityItems } from '../src/dashboard/priorityList.js';

describe('gatherPriorityItems', () => {
  it('returns an empty list when nothing is flagged', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(items).toHaveLength(0);
  });

  it('emits not_found items from suspicious-or-not-found verifications', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          {
            reference: { raw: 'Smith, J. (2024). The lost paper.', authors: ['Smith, J.'], title: 'The lost paper', year: 2024, detectedStyle: 'apa' } as any,
            status: 'not_found',
            formatIssues: [],
            confidenceScore: 0.4,
            flags: [],
          },
        ],
      }),
      new Set(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemKey: 'ref:0',
      category: 'not_found',
      headline: 'Smith, J. (2024). The lost paper.',
      sourceText: 'Smith, J. (2024). The lost paper.',
    });
  });

  it('emits suspect items with matched-work metadata', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          {
            reference: { raw: 'Mollick & Mollick (2023). SSRN preprint.', authors: ['Mollick', 'Mollick'], title: 'SSRN preprint', year: 2023, detectedStyle: 'apa' } as any,
            status: 'suspicious',
            formatIssues: [],
            confidenceScore: 0.6,
            flags: [],
            matchedWork: { title: 'A different title', year: 2023, doi: '10.x/y', source: 'crossref' as any },
          },
        ],
      }),
      new Set(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe('suspect');
    expect(items[0].matched?.title).toBe('A different title');
  });

  it('emits orphan items from unmatched in-text citations', () => {
    const items = gatherPriorityItems(
      makeRefs({
        crossReference: {
          unmatchedBibliography: [],
          unmatchedInText: [
            { raw: '(Borck, 2026)', authors: ['Borck'], year: 2026, position: 100 },
          ],
        },
      }),
      new Set(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemKey: 'intext:0',
      category: 'orphan',
      headline: '(Borck, 2026)',
      sourceText: '(Borck, 2026)',
    });
  });

  it('skips items whose itemKey is in the dismissed set', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          { reference: { raw: 'A' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
          { reference: { raw: 'B' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
        ],
      }),
      new Set(['ref:0']),
    );
    expect(items).toHaveLength(1);
    expect(items[0].itemKey).toBe('ref:1');
  });

  it('orders items: not_found, then suspect, then orphan', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          { reference: { raw: 'Suspect ref' } as any, status: 'suspicious', formatIssues: [], confidenceScore: 0.5, flags: [] },
          { reference: { raw: 'Not found ref' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
        ],
        crossReference: {
          unmatchedBibliography: [],
          unmatchedInText: [{ raw: '(Borck, 2026)', authors: ['Borck'], year: 2026, position: 100 }],
        },
      }),
      new Set(),
    );
    expect(items.map((i) => i.category)).toEqual(['not_found', 'suspect', 'orphan']);
  });
});
```

- [ ] **Step 3.2: Run tests, verify they fail**

```bash
npx vitest --root /Users/michael/Projects/lens/cite-sight/packages/core run test/dashboard.test.ts
```

Expected: the 6 new tests fail with "Cannot find module '../src/dashboard/priorityList.js'". The 7 from Task 2 still pass.

- [ ] **Step 3.3: Implement `gatherPriorityItems`**

```typescript
// packages/core/src/dashboard/priorityList.ts
import type { ReferenceAnalysisResult } from '../types.js';
import type { PriorityItem } from './types.js';

/**
 * Build the ordered list of flagged items for the "Things to check" hero.
 *
 * Order is deliberate — most-actionable categories first:
 *   1. not_found (could be fabricated)
 *   2. suspect   (metadata mismatch)
 *   3. orphan    (in-text citation with no bib entry)
 *
 * Dismissed items (by itemKey) are filtered out so the hero only shows
 * what the user still needs to look at.
 */
export function gatherPriorityItems(
  refs: ReferenceAnalysisResult,
  dismissed: ReadonlySet<string>,
): PriorityItem[] {
  const notFound: PriorityItem[] = [];
  const suspect: PriorityItem[] = [];
  const orphan: PriorityItem[] = [];

  refs.verifications.forEach((v, idx) => {
    const itemKey = `ref:${idx}`;
    if (dismissed.has(itemKey)) return;

    if (v.status === 'not_found') {
      notFound.push({
        itemKey,
        category: 'not_found',
        headline: v.reference.raw,
        sourceText: v.reference.raw,
        reason: 'Crossref, Semantic Scholar, and OpenAlex returned no match.',
      });
    } else if (v.status === 'suspicious') {
      suspect.push({
        itemKey,
        category: 'suspect',
        headline: v.reference.raw,
        sourceText: v.reference.raw,
        reason: 'A database returned a match, but the metadata does not agree.',
        matched: v.matchedWork
          ? {
              title: v.matchedWork.title,
              year: v.matchedWork.year,
              doi: v.matchedWork.doi,
              source: v.matchedWork.source,
            }
          : undefined,
      });
    }
  });

  refs.crossReference.unmatchedInText.forEach((c, idx) => {
    const itemKey = `intext:${idx}`;
    if (dismissed.has(itemKey)) return;

    orphan.push({
      itemKey,
      category: 'orphan',
      headline: c.raw,
      sourceText: c.raw,
      reason: 'This citation appears in the body but no bibliography entry matches.',
    });
  });

  return [...notFound, ...suspect, ...orphan];
}
```

- [ ] **Step 3.4: Run tests, verify they pass**

```bash
npx vitest --root /Users/michael/Projects/lens/cite-sight/packages/core run test/dashboard.test.ts
```

Expected: all 13 dashboard tests pass.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/core/src/dashboard/priorityList.ts packages/core/test/dashboard.test.ts
git commit -m "feat(core): add priority-list assembly for dashboard

gatherPriorityItems() collapses verifications + unmatched in-text
citations into a single ordered list of PriorityItem for the new
'Things to check' hero. Dismissed items are filtered."
```

---

## Task 4: Core — Wire exports and rebuild

**Files:**
- Create: `packages/core/src/dashboard/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 4.1: Create the dashboard barrel**

```typescript
// packages/core/src/dashboard/index.ts
export * from './types.js';
export { computeVerdict } from './verdict.js';
export { gatherPriorityItems } from './priorityList.js';
```

- [ ] **Step 4.2: Re-export from the package root**

Read the current `packages/core/src/index.ts` first, then append the new export at the end. Example final state of that file:

```typescript
// packages/core/src/index.ts (existing contents kept verbatim)
export * from './types.js';
export { analyzePipeline } from './pipeline.js';
// ... whatever else is there ...

// NEW — append at the end:
export * from './dashboard/index.js';
```

- [ ] **Step 4.3: Build core**

```bash
cd /Users/michael/Projects/lens/cite-sight
npm run build:core
```

Expected: clean build, no errors. Verify `packages/core/dist/dashboard/` directory exists with `verdict.js`, `priorityList.js`, etc.

- [ ] **Step 4.4: Verify dashboard exports are visible from desktop**

```bash
node --input-type=module --eval "import { computeVerdict, gatherPriorityItems } from '@michaelborck/cite-sight-core'; console.log(typeof computeVerdict, typeof gatherPriorityItems);"
```

Expected: `function function`.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/core/src/dashboard/index.ts packages/core/src/index.ts
git commit -m "feat(core): export dashboard module from package root

So desktop (and future web) can import computeVerdict /
gatherPriorityItems / PriorityItem etc. directly from
@michaelborck/cite-sight-core."
```

---

## Task 5: Desktop — VerdictHero component

**Files:**
- Create: `packages/desktop/src/renderer/components/Overview/VerdictHero.tsx`
- Create: `packages/desktop/src/renderer/components/Overview/Overview.css`

- [ ] **Step 5.1: Create `VerdictHero.tsx`**

```tsx
// packages/desktop/src/renderer/components/Overview/VerdictHero.tsx
import type { Verdict } from '@michaelborck/cite-sight-core';

interface Props {
  fileName: string;
  pages?: number;
  wordCount: number;
  processingTimeMs: number;
  verdict: Verdict;
}

const PILL_LABEL: Record<Verdict['state'], string> = {
  all_clear: 'All clear',
  caution: 'Caution',
  issues: 'Issues',
};

function pillSuffix(v: Verdict): string {
  if (v.state === 'all_clear') return ' — all checks pass';
  return ` — ${v.toCheckCount} to check`;
}

export function VerdictHero({ fileName, pages, wordCount, processingTimeMs, verdict }: Props) {
  const total = verdict.verifiedCount + verdict.toCheckCount + verdict.unverifiableCount;
  const verifiedPct = total === 0 ? 0 : (verdict.verifiedCount / total) * 100;
  const toCheckPct = total === 0 ? 0 : (verdict.toCheckCount / total) * 100;
  const unverifiablePct = total === 0 ? 0 : (verdict.unverifiableCount / total) * 100;

  const breakdownParts = [
    verdict.breakdown.suspect > 0 && `${verdict.breakdown.suspect} suspect`,
    verdict.breakdown.notFound > 0 && `${verdict.breakdown.notFound} not found`,
    verdict.breakdown.orphanInText > 0 && `${verdict.breakdown.orphanInText} orphan citations`,
  ].filter(Boolean);

  return (
    <div className="hero-card">
      <div className="hero-header">
        <div>
          <div className="hero-filename">{fileName}</div>
          <div className="hero-meta">
            {pages != null && <>{pages} pages · </>}
            {wordCount.toLocaleString()} words · analysed in {(processingTimeMs / 1000).toFixed(1)}s
          </div>
        </div>
        <div className={`verdict-pill verdict-${verdict.state}`}>
          {PILL_LABEL[verdict.state]}{pillSuffix(verdict)}
        </div>
      </div>

      <div className="proportion-bar">
        {verifiedPct > 0 && (
          <div className="proportion-segment seg-verified" style={{ width: `${verifiedPct}%` }}>
            {verifiedPct > 12 ? `${verdict.verifiedCount} verified` : ''}
          </div>
        )}
        {toCheckPct > 0 && (
          <div className="proportion-segment seg-tocheck" style={{ width: `${toCheckPct}%` }}>
            {toCheckPct > 12 ? `${verdict.toCheckCount} to check` : ''}
          </div>
        )}
        {unverifiablePct > 0 && (
          <div className="proportion-segment seg-unverifiable" style={{ width: `${unverifiablePct}%` }}>
            {unverifiablePct > 12 ? `${verdict.unverifiableCount} unverifiable` : ''}
          </div>
        )}
      </div>

      {breakdownParts.length > 0 && (
        <div className="hero-breakdown">{breakdownParts.join(' · ')}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2: Create `Overview.css` with styles for `VerdictHero`**

```css
/* packages/desktop/src/renderer/components/Overview/Overview.css */

.hero-card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem 1.1rem;
  margin-bottom: 0.8rem;
}

.hero-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.7rem;
  gap: 1rem;
}

.hero-filename {
  font-weight: 700;
  font-size: 1.05rem;
  color: #222;
}

.hero-meta {
  font-size: 0.78rem;
  color: #888;
  margin-top: 0.15rem;
}

.verdict-pill {
  display: inline-block;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.85rem;
  white-space: nowrap;
}

.verdict-all_clear {
  background: #e8f5ec;
  color: #127a3a;
}

.verdict-caution {
  background: #fff4e8;
  color: #a45a00;
}

.verdict-issues {
  background: #fde8e8;
  color: #a00;
}

.proportion-bar {
  height: 26px;
  background: #f4f4f4;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  font-size: 0.7rem;
  font-weight: 600;
  color: #fff;
}

.proportion-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.3s ease;
}

.seg-verified {
  background: #127a3a;
}

.seg-tocheck {
  background: #a00;
}

.seg-unverifiable {
  background: #888;
}

.hero-breakdown {
  font-size: 0.78rem;
  color: #666;
  margin-top: 0.4rem;
}
```

- [ ] **Step 5.3: TypeScript check the new component compiles**

```bash
cd /Users/michael/Projects/lens/cite-sight
npx tsc --noEmit --project packages/desktop/tsconfig.json
```

Expected: no errors. (`Overview.css` is imported by name only when wired in; the file just needs to exist for now.)

- [ ] **Step 5.4: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/desktop/src/renderer/components/Overview/VerdictHero.tsx packages/desktop/src/renderer/components/Overview/Overview.css
git commit -m "feat(desktop): VerdictHero component

Hero 1 of the new Overview tab: filename + metadata + verdict pill +
three-segment proportion bar + one-line breakdown."
```

---

## Task 6: Desktop — PriorityListRow component

**Files:**
- Create: `packages/desktop/src/renderer/components/Overview/PriorityListRow.tsx`
- Modify: `packages/desktop/src/renderer/components/Overview/Overview.css`

- [ ] **Step 6.1: Create the row component**

```tsx
// packages/desktop/src/renderer/components/Overview/PriorityListRow.tsx
import { useState } from 'react';
import type { PriorityItem } from '@michaelborck/cite-sight-core';

interface Props {
  item: PriorityItem;
  /** Called when the user clicks Dismiss or Mark as fabricated. */
  onDismiss: (itemKey: string, type: 'dismiss' | 'fabricated') => void;
}

const CATEGORY_LABEL: Record<PriorityItem['category'], string> = {
  not_found: 'Not found',
  suspect: 'Suspect',
  orphan: 'Orphan citation',
};

function scholarSearchUrl(text: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(text)}`;
}

export function PriorityListRow({ item, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`priority-row category-${item.category} ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="priority-row-header"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
      >
        <span className="priority-row-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="priority-row-category">{CATEGORY_LABEL[item.category]}</span>
        <span className="priority-row-headline">{item.headline}</span>
      </button>

      {expanded && (
        <div className="priority-row-detail">
          {item.reason && <div className="priority-row-reason">{item.reason}</div>}

          <div className="priority-row-source-label">Source</div>
          <blockquote className="priority-row-source">{item.sourceText}</blockquote>

          {item.matched && (
            <>
              <div className="priority-row-source-label">Database returned</div>
              <div className="priority-row-matched">
                <strong>{item.matched.title ?? '(no title)'}</strong>
                {item.matched.year && <> ({item.matched.year})</>}
                {item.matched.source && <> — {item.matched.source}</>}
                {item.matched.doi && <> — DOI: {item.matched.doi}</>}
              </div>
            </>
          )}

          <div className="priority-row-actions">
            <a
              className="priority-action priority-action-search"
              href={scholarSearchUrl(item.headline)}
              target="_blank"
              rel="noreferrer"
            >
              Search Scholar
            </a>
            <button
              type="button"
              className="priority-action priority-action-dismiss"
              onClick={() => onDismiss(item.itemKey, 'dismiss')}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="priority-action priority-action-fabricated"
              onClick={() => onDismiss(item.itemKey, 'fabricated')}
            >
              Mark as fabricated
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.2: Add styles to `Overview.css`**

Append to `packages/desktop/src/renderer/components/Overview/Overview.css`:

```css
/* === priority list rows === */

.priority-row {
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fafafa;
  margin-bottom: 0.4rem;
  overflow: hidden;
}

.priority-row.expanded {
  background: #fff;
}

.priority-row-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
}

.priority-row-header:hover {
  background: #f4f4f4;
}

.priority-row-chevron {
  color: #888;
  font-size: 0.8rem;
  width: 0.9rem;
}

.priority-row-category {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  flex-shrink: 0;
}

.category-not_found .priority-row-category {
  background: #fbb;
  color: #700;
}

.category-suspect .priority-row-category {
  background: #fed8a4;
  color: #7a4500;
}

.category-orphan .priority-row-category {
  background: #cfe2ff;
  color: #054;
}

.priority-row-headline {
  flex: 1;
  font-weight: 500;
  font-size: 0.9rem;
  color: #222;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.priority-row-detail {
  padding: 0.6rem 0.9rem 0.8rem 0.9rem;
  border-top: 1px solid #eee;
  font-size: 0.85rem;
}

.priority-row-reason {
  color: #666;
  margin-bottom: 0.5rem;
}

.priority-row-source-label {
  color: #888;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.2rem;
  margin-top: 0.4rem;
}

.priority-row-source {
  background: #fffbe6;
  border-left: 3px solid #f5c542;
  margin: 0;
  padding: 0.5rem 0.6rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  color: #333;
}

.priority-row-matched {
  padding: 0.3rem 0;
  color: #444;
}

.priority-row-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.7rem;
  flex-wrap: wrap;
}

.priority-action {
  display: inline-block;
  background: #eee;
  border: none;
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  font-size: 0.78rem;
  cursor: pointer;
  font-family: inherit;
  color: #222;
  text-decoration: none;
}

.priority-action:hover {
  background: #ddd;
}

.priority-action-fabricated {
  background: #fde8e8;
  color: #a00;
}

.priority-action-fabricated:hover {
  background: #fbcccc;
}
```

- [ ] **Step 6.3: Verify TypeScript compiles**

```bash
cd /Users/michael/Projects/lens/cite-sight
npx tsc --noEmit --project packages/desktop/tsconfig.json
```

Expected: no errors.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/desktop/src/renderer/components/Overview/PriorityListRow.tsx packages/desktop/src/renderer/components/Overview/Overview.css
git commit -m "feat(desktop): PriorityListRow with inline expand

Single row of the 'Things to check' hero. Collapsed shows category +
headline; expanded shows source quote, optional database-match info,
and three actions (Search Scholar, Dismiss, Mark as fabricated).
Multiple rows can be expanded at once."
```

---

## Task 7: Desktop — ThingsToCheckHero (filter chips + list)

**Files:**
- Create: `packages/desktop/src/renderer/components/Overview/ThingsToCheckHero.tsx`
- Modify: `packages/desktop/src/renderer/components/Overview/Overview.css`

- [ ] **Step 7.1: Create the component**

```tsx
// packages/desktop/src/renderer/components/Overview/ThingsToCheckHero.tsx
import { useState } from 'react';
import type { PriorityItem, PriorityCategory } from '@michaelborck/cite-sight-core';
import { PriorityListRow } from './PriorityListRow.js';

interface Props {
  items: PriorityItem[];
  onDismiss: (itemKey: string, type: 'dismiss' | 'fabricated') => void;
}

const CHIP_DEFS: { category: PriorityCategory; label: string; className: string }[] = [
  { category: 'not_found', label: 'Not found', className: 'chip-not_found' },
  { category: 'suspect', label: 'Suspect', className: 'chip-suspect' },
  { category: 'orphan', label: 'Orphan', className: 'chip-orphan' },
];

export function ThingsToCheckHero({ items, onDismiss }: Props) {
  const [hiddenCategories, setHiddenCategories] = useState<Set<PriorityCategory>>(new Set());

  const counts = CHIP_DEFS.reduce<Record<PriorityCategory, number>>(
    (acc, def) => ({ ...acc, [def.category]: items.filter((i) => i.category === def.category).length }),
    { not_found: 0, suspect: 0, orphan: 0 },
  );

  const visibleItems = items.filter((i) => !hiddenCategories.has(i.category));

  const toggleCategory = (cat: PriorityCategory) => {
    setHiddenCategories((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="hero-card">
      <div className="hero-section-title">Things to check</div>

      <div className="filter-chips">
        {CHIP_DEFS.map((def) => {
          const hidden = hiddenCategories.has(def.category);
          return (
            <button
              key={def.category}
              type="button"
              className={`filter-chip ${def.className} ${hidden ? 'off' : ''}`}
              onClick={() => toggleCategory(def.category)}
              aria-pressed={!hidden}
            >
              {def.label} · {counts[def.category]}
            </button>
          );
        })}
      </div>

      {visibleItems.length === 0 ? (
        <div className="priority-empty">
          {items.length === 0
            ? 'Nothing flagged — every reference verified and every in-text citation matched.'
            : 'All flagged items are filtered out. Click a chip to show them.'}
        </div>
      ) : (
        <div className="priority-list">
          {visibleItems.map((item) => (
            <PriorityListRow key={item.itemKey} item={item} onDismiss={onDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7.2: Add styles to `Overview.css`**

Append:

```css
/* === things-to-check hero === */

.hero-section-title {
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 0.6rem;
  color: #222;
}

.filter-chips {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.8rem;
}

.filter-chip {
  border: 1px solid transparent;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.filter-chip.off {
  opacity: 0.35;
  text-decoration: line-through;
}

.chip-not_found { background: #fbb; color: #700; }
.chip-suspect   { background: #fed8a4; color: #7a4500; }
.chip-orphan    { background: #cfe2ff; color: #054; }

.priority-empty {
  padding: 1rem;
  text-align: center;
  color: #666;
  background: #fafafa;
  border-radius: 6px;
  font-size: 0.9rem;
}

.priority-list {
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 7.3: Verify TypeScript compiles**

```bash
cd /Users/michael/Projects/lens/cite-sight
npx tsc --noEmit --project packages/desktop/tsconfig.json
```

Expected: no errors.

- [ ] **Step 7.4: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/desktop/src/renderer/components/Overview/ThingsToCheckHero.tsx packages/desktop/src/renderer/components/Overview/Overview.css
git commit -m "feat(desktop): ThingsToCheckHero with filter chips

Hero 2 of the new Overview tab: filter chips per category with live
counts, and the priority list of flagged items. Filtering is local
state — toggle a chip to hide that category."
```

---

## Task 8: Desktop — UndoToast component

**Files:**
- Create: `packages/desktop/src/renderer/components/Overview/UndoToast.tsx`
- Modify: `packages/desktop/src/renderer/components/Overview/Overview.css`

- [ ] **Step 8.1: Create the toast component**

```tsx
// packages/desktop/src/renderer/components/Overview/UndoToast.tsx
import { useEffect } from 'react';

interface Props {
  /** The message to display (e.g. "Dismissed Smith (2024)"). */
  message: string;
  /** Called when the user clicks Undo. */
  onUndo: () => void;
  /** Called after the toast times out without an Undo click. */
  onExpire: () => void;
  /** Milliseconds before auto-expiry. Defaults to 5000. */
  durationMs?: number;
}

export function UndoToast({ message, onUndo, onExpire, durationMs = 5000 }: Props) {
  useEffect(() => {
    const id = setTimeout(onExpire, durationMs);
    return () => clearTimeout(id);
  }, [onExpire, durationMs]);

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-message">{message}</span>
      <button type="button" className="undo-toast-button" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
```

- [ ] **Step 8.2: Add toast styles to `Overview.css`**

Append:

```css
/* === undo toast === */

.undo-toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: #222;
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  z-index: 9999;
  font-size: 0.9rem;
  animation: toast-slide-in 0.2s ease-out;
}

@keyframes toast-slide-in {
  from { transform: translate(-50%, 20px); opacity: 0; }
  to   { transform: translate(-50%, 0); opacity: 1; }
}

.undo-toast-button {
  background: transparent;
  color: #ffd75e;
  border: none;
  padding: 0;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  font-family: inherit;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.undo-toast-button:hover {
  text-decoration: underline;
}
```

- [ ] **Step 8.3: Verify TypeScript compiles**

```bash
cd /Users/michael/Projects/lens/cite-sight
npx tsc --noEmit --project packages/desktop/tsconfig.json
```

Expected: no errors.

- [ ] **Step 8.4: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/desktop/src/renderer/components/Overview/UndoToast.tsx packages/desktop/src/renderer/components/Overview/Overview.css
git commit -m "feat(desktop): UndoToast component

Five-second toast that lets the user reverse a Dismiss or
Mark-as-fabricated click. Auto-expires; calling onExpire commits the
action permanently from the caller's perspective."
```

---

## Task 9: Desktop — OverviewPanel (top-level)

**Files:**
- Create: `packages/desktop/src/renderer/components/Overview/OverviewPanel.tsx`
- Create: `packages/desktop/src/renderer/components/Overview/index.ts`

- [ ] **Step 9.1: Create the top-level panel**

```tsx
// packages/desktop/src/renderer/components/Overview/OverviewPanel.tsx
import { useMemo, useState } from 'react';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import { computeVerdict, gatherPriorityItems } from '@michaelborck/cite-sight-core';
import { VerdictHero } from './VerdictHero.js';
import { ThingsToCheckHero } from './ThingsToCheckHero.js';
import { UndoToast } from './UndoToast.js';
import './Overview.css';

interface Props {
  results: AnalysisResult;
}

interface PendingDismissal {
  itemKey: string;
  type: 'dismiss' | 'fabricated';
  /** Human-friendly text shown in the toast. */
  headline: string;
}

export function OverviewPanel({ results }: Props) {
  // Session-only dismissal state — lost on tab change or reload (Phase 1).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingDismissal | null>(null);

  const verdict = useMemo(() => computeVerdict(results.references, dismissed), [results.references, dismissed]);
  const items = useMemo(() => gatherPriorityItems(results.references, dismissed), [results.references, dismissed]);

  const handleDismiss = (itemKey: string, type: 'dismiss' | 'fabricated') => {
    const item = items.find((i) => i.itemKey === itemKey);
    const headline = item?.headline ?? itemKey;

    setDismissed((s) => {
      const next = new Set(s);
      next.add(itemKey);
      return next;
    });
    setPending({ itemKey, type, headline });
  };

  const handleUndo = () => {
    if (!pending) return;
    setDismissed((s) => {
      const next = new Set(s);
      next.delete(pending.itemKey);
      return next;
    });
    setPending(null);
  };

  const handleExpire = () => {
    // No-op for the dismissal itself — it was already applied at click time.
    // We just clear the toast slot.
    setPending(null);
  };

  return (
    <div className="overview-panel">
      <VerdictHero
        fileName={results.fileName}
        wordCount={results.readability.wordCount}
        processingTimeMs={results.processingTime}
        verdict={verdict}
      />
      <ThingsToCheckHero items={items} onDismiss={handleDismiss} />

      {pending && (
        <UndoToast
          message={
            pending.type === 'dismiss'
              ? `Dismissed: ${pending.headline}`
              : `Marked as fabricated: ${pending.headline}`
          }
          onUndo={handleUndo}
          onExpire={handleExpire}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 9.2: Create the barrel**

```typescript
// packages/desktop/src/renderer/components/Overview/index.ts
export { OverviewPanel } from './OverviewPanel.js';
```

- [ ] **Step 9.3: Verify TypeScript compiles**

```bash
cd /Users/michael/Projects/lens/cite-sight
npx tsc --noEmit --project packages/desktop/tsconfig.json
```

Expected: no errors.

- [ ] **Step 9.4: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/desktop/src/renderer/components/Overview/OverviewPanel.tsx packages/desktop/src/renderer/components/Overview/index.ts
git commit -m "feat(desktop): OverviewPanel combining the two heroes

Top-level component for the redesigned Overview tab. Holds the
session-only dismissal Set and wires Dismiss / Mark-as-fabricated
through the UndoToast."
```

---

## Task 10: Desktop — Wire into ResultsDashboard and reorder sidebar

**Files:**
- Modify: `packages/desktop/src/renderer/components/ResultsDashboard.tsx`
- Modify: `packages/desktop/src/renderer/components/ResultsDashboard.css`

- [ ] **Step 10.1: Read the current `ResultsDashboard.tsx` to locate exactly what to change**

Open `packages/desktop/src/renderer/components/ResultsDashboard.tsx` and find these three regions:

1. The inline `function OverviewPanel({ results }: Props)` definition (around line 59-99).
2. The `SECTIONS` constant (around line 511-518).
3. The `<aside className="results-sidebar">` block where `{SECTIONS.map(...)}` renders.

- [ ] **Step 10.2: Replace the inline OverviewPanel with an import**

At the top of `ResultsDashboard.tsx`, change the existing React import to include `Fragment` and add the new component import below it:

```typescript
import { Fragment, useEffect, useState } from 'react';
import { OverviewPanel } from './Overview/index.js';
```

Then delete the entire inline `function OverviewPanel({ results }: Props) { ... }` block (around lines 59-99). The component is now imported from `./Overview`.

- [ ] **Step 10.3: Reorder the SECTIONS array**

Replace the current `SECTIONS` constant with:

```typescript
const SECTIONS = [
  { id: 'overview',    label: 'Overview',    icon: '◆', group: 'primary' as const },
  { id: 'references',  label: 'References',  icon: '📚', group: 'primary' as const },
  { id: 'crossrefs',   label: 'Cross-refs',  icon: '⇄', group: 'primary' as const },
  { id: 'quality',     label: 'Quality',     icon: '✎', group: 'bonus' as const },
  { id: 'words',       label: 'Words',       icon: '🔢', group: 'bonus' as const },
  { id: 'patterns',    label: 'Patterns',    icon: '🔍', group: 'bonus' as const },
];
```

Note: Overview is now first (was already first); References / Cross-refs are tagged `primary`; Quality / Words / Patterns are tagged `bonus`. Order is unchanged from today — only the grouping is new.

- [ ] **Step 10.4: Render a "Bonus signals" divider in the sidebar**

Find the sidebar render block (`<nav className="sidebar-nav">{SECTIONS.map(s => {...})}</nav>`) and replace it with a version that injects the divider between the primary and bonus groups:

```tsx
<nav className="sidebar-nav">
  {SECTIONS.map((s, idx) => {
    const prev = SECTIONS[idx - 1];
    const showDivider = prev && prev.group === 'primary' && s.group === 'bonus';
    const badge = getBadge(s.id);
    return (
      <Fragment key={s.id}>
        {showDivider && <div className="sidebar-divider">Bonus signals</div>}
        <button
          className={`sidebar-link ${activeSection === s.id ? 'active' : ''}`}
          onClick={() => setActiveSection(s.id)}
        >
          <span><span className="icon">{s.icon}</span> {s.label}</span>
          {badge.count !== null && (
            <span className={`sidebar-badge ${badge.warn ? 'warn' : ''}`}>{badge.count}</span>
          )}
        </button>
      </Fragment>
    );
  })}
</nav>
```

- [ ] **Step 10.5: Add divider style to `ResultsDashboard.css`**

Append (don't replace) at the end of `packages/desktop/src/renderer/components/ResultsDashboard.css`:

```css
.sidebar-divider {
  margin: 0.6rem 0.5rem 0.3rem 0.5rem;
  padding-top: 0.4rem;
  border-top: 1px solid #ddd;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888;
  font-weight: 600;
}
```

- [ ] **Step 10.6: Verify TypeScript compiles + lint passes**

```bash
cd /Users/michael/Projects/lens/cite-sight
npx tsc --noEmit --project packages/desktop/tsconfig.json
npm run lint
```

Expected: no TypeScript errors. Lint may report unrelated warnings — only block on errors in the files we touched.

- [ ] **Step 10.7: Commit**

```bash
cd /Users/michael/Projects/lens/cite-sight
git add packages/desktop/src/renderer/components/ResultsDashboard.tsx packages/desktop/src/renderer/components/ResultsDashboard.css
git commit -m "feat(desktop): wire OverviewPanel; reorder sidebar with bonus divider

Removes the inline OverviewPanel function in favour of the new
multi-component one under Overview/. Tags each sidebar section as
primary or bonus and renders a 'Bonus signals' divider before the
Quality/Words/Patterns group."
```

---

## Task 11: End-to-end manual verification

**Files:** none modified — verification only.

- [ ] **Step 11.1: Build core, then desktop**

```bash
cd /Users/michael/Projects/lens/cite-sight
npm run build:core
npm run build:desktop
```

Expected: both build cleanly.

- [ ] **Step 11.2: Start the Vite dev server and Electron**

```bash
# Terminal 1
cd /Users/michael/Projects/lens/cite-sight/packages/desktop
npx vite

# Terminal 2 (once Vite is serving)
cd /Users/michael/Projects/lens/cite-sight
npx tsc -p packages/desktop/tsconfig.json
cd packages/desktop && npx electron .
```

Expected: Electron window opens.

- [ ] **Step 11.3: Run the user's known-good test file through the app**

In the Electron app: click **Browse Files**, pick `/Users/michael/Desktop/references-collated.txt`, hit **Analyse**.

Verify, on the resulting Overview tab:

1. **VerdictHero**
   - File name `references-collated.txt` and metadata line render correctly.
   - Verdict pill is **Caution** (because 13 items are flagged) or **All clear** depending on dismissals.
   - Proportion bar shows three coloured segments; widths sum to 100%.
   - One-line breakdown matches the chip counts.

2. **ThingsToCheckHero**
   - Three filter chips render with counts that sum to the priority list length.
   - Clicking a chip greys it out and hides those rows. Clicking again brings them back.
   - The list shows rows for `Not found`, `Suspect`, and `Orphan citation` in that order.

3. **PriorityListRow**
   - Each collapsed row shows category badge + headline text.
   - Clicking expands the row in place; multiple can be open at once.
   - Expanded view shows the source quote in italic with a yellow border, the reason line, and three action buttons.
   - **Search Scholar** opens Google Scholar in the system browser with the headline pre-filled.

4. **Dismiss + Undo**
   - Click **Dismiss** on any row: the row disappears, the verdict counts update, and a black toast appears at the bottom of the window with `Dismissed: ...` and an **UNDO** button.
   - Within 5 seconds: click **UNDO** — the row returns and counts revert.
   - Repeat dismiss, wait 5+ seconds: the toast fades; the row stays hidden.
   - Click **Mark as fabricated**: toast says `Marked as fabricated: ...`.

5. **Sidebar**
   - The sidebar shows: Overview · References · Cross-refs, then a thin divider labelled **Bonus signals**, then Quality · Words · Patterns.
   - Clicking each section still routes correctly to the existing panels (References / Cross-refs / Quality / Words / Patterns are unchanged).

- [ ] **Step 11.4: Run all tests one final time**

```bash
cd /Users/michael/Projects/lens/cite-sight
npx vitest --root packages/core run
```

Expected: all tests pass (39 prior + 13 new dashboard tests = 52 total).

- [ ] **Step 11.5: Commit a tiny note + close out the phase**

If any manual fix was needed during verification (typo, missing CSS rule), commit that fix:

```bash
git add -A
git commit -m "fix(desktop): manual verification adjustments

[brief description of what was tweaked]"
```

If no fixes were needed, no commit. The phase is done — the working tree should be clean.

---

## Out of scope (deferred to later phases)

These are explicitly NOT in Phase 1, per the design doc. Do not implement them in this plan:

- Source-span page numbers, surrounding context, paragraph location (Phase 2)
- Per-provider verification trail in the expanded row (Phase 2)
- Parser-confidence heuristic + the fourth "Parser unsure" category (Phase 3)
- Persistent dismissals on disk; export / import `.citesight.json` (Phase 4)
- Sidebar file list with status dots; "All Files" batch roll-up view (Phase 5)
- Verdict-pill threshold tuning (after data from Phase 3)

---

## Self-review

Done before declaring this plan ready:

1. **Spec coverage** — every Phase 1 bullet in the spec maps to a task:
   - New Overview layout → Tasks 5, 6, 7, 9
   - Two heroes (verdict + things-to-check) → Tasks 5, 7
   - Filter chips with counts → Task 7
   - Inline-expand priority list rows → Task 6
   - Source text in expanded row → Task 6 (uses `reference.raw` since page/line is Phase 2)
   - Action buttons (Search Scholar / Dismiss / Mark as fabricated) → Task 6
   - 5-second Undo toast → Task 8
   - Session-only dismissals → Task 9
   - Sidebar reorder with "Bonus signals" divider → Task 10
   - "No data model changes" → only `core/src/dashboard/` (a new pure-logic module) and new desktop UI files; no existing types touched
2. **Placeholder scan** — no TBDs, no "implement later", no "add error handling", no "similar to Task N". All code blocks are complete.
3. **Type consistency** — `PriorityItem.itemKey`, `PriorityCategory`, `Verdict.state`, `VerdictState` are used identically wherever they appear. The dismissal-key format `ref:<index>` / `intext:<index>` is consistent across `computeVerdict`, `gatherPriorityItems`, and `OverviewPanel`. (Note: this index-based scheme is intentionally fragile by design — Phase 4 swaps it for content-hashed keys when persistence comes online.)
4. **No new dependencies** — every import is from packages already in `dependencies` / `devDependencies`.
