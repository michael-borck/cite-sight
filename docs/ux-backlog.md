# UX Backlog

Findings from the UX/accessibility audit of all four surfaces (web, desktop,
standalone, CLI) plus the shared `ui-dashboard`. Ranked by impact ÷ effort.
Tick items as they land; keep the "why it matters" one-liners so a future
reader can triage without re-running the audit.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done

---

## Batch 1 — dead code + accessibility (shipped 2026-10-08)

- [x] **#1 Render the hosted-limits disclosure on the web tool page.**
  `HOSTED_LIMITS_NOTICE` is imported in `web/src/disclaimer.ts:13-14` and fully
  styled (`.hosted-notice`, `ToolPage.css:55-83`) but had zero consumers. The
  hosted checker is the only product that uploads the document to a server; it
  now discloses before upload, like standalone already does.
- [x] **#2 Wire up `UndoToast`** — the only undo affordance and the only proper
  live region in the package, exported but never rendered. Review actions now
  announce and are reversible.
- [x] **#3 Show `AnalysisProgress` on the sync (no-SSE) path.** A server without
  Redis analysed inline, so the client sat on a bare `<progress>` for minutes
  with no %, stage, or pacing note. `AnalysisProgress` already existed for
  exactly this and was dead.
- [x] **#4 Fix the "Reviewed items remain available below" false copy.**
  Reviewed items are filtered out of the priority list, so nothing was below.
- [x] **#5 Fix the focus ring.** `outline: none` + a box-shadow measuring
  **1.33:1** against white (WCAG 2.4.11 wants 3:1). Replaced with a solid
  accent ring; `outline: none` removed.
- [x] **#6 Keyboard-accessible table sorting.** Clickable `<th>` with no
  `tabIndex` / `aria-sort` / button role — mouse-only sorting. Now a real
  button in the header with `aria-sort`.
- [x] **#8 Fix the CLI exit-code bug.** A claims finding with status
  `unavailable` set `hadError` → exit 1 while the printed message said "Exit 0".
  Contradicted the documented policy in `cli/src/findings.ts`. The decision now
  lives in an exported `exitCodeFor()` so it can be unit-tested without spawning
  the CLI, matching why `findings.ts` was extracted in the first place.
- [x] **#10 Add a "Remove file" affordance on the web upload.** Once a file was
  chosen there was no way to clear it without starting a run and cancelling.
- [x] **Focus rings across all three bundles.** The 1.33:1 ring shipped
  independently in web, desktop and standalone (`index.css` is byte-identical
  across the three). All three now use a solid `accent-dim` outline, extended to
  links, inputs, selects and `[tabindex]` rows, and the four `outline: none`
  overrides that defeated it were removed. The react-dropzone root also gets a
  visible focus state — it was focusable and Enter/Space operable with no
  feedback at all.
- [x] **Dismiss the upload/privacy notices**, and reword the retention line —
  the old copy said queued reports exclude document text, but `retention.ts`
  strips text from *every* report.
- [x] **`beforeunload` guard** while a check is running or a report is
  un-downloaded; both the queued job and the recovery window die with the tab.

## Batch 2 — next up (not started)

- [ ] **#7 Deep-link `/tool` and read it on mount**, then keep the
  `beforeunload` guard. Web routing is in-memory `useState`
  (`web/src/App.tsx:10`), so refreshing the tab drops the user on the landing
  page and the session-restore effect never runs — the recovery the README
  promises is effectively unreachable.
- [ ] **#9 Land or delete `VerdictHero`.** The headline-verdict treatment
  (all-clear / caution / issues + proportion bar) is unreachable; reports open
  on a count sentence instead.

## Backlog — trust & disclosure (product call)

- [ ] Landing page has no privacy line; the only privacy copy promotes the
  *offline* products while the hero CTA uploads the document to a server.
- [ ] `LandingPage.tsx:346-348` claims desktop offers "everything the web
  version offers", contradicted by `HOSTED_LIMITS_NOTICE` (shared server-side
  rate limits → more `Unverified`).
- [ ] Put "not found ≠ fake" / "not a plagiarism or AI detector" near the hero,
  not two clicks away on About.
- [ ] UI never states that the desktop options blob (`localStorage`) persists API
  keys — only *sessions* exclude them.

## Backlog — accessibility

- [ ] Status-badge text contrast: amber "Needs review" **2.58:1**, `--ink-faint`
  **2.58:1**, `--accent` links **3.32:1** — all fail WCAG AA. Fixing the focus
  ring did not touch these; they are a separate token change.
- [ ] Live regions: streaming progress still silent on every surface; recording a
  review is now announced via the toast, but the focused row still unmounts with
  no focus restore.
- [ ] `HelpOverlay` + desktop Settings claim `aria-modal="true"` with no focus
  trap, no Escape, no focus restore.
- [ ] State by opacity alone (reviewed rows `0.45`, off-filters `0.4`).
- [ ] `<main>` nested inside `<main>`; brand `<h1 onClick>` mouse-only; no skip
  link; dropzone is focusable but `role="presentation"` with no accessible name
  (it now has a focus style, but still no `role="button"` + label).

## Backlog — clarity & consistency

- [ ] `Format Only` status is unfilterable, uncounted, and unexplained — yet it
  is the *only* status in a local-only run.
- [ ] "Orphaned" summary stat silently includes uncited bibliography entries.
- [ ] `unverified` is amber in the table but grey on two other surfaces.
- [ ] Four vocabularies for the same six statuses across CLI terminal, CLI text
  report, CLI HTML report, and PDF. Raw enums leak into UI copy.
- [ ] Desktop/standalone print raw react-dropzone messages ("larger than
  52428800 bytes"); web writes a human sentence.

## Backlog — scale & performance

- [ ] No search box, pagination, or virtualisation for the reference table.
- [ ] Every review action re-renders the whole table (`ReferenceRow` not
  memoised; `dismissed` is a fresh `Set` per effect run; `live()` filters 6×).
- [ ] Zero media queries in `ResultsDashboard.css` / `Overview.css`; 220px
  sidebar never collapses.

## Backlog — CLI report quality

- [ ] Text report drops `nearMatches` entirely (typo suggestions present in
  terminal + HTML reports but missing from saved `.txt`); no status legend in
  the file.
- [ ] ~14-line disclaimer re-printed per file (~280 lines on a 20-file batch).
- [ ] Batch roll-up prints *after* every per-file report.