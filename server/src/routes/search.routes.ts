import { Router, type Request, type Response } from 'express';
import { z } from 'zod/v4';
import { hybridSearch } from '../services/rag.service.js';
import { ValidationError } from '../types/errors.js';

const router = Router();

const searchSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  category: z.string().optional(),
});

// GET /api/search?q=query&limit=10&category=ai_agents
router.get('/', async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError(`Invalid search params: ${parsed.error.message}`);
  }

  const { q, limit, category } = parsed.data;
  const hits = await hybridSearch(q, limit, category);

  res.json({
    query: q,
    results: hits.map((h) => ({
      source_id: h.source_id,
      title: h.title,
      url: h.url,
      excerpt: h.content.slice(0, 300),
      relevance: h.score,
      category: null,
    })),
    total: hits.length,
  });
});

export default router;
