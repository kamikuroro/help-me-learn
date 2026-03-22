import { Router, type Request, type Response } from 'express';
import { queryOne, queryMany, query } from '../services/db.service.js';
import { SourceNotFoundError, ValidationError } from '../types/errors.js';

const router = Router();

// GET /api/sources — List all sources (paginated, filterable)
router.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const category = req.query.category as string | undefined;
  const status = req.query.status as string | undefined;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (category) {
    whereClause += ` AND category = $${paramIndex++}`;
    params.push(category);
  }
  if (status) {
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM sources ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || '0', 10);

  const sources = await queryMany(
    `SELECT id, url, title, summary, category, tags, status, error_message,
            word_count, audio_full_path, audio_full_duration_s,
            audio_summary_path, audio_summary_duration_s,
            created_at, updated_at
     FROM sources ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset],
  );

  res.json({
    data: sources,
    total,
    offset,
    limit,
  });
});

// GET /api/sources/:id — Full source with content
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const source = await queryOne(
    `SELECT id, url, title, raw_content, summary, category, tags, status, error_message,
            word_count, audio_full_path, audio_full_duration_s,
            audio_summary_path, audio_summary_duration_s,
            created_at, updated_at
     FROM sources WHERE id = $1`,
    [id],
  );

  if (!source) throw new SourceNotFoundError(id);

  res.json(source);
});

// DELETE /api/sources/:id — Remove source and its chunks
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const result = await query('DELETE FROM sources WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new SourceNotFoundError(id);

  res.status(204).send();
});

// POST /api/sources/:id/retry — Re-trigger failed ingestion
router.post('/:id/retry', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const source = await queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM sources WHERE id = $1',
    [id],
  );
  if (!source) throw new SourceNotFoundError(id);
  if (source.status !== 'failed') {
    throw new ValidationError(`Source is not in failed state (current: ${source.status})`);
  }

  // Reset status and re-queue
  await query(
    `UPDATE sources SET status = 'pending', error_message = NULL, updated_at = NOW() WHERE id = $1`,
    [id],
  );

  // Delete existing chunks for clean re-ingestion
  await query('DELETE FROM chunks WHERE source_id = $1', [id]);

  const { ingestionQueue } = await import('../jobs/ingest.job.js');
  ingestionQueue.add({ sourceId: id });

  res.json({ id, status: 'pending', message: 'Retry started' });
});

export default router;
