import { Router, type Request, type Response } from 'express';
import { healthCheck } from '../services/db.service.js';
import { ingestionQueue } from '../jobs/ingest.job.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const dbHealthy = await healthCheck();

  const status = dbHealthy ? 'ok' : 'degraded';
  const statusCode = dbHealthy ? 200 : 503;

  res.status(statusCode).json({
    status,
    db: dbHealthy ? 'connected' : 'disconnected',
    queues: {
      ingestion: ingestionQueue.getStats(),
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
