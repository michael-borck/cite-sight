# Citation Signals Dashboard — design

**Date:** 2026-05-14
**Status:** Brainstorming complete, ready for implementation plan
**Scope:** A redesign of the CiteSight results dashboard centred on reference verification, with a richer signal model (parser confidence + per-provider verification trail + source spans) and durable user judgments (dismiss / mark as fabricated).

## Goal

Make it easy to answer one question, fast: **which of my references actually need attention?**

Today's dashboard gives the user counts ("86 Orphaned") without context. The user has to drill into multiple tabs to figure out whether a flagged item is a real problem or a parser hallucination. The redesign surfaces actionable signals at the top, lets the user inspect the evidence in-place, and records their judgments so the same flags don't reappear unless the doc changes.

References are the headline. The other extracted signals (readability, writing quality, word/pattern analysis) exist because we have the text anyway. They get demoted to a "Bonus signals" group.

## Users and jobs

| User | Job to be done | Surface |
|---|---|---|
| Student | "I'm about to submit. Are all my references real and properly cited?" | Web (single doc, in-browser, no retention) **or** Desktop |
| Staff / marker | "I have 30-50 submissions. Show me the dodgy ones first." | Desktop (multi-file) |

The two surfaces share the same per-doc view. The desktop app adds a multi-file sidebar and a batch roll-up.

## Information architecture

### Sidebar (visible only when 2+ files)

```
┌─────────────────┐
│ Files (3)       │
│ ─────────────── │
│ 📚 All Files    │  ← jumps to batch roll-up
│                 │
│ ● alice.pdf     │  ← green dot = all clear
│ ● bob.pdf       │  ← amber dot = needs attention (selected)
│ ● chen.docx     │  ← red dot = many issues
│ ─────────────── │
│ Sections        │
│ ◆ Overview      │
│ 📚 References   │
│ ⇄ Cross-refs    │
│ ─────────────── │
│ Bonus signals   │
│ ✎ Quality       │
│ 🔢 Words        │
│ 🔍 Patterns     │
└─────────────────┘
```

Sidebar tabs reordered from today: **Overview** first; References / Cross-refs primary; Quality / Words / Patterns demoted under a "Bonus signals" divider.

When the user has only one file loaded, the file-list portion of the sidebar collapses; the Sections list remains as the main navigation (matching today's behaviour).

### Per-doc Overview tab (the main change)

Two stacked hero blocks, then the existing depth tabs underneath:

```
┌─────────────────────────────────────────────────────────┐
│ bob-paper.pdf                                           │
│ 12 pages · 5,887 words · analysed in 11s                │
│                          [Caution — 7 to check]         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 42 verified    │ 7 to check │ 7 unverifiable        │ │  ← proportion bar
│ └─────────────────────────────────────────────────────┘ │
│ 2 suspect · 3 not found · 2 orphan citations            │
├─────────────────────────────────────────────────────────┤
│ Things to check          Export decisions · Import      │
│ [Not found · 3] [Suspect · 2] [Orphan · 2] [Parser · 0] │  ← filter chips
│                                                         │
│ ▾ NOT FOUND  Smith, J. (2024). The lost paper.          │  ← expanded
│   Source: "…as discussed in Smith, J. (2024)…"          │
│   Crossref · SemSch · OpenAlex — all no match           │
│   [Search Scholar] [Dismiss] [Mark as fabricated]       │
│                                                         │
│ ▸ SUSPECT    Mollick & Mollick (2023, SSRN)             │
│ ▸ ORPHAN     "(Borck, 2026)" — page 4                   │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

#### Hero 1 — Doc summary

- File name + lightweight metadata (pages, words, analysis time)
- **Verdict pill** in the top-right corner. States:
  - `All clear` (green) — zero items need attention
  - `Caution` (amber) — 1+ items flagged but none confirmed fabricated
  - `Issues` (red) — 1+ items marked as fabricated, or `not found` count exceeds a threshold (default 5 or 10% of total refs, whichever is greater)
- **Proportion bar** showing three segments: Verified / To check / Unverifiable. Width proportional to count, label inside if segment is wide enough.
- One-line text breakdown beneath the bar: `2 suspect · 3 not found · 2 orphan citations · 0 parser issues`.

#### Hero 2 — Things to check

- Title row with **Export decisions** / **Import decisions** links on the right.
- **Filter chips** with counts per category. Click to toggle visibility. Chip colours:
  - Not found — red
  - Suspect match — amber
  - Orphan cite — blue
  - Parser unsure — purple
- **Flat priority list** below. Each row is collapsed by default, showing only category label + the flagged item's headline text.
- Row click → **inline expand** (accordion-style). Multiple rows can be open simultaneously. Expanded content:
  - **Source span** — quoted text from the doc with surrounding context (~80 chars before/after the flagged phrase), in italic with a yellow left-border. Below: `Page N · bibliography line M` (or paragraph for non-paginated formats).
  - **Verification trail** — per-provider pills showing what Crossref / Semantic Scholar / OpenAlex returned: `Crossref: no match`, `SemSch: title diff 47%`, `OpenAlex: hit (doi:10.xxx)`.
  - **Actions** — three buttons:
    - **Search Scholar** — opens Google Scholar in a new tab with the ref title as the query.
    - **Dismiss** — hides the row + records a "user judged OK" decision against the doc-hash.
    - **Mark as fabricated** — same as Dismiss but records a "user judged bad" decision. The export JSON distinguishes the two so a marker can hand it back to a student.

### Batch roll-up (the "All Files" view)

When 2+ files are loaded, the sidebar's "All Files" entry opens a table:

| File | Verdict | Proportion | Not found | Suspect | Orphan | Parser |
|---|---|---|---|---|---|---|
| alice.pdf | All clear | ████████░░ 8/8 | 0 | 0 | 0 | 0 |
| bob.pdf | Caution | █████░░░░░ 42/49 | 3 | 2 | 2 | 0 |
| chen.docx | Issues | ███░░░░░░░ 12/40 | 18 | 5 | 5 | 0 |

Click a row to drill into that doc's Overview. The table is sortable by any column (default: worst-first by total flagged count).

## Inputs and file selection

| | Web | Desktop |
|---|---|---|
| One file | Drag-drop or "Browse" | Same |
| Multiple files | (not supported) | Drag-drop or multi-select dialog |
| Folder | (not supported) | Folder picker recurses into supported types (existing) |
| Zip | (not supported) | (not supported — deliberate) |

### Privacy story (web)

The web app processes everything in-browser. The upload screen shows a one-liner: **"Your file never leaves this browser. We don't keep anything."** A footer note repeats it. Desktop has a similar but adjusted line in About.

## Dismissal model

User decisions per row are recorded against the doc-hash (SHA-256 of file content) and persist as follows:

- **Desktop**: dismissals saved to `app.getPath('userData')/decisions/<doc-hash>.json` automatically.
- **Web**: dismissals held in-memory for the session; lost on reload.
- **Both**: a manual **Export decisions** button writes `<filename>.citesight.json` next to the doc; **Import decisions** loads it back. This lets staff hand annotated results to a student, or carry decisions across machines.

### JSON file schema

```json
{
  "docHash": "sha256:...",
  "fileName": "bob-paper.pdf",
  "decisions": [
    {
      "itemKey": "ref:23",
      "type": "dismiss",
      "reason": "Marker confirmed this is a real preprint",
      "at": "2026-05-14T10:23:45Z"
    },
    {
      "itemKey": "intext:p4-l12-Borck-2026",
      "type": "fabricated",
      "reason": null,
      "at": "2026-05-14T10:25:01Z"
    }
  ]
}
```

`itemKey` is stable across re-runs of the same file (so dismissals apply on re-analysis) and stable across parser changes (so improving the extractor doesn't invalidate every existing decision). Formula:

- **Bibliography entry:** `ref:<sha1-first-16-of-normalised-raw>`. Normalise = lowercase + strip whitespace + strip punctuation. Hashing the content (not the index) means a re-parse that finds 84 instead of 76 refs doesn't shift dismissals for the refs the user already judged.
- **In-text citation:** `intext:<sha1-first-16-of(surname + year + sourceSpanContext)>`. Including the source-span context keeps repeat citations of the same author/year distinguishable.

### Reversibility

| Action | Reversibility |
|---|---|
| Click **Dismiss** | A 5-second toast "Dismissed. Undo" appears. Click Undo to restore the row. |
| Click **Mark as fabricated** | Same toast pattern. |
| After the toast disappears | The dismissal is persisted. To undo, the user re-analyses the doc (resets all in-memory state) or deletes the JSON file from `<filename>.citesight.json` / `userData/decisions/<hash>.json`. |
| Doc content changes (different hash) | Old dismissals don't apply — they're keyed to a hash that no longer exists. The newly analysed doc starts clean. |

There is intentionally no "view dismissed items" panel in MVP. The rescan-as-reset lever is the escape hatch; the JSON file is the audit log if anyone wants to inspect it.

## Data model changes required

The current `AnalysisResult` doesn't carry enough information to power this UI. The following additions are needed in `packages/core/src/types.ts` and the extractors / verifier:

1. **Source spans on every extracted reference and in-text citation.** Currently we have `position` (character offset in the extracted text). We need:
   - `page` (for PDF inputs — already available from pdfjs)
   - `lineInBlock` (best-effort line number within the bibliography or body)
   - `contextBefore` (~80 chars before the match)
   - `contextAfter` (~80 chars after the match)

2. **Per-provider verification trail.** Today the verifier returns a single status. We need a list of attempts:

   ```ts
   verifications: Array<{
     provider: 'crossref' | 'semantic-scholar' | 'openalex';
     status: 'hit' | 'no-match' | 'error';
     matchQuality?: number;   // 0-1, only when status='hit'
     matchedTitle?: string;
     matchedDoi?: string;
     error?: string;
   }>;
   ```

3. **Parser confidence on every reference.** A 0-1 heuristic computed during `parseReference`:
   - +0.3 if DOI extracted
   - +0.2 if italic-marked title (`*Title*`)
   - +0.2 if year detected
   - +0.15 if at least one author parsed with surname pattern
   - +0.15 if volume/issue/pages or journal-like segment parsed
   - Refs below a threshold (default 0.5) get filed under "Parser unsure" in the priority list.

4. **A stable `itemKey`** computed for each ref / in-text citation, as defined in the JSON schema above. Used as the key for dismissals.

## Implementation phases

The whole thing is too big for one PR. Recommended phasing:

### Phase 1 — Core dashboard reshape (no new signals)

Just lay out the new Overview tab using existing data. Demote NLP tabs. Keep current `unmatchedBibliography` / `unmatchedInText` / `notFoundCount` / `suspiciousCount`. The priority list rows show what the current model can produce; filter chips work; rows expand to show the raw text we already have (no source-span page/line yet); dismiss is session-only (no persistence).

**Ships as:** New layout, no model changes. Maps existing summary numbers into the new visual language. Probably 1-2 days.

### Phase 2 — Source spans and per-provider trail

Update extractors to capture `page`, `contextBefore`, `contextAfter`. Update verifier to return a per-provider list instead of a single status. Wire those into the expanded row.

**Ships as:** Real source spans + per-provider pills in the expanded row. Requires core changes.

### Phase 3 — Parser confidence + Parser-unsure category

Add the confidence heuristic to `parseReference`. New category appears in the priority list. Tests for the heuristic.

**Ships as:** Parser-unsure becomes a real signal.

### Phase 4 — Dismissal persistence + JSON export/import

Build the decisions file format. Add Export / Import buttons. Wire dismiss/mark-as-fabricated through to disk on desktop. Toast + Undo behaviour. Stable `itemKey` generation.

**Ships as:** Persistent decisions, sharable JSON, full reversibility story.

### Phase 5 — Batch roll-up + multi-file sidebar

Sidebar shows file rows with status dots. "All Files" view with the sortable table. Drill-down navigation.

**Ships as:** Multi-file UX. Only matters on desktop.

Phases 1-4 are valuable on their own; phase 5 is a nice-to-have until staff users start hitting multi-file friction.

## Open questions / deferred

These are explicitly out of scope for this design and worth flagging:

- **PDF page rendering with highlights.** Showing the actual PDF page with the citation highlighted (rather than just quoted text + page number) is a much larger feature. Defer until users ask.
- **Re-analyse with edited bibliography.** Some users will want to fix a ref in-app and re-verify just that ref without re-parsing the whole doc. Defer.
- **Cross-doc deduplication.** In batch mode, two students may cite the same fabricated reference. Detecting that pattern is a feature for staff. Defer.
- **Confidence threshold tuning.** The 0.5 cutoff for "Parser unsure" is a guess. After Phase 3 ships we should measure real-world distributions and tune.
- **Verdict pill thresholds.** "Issues" at 10% or 5 fabricated is a guess. Same — tune after data.

## Out of scope

- Changes to the CLI's output (`cite-sight check`) — separate consideration.
- Server-side analysis pipeline changes — the same `analyzePipeline` runs everywhere; data model changes flow through naturally.
- Re-styling the Quality / Words / Patterns tabs themselves — they stay as-is, just demoted in the sidebar.
