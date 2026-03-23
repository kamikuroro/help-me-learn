import { JobQueue } from './queue.js';
import { ingestBook } from '../services/podcast.service.js';
import { logger } from '../logger.js';

interface BookIngestionJobData {
  bookId: number;
}

export const bookIngestionQueue = new JobQueue(
  'book-ingestion',
  async (data: BookIngestionJobData) => {
    logger.info({ event: 'book_ingest_start', book_id: data.bookId });
    await ingestBook(data.bookId);
  },
  1,
);
