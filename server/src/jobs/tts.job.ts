import { JobQueue } from './queue.js';
import { generateTTS } from '../services/tts.service.js';
import { queryOne, query } from '../services/db.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import path from 'path';

interface TTSJobData {
  sourceId: number;
  type: 'full' | 'summary';
}

export const ttsQueue = new JobQueue(
  'tts',
  async (data: TTSJobData) => {
    const { sourceId, type } = data;
    const start = Date.now();

    logger.info({ event: 'tts_start', source_id: sourceId, type });

    const source = await queryOne<{
      id: number;
      raw_content: string | null;
      summary: string | null;
      title: string | null;
    }>(
      'SELECT id, raw_content, summary, title FROM sources WHERE id = $1',
      [sourceId],
    );

    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    const text = type === 'full' ? source.raw_content : source.summary;
    if (!text) {
      throw new Error(`No ${type} content for source ${sourceId}`);
    }

    const subDir = type === 'full' ? 'full' : 'summary';
    const outputPath = path.join(config.audio.dir, subDir, `${sourceId}.mp3`);

    const result = await generateTTS(text, outputPath);

    const pathCol = type === 'full' ? 'audio_full_path' : 'audio_summary_path';
    const durationCol = type === 'full' ? 'audio_full_duration_s' : 'audio_summary_duration_s';

    await query(
      `UPDATE sources SET ${pathCol} = $1, ${durationCol} = $2, updated_at = NOW() WHERE id = $3`,
      [outputPath, result.durationSeconds, sourceId],
    );

    const duration = Date.now() - start;
    logger.info({
      event: 'tts_complete',
      source_id: sourceId,
      type,
      audio_duration_s: result.durationSeconds,
      duration_ms: duration,
    });
  },
  1,
);
