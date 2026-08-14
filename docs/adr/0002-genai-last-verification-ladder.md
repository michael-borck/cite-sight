# ADR 0002 — GenAI last: the verification ladder is deterministic → interpretable ML → generative

- **Status:** Accepted
- **Date:** 2026-08-14
- **Deciders:** Michael Borck
- **Scope:** `packages/core` reference verification (parsing, matching, adjudication). Applies as a default to future features across the app.

## Context

Reference verification could plausibly be built around an LLM: hand it the
citation string and a candidate record and ask "same work?". That is the
field's current default reflex, and it was the implicit alternative each time
the adjudication layer needed work.

A 24-reference real-world audit (2026-08-14) forced the question. All 23 false
positives were fixed **without any generative component**: a style-aware
parser (quoted-title extraction, curly quotes, bare-year author anchoring),
set-arithmetic title containment with a venue-debris test, author-surname
corroboration, joint candidate scoring, and a dedicated arXiv lookup. The one
true positive (a wrong title) was also caught by these means.

## Decision

CiteSight escalates in order, and each rung must demonstrably fail before the
next is used:

1. **Deterministic first** — regex/rules, exact identifiers (DOI, arXiv ID),
   set arithmetic, authoritative API lookups.
2. **Interpretable ML second** — if a judgement genuinely needs learning
   (e.g. reference-string segmentation someday), prefer small transparent
   models whose behaviour can be tested offline and explained per-decision.
3. **Generative last** — an LLM only where the cheaper rungs demonstrably
   cannot do the job, and then wrapped in deterministic validation, never as
   the decision-maker of record.

## Decision drivers

- **Cost** — verification runs over whole folders of documents; per-reference
  LLM calls multiply into real money and latency. The deterministic pipeline
  is effectively free and paces politely against public APIs.
- **Determinism** — the same document must yield the same verdicts on every
  run. Graders act on these flags; a verdict that flips between runs is worse
  than a stable false positive, because it cannot be reasoned about or
  regression-tested. The entire 104-test offline suite exists because every
  layer is replayable.
- **Evidencability** — a rule fires or it doesn't; a tree split can be read.
  An accusation of fabrication shown to a student must rest on evidence the
  grader can inspect ("the DOI resolves to a different-titled work"), not on
  a model's unexplainable judgement. This is also the legal-caution posture
  LEGAL.md already takes: the tool surfaces evidence, humans decide.
- **Testability** — deterministic layers get regression suites built from
  real failures (test/misq-style.test.ts is the 2026-08-14 audit, frozen).
  Generative behaviour cannot be pinned this way.

## Consequences

- Adjudication improvements are expressed as rules and scoring, not prompts
  (see the containment venue-debris test distinguishing "…, Cognitive Science
  (7:2), pp. 155-170" pollution from "Attention is NOT all you need"
  fabrication — a distinction an LLM could make, but not testably).
- New lookup needs are met by adding *sources* (arXiv in v0.8.10), not by
  asking a model.
- If a generative component is ever added (e.g. natural-language explanation
  of a verdict), it explains decisions already made deterministically; it
  never makes them.

## Revisit when

- A verification task appears where rule-based approaches have been tried and
  measurably fail (tracked as concrete false-positive/negative rates, as the
  2026-08-14 audit was), AND
- the generative option can be validated offline against a frozen corpus with
  acceptable determinism (pinned model, temperature 0, regression-tested), AND
- the per-document cost fits the tool's local-first, no-account posture.
