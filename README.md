# CiteSight

<!-- BADGES:START -->
[![edtech](https://img.shields.io/badge/-edtech-4caf50?style=flat-square)](https://github.com/topics/edtech) [![academic-integrity](https://img.shields.io/badge/-academic--integrity-blue?style=flat-square)](https://github.com/topics/academic-integrity) [![citation-analysis](https://img.shields.io/badge/-citation--analysis-blue?style=flat-square)](https://github.com/topics/citation-analysis) [![document-analysis](https://img.shields.io/badge/-document--analysis-blue?style=flat-square)](https://github.com/topics/document-analysis) [![frontend](https://img.shields.io/badge/-frontend-blue?style=flat-square)](https://github.com/topics/frontend) [![react](https://img.shields.io/badge/-react-61dafb?style=flat-square)](https://github.com/topics/react) [![research](https://img.shields.io/badge/-research-3f51b5?style=flat-square)](https://github.com/topics/research) [![typescript](https://img.shields.io/badge/-typescript-3178c6?style=flat-square)](https://github.com/topics/typescript) [![vite](https://img.shields.io/badge/-vite-blue?style=flat-square)](https://github.com/topics/vite) [![web-app](https://img.shields.io/badge/-web--app-blue?style=flat-square)](https://github.com/topics/web-app)
<!-- BADGES:END -->

**Academic integrity tool for checking student assignments.**

A desktop app, CLI tool, and web service that loads a student assignment, extracts references and in-text citations, verifies every reference exists via academic databases, checks URLs, validates citation formatting, and flags suspicious or fabricated references.

## Features

- **Reference Verification** — Checks every bibliography entry against Crossref, Semantic Scholar, and OpenAlex APIs
- **Citation Format Validation** — Checks APA, MLA, and Chicago formatting rules
- **Cross-Reference Checking** — Matches in-text citations to bibliography entries, flags orphans
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
| **Desktop app** | Offline use, URL screenshots | [Download for your platform](https://github.com/michael-borck/cite-sight/releases/latest) |
| **Standalone HTML** | No install — one file, double-click, runs on this device | [Download `cite-sight-standalone.html`](https://github.com/michael-borck/cite-sight/releases/latest) |
| **CLI** | Automation, CI pipelines | `npm install -g cite-sight` |
| **Docker** | VPS hosting, shared access | `docker pull michaelborck/cite-sight` |

### Platform Comparison

| Feature | Web / Docker | Desktop | Standalone HTML | CLI |
|---------|-------------|---------|-----------------|-----|
| File input | Single file or pasted references | Files or folders | Multiple files | Files, folders or globs |
| File types | PDF, DOCX, TXT, MD, QMD, JSON | PDF, DOCX, TXT, MD, QMD | PDF, DOCX, TXT, MD, QMD | PDF, DOCX, TXT, MD, QMD, JSON |
| URL screenshots | — | Yes | — | — |
| URL liveness checks | Yes | Yes | Manual (open in tab) | Yes |
| arXiv lookups | Yes | Yes | — (browser-blocked) | Yes |
| Report exports | PDF, CSV | PDF, CSV, BibTeX | PDF, CSV, BibTeX | HTML, JSON, text |
| Output format | Browser dashboard | Desktop dashboard | Browser dashboard | Text or JSON (stdout) |

The standalone build is a single self-contained `.html` file — the whole analysis
runs in your browser tab and the document never leaves your device. Two checks
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

```bash
npm run build:core
npx tsc -p packages/cli/tsconfig.json

cite-sight check paper.pdf
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
```

**Batch checking and rate limits.** Lookups run one reference at a time and every
external request is paced to one per second, so checking a folder is slow but
stays within the citation databases' polite-pool limits; results are cached per
run, so a work cited across many papers is looked up only once. Always pass
`--email` (it joins the Crossref/OpenAlex polite pools). Semantic Scholar's
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
3. **Verify Existence** (cascade):
   - DOI → Crossref API
   - Search Crossref by title + author
   - Search Semantic Scholar (fallback)
   - Search OpenAlex (fallback)
   - If has URL → HTTP status check
4. **Cross-Reference** — Match bibliography ↔ in-text citations
5. **Score** — Confidence score (0–1) based on metadata match quality

## Building Releases

Releases are built automatically via GitHub Actions when a version tag is pushed.

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

## Technology Stack

- **Core**: TypeScript, pdfjs-dist, mammoth
- **Desktop**: Electron, React 19, Zustand, Vite, electron-updater
- **Web**: React 19, Vite
- **Server**: Express, multer, BullMQ (optional)
- **CLI**: Commander.js, chalk
- **APIs**: Crossref, Semantic Scholar, OpenAlex, arXiv, DataCite (all free tier)

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
