import multer from 'multer';
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
  const status = err instanceof multer.MulterError
    ? err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    : err.status ?? err.statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';

  if (status >= 500) {
    console.error('[errorHandler]', err);
  }

  res.status(status).json({ error: message });
}
