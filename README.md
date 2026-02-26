# CiteSight

**Academic integrity tool for checking student assignments.**

A desktop app, CLI tool, and web service that loads a student assignment, extracts references and in-text citations, verifies every reference exists via academic databases, checks URLs, validates citation formatting, and flags suspicious or fabricated references.

## Features

- **Reference Verification** — Checks every bibliography entry against Crossref, Semantic Scholar, and OpenAlex APIs
- **Citation Format Validation** — Checks APA, MLA, and Chicago formatting rules
- **Cross-Reference Checking** — Matches in-text citations to bibliography entries, flags orphans
- **URL Verification** — HTTP checks on referenced URLs, with screenshots as evidence (desktop)
- **DOI Resolution** — Validates DOIs via Crossref
- **Readability Analysis** — Flesch Reading Ease, Flesch-Kincaid Grade, Coleman-Liau, ARI
- **Writing Quality** — Passive voice, hedging phrases, transitions, academic tone scoring
- **Writing Patterns** — Citation issues, completeness checks, and style observations for reviewer consideration
- **File Support** — PDF, DOCX, TXT, Markdown, JSON

## Install

Three ways to use CiteSight:

| Method | Best for | Install |
|--------|----------|---------|
| **Desktop app** | Offline use, URL screenshots | [Download for your platform](https://github.com/michael-borck/cite-sight/releases/latest) |
| **CLI** | Automation, CI pipelines | `npm install -g cite-sight` |
| **Docker** | VPS hosting, shared access | `docker pull michaelborck/cite-sight` |

### Platform Comparison

| Feature | Web / Docker | Desktop | CLI |
|---------|-------------|---------|-----|
| File input | Single file | Multiple files | Single file |
| File types | PDF, DOCX, TXT | PDF, DOCX, TXT, MD | PDF, DOCX, TXT, MD, JSON |
| URL screenshots | — | Yes | — |
| PDF/CSV export | Yes | — | — |
| Output format | Browser dashboard | Desktop dashboard | Text or JSON (stdout) |

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

### CLI

```bash
npm run build:core
npx tsc -p packages/cli/tsconfig.json

cite-sight check paper.pdf
cite-sight check paper.pdf --json
cite-sight check paper.pdf --style apa --email you@example.com --verbose
```

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
│   ├── desktop/       # Electron app
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
- **npm publish** — `@michaelborck/cite-sight-core` + `cite-sight` CLI
- **Docker images** — pushed to Docker Hub and GitHub Container Registry (amd64 + arm64)

## Technology Stack

- **Core**: TypeScript, pdfjs-dist, mammoth
- **Desktop**: Electron, React 19, Zustand, Vite, electron-updater
- **Web**: React 19, Vite
- **Server**: Express, multer, BullMQ (optional)
- **CLI**: Commander.js, chalk
- **APIs**: Crossref, Semantic Scholar, OpenAlex (all free tier)

## License

See [LICENSE](LICENSE).
