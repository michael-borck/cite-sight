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
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? '*';

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();

// Parse JSON and URL-encoded bodies (multer handles multipart)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  }),
);

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
  console.log(`[cite-sight-server] CORS origin: ${CORS_ORIGIN}`);
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
