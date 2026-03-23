import { JobQueue } from './queue.js';
import { generateTTS, synthesizeWithVoice, concatenateAudio } from '../services/tts.service.js';
import { generateArticleNarrationScript, generateArticleConversationalScript } from '../services/script-generation.service.js';
import { parseScript, getVoiceForSpeaker } from '../services/podcast.service.js';
import { queryOne, query } from '../services/db.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { detectLanguage } from '../utils/text.js';
import path from 'path';
import fs from 'fs/promises';

interface TTSJobData {
  sourceId: number;
  type: 'full' | 'summary';
  mode?: 'direct' | 'narration' | 'conversational';
}

export const ttsQueue = new JobQueue(
  'tts',
  async (data: TTSJobData) => {
    const { sourceId, type, mode = 'narration' } = data;
    const start = Date.now();

    logger.info({ event: 'tts_start', source_id: sourceId, type, mode });

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

    if (mode === 'direct') {
      // Original direct TTS — raw text to audio
      const result = await generateTTS(text, outputPath);
      await updateSourceAudio(sourceId, type, outputPath, result.durationSeconds);
    } else {
      // Smart TTS — generate script via Claude, then multi-voice synthesis
      const title = source.title || 'Untitled';
      const language = detectLanguage(text);

      let script: string;
      if (mode === 'conversational') {
        script = await generateArticleConversationalScript(text, title, language);
      } else {
        script = await generateArticleNarrationScript(text, title, language);
      }

      const segments = parseScript(script);
      if (segments.length === 0) {
        throw new Error('Script produced no parseable segments');
      }

      const lang = (language === 'zh' ? 'zh' : 'en') as 'en' | 'zh';
      const langCode = lang === 'zh' ? 'z' : 'a';

      const tempDir = path.join(config.audio.dir, subDir, `.source-${sourceId}-parts`);
      await fs.mkdir(tempDir, { recursive: true });

      const partPaths: string[] = [];
      let totalDuration = 0;

      try {
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];
          const voice = getVoiceForSpeaker(segment.speaker, lang);
          const partPath = path.join(tempDir, `seg-${String(i).padStart(4, '0')}.mp3`);

          const result = await synthesizeWithVoice(segment.text, partPath, voice, langCode);
          partPaths.push(partPath);
          totalDuration += result.durationSeconds;

          if ((i + 1) % 10 === 0) {
            logger.info({
              event: 'smart_tts_progress',
              source_id: sourceId,
              segment: i + 1,
              total: segments.length,
            });
          }
        }

        await concatenateAudio(partPaths, outputPath);
        await updateSourceAudio(sourceId, type, outputPath, totalDuration);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    const duration = Date.now() - start;
    logger.info({
      event: 'tts_complete',
      source_id: sourceId,
      type,
      mode,
      duration_ms: duration,
    });
  },
  1,
);

async function updateSourceAudio(
  sourceId: number,
  type: 'full' | 'summary',
  outputPath: string,
  durationSeconds: number,
): Promise<void> {
  const pathCol = type === 'full' ? 'audio_full_path' : 'audio_summary_path';
  const durationCol = type === 'full' ? 'audio_full_duration_s' : 'audio_summary_duration_s';

  await query(
    `UPDATE sources SET ${pathCol} = $1, ${durationCol} = $2, updated_at = NOW() WHERE id = $3`,
    [outputPath, durationSeconds, sourceId],
  );
}
