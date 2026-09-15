import { ipcMain, dialog, BrowserWindow, app, shell } from 'electron';
import { analyzePipeline, analyzeClaimsFile, verifyReferences, planFiles } from '@michaelborck/cite-sight-core';
import { takeScreenshot } from './screenshot.js';
import { saveSession, openSession } from './sessions.js';
import { saveLookupCache, loadDismissals, setDismissal, cacheInfo, clearCacheFile, clearDismissalsFile } from './cacheStore.js';
import { readdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { ProcessingOptions, AnalysisResult } from '@michaelborck/cite-sight-core';
import type { ClaimRequest } from '../shared/claimInstallation.js';
import { desktopTask, isLocalOnly, onlineOperation, setLocalOnly, setupOperation, setDocumentsOpen } from './privacy.js';
import { ClaimInstallation } from './claimInstallation.js';
import { claimCheckpointPath, checkpointClaimResult, clearBatchRecovery, loadBatchRecovery, saveBatchRecovery } from './batchRecovery.js';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.qmd']);

// Screenshots are the only files the renderer may read back, and they live in
// the OS temp dir with this prefix (see screenshot.ts). Anything else is a
// path-traversal attempt (e.g. ~/.ssh/id_rsa) and is refused.
const SCREENSHOT_PREFIX = 'cite-sight-screenshot-';

function isAllowedScreenshotPath(filePath: string): boolean {
  try {
    const tmpReal = realpathSync(tmpdir());
    const fileReal = realpathSync(resolve(filePath));
    return (
      (fileReal === tmpReal || fileReal.startsWith(tmpReal + '/')) &&
      basename(fileReal).startsWith(SCREENSHOT_PREFIX) &&
      extname(fileReal).toLowerCase() === '.png'
    );
  } catch {
    return false;
  }
}

/** Recursively collect supported files from a directory. */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

let mainWindow: BrowserWindow;
let handlersRegistered = false;
let claimController: AbortController | undefined;
const selectedClaimFiles = { source: new Set<string>() };
let installation: ClaimInstallation | undefined;
function claimInstallation(): ClaimInstallation {
  return installation ??= new ClaimInstallation(app.getPath('userData'), app.isPackaged
    ? join(process.resourcesPath, 'claim-runtime') : join(app.getAppPath(), 'resources', 'runtime', process.arch));
}

export function registerIpcHandlers(window: BrowserWindow): void {
  // macOS can reopen the window without restarting the process. Keep one set
  // of handlers and point dialogs/progress at the current window.
  mainWindow = window;
  window.once('closed', () => { claimController?.abort(new Error('Window closed.')); installation?.cancel(); });
  if (handlersRegistered) return;
  handlersRegistered = true;
  ipcMain.handle('cite-sight:save-session', (_event, session: unknown) => saveSession(mainWindow, session));
  const authorizeSources = (session: Awaited<ReturnType<typeof openSession>>) => {
    for (const file of session?.files ?? []) for (const source of file.claimSources ?? []) selectedClaimFiles.source.add(source.path);
    return session;
  };
  ipcMain.handle('cite-sight:open-session', async () => authorizeSources(await openSession(mainWindow)));
  ipcMain.handle('cite-sight:save-batch-checkpoint', (_event, session: unknown) => saveBatchRecovery(app.getPath('userData'), session));
  ipcMain.handle('cite-sight:load-batch-checkpoint', async () => authorizeSources(await loadBatchRecovery(app.getPath('userData'))));
  ipcMain.handle('cite-sight:clear-batch-checkpoint', () => desktopTask(isLocalOnly(), () => clearBatchRecovery(app.getPath('userData'))));
  ipcMain.handle('cite-sight:plan-batch', (_event, paths: string[], options: Parameters<typeof planFiles>[1]) => desktopTask(isLocalOnly(), async () => {
    setDocumentsOpen(true);
    return planFiles(paths, options, (index, total) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('cite-sight:progress', { stage: 'extracting', progress: index / total * 100, message: `Estimating document ${index} of ${total} locally...` });
    });
  }));
  ipcMain.handle('cite-sight:get-version', () => app.getVersion());
  ipcMain.handle('cite-sight:documents-open', (_event, value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('Invalid document state.');
    setDocumentsOpen(value);
  });
  ipcMain.handle('cite-sight:claim-installation', () => claimInstallation().status());
  ipcMain.handle('cite-sight:calibrate-claim-model', () => desktopTask(true, async () => { await claimInstallation().calibrate(); return claimInstallation().status(); }));
  const notifySetup = (progress: unknown) => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('cite-sight:claim-install-progress', progress); };
  ipcMain.handle('cite-sight:install-claim-model', (_event, id: string) => setupOperation(async () => {
    await claimInstallation().install(id, notifySetup); return claimInstallation().status();
  }));
  ipcMain.handle('cite-sight:import-claim-model', (_event, id: string) => setupOperation(async () => {
    const selection = await dialog.showOpenDialog(mainWindow, { title: 'Import catalog GGUF model', properties: ['openFile'], filters: [{ name: 'GGUF model', extensions: ['gguf'] }] });
    if (!selection.canceled && selection.filePaths[0]) await claimInstallation().install(id, notifySetup, selection.filePaths[0]);
    return claimInstallation().status();
  }));
  ipcMain.handle('cite-sight:cancel-claim-install', () => installation?.cancel());
  ipcMain.handle('cite-sight:remove-claim-model', () => setupOperation(async () => { await claimInstallation().remove(); return claimInstallation().status(); }));
  ipcMain.handle('cite-sight:set-local-only', (_event, value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('Invalid network mode.');
    setLocalOnly(value);
  });
  ipcMain.handle('cite-sight:select-claim-file', async (_event, kind: keyof typeof selectedClaimFiles) => {
    if (kind !== 'source') throw new Error('Executables and models are managed in Settings.');
    const selection = await dialog.showOpenDialog(mainWindow, { title: `Select local ${kind}`, properties: ['openFile'],
      filters: [{ name: 'Source document', extensions: ['pdf', 'docx', 'txt', 'md', 'qmd'] }],
    });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const path = realpathSync(selection.filePaths[0]);
    selectedClaimFiles[kind].add(path);
    return path;
  });
  ipcMain.handle('cite-sight:cancel-claims', () => claimController?.abort(new Error('Claim checking cancelled.')));
  ipcMain.handle('cite-sight:check-claims', (_event, filePath: string, config: ClaimRequest, options: ProcessingOptions) => desktopTask(true, async () => {
    setDocumentsOpen(true);
    if (!config || !Array.isArray(config.sources) || config.sources.some((source) => !source || !selectedClaimFiles.source.has(source.path))) {
      throw new Error('Select source files using the desktop file pickers.');
    }
    claimController = new AbortController();
    try {
      return await analyzeClaimsFile(filePath, { ...config, ...await claimInstallation().resolve() }, options, (update) => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('cite-sight:progress', update);
      }, claimController.signal, {
        path: claimCheckpointPath(app.getPath('userData'), filePath), restart: config.restart === true,
        onSaved: async (result) => {
          await checkpointClaimResult(app.getPath('userData'), filePath, result, config.sources, { ...options, offline: true }, config.maxClaims ?? 50);
          if (!mainWindow.isDestroyed()) mainWindow.webContents.send('cite-sight:claim-checkpoint', { path: filePath, result });
        },
      });
    } finally { claimController = undefined; }
  }));

  // Handle document analysis (with optional post-analysis screenshots)
  ipcMain.handle(
    'cite-sight:analyze',
    async (_event, filePath: string, options: ProcessingOptions) => desktopTask(options.offline !== false, async () => {
      setDocumentsOpen(true);
      // A Semantic Scholar key from the environment lifts keyless rate-limiting
      // during large folder batches, without needing a UI field for it.
      const mergedOptions: ProcessingOptions = {
        ...options,
        offline: options.offline !== false,
        semanticScholarApiKey: options.semanticScholarApiKey ?? process.env.SEMANTIC_SCHOLAR_API_KEY,
        openAlexApiKey: options.openAlexApiKey ?? process.env.OPENALEX_API_KEY,
      };
      const result: AnalysisResult = await analyzePipeline(
        filePath,
        mergedOptions,
        (update) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cite-sight:progress', update);
          }
        },
        (verification, index, total) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cite-sight:reference', { verification, index, total });
          }
        },
      );

      // Take screenshots of live URLs if requested
      if (!mergedOptions.offline && options.screenshotUrls && result.references?.verifications) {
        for (const v of result.references.verifications) {
          if (v.urlCheck?.url && v.urlCheck.status === 'live') {
            try {
              v.urlCheck.screenshotPath = await takeScreenshot(v.urlCheck.url);
            } catch {
              // Skip failed screenshots — non-critical
            }
          }
        }
      }

      // Persist the lookup cache so the next run (or the next app version)
      // starts warm instead of re-spending API quota.
      saveLookupCache();

      return result;
    }),
  );

  // Re-verify a single reference — the recovery path for 'unverified'
  // verdicts (rate-limit/timeout during the batch run). Same options as the
  // original analysis, including the env-var Semantic Scholar key.
  ipcMain.handle(
    'cite-sight:reverify',
    async (_event, ref: unknown, options: ProcessingOptions) => desktopTask(isLocalOnly() || options.offline !== false, async () => {
      const [verification] = await verifyReferences(
        [ref as never],
        {
          offline: isLocalOnly() || options.offline !== false,
          mailto: options.contactEmail,
          checkUrls: options.checkUrls,
          checkDoi: options.checkDoi,
          citationStyle: options.citationStyle as unknown as import('@michaelborck/cite-sight-core').CitationStyle,
          semanticScholarApiKey: options.semanticScholarApiKey ?? process.env.SEMANTIC_SCHOLAR_API_KEY,
          openAlexApiKey: options.openAlexApiKey ?? process.env.OPENALEX_API_KEY,
        },
      );
      saveLookupCache();
      return verification ?? null;
    }),
  );

  // Persistent triage decisions (dismissals), keyed by reference content.
  ipcMain.handle('cite-sight:load-dismissals', () => loadDismissals());
  ipcMain.handle('cite-sight:set-dismissal', (_event, contentKey: string, dismissed: boolean) => {
    if (typeof contentKey === 'string' && contentKey.startsWith('refkey:')) {
      setDismissal(contentKey, Boolean(dismissed));
    }
  });

  // Data & privacy: cache stewardship
  ipcMain.handle('cite-sight:cache-info', () => cacheInfo());
  ipcMain.handle('cite-sight:clear-cache', () => clearCacheFile());
  ipcMain.handle('cite-sight:clear-dismissals', () => clearDismissalsFile());
  ipcMain.handle('cite-sight:reveal-data-dir', () => {
    shell.showItemInFolder(cacheInfo().cacheFile);
  });

  // Handle native file dialog
  ipcMain.handle('cite-sight:select-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Documents',
          extensions: ['pdf', 'docx', 'txt', 'md', 'qmd'],
        },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Word Documents', extensions: ['docx'] },
        { name: 'Text Files', extensions: ['txt', 'md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled) {
      return [];
    }
    return filePaths;
  });

  // Handle folder selection — collect all supported files recursively
  ipcMain.handle('cite-sight:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Folder',
      properties: ['openDirectory'],
    });

    if (canceled || filePaths.length === 0) {
      return [];
    }

    return collectFiles(filePaths[0]);
  });

  // Handle URL screenshot capture
  ipcMain.handle('cite-sight:take-screenshot', async (_event, url: string) => {
    return onlineOperation(() => takeScreenshot(url));
  });

  // Read a screenshot file and return as data URL for renderer use. The path
  // is constrained to cite-sight's own screenshots in the temp dir so a
  // compromised renderer can't read arbitrary files off disk.
  ipcMain.handle('cite-sight:read-screenshot', (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !isAllowedScreenshotPath(filePath)) return null;
    if (!existsSync(filePath)) return null;
    const data = readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  });
}
