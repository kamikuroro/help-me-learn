import express from 'express';
import path from 'path';
import fsMod from 'fs';
import { config } from './config.js';
import { logger, logBroadcast } from './logger.js';
import { requestLogger } from './middleware/request-logger.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { closePool, healthCheck } from './services/db.service.js';
import { ingestionQueue } from './jobs/ingest.job.js';
import { ttsQueue } from './jobs/tts.job.js';
import { digestQueue } from './jobs/digest.job.js';
import { bookIngestionQueue } from './jobs/book-ingest.job.js';
import { podcastQueue } from './jobs/podcast.job.js';
import { preloadKokoroModel } from './services/tts.service.js';

import ingestRoutes from './routes/ingest.routes.js';
import sourcesRoutes from './routes/sources.routes.js';
import searchRoutes from './routes/search.routes.js';
import chatRoutes from './routes/chat.routes.js';
import audioRoutes from './routes/audio.routes.js';
import podcastRoutes from './routes/podcast.routes.js';

const app = express();

// Ensure required directories exist
fsMod.mkdirSync(path.join(config.audio.dir, 'books'), { recursive: true });

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Health check (no auth)
app.get('/api/health', async (_req, res) => {
  const dbHealthy = await healthCheck();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    db: dbHealthy ? 'connected' : 'disconnected',
    queues: {
      ingestion: ingestionQueue.getStats(),
      tts: ttsQueue.getStats(),
      digest: digestQueue.getStats(),
      bookIngestion: bookIngestionQueue.getStats(),
      podcast: podcastQueue.getStats(),
    },
    timestamp: new Date().toISOString(),
  });
});

// SSE log stream (auth-protected)
app.get('/api/logs/stream', authMiddleware, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send keepalive immediately so the client knows we're connected
  res.write(':ok\n\n');

  const onLog = (line: string) => {
    // Ensure single-line JSON for SSE (strip internal newlines from stack traces etc.)
    const singleLine = line.replace(/\n/g, '\\n');
    res.write(`data: ${singleLine}\n\n`);
    // Flush to avoid buffering delays
    if ('flush' in res && typeof res.flush === 'function') {
      res.flush();
    }
  };

  logBroadcast.on('log', onLog);

  req.on('close', () => {
    logBroadcast.off('log', onLog);
  });
});

// Auth-protected routes
app.use('/api/ingest', authMiddleware, ingestRoutes);
app.use('/api/sources', authMiddleware, sourcesRoutes);
app.use('/api/search', authMiddleware, searchRoutes);
app.use('/api/audio', authMiddleware, audioRoutes);
app.use('/api', authMiddleware, podcastRoutes);
app.use('/api', authMiddleware, chatRoutes);

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(
    { port: config.server.port, host: config.server.host },
    `Server started on ${config.server.host}:${config.server.port}`,
  );
  // Preload Kokoro model in mlx-audio (non-blocking)
  preloadKokoroModel();
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close();
  await ingestionQueue.drain(30_000);
  await ttsQueue.drain(30_000);
  await digestQueue.drain(30_000);
  await bookIngestionQueue.drain(30_000);
  await podcastQueue.drain(30_000);
  ingestionQueue.destroy();
  ttsQueue.destroy();
  digestQueue.destroy();
  bookIngestionQueue.destroy();
  podcastQueue.destroy();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
