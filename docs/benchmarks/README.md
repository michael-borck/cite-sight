# Claim evidence-review benchmarks

These are CPU-only smoke tests of the actual local runner, retrieval, prompt,
JSON schema and quotation validation. The cases and labels are synthetic and
developer-authored. They are not a held-out, independently adjudicated assessment
dataset and must not be presented as population-wide accuracy.

The follow-up [Qwen 3.5 2B/4B comparison](qwen3.5-comparison.md) includes a
JSON-compatible runtime configuration, matched-configuration baseline reruns and
laptop batch-time estimates. Qwen 3.5 4B matched 19/20 provisional labels and is
the stronger pilot candidate; this is not approval for automated grading.

## Reproduce a run

Build core, prepare the pinned runtime, and obtain a catalog model through the
desktop setup or the explicit developer downloader:

```bash
npm run build:core
npm run prepare:runtime -w packages/desktop
node scripts/prepare-claim-models.mjs /local/models qwen2.5-1.5b-q4km
node scripts/benchmark-claims.mjs /path/to/llama-cli /local/models/qwen2.5-1.5b-instruct-q4_k_m.gguf /local/results.json
```

The downloader checks the pinned size and SHA-256 before publishing a model file.
The benchmark itself makes no provider requests. It uses the production retrieval
and quote validator, including marking malformed/invented evidence unavailable.
The fourth argument can supply an institution's own JSON dataset with the same
`cases` structure as `claim-evidence-cases.json`.

Metrics include exact label agreement, false support among non-supported labels,
false contradiction among non-contradicted labels, unavailable output, insufficient
evidence and median/p90 wall time per case. Timing includes each invocation's
model load but excludes the initial file-hash/version checks and any document
parsing. Long real-world passages can cost more than these short examples.

## Recorded runs

All initial runs used the pinned macOS arm64 runtime b8680 on an Apple M1 laptop
with 16 GB RAM, CPU inference, temperature 0 and seed 0. JSON reports record the
exact model/runtime hashes and prompt version.

| Model and prompt | Exact agreement | False support | False contradiction | Median time | p90 time |
| --- | --- | --- | --- | --- | --- |
| Qwen 2.5 1.5B Q4_K_M, v1 | 7/20 | 1/15 | 12/14 | 4.93 s | 6.20 s |
| Qwen 2.5 1.5B Q4_K_M, v2 | 11/20 | 6/15 | 3/14 | 6.92 s | 7.87 s |
| Qwen 2.5 1.5B Q4_K_M, v2 repeat | 11/20 | 6/15 | 3/14 | 7.00 s | 7.79 s |
| SmolLM2 1.7B Q4_K_M, v2 | 9/20 | 10/15 | 0/14 | 8.15 s | 9.20 s |

The initial prompt over-produced contradictions, even where a quotation supported
the statement. The evidence-first v2 prompt and balanced examples changed that
behaviour, but increased false support. That is a tradeoff, not validation. Both
prompt versions and the repeat are retained for inspection. V2 was developed
after inspecting v1 results on this set, so its score is not held-out accuracy.

SmolLM2 also returned one unavailable result because its output/evidence did not
pass validation. Its low false-contradiction count came with a high false-support
count, not stronger assessment validity.

Neither model is recommended for grading from these results. A repeated result
can be consistently wrong. There is no assessment-ready default selection.
Catalog models remain explicit experimental choices, with their smoke counts
shown in Settings, and every suggestion requires a separate reviewer decision.

The managed-installation smoke check also exercised a real offline model import,
service restart and CPU calibration using the packaged runtime. Its short speed
sample took about 7.4 seconds. At that rate, 100 documents with 20 checked
statements each would mean about four hours of inference before other overhead.
The app deliberately shows a range and updates it from actual progress instead
of promising that duration for arbitrary sources or other laptops.

## Before approving a model for assessment

Use source documents and claim/source pairs selected independently of prompt
development. Have reviewers adjudicate support, qualification, contradiction and
missing evidence, including disagreements about the rubric. Include domain and
language differences, statistics, population changes, long documents and source
instructions that attempt to redirect the model.

Evaluate false support and false contradiction separately and compare reviewer
time with and without the model. Do not choose a model on speed or overall label
agreement alone. A short setup speed sample measures throughput only; it does not
approve the model's reasoning.
