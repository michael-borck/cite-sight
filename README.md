# CiteSight

**Academic integrity tool for checking student assignments.**

A desktop app and CLI tool that loads a student assignment, extracts references and in-text citations, verifies every reference exists via academic databases, checks URLs, validates citation formatting, and flags suspicious or fabricated references.

## Features

- **Reference Verification** — Checks every bibliography entry against Crossref, Semantic Scholar, and OpenAlex APIs
- **Citation Format Validation** — Checks APA, MLA, and Chicago formatting rules
- **Cross-Reference Checking** — Matches in-text citations to bibliography entries, flags orphans
- **URL Verification** — HTTP checks on referenced URLs, with screenshots as evidence (desktop)
- **DOI Resolution** — Validates DOIs via Crossref
- **Readability Analysis** — Flesch Reading Ease, Flesch-Kincaid Grade, Coleman-Liau, ARI
- **Writing Quality** — Passive voice, hedging phrases, transitions, academic tone scoring
- **Integrity Checks** — AI-typical patterns, citation anomalies, placeholder text detection
- **File Support** — PDF, DOCX, TXT, Markdown, JSON

## Quick Start

### Desktop App

```bash
# Install dependencies
npm install

# Build the core library
npm run build:core

# Start the Electron app in dev mode
# Terminal 1: Vite dev server
cd packages/desktop && npx vite

# Terminal 2: Electron
npx tsc -p packages/desktop/tsconfig.json
cd packages/desktop && npx electron .
```

### CLI

```bash
npm run build:core
npx tsc -p packages/cli/tsconfig.json

# Analyze a document
node packages/cli/dist/index.js check paper.pdf

# JSON output
node packages/cli/dist/index.js check paper.pdf --json

# Options
node packages/cli/dist/index.js check paper.pdf --style apa --email you@example.com --verbose
```

## Project Structure

```
cite-sight/
├── packages/
│   ├── core/                # Shared library (CLI + desktop both use this)
│   │   └── src/
│   │       ├── extractors/  # PDF, DOCX, text extraction
│   │       ├── analyzers/   # Readability, writing quality, word analysis, integrity
│   │       ├── references/  # Extraction, format validation, API clients, verification
│   │       ├── pipeline.ts  # Full analysis orchestrator
│   │       └── types.ts     # All shared types
│   ├── desktop/             # Electron app
│   │   └── src/
│   │       ├── main/        # Electron main process, IPC, screenshots, auto-update
│   │       └── renderer/    # React UI
│   └── cli/                 # CLI tool
│       └── src/
│           └── index.ts     # Commander.js CLI
├── package.json             # Workspace root
└── tsconfig.base.json
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

Releases are built automatically via GitHub Actions when a tag is pushed:

```bash
git tag v1.0.0
git push --tags
```

This builds installers for macOS (DMG), Windows (NSIS), and Linux (AppImage) and creates a GitHub Release with auto-update support.

## Technology Stack

- **Core**: TypeScript, pdfjs-dist, mammoth
- **Desktop**: Electron, React 19, Zustand, Vite, electron-updater
- **CLI**: Commander.js, chalk
- **APIs**: Crossref, Semantic Scholar, OpenAlex (all free tier)

## License

See [LICENSE](LICENSE).
