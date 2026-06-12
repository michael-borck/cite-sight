import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { router } from './routes.js';
import { requestLogger, errorHandler } from './middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
// Default to same-origin only: the bundled SPA is served from this server, so
// it needs no cross-origin grant. A public/cross-origin API must opt in by
// setting CORS_ORIGIN explicitly (e.g. a specific origin, or "*" to allow any).
const CORS_ORIGIN = process.env['CORS_ORIGIN'];

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();

// Baseline security headers (cheap, no dependency). Avoids MIME-sniffing,
// framing/clickjacking, and referrer leakage.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Parse JSON and URL-encoded bodies (multer handles multipart)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — only enabled when an origin is explicitly configured. Same-origin
// requests (the bundled SPA) don't need it; cross-origin callers opt in.
if (CORS_ORIGIN) {
  app.use(
    cors({
      origin: CORS_ORIGIN,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }),
  );
}

// Request logging
app.use(requestLogger);

// Routes
app.use(router);

// Serve web frontend in production (Docker bundles it alongside the server)
const webDistPath = join(__dirname, '..', '..', 'web', 'dist');
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  // SPA fallback: serve index.html for non-API routes
  app.get('{*path}', (_req, res) => {
    res.sendFile(join(webDistPath, 'index.html'));
  });
  console.log(`[cite-sight-server] Serving web frontend from ${webDistPath}`);
}

// Error handling (must be registered after routes)
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`[cite-sight-server] Listening on port ${PORT}`);
  console.log(`[cite-sight-server] CORS: ${CORS_ORIGIN ? `enabled for ${CORS_ORIGIN}` : 'same-origin only (set CORS_ORIGIN to allow cross-origin)'}`);
  console.log(`[cite-sight-server] Redis/BullMQ: ${process.env['REDIS_URL'] ? 'enabled' : 'disabled (synchronous mode)'}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  console.log(`\n[cite-sight-server] Received ${signal} — shutting down gracefully...`);

  server.close((err) => {
    if (err) {
      console.error('[cite-sight-server] Error during shutdown:', err);
      process.exit(1);
    }
    console.log('[cite-sight-server] Server closed.');
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('[cite-sight-server] Shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
