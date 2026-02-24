import express from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { requestLogger, errorHandler } from './middleware.js';

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
