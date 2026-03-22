import { JobQueue } from './queue.js';
import { runIngestionPipeline } from '../services/ingestion.service.js';
import { logger } from '../logger.js';

export const ingestionQueue = new JobQueue(
  'ingestion',
  async (data: { sourceId: number }) => {
    const start = Date.now();
    logger.info({ event: 'ingest_start', source_id: data.sourceId });
    await runIngestionPipeline(data.sourceId);
    const duration = Date.now() - start;
    logger.info({ event: 'ingest_complete', source_id: data.sourceId, duration_ms: duration });
  },
  2, // concurrency
);
