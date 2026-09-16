# Privacy and on-device claim checking

## What is implemented

Desktop and CLI can compare cite-bearing sentences with explicitly supplied
local source files. Extraction, keyword retrieval and model inference run on
the computer. The model is a local GGUF instruction model executed by llama.cpp's
`llama-cli`. There is no cloud endpoint, Ollama connection or remote fallback.
Desktop has an explicit one-time model download in Settings.

Findings are supported, partially supported, contradicted, insufficient evidence,
or unavailable. A supported or contradicted finding must include a quotation
that exactly occurs in a retrieved passage. CiteSight calculates offsets and PDF
page numbers itself. Verifying the quotation does not prove that the model's
interpretation is correct. Every suggestion remains pending until a reviewer
records a decision, including suggestions of support. The UI calls this feature
**claim evidence review**.

## Setup

Desktop installers bundle llama.cpp b8680. The target-specific release archive
and SHA-256 are pinned in `packages/desktop/runtime-lock.json`; model revisions
and hashes are pinned in `packages/core/src/claims/modelCatalog.ts`. Runtime
files are packaged outside ASAR, preserving shared-library paths. The upstream
MIT license accompanies the runtime. Development builds need
`npm run prepare:runtime -w packages/desktop` after building core.

Model catalog inclusion approves an artifact for download, not its reasoning
for grading. Qwen 3.5 2B and 4B are now offered as experimental choices, alongside
the older comparison models. Their required ChatML/non-thinking configuration is
selected automatically using the verified model hash. See the
[benchmark procedure and recorded results](benchmarks/README.md).

CLI users supply a trusted local llama-cli and GGUF model explicitly. The
executable must support `--offline`, `--single-turn`, `--json-schema`,
`--device none` and `--no-show-timings`. On Windows, use `llama-cli.exe`.

This first implementation uses CPU inference and starts the model for each cited
statement. Begin with a small batch. Model size, RAM, CPU and the source language
determine speed and accuracy. Choose a model using adjudicated examples from
your institution; running locally does not establish fitness for assessment.

### Desktop

1. Open the **Claim evidence review (Experimental)** panel on a checked
   document, or **Settings → Local claim review**. Choose **Faster** or
   **More accurate** and select **Download and verify model** — a one-time,
   user-initiated download with a progress bar, or import the matching GGUF.
   The UI shows download size, disk needs, RAM guidance and hash. A failed or
   cancelled download is never registered as an installed model.
2. Optionally run **Measure CPU speed**. This uses a short synthetic statement,
   not a student submission. It measures speed, not assessment accuracy.
3. Extract the bibliography, then expand **Claim evidence review**. The saved
   model and bundled runtime are automatic. Claim runs force local-only mode for
   their duration regardless of the reference-check setting.
4. Choose the corresponding source file for each bibliography row. Mappings are
   explicit; CiteSight does not assume that a similarly named PDF is the source.
5. Set the maximum number of cited statements and select **Review claim evidence locally**.
6. Open **Claims** to inspect quotations, record review decisions, and export
    claim JSON/CSV. Desktop PDF reports and saved sessions include the findings.

### Human adjudication

Each Claims card shows the **Student claim**, **Model suggestion**, the exact
source quotations and locations, and a separate **Human assessment** field.
The latter starts as **Not assessed**. Reviewers can record:

- Evidence supports the statement.
- Evidence does not support the statement.
- Unresolved, which stays outstanding.
- Reviewed, which records completion without a support judgement.

Reviewing does not edit the model status or its evidence. Decisions include a
review timestamp and can be undone. All suggestions, including support, need
review. Desktop automatically checkpoints decision changes; saved sessions,
full reports and claim JSON/CSV keep the human assessment separate. The app does
not authenticate reviewer identity or provide a tamper-proof audit log.

The run re-reads the original submission and rejects a changed document hash or
stale reference mapping. Reopened sessions can show saved findings without the
original files, but rerunning requires the submission, model and sources. The
desktop renderer and imported sessions cannot select executable paths. Main
process configuration resolves the bundled runtime and rechecks installed model
bytes before inference. Model setup survives app restarts.

**Cancel claim checks** terminates the running inference process. Analysis locks
network-mode changes, online actions and concurrent document runs until it ends.

### Laptop batches and estimates

Preflight is local: it parses files to count references, distinct lookup queries
and detected cited statements without provider calls or model execution. Desktop
shows separate reference and CPU claim estimates. CLI exposes the same scan:

```bash
cite-sight plan submissions/ --offline
cite-sight plan submissions/ --claims --seconds-per-claim 10 --json
```

Settings also displays the Qwen 3.5 benchmark comparison: 2B median/p90 of
9.3/9.9 seconds, 4B 23.6/26.6 seconds on the tested Apple M1 with 16 GB RAM, plus
30/100-document extrapolations assuming 20 checked statements each. Those are
short synthetic examples, not guaranteed times or real-world accuracy. The
**Measure CPU speed** button runs a local sample on the user's laptop.

Without a local timing sample, the broad planning budgets are 2-45 seconds per
distinct online reference query and 10-180 seconds per potentially checked
statement. These are not bounds: provider retries, unusual documents and model
output length can exceed them. Local parsing uses the measured preflight time.
A local CPU sample or previous completed claim run supplies a better starting
rate. Remaining time updates with observed progress. Short samples can understate
the cost of longer passages.

Map each source once for references with identical raw bibliography text across
the open batch. **Review claim evidence for mapped documents** runs those
documents sequentially. Documents without a source mapping are not silently
treated as verified. Batches currently use the default limit of 50 cited
statements per document; individual review controls can set a different limit.

Each completed claim is written atomically to a per-document file under
`claim-checkpoints/` in Electron's user-data directory. Main-process callbacks
also refresh `batch-recovery.json` after each claim, including partial findings,
the document's claim limit and source mappings. Interrupted documents resume as
waiting. **Restore last batch**, then check waiting documents or use **Resume
saved claim review** for an individual document. Completed results can be read
while the rest remain pending.

Resume re-reads the submission and checks the model hash, runtime hash, prompt,
inference configuration, source mappings and extracted claims. Source files are
hashed again, and saved quotations are verified against freshly extracted text.
Completed, available claims with unchanged sources are reused; the interrupted
claim and unavailable results run again. Changed sources are rechecked. Changed
submission/model/settings/mappings require an explicit **Restart all claims**
selection rather than silently mixing incompatible results. Originals must remain
available. A hard shutdown during a file write retains the last fully saved
checkpoint; it cannot preserve partially generated model output.

Recovery retains the current local-only preference; enable online reference
checks explicitly if needed. Copying a report to another computer preserves
findings and review decisions, but per-claim execution checkpoints are local and
are not embedded in portable sessions.

**Stop after this document** finishes the current file and leaves the rest waiting.
Keep the laptop awake and plugged in for unattended processing. Closing the lid
or sleeping the machine can pause work. Checkpoints contain review excerpts and
source paths; **Clear saved batch checkpoint** removes batch recovery and all
desktop per-claim checkpoints. Reference-only verification still resumes at
document boundaries.

### CLI

Inspect the parsed bibliography first:

```bash
cite-sight check paper.pdf --offline --json
```

Create a source manifest. Numbers are one-based positions in
`references.references`, not footnote numbers. Paths are relative to the manifest:

```json
{
  "version": 1,
  "sources": [
    {"reference": 1, "path": "sources/smith-2020.pdf"},
    {"reference": 2, "path": "sources/jones-2021.txt"}
  ]
}
```

You can add `referenceText` to a mapping, using the parsed reference's exact
`raw` text, to reject a stale manifest. The manifest never supplies executable
or model paths. Those require explicit command options:

```bash
cite-sight claims paper.pdf --sources sources.json \
  --runner /path/to/llama-cli --model /path/to/instruct-model.gguf \
  --max-claims 10 --model-timeout 180 \
  --format html --output claims.html
```

`claims` always forces offline mode. Use `--json` for stdout or `--format json
--output claims.json` for a report file. Text and HTML reports include evidence.
The default limit is 50 statements, adjustable from 1 to 200. Model timeout is
per statement, defaults to 180 seconds and allows up to 600 seconds. Ctrl+C
cancels inference.

CLI writes a per-claim checkpoint to `<document>.claims-checkpoint.json` by
default. Use `--checkpoint /local/path.json` to place it elsewhere. Run the same
command again to resume after shutdown. The checkpoint stores partial excerpts,
evidence and configuration fingerprints; it does not contain model or executable
paths. Keep it in approved local storage and delete it when no longer needed.

```bash
cite-sight claims paper.pdf --sources sources.json \
  --runner /path/to/llama-cli --model /path/to/Qwen3.5-4B-Q4_K_M.gguf \
  --checkpoint /local/review-checkpoint.json --format html --output claims.html
```

Use `--restart-claims` to deliberately replace an incompatible or unwanted
checkpoint. It reruns all claims. An interrupted CLI run preserves the checkpoint;
the final HTML/JSON report is written when the command completes. A checkpoint
is separate from the report, and cannot overwrite the source manifest, submission,
source file, model or executable.

Exit 1 indicates an execution failure or at least one unavailable claim check;
partial reports are still written when analysis completes. Missing mappings or
retrieval misses produce insufficient evidence. `--fail-on any` includes claim
findings that need review. To rerun claims, use `claims` again with explicit
model and source options. The reference `retry` command does not run a model.

## Privacy controls

- The core request boundary rejects external requests throughout local-only
  extraction and inference. Reference verification skips providers entirely,
  including DOI, book, web-metadata and URL fallbacks.
- A deliberate setup download can contact the pinned artifact hosts while
  local-only mode stays enabled. It carries no submission fields or credentials.
  Setup may run while a batch is merely open, but never during a running check:
  analysis and setup exclude each other. Cancel removes the partial file.
  Existing valid installations survive failed updates.
- Desktop blocks renderer HTTP/WebSocket requests and external-link opening in
  local-only mode. Update checks run via the version button and, in online
  mode, a notification-only background check shortly after launch and daily.
  Checks never run in local-only mode or during analysis, and downloads always
  require an explicit click. A private run cannot start while an explicit online
  operation is still running. Development builds allow only their Vite origin
  at `localhost:5173`; use a packaged build for a no-network deployment.
- llama-cli receives an explicit local model, offline mode and CPU-only device
  selection. Its environment excludes inherited RPC, remote-model, token and
  prompt-logging settings. CiteSight does not pass a server address or tool access.
- Prompts go through private temporary files rather than process arguments.
  They are removed after normal completion, errors and cancellation. Runner logs
  are not forwarded into application reports. Forced termination or a machine
  crash can leave a temporary `cite-sight-claim-*` directory for OS cleanup.
- Claim reports contain statement excerpts, selected source quotations, source
  filenames and SHA-256 hashes. They omit the full extracted submission and
  model/executable paths. Saved review sessions also omit full document text and
  API keys. Ordinary CLI reference-analysis JSON can contain extracted text.
- The chosen model ID, revision and hash are saved locally in `claim-setup.json`;
  the CPU sample is in `claim-speed.json`. Source mappings can be saved in review
  sessions and batch recovery. Executable paths and model paths are excluded from
  portable reports. Saved reports remain until the user or institution removes them.
- Per-claim checkpoints are saved during analysis, including claim excerpts and
  quoted evidence. They are not an in-memory-only workflow. Human assessment
  changes are saved in batch recovery and reports, separately from cached model
  results. Shutdown recovery does not send any content to a server.
- Reports include actual runtime version and executable hash, model hash and
  known catalog revision, prompt version, platform and inference parameters.
  Fixed temperature and seed improve repeatability, not correctness.

Use trusted software and genuinely local storage. These application controls
are not an OS sandbox for an arbitrary executable or a guarantee about cloud
sync software on the computer. For a strict institutional deployment, distribute
approved binaries/models and verify a complete run with network egress blocked.

## Where claim evidence comes from (and what we don't do)

Three layers, in increasing depth:

1. **Publisher abstracts** — during online reference verification, matched
   works may carry the publisher abstract from the open scholarly APIs
   (Crossref, OpenAlex, Semantic Scholar, Europe PMC). When no local source
   is mapped, the claim run uses the abstract and labels the finding
   "Publisher abstract (...)". Abstracts cover findings and conclusions,
   not methods detail or page-level quotes. Abstracts arrive only via the
   APIs' documented endpoints, under their rate limits and terms.
2. **Your mapped local files** — full-text evidence, exactly as described
   above. Nothing is downloaded; you obtained the file yourself.
3. **Human judgement** — every suggestion requires a reviewer decision.

**We do not scrape Google Scholar** — its Terms of Service prohibit
automated access, so CiteSight will never query it programmatically or
bulk-download paywalled PDFs. Scholar links in the UI open in *your*
browser, on your initiative, as a manual check. Provider lookups honour
rate limits (one request per second per service, longer for arXiv) and
identify themselves via the User-Agent and your contact email.

## Online verification and Docker

When desktop or CLI online verification is enabled, reference titles, authors,
identifiers and URLs leave the computer. Disabling only DOI and URL checks does
not disable search. The standalone HTML still makes provider requests; it has
no claim-inference UI. The hosted web app receives the uploaded submission.

Both hosted API keys come from the server environment:
`SEMANTIC_SCHOLAR_API_KEY` and `OPENALEX_API_KEY`. Compose forwards both from the
shell or a `.env` file. They are not embedded in the image and the hosted web UI
does not collect them. Desktop and standalone have personal key fields.

An institution-hosted inference service would move content off the user's
computer, even if it stays inside the institution. This implementation does not
use one.

## Coverage and limitations

- Sources must be PDF, DOCX, TXT, MD or QMD. Scanned documents need local OCR
  beforehand. OCR is not bundled in this implementation.
- Citation detection uses the existing author-date and MLA parser. Numeric
  footnotes and ambiguous bibliography matches remain unassigned for review.
- The unit of analysis is a cite-bearing sentence, not every assertion in the
  submission. Grouped citations are checked separately against each source.
- Retrieval is local keyword overlap, not semantic embeddings. Paraphrases with
  different vocabulary can be missed. A retrieval miss is not a contradiction.
- At most four passages enter each prompt. PDF page numbers are physical page
  indexes; other formats use extracted-text offsets. This is not a full-paper
  systematic review or a verification of the supplied file's authenticity.
- Input size, text budget, context length and statement limits bound the run.
  Truncation and omitted statements are reported. A partial source can omit
  qualifications or opposing evidence elsewhere in the work.

## Validation

Regression tests cover zero provider requests during claim runs, stale mappings,
grouped citations, missing sources, invented quotations, offset/page handling,
subprocess timeout/cancellation and prompt cleanup, managed-runtime authorization,
desktop mode locks, verified setup and restart persistence, batch recovery,
planning and CLI exports. Recorded real-model smoke runs live in `docs/benchmarks`.
Their synthetic developer-authored labels are provisional and not an independent
assessment validation set. Prompt revisions tested on this same set must not be
reported as held-out accuracy.

Before grading use, evaluate the selected model against held-out claim/source
pairs labelled by reviewers. Include qualified support, opposing findings,
misquoted numbers, mismatched populations and incomplete evidence. Measure false
support and false contradiction separately. Neither a real DOI nor an exact
quotation establishes that the student's claim follows from the source.
