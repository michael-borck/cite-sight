# CiteSight → cite-analyser migration

Decision (2026-11): the TypeScript engine moves to Python. Rationale:

- Every consumer is Python (FeedForward web, FeedForward Desktop's analyser
  pack, the lens family); cite-sight is the ecosystem's only TS engine.
- The lens family provides `lens-contract` (manifest/serve/health), the family
  table, and pip-installable distribution — cite-sight never had any of that.
- The valuable, hard-won logic is the parsers and verifiers, not the language.

## The plan

1. **Freeze** (this repo, done): `packages/core` is maintenance-only. The
   React dashboards, desktop app, CLI and server keep working off the frozen
   engine until the successor reaches parity.
2. **Port** ([cite-analyser](https://github.com/michael-borck/cite-analyser)):
   module-by-module, in pipeline order — reference extraction →
   cross-referencing → duplicates → verification (Crossref/DataCite/OpenAlex/
   EuropePMC/arXiv/URL liveness) → claims (optional, last).
3. **Conformance, not trust**: `demo-corpus/` documents run through BOTH
   engines; the golden JSON from this engine is committed in cite-analyser
   and its test suite must match it field-by-field. Parity is proven, then
   this engine is retired.
4. **Rewire** (done): cite-sight's server delegates analysis to
   cite-analyser over HTTP. Configure with `CITE_ANALYSER_URL`
   (e.g. `http://cite-analyser:8006` — both compose files wire it up) and
   `CITE_ANALYSIS_ENGINE`:
   - `auto` (default) — use the analyser, fall back to the bundled engine
     if it is unreachable (transitional safety)
   - `analyser` — delegate only; fail loudly if the analyser is down
   - `local` — pre-migration behaviour (bundled engine)
   The analyser's `/analyse` response mirrors `ReferenceAnalysisResult`
   field-for-field, so the adapter is a straight mapping
   (`packages/server/src/engine.ts`). The CLI and desktop keep the bundled
   engine until the archive step.

## Non-goals

- No feature parity race: ported modules land only as they reach conformance.
- No dual maintenance: after step 4, engine changes happen in cite-analyser
  only.
