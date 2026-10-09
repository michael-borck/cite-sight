# Testing and verification notes

How to run the suite, and the environment traps that cost time while writing
tests in this repo. Each entry is something that actually bit us — if you hit
one that is not listed here, add it.

## Running the tests

```bash
npm test                    # everything: JS/TS packages, then the Python wrapper
npm run test:core           # a single package
npm run test:verification   # provider contracts + verification benchmark
npm run lint
```

The Python wrapper has its own suite (`packages/python/test_wrapper.py`,
stdlib `unittest`, no dependencies) and runs last in `npm test` via
`npm run test:python`.

## Environment gotchas

### `localStorage` is undefined under test on Node 26

Node 26 exposes an experimental global `localStorage` that is **undefined unless
Node is started with `--localstorage-file`**. Vitest's jsdom environment makes
`window === globalThis`, so it shadows jsdom's working storage — meaning both
`localStorage` and `window.localStorage` are the broken one.

The symptom is deliberately unhelpful:

```
TypeError: Cannot read properties of undefined (reading 'clear')
```

Nothing in the message mentions Node, jsdom or storage. It appears at the first
`localStorage.*` call in a test, and only in files that use `localStorage` —
which is why it can look like your test is at fault.

Fix: install a stub for the duration of the test. `packages/web/test/landing-download.test.tsx`
has a complete in-memory `Storage` implementation:

```ts
let store: Storage;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
  } as Storage;
}

beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal('localStorage', store);
});
afterEach(() => vi.unstubAllGlobals());
```

`sessionStorage` is **not** affected — Node's experimental global is
`localStorage` specifically, which is why `tool-page.test.tsx` uses
`sessionStorage` and has never needed a stub. If a test genuinely needs
`localStorage`, stub it as above.

### `import.meta.url` fails under jsdom

Reading a fixture with it throws:

```
TypeError: The URL must be of scheme file
```

jsdom gives `import.meta.url` an `http:` URL. Use `import.meta.dirname`
alongside `node:path`:

```ts
import { resolve } from 'node:path';
const css = readFileSync(resolve(import.meta.dirname, '../src/index.css'), 'utf8');
```

See `packages/web/test/contrast.test.ts`.

### Build-time constants need a `define`

Components can read constants injected by Vite (`__APP_VERSION__`). Vitest does
not run `vite.config.ts`, so an undefined constant blows up at render:

```
ReferenceError: __APP_VERSION__ is not defined
```

Mirror the production `define` in the package's `vitest.config.ts` — the web
package does this for `__APP_VERSION__`.

### `._*` files are everywhere on this checkout

The repo lives on an exFAT volume, so macOS scatters AppleDouble sidecars
(`._SomeFile.ts`) next to every real file. They are gitignored, but they are not
invisible to test runners. Every `vitest.config.ts` excludes `**/._*`; keep that
pattern if you add a package, and expect stray `._` files in any file listing.

They also confuse `git` with `non-monotonic index` warnings. Harmless, but they
are why `git status` output in this repo is noisy.

## Seeing the UI

Code review and tests both miss whole classes of problem — a dismiss button
rendered 400px off-screen, two notice bars saying the same thing, a legal
caveat styled as the largest text on the page. Both surfaces can be screenshotted
without a display.

### Web (Chromium)

Playwright browsers are already cached at
`~/Library/Caches/ms-playwright`, so only the driver package is needed:

```bash
npm i -D playwright-core   # deliberately not a saved dependency

cd packages/web && npm run dev -- --port 5199
```

```js
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });

// Route the API so a report renders with no backend and no network.
await page.route('**/api/analyze', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ status: 'complete', result, expiresAt: new Date(Date.now() + 3600e3).toISOString() }),
}));
await page.goto('http://localhost:5199/tool', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'shot.png' });
```

Bump the `chromium-1223` path if a newer cached build exists — `ls
~/Library/Caches/ms-playwright` to see what is there.

### Desktop (Electron)

The renderer is a Vite bundle, so it can be driven directly with Electron's own
screenshot API and a stubbed preload:

```bash
npm run build:core && npm run build -w packages/desktop
node_modules/electron/dist/Electron.app/Contents/MacOS/Electron capture.js
```

`capture.js` needs a preload that exposes the IPC bridge with `contextBridge`
(setting `window.citeSight` directly does **not** work — with
`contextIsolation: true` the preload's `window` is a different object), then
`webContents.capturePage().toPNG()`. The macOS Electron path is above; on other
platforms it is `node_modules/electron/dist/electron`.

This is how the desktop empty state was reviewed and restyled. Note that
`npm run build` alone does not catch regressions here — the Electron build fails
only if something actually breaks, which is why screenshots were worth the
setup.

## What the suite covers

`packages/core/test` holds the bulk: provider contracts, verdict logic against
recorded verdicts, reference extraction, cross-referencing, SSRF and upload
limits, session and checkpoint handling. `packages/cli/test` runs the built CLI
end-to-end against a mock fetch. `packages/web/test` covers routing, refresh
recovery, the busy-retry backoff and design-token contrast — see
[`contrast.test.ts`](../packages/web/test/contrast.test.ts), which computes real
WCAG ratios from `index.css` so the palette cannot silently regress.

There is no coverage threshold configured. The gap that matters is visual, and
that is what the screenshot workflow above is for.