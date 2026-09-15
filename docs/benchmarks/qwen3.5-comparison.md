# Qwen 3.5 2B and 4B CPU comparison

Tested on 14 September 2026 using the existing 20-case synthetic evidence-review
set. The prompt, source passages and provisional labels were not changed for
these tests. These are development smoke results, not measured accuracy on
student submissions or approval for automated grading.

## Models and runtime

- Apple M1, 8 logical CPUs, 16 GB RAM. Inference used CPU only.
- llama.cpp b8680, runtime SHA-256 recorded in each report.
- Unsloth GGUF conversions of `Qwen/Qwen3.5-2B` and `Qwen/Qwen3.5-4B`, Q4_K_M.
- Text-only use, with no vision projector. Files are 1.28 GB and 2.74 GB.
- Model repository revisions, sizes and verified SHA-256 values are pinned in
  [qwen3.5-artifacts.json](qwen3.5-artifacts.json).
- These are the Qwen 3.5 model sizes requested, but not the bit-identical packaged
  artifacts behind Ollama's `qwen3.5:2b` and `qwen3.5:4b` tags. Different
  quantizations, runtimes and thinking settings may produce different results.

## Compatibility finding

Both models loaded with the bundled runtime. On the direct-support probe, the
model's default chat template plus the JSON schema failed during sampler
initialization with `Failed to initialize samplers: std::exception`. Disabling
thinking alone did not resolve the 2B failure. These are configuration failures,
not reasoning mistakes, and are excluded from the quality table below.

The working configuration was:

```text
--chat-template chatml --reasoning off
```

It preserves the application prompt and strict quotation checks. All compared
runs below used that same wrapper, CPU-only inference, temperature 0, seed 0,
8,192-token context and a 1,024-token output limit. Thinking mode was not tested
as an accuracy/performance alternative. The unchanged default remains available;
the overrides are explicit and recorded in report provenance.

There are upstream reports of this template/schema interaction, for example
[llama.cpp issue 21600](https://github.com/ggml-org/llama.cpp/issues/21600).

## Same-configuration results

The older models were rerun using ChatML and thinking disabled, rather than
attributing the entire improvement to model size or generation.

| Model, Q4_K_M | Exact label agreement | False support | False contradiction | Unavailable | Median | p90 |
| --- | --- | --- | --- | --- | --- | --- |
| Qwen 2.5 1.5B | 14/20 | 2/15 | 3/14 | 0 | 6.89 s | 7.89 s |
| SmolLM2 1.7B | 12/20 | 7/15 | 0/14 | 1 | 8.47 s | 10.17 s |
| Qwen 3.5 2B | 17/20 | 0/15 | 3/14 | 0 | 9.27 s | 9.92 s |
| Qwen 3.5 4B | 19/20 | 0/15 | 1/14 | 0 | 23.62 s | 26.64 s |

False-support denominators are the 15 cases not labelled supported. False-
contradiction denominators are the 14 cases not labelled contradicted. One
unrelated-source case was handled as insufficient evidence by retrieval without
invoking the model, so this is an end-to-end pipeline comparison. Each model
generated responses for 19 cases. Timing includes per-case retrieval and model
process startup, but excludes initial file hashing/version checks, source-file
extraction and online reference lookups. Models were run sequentially, avoiding
CPU contention between candidate runs.

### Differing cases

The 2B model overcalled contradiction for:

- `negative-support`: the source and statement both said the drug did not lower
  blood pressure, but the model described them as contradictory.
- `unmeasured-outcome`: it treated an unmeasured memory outcome as a contradiction.
- `causal-overstatement`: it labelled the mixed correlation/causation claim
  contradicted rather than partially supported.

The 2B model also gave an inconsistent explanation on `qualified-exact`, despite
matching its supported label. Exact label agreement alone misses this problem.

The 4B model's sole label disagreement was `causal-overstatement`. Its explanation
correctly identified that an observational study did not prove causation. Whether
the mixed statement should be labelled partially supported or contradicted is a
rubric question worth independent adjudication. The published score retains the
original label; it was not changed to improve the model's result.

Neither Qwen 3.5 run falsely supported a non-supported test claim, and all its
returned quotations passed validation. This small set cannot establish a real-
world false-acceptance rate, nor does quote validity prove interpretation quality.

## Laptop tradeoff and recommendation

Qwen 3.5 4B is the stronger candidate for a human-reviewed pilot. It handled the
negation and missing-evidence cases more reliably and gave more consistent
explanations. Qwen 3.5 2B is the faster option when CPU throughput matters more.
The 4B median was about 2.5 times the 2B median on this machine.

Using those short-case medians as a rough extrapolation:

| Batch, 20 checked statements per document | 2B | 4B |
| --- | --- | --- |
| 30 documents, 600 statements | about 1.5 hours | about 3.9 hours |
| 100 documents, 2,000 statements | about 5.2 hours | about 13.1 hours |

These are inference estimates, not deadlines. Longer passages, more generated
text, parsing, source verification, thermal throttling and laptop sleep can change
elapsed time. Measure a sample on the actual laptop and use the updating estimate.

Before designating either model assessment-ready, evaluate independently labelled
claim/source pairs from the intended subjects, including long documents and
ambiguous cases. All model suggestions should still receive human review.

## Reproduce

Download the pinned text GGUF files with `hf download` using the revisions in the
artifact manifest, and verify their hashes before inference. Then run:

```bash
node scripts/benchmark-claims.mjs /path/to/llama-cli \
  /path/to/Qwen3.5-2B-Q4_K_M.gguf /local/qwen35-2b.json --chatml --no-thinking
node scripts/benchmark-claims.mjs /path/to/llama-cli \
  /path/to/Qwen3.5-4B-Q4_K_M.gguf /local/qwen35-4b.json --chatml --no-thinking
```

The four full comparison reports end in `cpu-v2-chatml.json` in this directory.
Earlier reports retain their original model-default configuration for comparison.
