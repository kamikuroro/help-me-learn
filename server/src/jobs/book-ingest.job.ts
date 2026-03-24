import { JobQueue } from './queue.js';
import { processBookUpload } from '../services/podcast.service.js';
import { logger } from '../logger.js';

interface BookIngestionJobData {
  bookId: number;
}

export const bookIngestionQueue = new JobQueue(
  'book-ingestion',
  async (data: BookIngestionJobData) => {
    logger.info({ event: 'book_upload_start', book_id: data.bookId });
    await processBookUpload(data.bookId);
  },
  1,
);
