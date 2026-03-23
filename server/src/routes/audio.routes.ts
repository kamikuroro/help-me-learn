import { Router, type Request, type Response } from 'express';
import { z } from 'zod/v4';
import { queryOne } from '../services/db.service.js';
import { ttsQueue } from '../jobs/tts.job.js';
import { config } from '../config.js';
import { SourceNotFoundError, ValidationError } from '../types/errors.js';
import fs from 'fs';
import fsp from 'fs/promises';

const router = Router();

// GET /api/audio/quota — ElevenLabs character usage and remaining quota
router.get('/quota', async (_req: Request, res: Response) => {
  if (!config.elevenlabs.apiKey) {
    res.json({ character_limit: 0, character_count: 0, characters_remaining: 0, provider: 'none' });
    return;
  }

  const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': config.elevenlabs.apiKey },
  });

  if (!response.ok) {
    res.status(502).json({ error: 'Failed to fetch ElevenLabs quota' });
    return;
  }

  const data = await response.json() as {
    character_count: number;
    character_limit: number;
    tier?: string;
  };

  res.json({
    character_limit: data.character_limit,
    character_count: data.character_count,
    characters_remaining: data.character_limit - data.character_count,
    tier: data.tier || 'unknown',
    provider: 'elevenlabs',
  });
});

const generateSchema = z.object({
  type: z.enum(['full', 'summary']),
});

// POST /api/audio/generate/:id — Trigger TTS generation
router.post('/generate/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid request: ${parsed.error.message}`);
  }

  const source = await queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM sources WHERE id = $1',
    [id],
  );
  if (!source) throw new SourceNotFoundError(id);
  if (source.status !== 'ready') {
    throw new ValidationError(`Source must be in ready state (current: ${source.status})`);
  }

  ttsQueue.add({ sourceId: id, type: parsed.data.type });

  res.status(202).json({
    message: `TTS generation started for ${parsed.data.type}`,
    source_id: id,
    type: parsed.data.type,
  });
});

// GET /api/audio/full/:id — Stream full article audio
router.get('/full/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const source = await queryOne<{ audio_full_path: string | null }>(
    'SELECT audio_full_path FROM sources WHERE id = $1',
    [id],
  );
  if (!source) throw new SourceNotFoundError(id);
  if (!source.audio_full_path) {
    res.status(404).json({ error: 'Audio not generated yet' });
    return;
  }

  await streamAudio(req, res, source.audio_full_path);
});

// GET /api/audio/summary/:id — Stream summary audio
router.get('/summary/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const source = await queryOne<{ audio_summary_path: string | null }>(
    'SELECT audio_summary_path FROM sources WHERE id = $1',
    [id],
  );
  if (!source) throw new SourceNotFoundError(id);
  if (!source.audio_summary_path) {
    res.status(404).json({ error: 'Audio not generated yet' });
    return;
  }

  await streamAudio(req, res, source.audio_summary_path);
});

// GET /api/audio/digest/:year/:week — Stream weekly digest audio
router.get('/digest/:year/:week', async (req: Request, res: Response) => {
  const year = parseInt(req.params.year as string, 10);
  const week = parseInt(req.params.week as string, 10);
  if (isNaN(year) || isNaN(week)) throw new ValidationError('Invalid year or week');

  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  const weekStart = monday.toISOString().slice(0, 10);

  const digest = await queryOne<{ audio_path: string | null }>(
    'SELECT audio_path FROM audio_digests WHERE week_start = $1',
    [weekStart],
  );
  if (!digest?.audio_path) {
    res.status(404).json({ error: 'Digest not found for this week' });
    return;
  }

  await streamAudio(req, res, digest.audio_path);
});

// GET /api/audio/messages/:id — Stream chat message audio
router.get('/messages/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid message ID');

  const message = await queryOne<{ audio_path: string | null }>(
    'SELECT audio_path FROM messages WHERE id = $1',
    [id],
  );
  if (!message?.audio_path) {
    res.status(404).json({ error: 'Audio not available for this message' });
    return;
  }

  await streamAudio(req, res, message.audio_path);
});

async function streamAudio(req: Request, res: Response, filePath: string): Promise<void> {
  try {
    const stat = await fsp.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/mpeg',
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      });

      fs.createReadStream(filePath).pipe(res);
    }
  } catch {
    res.status(404).json({ error: 'Audio file not found on disk' });
  }
}

export default router;
