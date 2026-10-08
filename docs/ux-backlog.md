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

## Batch 2 — routing and contrast

- [x] **#7 Deep-link `/tool` and read it on mount.** Web routing was in-memory
  `useState`, so a refresh returned to the landing page and the session-restore
  effect in `ToolPage` never mounted — the refresh recovery the README promises
  was unreachable. Pages now live in the URL (`/`, `/tool`, `/about`) with
  `pushState` and a `popstate` listener, so browser back works and a cold deep
  link loads (the server already serves the SPA for every path).
- [x] **Page changes are announced and focused.** Swapping the `<main>` subtree
  left focus on a button that no longer existed; a visually hidden
  `role="status"` heading now takes focus on each navigation.
- [x] **Skip link, labelled nav, `aria-current`, keyboard-operable brand.** The
  brand was an `<h1 onClick>` — a mouse-only heading that was the only `h1` on
  every page. It is now a real button inside the `h1`, with a skip link and
  `aria-current="page"` on the active nav item.
- [x] **Contrast tokens corrected.** Nine text tokens failed WCAG AA — help text
  and links at 2.4–3.3:1, and the "Needs review" badge at 2.6:1. Hues are
  unchanged; only lightness moved, and every token now clears 4.5:1 on paper,
  white and its own tinted background. Applied to all three `index.css` copies.
- [x] **Disabled primary button is readable.** White text at 0.4 opacity
  measured 1.03:1, so "Check citations" before a file was chosen was invisible
  text. It now uses the neutral surface/text pairing at 4.59:1.
- [x] **State is no longer signalled by opacity.** Reviewed rows (0.45) and
  hidden filter chips (0.4) sat near 1.2:1. They now keep full contrast and gain
  a line-through plus an inset outline, matching what `aria-pressed="false"`
  already tells assistive tech.
- [x] **`packages/web/test/contrast.test.ts`** — computes real contrast ratios
  from `index.css` for every text token, checks all three copies ship the
  corrected palette, and asserts the opacity-as-state rules stay gone.

## Batch 3 — report correctness and consistency

- [x] **The plain-text CLI report was silently dropping `nearMatches`** — the
  "likely a typo, not a fake" suggestion appeared in the terminal and HTML
  reports but never in a saved `.txt`. That is a whole class of finding missing
  from the artefact a marker is most likely to keep.
- [x] **Status legend in the text report.** It printed raw `[not_found]` /
  `[unverified]` tokens with no explanation, which is exactly the distinction a
  grader must not get wrong: "not found" means every database answered and found
  nothing, "unverified" means our lookup failed.
- [x] **No more stacked blank lines** in the text report (each block ended in
  `\n` and was then joined with `\n`, giving 4–6 consecutive newlines per
  reference).
- [x] **One status vocabulary, in core.** `STATUS_LABELS` / `STATUS_HINTS` now
  live in `core/src/references/explain.ts`. The dashboard and the live progress
  view had their own copies and the CLI had a third; the six verdicts were
  described four different ways across the app.
- [x] **The disclaimer prints once per run, not once per file** (~14 lines × N
  files buried the findings). Moved to stderr so `--json` output stays
  machine-readable — the first attempt broke six tests by writing it to stdout.
- [x] **`HelpOverlay` is a real dialog**: `aria-modal` was declared with no
  focus trap, no initial focus, no Escape and no focus restore, so AT was told
  to hide content that stayed keyboard-reachable. All four now work, plus
  click-outside to close.
- [x] **Section-help popovers** expose `aria-expanded`/`aria-controls`, close on
  Escape or an outside click, and trap Tab inside (they previously closed only
  via a close button you had to tab to find).
- [x] **Streaming progress is announced.** `aria-live` on the counter and
  `role="progressbar"` with `aria-valuetext` on the bar. This is the only
  async-progress surface in the app and a screen-reader user previously heard one
  message and then nothing for the whole run.
- [x] **No nested `<main>` landmark.** `ResultsDashboard` rendered a second
  `<main>` inside the host page's — invalid, and it broke landmark navigation on
  all four surfaces. Now a labelled `<section>`.
- [x] **Dropzone is announced.** react-dropzone's root is focusable and
  Enter/Space operable but shipped `role="presentation"` with no accessible name,
  so it was announced as nothing.
- [x] **File-rejection messages say something a person can act on.** Desktop and
  standalone printed react-dropzone's strings verbatim ("File is larger than
  52428800 bytes"); the wording now lives in one shared helper and reads like
  the web app's.
- [x] **The "Orphaned" stat says what it counts.** It summed unmatched in-text
  citations *and* uncited bibliography entries while the Cross-refs panel
  presented those as two different things. Now "Unmatched (N cited, M uncited)".
- [x] **`unverified` looks the same everywhere.** It was amber + dashed in the
  reference table but grey on two other surfaces, discarding the deliberate
  "retryable, not a confirmed miss" signal.

## Batch 4 — next up (not started)

- [ ] **#9 Land or delete `VerdictHero`.** The headline-verdict treatment
  (all-clear / caution / issues + proportion bar) is unreachable; reports open
  on a count sentence instead. It is the last remaining dead component.
- [ ] **`Format Only` is the least explained verdict.** It is unfilterable,
  uncounted, absent from the legend and absent from the help topics — yet it is
  the *only* verdict a local-only run produces.
- [ ] **Consolidate the triplicated report generators** (`generatePdfReport.ts`
  ×3, `generateCsvReport.ts` ×3 — the desktop CSV is two feature-generations
  behind the others). Natural home is now that `ui-dashboard` exports shared
  copy helpers.
- [ ] **Desktop batch completion signal.** A finished run is indistinguishable
  from a stalled one: no banner, no "N of M done".

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

- [x] Status-badge text contrast: amber "Needs review" **2.58:1**, `--ink-faint`
  **2.58:1**, `--accent` links **3.32:1** — all failed WCAG AA and are now fixed
  (see Batch 2).
- [x] Streaming progress now announces via `aria-live` + `role="progressbar"`.
- [ ] The focused row still unmounts when a review is recorded, with no focus
  restore (the toast announces the action; focus itself is not restored).
- [ ] Desktop Settings overlay still claims `aria-modal="true"` with no focus
  trap, no Escape, no focus restore — the same defect just fixed in `HelpOverlay`.
- [x] No nested `<main>` landmark; `ResultsDashboard` is now a labelled
  `<section>`.
- [x] Dropzone now has `role="button"` and an accessible name.
- [x] Section-help popovers have `aria-expanded`/`aria-controls` and close on
  Escape/outside click.
- [ ] Every section-help trigger still has the identical accessible name
  ("What does this mean?"), so with several on screen they are indistinguishable.

## Backlog — clarity & consistency

- [ ] `Format Only` status is unfilterable, uncounted, and unexplained — yet it
  is the *only* status in a local-only run.
- [x] "Orphaned" summary stat silently included uncited bibliography entries; it
  now reads "Unmatched (N cited, M uncited)".
- [x] `unverified` was amber in the table but grey on two other surfaces.
- [x] One status vocabulary: `STATUS_LABELS` / `STATUS_HINTS` in core, consumed
  by the dashboard, the live progress view and the CLI text report. Still to do:
  the CLI terminal keeps its lowercase glyph form and the PDF export keeps
  "Unverified (lookup failed)".
- [x] Desktop/standalone no longer print raw react-dropzone messages.

## Backlog — scale & performance

- [ ] No search box, pagination, or virtualisation for the reference table. This
  is the biggest functional gap: a 200-reference bibliography has no way to
  filter by title, author or DOI.
- [ ] Every review action re-renders the whole table (`ReferenceRow` not
  memoised; `dismissed` is a fresh `Set` per effect run; `live()` filters 6×).
- [ ] Zero media queries in `ResultsDashboard.css` / `Overview.css`; 220px
  sidebar never collapses and the 7-column table is saved only by
  `overflow-x: auto`.

## Backlog — CLI report quality

- [x] Text report no longer drops `nearMatches`, and now carries a status legend.
- [x] Disclaimer printed once per run (on stderr) rather than once per file.
- [ ] Batch roll-up prints *after* every per-file report, so a 20-file run buries
  the summary under 20 reports.
- [ ] `--fail-on` help text still says "Exit 2 when findings are present" while
  the flag has four levels.
- [ ] Batch roll-up prints *after* every per-file report.