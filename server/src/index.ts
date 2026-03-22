import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { requestLogger } from './middleware/request-logger.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { closePool, healthCheck } from './services/db.service.js';
import { ingestionQueue } from './jobs/ingest.job.js';

import ingestRoutes from './routes/ingest.routes.js';
import sourcesRoutes from './routes/sources.routes.js';
import searchRoutes from './routes/search.routes.js';
import chatRoutes from './routes/chat.routes.js';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Health check (no auth)
app.get('/api/health', async (_req, res) => {
  const dbHealthy = await healthCheck();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    db: dbHealthy ? 'connected' : 'disconnected',
    queues: { ingestion: ingestionQueue.getStats() },
    timestamp: new Date().toISOString(),
  });
});

// Auth-protected routes
app.use('/api/ingest', authMiddleware, ingestRoutes);
app.use('/api/sources', authMiddleware, sourcesRoutes);
app.use('/api/search', authMiddleware, searchRoutes);
app.use('/api', authMiddleware, chatRoutes);

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(
    { port: config.server.port, host: config.server.host },
    `Server started on ${config.server.host}:${config.server.port}`,
  );
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close();
  await ingestionQueue.drain(30_000);
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
