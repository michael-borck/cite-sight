import { Router } from 'express';
import multer from 'multer';
import { tmpdir } from 'os';
import { rename, unlink } from 'fs/promises';
import path from 'path';
import { analyzePipeline } from '@michaelborck/cite-sight-core';
import type { ProcessingOptions } from '@michaelborck/cite-sight-core';
import { isQueueAvailable, addJob, getJob } from './queue.js';
import { fileCleanup } from './middleware.js';
import { MANIFEST } from './manifest.js';

// ---------------------------------------------------------------------------
// Multer configuration
// ---------------------------------------------------------------------------

const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.json']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// The MIME types a browser sends for each accepted extension. Used as a
// defense-in-depth cross-check against the extension — a mismatch (e.g. an
// executable renamed to .pdf) is rejected up front. (The downstream parsers
// also reject content that isn't really a PDF/DOCX, so this is one layer of
// several, not the sole guard.)
const EXTENSION_MIME: Record<string, Set<string>> = {
  '.pdf': new Set(['application/pdf', 'application/octet-stream']),
  '.docx': new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
    'application/zip',
  ]),
  '.txt': new Set(['text/plain', 'application/octet-stream']),
  '.md': new Set(['text/markdown', 'text/plain', 'text/x-markdown', 'application/octet-stream']),
  '.json': new Set(['application/json', 'text/plain', 'application/octet-stream']),
};

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      cb(Object.assign(new Error('Unsupported file type'), { status: 415 }));
      return;
    }
    // Reject an obvious extension/MIME mismatch. An empty/missing mimetype is
    // allowed through (some clients omit it); the parser is the backstop.
    const allowed = EXTENSION_MIME[ext];
    if (file.mimetype && allowed && !allowed.has(file.mimetype.toLowerCase())) {
      cb(Object.assign(new Error('File content does not match its extension'), { status: 415 }));
      return;
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// Concurrent upload limit
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_UPLOADS = 10;
let activeUploads = 0;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const router = Router();

// ---- POST /api/analyze -----------------------------------------------------

router.post(
  '/api/analyze',
  fileCleanup,
  (_req, res, next) => {
    if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
      res.status(503).json({
        error: 'The server is busy processing other uploads. Please try again in a moment.',
      });
      return;
    }
    activeUploads++;
    next();
  },
  upload.single('file'),
  async (req, res, next) => {
    if (!req.file) {
      activeUploads--;
      res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
      return;
    }

    // Multer saves temp files without an extension (e.g. /tmp/abc123).
    // The core extractor relies on the extension to determine file type, so
    // rename the temp file to preserve the original extension.
    const ext = path.extname(req.file.originalname).toLowerCase();
    const filePath = req.file.path + ext;
    await rename(req.file.path, filePath);

    // Parse options from request body (all optional, with safe defaults)
    const body = req.body as Record<string, string | undefined>;

    const citationStyle = (['auto', 'apa', 'mla', 'chicago'].includes(body['citationStyle'] ?? '')
      ? body['citationStyle']
      : 'auto') as ProcessingOptions['citationStyle'];

    const checkUrls = body['checkUrls'] !== 'false';
    const checkDoi = body['checkDoi'] !== 'false';
    const checkInText = body['checkInText'] !== 'false';

    // ---- Async path: BullMQ queue ------------------------------------------
    if (isQueueAvailable()) {
      try {
        const jobId = await addJob({
          filePath,
          citationStyle,
          checkUrls,
          checkDoi,
          checkInText,
        });

        activeUploads--;
        // File ownership transferred to the worker — do NOT delete here.
        res.status(202).json({ status: 'queued', jobId });
      } catch (err) {
        activeUploads--;
        next(err);
      }
      return;
    }

    // ---- Synchronous path --------------------------------------------------
    const options: ProcessingOptions = {
      citationStyle,
      checkUrls,
      checkDoi,
      checkInText,
      screenshotUrls: false,
    };

    try {
      const result = await analyzePipeline(filePath, options);
      res.json({ status: 'complete', result });
    } catch (err) {
      next(err);
    } finally {
      activeUploads--;
      // Always clean up — even when response was already sent via next(err).
      await unlink(filePath).catch(() => undefined);
    }
  },
);

// ---- GET /api/job/:id ------------------------------------------------------

router.get('/api/job/:id', async (req, res, next) => {
  if (!isQueueAvailable()) {
    res.status(404).json({ error: 'Job queue is not configured on this server.' });
    return;
  }

  try {
    const jobData = await getJob(req.params['id'] ?? '');

    if (!jobData) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }

    res.json(jobData);
  } catch (err) {
    next(err);
  }
});

// ---- GET /api/health -------------------------------------------------------

router.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    redis: isQueueAvailable(),
  });
});

// ---------------------------------------------------------------------------
// lens analyser family contract
// ---------------------------------------------------------------------------
// Synchronous, flat-result endpoints matching the family contract (POST /analyse,
// GET /health, GET /manifest), alongside the /api/* routes the cite-sight
// frontends use. These let auto-analyser and other family tools call cite-sight
// like any other analyser. /analyse always runs synchronously (no job queue) and
// returns the report directly (no envelope), per the family convention.

router.post('/analyse', fileCleanup, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const filePath = req.file.path + ext;
  await rename(req.file.path, filePath);

  const body = req.body as Record<string, string | undefined>;
  const citationStyle = (['auto', 'apa', 'mla', 'chicago'].includes(body['citationStyle'] ?? '')
    ? body['citationStyle']
    : 'auto') as ProcessingOptions['citationStyle'];

  const options: ProcessingOptions = {
    citationStyle,
    checkUrls: body['checkUrls'] !== 'false',
    checkDoi: body['checkDoi'] !== 'false',
    checkInText: body['checkInText'] !== 'false',
    screenshotUrls: false,
  };

  try {
    const result = await analyzePipeline(filePath, options);
    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: MANIFEST.version });
});

router.get('/manifest', (_req, res) => {
  res.json(MANIFEST);
});
