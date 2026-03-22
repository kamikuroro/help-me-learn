import { JobQueue } from './queue.js';
import { generateTTS } from '../services/tts.service.js';
import { queryMany, queryOne, query } from '../services/db.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import path from 'path';

interface DigestJobData {
  weekStart: string;
}

export const digestQueue = new JobQueue(
  'digest',
  async (data: DigestJobData) => {
    const start = Date.now();
    const { weekStart } = data;

    logger.info({ event: 'digest_start', week_start: weekStart });

    const sources = await queryMany<{
      id: number;
      title: string | null;
      summary: string | null;
    }>(
      `SELECT id, title, summary FROM sources
       WHERE status = 'ready' AND summary IS NOT NULL
         AND created_at >= $1::date AND created_at < ($1::date + INTERVAL '7 days')
       ORDER BY created_at`,
      [weekStart],
    );

    if (sources.length === 0) {
      logger.info({ event: 'digest_skip', week_start: weekStart, reason: 'no sources' });
      return;
    }

    const transcript = sources
      .map((s, i) => `Article ${i + 1}: ${s.title || 'Untitled'}\n\n${s.summary}`)
      .join('\n\n---\n\n');

    const outputPath = path.join(config.audio.dir, 'digest', `${weekStart}.mp3`);
    const result = await generateTTS(transcript, outputPath);

    await query(
      `INSERT INTO audio_digests (week_start, source_ids, transcript, audio_path, duration_s)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (week_start) DO UPDATE SET
         source_ids = EXCLUDED.source_ids,
         transcript = EXCLUDED.transcript,
         audio_path = EXCLUDED.audio_path,
         duration_s = EXCLUDED.duration_s`,
      [weekStart, sources.map((s) => s.id), transcript, outputPath, result.durationSeconds],
    );

    const duration = Date.now() - start;
    logger.info({
      event: 'digest_complete',
      week_start: weekStart,
      sources: sources.length,
      audio_duration_s: result.durationSeconds,
      duration_ms: duration,
    });
  },
  1,
);
