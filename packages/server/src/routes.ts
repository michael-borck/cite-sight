import { Router } from 'express';
import multer from 'multer';
import { tmpdir } from 'os';
import { rename, unlink } from 'fs/promises';
import path from 'path';
import { analyzePipeline } from '@michaelborck/cite-sight-core';
import type { ProcessingOptions } from '@michaelborck/cite-sight-core';
import { isQueueAvailable, addJob, getJob } from './queue.js';
import { fileCleanup } from './middleware.js';

// ---------------------------------------------------------------------------
// Multer configuration
// ---------------------------------------------------------------------------

const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.json']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ACCEPTED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(new Error(`Unsupported file type: ${ext}`), {
          status: 415,
        }),
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const router = Router();

// ---- POST /api/analyze -----------------------------------------------------

router.post(
  '/api/analyze',
  fileCleanup,
  upload.single('file'),
  async (req, res, next) => {
    if (!req.file) {
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

        // File ownership transferred to the worker — do NOT delete here.
        res.status(202).json({ status: 'queued', jobId });
      } catch (err) {
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
