import { unlink } from 'fs/promises';
import type { Request, Response, NextFunction } from 'express';

// ---- Request logger --------------------------------------------------------

/**
 * Simple request logger: logs method, path, status code, and duration.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
    );
  });

  next();
}

// ---- File cleanup ----------------------------------------------------------

/**
 * Middleware that schedules deletion of an uploaded temp file after the
 * response is sent.  The file path is read from `req.file.path`.
 *
 * This is a belt-and-suspenders fallback; route handlers should also delete
 * the file in a `finally` block so it is removed even on errors.
 */
export function fileCleanup(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on('finish', () => {
    const filePath = req.file?.path;
    if (filePath) {
      unlink(filePath).catch((err: unknown) => {
        // Non-fatal — just log so we know if temp files are leaking.
        console.warn(`[fileCleanup] Failed to delete temp file ${filePath}:`, err);
      });
    }
  });

  next();
}

// ---- Error handler ---------------------------------------------------------

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

/**
 * Express error-handling middleware.  Returns JSON error responses with
 * appropriate HTTP status codes.
 */
export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';

  if (status >= 500) {
    console.error('[errorHandler]', err);
  }

  res.status(status).json({ error: message });
}
