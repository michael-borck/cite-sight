# ADR 0001 — Desktop app stays on Electron, not Tauri

- **Status:** Accepted
- **Date:** 2026-07-23
- **Deciders:** Michael Borck
- **Scope:** `packages/desktop` only. Does not affect core, server, cli, or web.

## Context

The Electron desktop app ships large installers (macOS arm64 DMG ≈ 140 MB,
Windows NSIS ≈ 118 MB, Linux AppImage ≈ 160 MB), most of it the bundled
Chromium runtime. Migrating to **Tauri** (which uses the OS webview instead of
bundling a browser) was proposed to cut download size.

We built a working proof-of-concept to answer two questions with evidence
rather than guesswork:

1. Can the analysis engine run in a webview at all?
2. What actually breaks in the migration?

## What the proof-of-concept proved

A real Tauri build of CiteSight ran the full pipeline — PDF/DOCX extraction,
reference verification against Crossref/OpenAlex/Semantic Scholar — end to end
inside the macOS WKWebView, against a real fixture (5 references, APA detected,
1 verified / 3 suspicious).

| | Electron 0.8.7 | Tauri PoC |
|---|---|---|
| macOS arm64 DMG | 140 MB | **3.23 MB** |
| Installed `.app` | ~130 MB | 6.2 MB |

So the size prize is real (~98% smaller), and `packages/core` runs in a webview
**with no Rust port of the domain logic** — `main.rs` was 10 lines.

Getting there surfaced three code-level blockers, all of which we **fixed in
core** (see the "Kept regardless" section). They are not the reason we stayed on
Electron.

## The decision driver: screenshots

The desktop app screenshots each live reference URL so a human can see the page
that the automated verdict was based on — visual evidence behind the
assessment. It is implemented with Electron's `BrowserWindow` + `capturePage()`
(`packages/desktop/src/main/screenshot.ts`).

This is not a minor feature. It is the desktop app's **reason to exist**:

- The web version explicitly markets *"Want offline analysis and screenshot
  verification?"* as the pitch to download the desktop app
  (`packages/web/src/pages/ToolPage.tsx:259`).
- The server deliberately never screenshots — `screenshotUrls: false` in every
  path (`packages/server/src/queue.ts:65`, `routes.ts:185`, `routes.ts:270`).

`capturePage()` is reliable, cross-platform, offline, and needs no OS
permission **because Electron bundles Chromium and owns the compositor**. The
137 MB we wanted to shed *is* that Chromium — the very thing the feature
depends on. Tauri is small precisely because it ships no browser engine, which
is the same reason it cannot cleanly screenshot arbitrary pages.

Every Tauri workaround breaks something the feature requires:

| Approach | What it costs |
|---|---|
| Rust offscreen webview + OS screen-capture | Triggers the **macOS screen-recording permission prompt**; offscreen windows may not composite; flaky cross-platform |
| Bundle headless Chrome (chromiumoxide / headless_chrome) | Requires Chrome installed on the user's machine, or re-bundles a browser → **destroys the size win** |
| Server-side screenshots | Breaks **offline operation** (the selling point) and sends student reference URLs to a server (privacy) |

To reproduce the current behaviour you would have to re-bundle a browser
engine — i.e. rebuild Electron, worse.

## Decision

**Keep Electron for the desktop app.** This is the one case where Electron's
size buys a real, load-bearing capability rather than mere convenience.
Migrating to save download size while destroying the app's core differentiator
is a bad trade.

## Kept regardless of this decision

The PoC required making `packages/core` bundle cleanly for a browser/webview.
Those changes are **committed and retained** (branch
`core/browser-safe-extraction`) because they stand on their own merits — they
help the **web** build and are good hygiene — and they do **not** touch the
Electron path (desktop still builds and launches clean):

1. **No `node:*` reachable from the neutral graph.** Path-taking helpers moved
   to `extractors/fromFile.ts` and `pipelineFromFile.ts`; neutral entry points
   are `extractFromBytes()` and `analyzeDocument(bytes, fileName)`. Extractors
   take `Uint8Array` instead of `Buffer`.
2. **pdfjs worker no longer throws on import** outside Node; `setPdfWorkerSrc()`
   lets a bundled host inject the worker URL.
3. **Injectable fetch** (`httpClient.ts`, `setFetch`/`httpFetch`) so a webview
   host can route through a native HTTP layer **without** overwriting
   `globalThis.fetch` (which would make the native plugin re-enter itself and
   hang — a trap we hit).
4. New `@michaelborck/cite-sight-core/browser` entry + a regression guard
   (`test/browser-entry.test.ts`) that fails if any `node:` builtin becomes
   reachable from it again.

The Tauri PoC itself (`spike-tauri/`) was a throwaway rig and has been deleted.

## Revisit this decision if any of these change

This ADR is about *today's* constraints. Reopen it if:

- **The screenshot feature is dropped or reworked** (e.g. it moves to a
  server-side/opt-in model, or usage data shows nobody relies on the
  thumbnails). Without the `capturePage` dependency, Tauri becomes largely
  mechanical wiring — the PoC proved the engine already runs in a webview.
- **A reliable, offline, no-permission, cross-platform screenshot path lands
  for Tauri/wry** (a real `capturePage` equivalent). None existed as of
  2026-07.
- **Download size becomes a hard operational blocker** (e.g. university managed
  deployment with a size cap, or bandwidth complaints) that outweighs the
  feature — at which point the server-side-screenshot trade may be worth
  revisiting despite the offline/privacy cost.

If none of those hold, the answer to "should we move to Tauri?" is **no**, and
this record is why.
