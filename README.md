# CiteSight

<!-- BADGES:START -->
[![edtech](https://img.shields.io/badge/-edtech-4caf50?style=flat-square)](https://github.com/topics/edtech) [![academic-integrity](https://img.shields.io/badge/-academic--integrity-blue?style=flat-square)](https://github.com/topics/academic-integrity) [![citation-analysis](https://img.shields.io/badge/-citation--analysis-blue?style=flat-square)](https://github.com/topics/citation-analysis) [![document-analysis](https://img.shields.io/badge/-document--analysis-blue?style=flat-square)](https://github.com/topics/document-analysis) [![frontend](https://img.shields.io/badge/-frontend-blue?style=flat-square)](https://github.com/topics/frontend) [![react](https://img.shields.io/badge/-react-61dafb?style=flat-square)](https://github.com/topics/react) [![research](https://img.shields.io/badge/-research-3f51b5?style=flat-square)](https://github.com/topics/research) [![typescript](https://img.shields.io/badge/-typescript-3178c6?style=flat-square)](https://github.com/topics/typescript) [![vite](https://img.shields.io/badge/-vite-blue?style=flat-square)](https://github.com/topics/vite) [![web-app](https://img.shields.io/badge/-web--app-blue?style=flat-square)](https://github.com/topics/web-app)
<!-- BADGES:END -->

**Academic integrity tool for checking student assignments.**

A desktop app, CLI tool, and web service that loads a student assignment, extracts references and in-text citations, verifies every reference exists via academic databases, checks URLs, validates citation formatting, and flags suspicious or fabricated references.

## Features

- **Reference Verification** — Searches Crossref, OpenAlex, Semantic Scholar, arXiv, DataCite, Europe PMC, and book/web metadata
- **Publication notices** — Shows Crossref and Retraction Watch updates separately from the reference's identity match
- **Citation Format Validation** — Checks APA, MLA, and Chicago formatting rules
- **Cross-Reference Checking** — Matches in-text citations to bibliography entries, flags orphans, and
  suggests likely spelling mismatches (hand-typed references often slip by a letter or two)
- **URL Verification** — HTTP checks on referenced URLs, with screenshots as evidence (desktop)
- **DOI Resolution** — Validates DOIs via Crossref (bot-blocked/paywalled publisher pages are reported as *blocked*, not dead)
- **Citation Patterns** — Future-dated citations, suspicious year clusters, mixed citation styles, and placeholder/template citation text
- **File Support** — PDF, DOCX, TXT, Markdown, JSON

CiteSight focuses on **citation integrity**. Prose-level signals — readability,
writing quality, and AI-writing tells (emojis, em-dashes, adverb ratio) — live
in the sibling [`document-analyser`](https://github.com/michael-borck/lens-analysers)
tool; run both for a full picture.

## Install

Four ways to use CiteSight:

| Method | Best for | Install |
|--------|----------|---------|
| **Desktop app** | Offline use, URL screenshots | [Download for your platform](https://github.com/michael-borck/cite-sight/releases/latest) — Mac (M-series): `…-arm64.dmg` · Mac (Intel): `…-x64.dmg` · Windows: `…-Setup.exe` · Linux: `…AppImage` |
| **Standalone HTML** | No install — one file, double-click, runs on this device | [Download `cite-sight-standalone.html`](https://github.com/michael-borck/cite-sight/releases/latest) |
| **CLI** | Automation, CI pipelines | `npm install -g cite-sight` |
| **Docker** | VPS hosting, shared access | `docker pull michaelborck/cite-sight` |

### Platform Comparison

| Feature | Web / Docker | Desktop | Standalone HTML | CLI |
|---------|-------------|---------|-----------------|-----|
| File input | Single file or pasted references | Files or folders | Multiple files | Files, folders or globs |
| File types | PDF, DOCX, TXT, MD, QMD, JSON | PDF, DOCX, TXT, MD, QMD | PDF, DOCX, TXT, MD, QMD | PDF, DOCX, TXT, MD, QMD, JSON |
| URL screenshots | — | Yes | Opt-in (`--screenshots` + Playwright) | — |
| URL liveness checks | Yes | Yes | Manual (open in tab) | Yes |
| arXiv lookups | Yes | Yes | — (browser-blocked) | Yes |
| Report exports | PDF, CSV | PDF, CSV, BibTeX | PDF, CSV, BibTeX | HTML, JSON, text, BibTeX (`--bibtex`) |
| Output format | Browser dashboard | Desktop dashboard | Browser dashboard | Text or JSON (stdout) |

The standalone build is a single self-contained `.html` file — the whole analysis
runs in your browser tab. The submission file stays on your device, but external
lookups send extracted reference titles, authors, identifiers and URLs to providers.
This is not a zero-network mode. Two checks
behave differently there (see the table): automatic URL probes and arXiv lookups
are blocked by browser cross-origin rules, so affected references show as
*unverified* and each result row has **Open DOI** / **Open cited URL** buttons to
eyeball the source in a new tab. The version button in the header checks GitHub
for a newer release on demand — it never auto-updates; you re-download the file
when you want a newer one.

## Review workflow

### Web and desktop

1. Add a document and choose **Assignment** or **Reference list**. Assignments
   include in-text matching; reference lists check the sources themselves.
2. Leave citation style on **Auto-detect**, or select the style you require.
   URL/DOI checks, screenshots and connection settings are under **Advanced options**.
3. Start with **Review findings**. Unavailable database checks have a separate
   retry action, so an outage does not look like a confirmed citation error.
4. Compare the cited text with the matched record. Record a review decision or
   mark the item reviewed. Decisions do not overwrite the database verdict and
   can be undone. PDF exports include the review log; reference CSV rows include
   the decision and review time.

The web tool also has a **Paste references** tab. Put one reference per paragraph;
there is no need to create a file first. Uploads support PDF, DOCX, TXT, MD, QMD
and JSON, up to 10 MB. Pasted lists are limited to 100,000 characters.

On desktop, the batch list stays visible while checks run. One failed document
does not stop the batch. Retry individual failures or all failed files. **Stop
after this document** finishes the active file and leaves the rest waiting.
Check settings are remembered on the device; cache controls are in **Settings**.

### Save and resume

- **Desktop:** use **Save review session** and **Open review session**, or
  Ctrl/Cmd+S and Ctrl/Cmd+O. Session JSON files contain citation results, review
  decisions and source file paths. They exclude API keys, contact email, full
  document text and temporary screenshots. Reopening a session does not require
  the original files just to review completed results. Retrying failed or waiting
  documents requires those files to remain at their saved paths.
- **Web:** refreshing the same tab reconnects to a queued check or restores the
  completed report and review decisions. This uses browser session storage and
  excludes full document text. The page shows when refresh recovery expires.
  Download the report to keep it beyond that time. A new tab or a browser that
  blocks storage cannot recover the check automatically.

### CLI settings and report files

```bash
# Save recurring preferences. Explicit command options override them.
cite-sight config set email lecturer@example.edu
cite-sight config set style apa
cite-sight config list
cite-sight config path

# A shareable, self-contained HTML report per file, plus an index and retry JSON.
cite-sight check papers/ --format html --output reports/

# A single JSON report containing every file's outcome.
cite-sight check papers/ --output results.json

# Retry failed files without rechecking successful ones.
cite-sight retry results.json --only failed --output retried.json

# Retry unavailable references using the saved reference data, without rereading documents.
cite-sight retry results.json --only unavailable --format html --output retried.html
```

`--format` accepts `text`, `json` and `html`. `--output` accepts a file or
directory. Directory output includes a JSON report for later retries. Without
`--output`, reports go to stdout; progress goes to stderr. The existing `--json`
output and exit codes remain available for scripts and CI.

Retries reuse the saved check settings unless command options override them.
Connection credentials come from the current command or environment. API keys
are not saved in configuration or exported reports; use `--s2-key` or
`SEMANTIC_SCHOLAR_API_KEY`. `CITESIGHT_EMAIL` overrides the saved email, and
`CITESIGHT_CONFIG_HOME` selects a different configuration directory.
Use `config unset email`, `config unset style`, or `config reset` to remove settings.

OpenAlex accepts `--openalex-key` or `OPENALEX_API_KEY`. Desktop and standalone
have an OpenAlex key field under advanced options; desktop and server also read
the environment variable. Keys are excluded from exported sessions and CLI
reports. Get a free key at [OpenAlex settings](https://openalex.org/settings/api).

## Deploy on a VPS

Pull the pre-built Docker image — no Node.js or build tools needed on the server.

### Quick deploy

```bash
docker run -d -p 3000:3000 --restart unless-stopped --name cite-sight michaelborck/cite-sight
```

The web app and API are available at `http://your-server:3000`.

### Using docker-compose (recommended)

Create a `docker-compose.yml` on your VPS:

```yaml
services:
  app:
    image: michaelborck/cite-sight:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
    environment:
      - PORT=3000
```

Then:

```bash
docker compose up -d
```

### Update to latest version

```bash
docker compose pull
docker compose up -d
```

### With Redis job queue (optional)

For heavier usage, add Redis to queue analysis jobs instead of processing synchronously:

```yaml
services:
  app:
    image: michaelborck/cite-sight:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
    environment:
      - PORT=3000
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    restart: unless-stopped
```

### Behind a reverse proxy (Nginx/Caddy)

If you're serving on a domain with HTTPS, point your reverse proxy at port 3000. Example Caddy config:

```
citesight.yourdomain.com {
    reverse_proxy localhost:3000
}
```

## Quick Start (Development)

### Desktop App

```bash
npm install
npm run build:core

# Terminal 1: Vite dev server
cd packages/desktop && npx vite

# Terminal 2: Electron
npx tsc -p packages/desktop/tsconfig.json
cd packages/desktop && npx electron .
```

### Web App + Server

```bash
npm install
npm run build:core
npm run build:server

# Terminal 1: API server
node packages/server/dist/index.js

# Terminal 2: Web frontend
cd packages/web && npx vite
```

Open `http://localhost:5173` — Vite proxies API calls to the server.

### Standalone HTML

```bash
npm run build:core
npm run build:standalone
# Single self-contained file at packages/standalone/dist/index.html — open it
# in any browser (double-click works; no server needed).
```

For development: `npm run dev -w packages/standalone`.

### CLI

**Just want to run it?** No build needed — install the published package (Node.js 20+):

```bash
npm install -g cite-sight
cite-sight check paper.pdf
```

**Building from source** (requires Node.js 20+; any Apple Silicon or Intel Mac works — nothing is architecture-specific):

```bash
# 1. Install workspace dependencies once, from the repository root.
#    This is a npm workspaces monorepo: installing inside packages/cli alone
#    will not wire up @michaelborck/cite-sight-core. Re-run after each git pull.
npm install

# 2. Build core, then the CLI. dist lands in packages/cli/dist/index.js.
npm run build:core
npm run build:cli

# 3. Run it from the repo (the `cite-sight` command only exists on your PATH
#    after `npm install -g cite-sight`, which replaces this whole section).
node packages/cli/dist/index.js check paper.pdf
node packages/cli/dist/index.js check paper.pdf --json
cite-sight check paper.pdf --json
cite-sight check paper.pdf --style apa --email you@example.com

# Reports show the detail behind each issue by default — what was cited vs.
# what the matched record holds, plus the surrounding text for in-text
# citations. Use --minimal for a condensed summary-and-verdicts view.
cite-sight check paper.pdf --minimal

# For a bare source list / annotated bibliography (e.g. a deep-research export)
# rather than a manuscript, use --source-list to skip the in-text
# cross-reference check (otherwise every entry is reported as "uncited").
# CiteSight also auto-skips that check for lists of at least three references
# when no in-text citations are detected. Orphaned citations are still reported.
cite-sight check sources.md --source-list

# Export verified references as BibTeX (for Zotero/Mendeley/LaTeX):
cite-sight check papers/ --bibtex references.bib

# Capture screenshots of live cited pages — opt-in, needs Playwright:
npm install -g playwright && npx playwright install chromium
cite-sight check papers/ --screenshots --output reports/
```

**Build troubleshooting**

- `build:core` fails with "tsc: command not found", or `npx tsc` prints
  "This is not the tsc command you are looking for", or TypeScript errors about
  `@types/node`: the `npm install` step at the repository root was skipped (or a
  `git pull` landed new dependencies). Run `npm install` from the repo root and retry.
- Do **not** package the CLI with `pkg` or similar bundlers — the PDF extractor
  loads its pdf.js worker at runtime and such packages crash. Use the npm
  package, `node packages/cli/dist/index.js`, or Docker.

**Batch checking and rate limits.** Lookups run one reference at a time and every
external request is paced by provider, with a longer interval for arXiv. Results
are cached so repeated references reuse lookups. Pass `--email` to identify
Crossref requests and `--openalex-key` for OpenAlex's larger free daily allowance.
Semantic Scholar's
keyless tier can still rate-limit a large batch — supply a key with `--s2-key`
or the `SEMANTIC_SCHOLAR_API_KEY` environment variable (the desktop app and
server read the same variable). When a lookup is throttled, that reference is
reported as **unverified** with the reason (e.g. "rate-limited on Semantic
Scholar") — it is *not* a confirmed miss; re-run to retry those.

### Docker (local build)

```bash
docker compose up --build
# Open http://localhost:3000
```

## Project Structure

```
cite-sight/
├── packages/
│   ├── core/          # Shared analysis library
│   ├── ui-dashboard/  # Shared results dashboard (source-only package)
│   ├── desktop/       # Electron app
│   ├── standalone/    # Single-file HTML build (runs from file://)
│   ├── cli/           # CLI tool
│   ├── server/        # Express API server
│   └── web/           # Landing page + online tool
├── Dockerfile
├── docker-compose.yml
└── package.json       # Workspace root
```

## How Reference Verification Works

For each reference in the bibliography:

1. **Parse** — Extract authors, title, year, journal, DOI, URL
2. **Validate Format** — Check against APA/MLA/Chicago rules
3. **Verify existence and metadata**:
   - Resolve DOI via Crossref, DataCite, then the DOI registry; resolve ISBN and arXiv identifiers
   - Search Crossref, OpenAlex, Semantic Scholar, arXiv, DataCite and Europe PMC as needed
   - Continue beyond partial or ambiguous candidates; retry title-only search when author parsing may have interfered, then a stripped typo-tolerant query so one misspelt word doesn't hide a real paper
   - Compare titles, authors, years, identifiers and available publication details
   - Check book/web metadata and URL liveness separately; a live page alone does not confirm a citation
   - Check publication notices, with a separate outcome and check timestamp
4. **Cross-Reference** — Match bibliography ↔ in-text citations; near misses (same year, surname one edit
   or a letter-swap apart) are reported as "possible spelling mismatches" instead of orphans — common when
   references are hand-typed
5. **Score** — Heuristic match strength from 0 to 1, not a probability of correctness

The offline regression benchmark lives in
`packages/core/test/verification-benchmark.test.ts`. Provider response fixtures
and publication-notice tests live in `packages/core/test/provider-contracts.test.ts`.
These guard known errors, not population-wide accuracy claims.
Run them with `npm run test:verification`; all provider responses in this suite
are local fixtures.

## Privacy and claim checking

Desktop and CLI can check cited statements against explicitly mapped local
source files using a locally installed **llama-cli** executable and **GGUF
instruction model**. The run forces local-only mode, uses CPU inference and
verifies the model's quotations against retrieved source passages. Model
judgements still require review.

Desktop installers include a pinned llama.cpp runtime. Open the
**Unit source library (Layer 2).** A coordinator collects the unit's common
readings once into one folder (`cite-sight library plan submissions/ --output
unit-sources.json` lists which works are common across submissions — collect
those first). Claim checking then content-matches unmapped entries against that
folder automatically — filenames don't matter. Markers can also compare claims
across submissions: `cite-sight claim-overlap results.json` flags similar
claims on the same shared reference — a signal to assess, never proof.

**Claim evidence review (Experimental)** panel on a checked document — or
**Settings → Local claim review** — pick **Faster** (2B, ~1.3 GB) or
**More accurate** (4B, ~2.7 GB), and select **Download and verify model**.
The download is user-initiated, checked against a pinned SHA-256, and shown
with a progress bar. An already downloaded catalog model can be imported
instead. Setup can run while a batch is open, but not while checks run.
Setup is remembered on the computer. **Measure CPU speed** runs a short local
sample to improve runtime estimates.

Qwen 3.5 **2B** and **4B** are offered as experimental options, with automatic
JSON-compatible runtime settings. Settings shows their timing/quality comparison
and a **Measure CPU speed** action. The 4B model is the stronger pilot candidate;
neither is designated assessment-ready from the small synthetic test set. Older
comparison models remain available. See [recorded CPU benchmarks](docs/benchmarks/README.md).

Run citation extraction, expand **Claim evidence review**, and map source files
to bibliography rows. Identical reference text shares its mapping across the
open batch. Unmapped references with a **publisher abstract** from the online
lookups are checked against the abstract and labelled "Publisher abstract" —
weaker than full text, but zero-effort coverage. CiteSight never scrapes
Google Scholar or bulk-downloads paywalled PDFs; provider lookups honour
documented rate limits (see the app's "Where the evidence comes from" panel). Select **Review claim evidence locally** for one document or
**Review claim evidence for mapped documents** for the batch. Every model
suggestion, including suggested support, remains pending human review.
PDF, claim JSON/CSV and saved sessions include evidence and version provenance.
The Claims view separates **Student claim**, **Model suggestion** and **Human
assessment**. Reviewers record support, lack of support, unresolved or reviewed,
with a timestamp. Human decisions do not overwrite model findings.

### Planning a laptop batch

Use **Estimate reference runtime** or **Estimate CPU claim runtime** before a
large run. Preflight scans documents locally and counts references, distinct
lookup queries and cited statements. The remaining-time range updates as work
finishes. API rate limits and retries can extend the reference estimate; long
source passages can extend the CPU estimate. Keep the laptop awake and plugged
in for unattended runs.

Individual completed claims are checkpointed locally, as well as completed
documents. **Stop after this document** leaves the rest waiting; **Restore last
batch** recovers partial results, mappings and pending work. Resume repeats only
the interrupted/unavailable claims after checking file and model fingerprints.
Changing the model or mappings requires an explicit restart. Checkpoints include
source mappings and review excerpts. Settings has a **Clear saved batch
checkpoint** action that also removes per-claim recovery files.

CLI planning also works without calling any provider or model:

```bash
cite-sight plan submissions/ --offline
cite-sight plan submissions/ --claims --seconds-per-claim 10 --json
```

The first command estimates local reference parsing. Omit `--offline` to budget
for online reference verification. The second uses a measured CPU rate; omit
`--seconds-per-claim` for a broad, uncalibrated range. These are planning ranges,
not deadlines.

For CLI, first inspect the bibliography with `cite-sight check paper.pdf --offline
--json`. Create `sources.json`, with reference numbers matching the displayed
bibliography order:

```json
{"version": 1, "sources": [{"reference": 1, "path": "sources/smith-2020.pdf"}]}
```

Then run:

```bash
cite-sight claims paper.pdf --sources sources.json \
  --runner /path/to/llama-cli --model /path/to/instruct-model.gguf \
  --max-claims 10 --format html --output claims.html
```

Run the same CLI command again to resume. It saves each completed claim in
`paper.pdf.claims-checkpoint.json`; override with `--checkpoint /local/path.json`.
Use `--restart-claims` to rerun all claims instead of reusing a saved checkpoint.

Source paths are relative to the manifest. Supported source files are PDF, DOCX,
TXT, MD and QMD. Scanned PDFs need local OCR beforehand. Models must be installed
before analysis; no downloads occur during a claim run. CLI retains explicit
local executable/model options. See the
[local setup, privacy boundaries and limitations](docs/privacy-and-claim-checking.md).

**Desktop and CLI verify references online by default.** Only extracted
reference details (titles, authors, identifiers, cited URLs) are sent to
citation databases; the essay text itself never leaves the machine. For fully
offline checks, use **Local-only mode** on desktop or `--offline` in CLI.
Disabling only DOI and URL checks still leaves searches enabled when online
mode is selected. Hosted web uploads go to the server and do not support local
claim inference.

### Docker API keys

The hosted web UI does not collect personal API keys. Its server reads both
`SEMANTIC_SCHOLAR_API_KEY` and `OPENALEX_API_KEY` from the environment. Both
Compose files pass these optional variables through from your shell or Compose
`.env` file:

```dotenv
SEMANTIC_SCHOLAR_API_KEY=your-semantic-scholar-key
OPENALEX_API_KEY=your-openalex-key
```

These values are runtime configuration, not baked into the Docker image. Desktop
and standalone HTML have personal key fields; CLI also accepts environment
variables or command options.

## Building Releases

Releases are built automatically via GitHub Actions when a version tag is pushed.

Electron's `beforePack` hook prepares the target architecture's runtime using
`packages/desktop/runtime-lock.json`. Archives are checksum-verified and copied
outside ASAR with their shared libraries and license. Model weights are never
bundled in the installer. For development, build core and run
`npm run prepare:runtime -w packages/desktop` once. On non-native macOS filesystems,
use a native temporary output directory when packaging to avoid AppleDouble
resource forks interfering with ASAR integrity checks.

### Version bump script

Use the bump script to update all workspace versions, commit, tag, and push in one step:

```bash
npm run bump -- patch   # 0.2.9 → 0.2.10
npm run bump -- minor   # 0.2.9 → 0.3.0
npm run bump -- major   # 0.2.9 → 1.0.0
npm run bump -- 1.0.0   # exact version
```

The script updates all 6 `package.json` files, commits, creates an annotated `vX.Y.Z` tag, and prompts before pushing.

### What the tag triggers

Pushing a `v*` tag triggers:
- **Electron installers** — macOS (DMG), Windows (NSIS), Linux (AppImage) with auto-update
- **Standalone HTML** — `cite-sight-standalone.html` attached to the release
- **npm publish** — `@michaelborck/cite-sight-core` + `cite-sight` CLI
- **Docker images** — pushed to Docker Hub and GitHub Container Registry (amd64 + arm64)

## Automating & integrating

- **Node library** — `npm install @michaelborck/cite-sight-core` gives typed
  functions (`analyzeDocument`, `verifyReferences`, `analyzeClaimsFile`,
  `planFiles`, `unitSourceList`, `claimOverlapFromResults`, …) — the same
  engine the CLI and desktop use. See the exported types in `packages/core`.
- **Python** — `pip install cite-sight-py`: a thin wrapper that shells out to
  the CLI and returns parsed JSON (`check`, `claims`, `library_plan`,
  `claim_overlap`). Requires the CLI; source in `packages/python`.
- **HTTP** — run the server (`docker run -p 3000:3000 michaelborck/cite-sight`)
  and POST documents to `/api/analyze`.
- **Claim runtime on CLI** — `cite-sight setup-claims runtime` and
  `setup-claims model <id>` download the pinned, checksum-verified runtime and
  an approved model into the CiteSight config folder. `claims` uses them
  automatically. CiteSight never probes system llama-cli or Ollama installs —
  the managed install is used everywhere so behaviour is identical; experts
  can still override with `--runner`.

## Technology Stack

- **Core**: TypeScript, pdfjs-dist, mammoth
- **Desktop**: Electron, React 19, Zustand, Vite, electron-updater
- **Web**: React 19, Vite
- **Server**: Express, multer, BullMQ (optional)
- **CLI**: Commander.js, chalk
- **APIs**: Crossref, Semantic Scholar, OpenAlex, arXiv, DataCite, Europe PMC, Open Library

## Hosted data retention

Uploaded files are deleted after analysis, on upload/validation failure, or when
a waiting job is cancelled. Cancelling an analysis that has already started
does not interrupt it; its upload is deleted when processing finishes.

With Redis enabled, citation reports and failure messages expire after one hour
using Redis key expiry. Reports contain reference text and citation results, but
not the full extracted document text. The server buffers streaming events in
memory during analysis and for 60 seconds after completion. BullMQ removes
terminal jobs immediately instead of storing another copy of the report.

On startup, completed and failed jobs left by older versions are removed because
those jobs could contain full document text without a strict expiry. Waiting
and active jobs are preserved. Redis backups, if configured by the operator,
have their own retention policy.

## Data sources & attribution

CiteSight verifies references against open bibliographic services. With thanks:

- **[Semantic Scholar](https://www.semanticscholar.org)** — bibliographic data provided by
  Semantic Scholar, a free AI-powered research tool from the
  [Allen Institute for AI](https://allenai.org), used under the
  [Semantic Scholar API License Agreement](https://www.semanticscholar.org/product/api/license).
  API keys are **bring-your-own**: each user supplies their own key; no shared or
  embedded key ships with CiteSight. If you publish results produced with this data,
  cite *The Semantic Scholar Open Data Platform* (Kinney et al., 2023).
- **[Crossref](https://www.crossref.org)** — open scholarly metadata; requests join the
  polite pool via your contact email.
- **[OpenAlex](https://openalex.org)** — open catalogue of scholarly works (CC0). For
  scholarly use, cite Priem, Piwowar & Orr (2022), *OpenAlex: A fully-open index of
  scholarly works, authors, venues, institutions, and concepts*.
- **arXiv** — thank you to [arXiv](https://arxiv.org) for use of its open access
  interoperability. Requests are paced to arXiv's API guidance (one request per
  three seconds).
- **[DataCite](https://datacite.org)** and **[Open Library](https://openlibrary.org)** —
  open metadata used for DOI resolution and book lookups.

**Hosted deployments:** do **not** set `SEMANTIC_SCHOLAR_API_KEY` on a publicly
accessible server. A personal key covers the key-holder's own use (and their
organisation's authorised users) under the S2 licence — it must not serve anonymous
visitors' requests. Leave public instances keyless; users get their own free key at
[semanticscholar.org/product/api](https://www.semanticscholar.org/product/api).

## Licence

See [LICENSE](LICENSE).
