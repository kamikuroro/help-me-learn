import { Router, type Request, type Response } from 'express';
import { z } from 'zod/v4';
import { createSource } from '../services/ingestion.service.js';
import { ingestionQueue } from '../jobs/ingest.job.js';
import { queryOne } from '../services/db.service.js';
import { isValidUrl } from '../utils/url.js';
import { ValidationError, DuplicateSourceError, SourceNotFoundError } from '../types/errors.js';

const router = Router();

const ingestSchema = z.object({
  url: z.string(),
  tags: z.array(z.string()).optional(),
  content: z.string().optional(),
  title: z.string().optional(),
});

// POST /api/ingest — Submit a URL for ingestion
router.post('/', async (req: Request, res: Response) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid request: ${parsed.error.message}`);
  }

  const { url, tags, content, title } = parsed.data;
  if (!isValidUrl(url)) {
    throw new ValidationError('Invalid URL: must be an http or https URL');
  }

  try {
    const sourceId = await createSource(url, tags);
    ingestionQueue.add({ sourceId, rawContent: content, rawTitle: title });

    res.status(202).json({
      id: sourceId,
      status: 'pending',
      message: 'Ingestion started',
    });
  } catch (err) {
    if (err instanceof DuplicateSourceError) {
      res.status(409).json({
        error: err.code,
        message: err.message,
      });
      return;
    }
    throw err;
  }
});

// GET /api/ingest/:id/status — Check ingestion progress
router.get('/:id/status', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const source = await queryOne<{ id: number; status: string; error_message: string | null }>(
    'SELECT id, status, error_message FROM sources WHERE id = $1',
    [id],
  );

  if (!source) throw new SourceNotFoundError(id);

  res.json({
    id: source.id,
    status: source.status,
    error_message: source.error_message,
  });
});

export default router;
