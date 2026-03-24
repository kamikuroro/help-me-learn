import { config } from '../config.js';
import { logger } from '../logger.js';
import { query, queryOne, queryMany } from './db.service.js';
import { extractTOC, extractPageRange } from './pdf.service.js';
import { generateVerbatimScript, generateConversationalScript } from './script-generation.service.js';
import { synthesizeWithVoice, concatenateAudio } from './tts.service.js';
import { detectLanguage, countWords } from '../utils/text.js';
import fs from 'fs/promises';
import path from 'path';

export type Speaker = 'NARRATOR' | 'HOST_A' | 'HOST_B';

export interface ScriptSegment {
  speaker: Speaker;
  text: string;
}

/**
 * Parse a tagged podcast script into speaker segments.
 */
export function parseScript(script: string): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  const lines = script.split('\n');
  let currentSpeaker: Speaker | null = null;
  let currentText = '';

  for (const line of lines) {
    const match = line.match(/^\[(NARRATOR|HOST_A|HOST_B)\]:\s*(.*)$/);
    if (match) {
      if (currentSpeaker && currentText.trim()) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
      }
      currentSpeaker = match[1] as Speaker;
      currentText = match[2];
    } else if (currentSpeaker) {
      currentText += ' ' + line;
    }
  }

  if (currentSpeaker && currentText.trim()) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim() });
  }

  return segments;
}

/**
 * Map a speaker + language to a Kokoro voice name.
 */
export function getVoiceForSpeaker(speaker: Speaker, language: 'en' | 'zh'): string {
  if (language === 'zh') {
    switch (speaker) {
      case 'NARRATOR': return config.kokoro.narratorZh;
      case 'HOST_A': return config.kokoro.podcastHostAZh;
      case 'HOST_B': return config.kokoro.podcastHostBZh;
    }
  } else {
    switch (speaker) {
      case 'NARRATOR': return config.kokoro.narratorEn;
      case 'HOST_A': return config.kokoro.podcastHostAEn;
      case 'HOST_B': return config.kokoro.podcastHostBEn;
    }
  }
}

/**
 * Process a book upload: extract TOC from PDF and store chapter metadata.
 * Does NOT extract full markdown — that happens on demand when episodes are generated.
 */
export async function processBookUpload(bookId: number): Promise<void> {
  const book = await queryOne<{ id: number; file_path: string; title: string; author: string | null }>(
    'SELECT id, file_path, title, author FROM books WHERE id = $1',
    [bookId],
  );
  if (!book) throw new Error(`Book ${bookId} not found`);

  try {
    await query("UPDATE books SET status = 'processing_toc', updated_at = NOW() WHERE id = $1", [bookId]);

    const toc = await extractTOC(book.file_path);

    // Update book metadata (only if user didn't provide)
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (toc.totalPages) {
      updates.push(`total_pages = $${paramIndex++}`);
      values.push(toc.totalPages);
    }
    if (toc.title && book.title === 'Untitled Book') {
      updates.push(`title = $${paramIndex++}`);
      values.push(toc.title);
    }
    if (toc.author && !book.author) {
      updates.push(`author = $${paramIndex++}`);
      values.push(toc.author);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(bookId);
      await query(`UPDATE books SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
    }

    // Insert chapter metadata (TOC only, no markdown)
    for (let i = 0; i < toc.chapters.length; i++) {
      const ch = toc.chapters[i];
      await queryOne<{ id: number }>(
        `INSERT INTO book_chapters (book_id, chapter_index, title, page_start, page_end, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT (book_id, chapter_index) DO NOTHING
         RETURNING id`,
        [bookId, i, ch.title, ch.pageStart, ch.pageEnd],
      );
    }

    await query(
      "UPDATE books SET status = 'ready', total_chapters = $1, updated_at = NOW() WHERE id = $2",
      [toc.chapters.length, bookId],
    );

    logger.info({ event: 'book_upload_complete', book_id: bookId, chapters: toc.chapters.length, pages: toc.totalPages });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(
      "UPDATE books SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2",
      [message.slice(0, 1000), bookId],
    );
    logger.error({ event: 'book_upload_failed', book_id: bookId, err: error });
    throw error;
  }
}

/**
 * Generate a podcast episode: create script via Claude, then synthesize audio.
 * Supports both chapter-based and page-range episodes.
 */
export async function generateEpisode(episodeId: number): Promise<void> {
  const episode = await queryOne<{
    id: number;
    book_id: number;
    chapter_id: number | null;
    mode: 'verbatim' | 'conversational';
    script: string | null;
    page_start: number | null;
    page_end: number | null;
    title: string | null;
  }>(
    'SELECT id, book_id, chapter_id, mode, script, page_start, page_end, title FROM podcast_episodes WHERE id = $1',
    [episodeId],
  );
  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const book = await queryOne<{ title: string; file_path: string }>(
    'SELECT title, file_path FROM books WHERE id = $1',
    [episode.book_id],
  );
  if (!book) throw new Error(`Book ${episode.book_id} not found`);

  // Resolve content: either from a chapter or a page range
  let contentMarkdown: string;
  let contentTitle: string;
  let contentLanguage: string;

  if (episode.chapter_id) {
    const chapter = await queryOne<{
      id: number; title: string; markdown: string | null; language: string | null;
      page_start: number | null; page_end: number | null;
    }>(
      'SELECT id, title, markdown, language, page_start, page_end FROM book_chapters WHERE id = $1',
      [episode.chapter_id],
    );
    if (!chapter) throw new Error(`Chapter ${episode.chapter_id} not found`);

    // On-demand extraction if markdown is missing
    if (!chapter.markdown) {
      if (chapter.page_start == null || chapter.page_end == null) {
        throw new Error(`Chapter ${chapter.id} has no markdown and no page range for extraction`);
      }
      const extracted = await extractPageRange(book.file_path, chapter.page_start, chapter.page_end);
      chapter.markdown = extracted.markdown;
      const lang = detectLanguage(chapter.markdown);
      const words = countWords(chapter.markdown);
      await query(
        "UPDATE book_chapters SET markdown = $1, language = $2, word_count = $3, status = 'ready', updated_at = NOW() WHERE id = $4",
        [chapter.markdown, lang, words, chapter.id],
      );
      chapter.language = lang;
    }

    contentMarkdown = chapter.markdown;
    contentTitle = chapter.title || 'Untitled';
    contentLanguage = chapter.language || 'en';
  } else if (episode.page_start != null && episode.page_end != null) {
    // Page-range episode (no chapter)
    const extracted = await extractPageRange(book.file_path, episode.page_start, episode.page_end);
    contentMarkdown = extracted.markdown;
    contentTitle = episode.title || `Pages ${episode.page_start}\u2013${episode.page_end}`;
    contentLanguage = detectLanguage(contentMarkdown);
  } else {
    throw new Error(`Episode ${episodeId} has neither chapter_id nor page range`);
  }

  try {
    // Step 1: Generate script (skip if already present, e.g., on regenerate with regenerate_script=false)
    let script = episode.script;
    if (!script) {
      await query(
        "UPDATE podcast_episodes SET status = 'scripting', updated_at = NOW() WHERE id = $1",
        [episodeId],
      );

      if (episode.mode === 'verbatim') {
        script = await generateVerbatimScript(
          contentMarkdown, contentTitle, book.title, contentLanguage,
        );
      } else {
        script = await generateConversationalScript(
          contentMarkdown, contentTitle, book.title, contentLanguage,
        );
      }

      await query(
        'UPDATE podcast_episodes SET script = $1, updated_at = NOW() WHERE id = $2',
        [script, episodeId],
      );
    }

    // Step 2: Synthesize audio
    await query(
      "UPDATE podcast_episodes SET status = 'synthesizing', updated_at = NOW() WHERE id = $1",
      [episodeId],
    );

    const segments = parseScript(script);
    if (segments.length === 0) {
      throw new Error('Script produced no parseable segments');
    }

    const language = (contentLanguage === 'zh' ? 'zh' : 'en') as 'en' | 'zh';
    const langCode = language === 'zh' ? 'z' : 'a';

    const episodeDir = path.join(config.audio.dir, 'podcast', String(episode.book_id));
    await fs.mkdir(episodeDir, { recursive: true });

    const tempDir = path.join(episodeDir, `.episode-${episodeId}-parts`);
    await fs.mkdir(tempDir, { recursive: true });

    const partPaths: string[] = [];
    let totalDuration = 0;

    try {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const voice = getVoiceForSpeaker(segment.speaker, language);
        const partPath = path.join(tempDir, `seg-${String(i).padStart(4, '0')}.mp3`);

        const result = await synthesizeWithVoice(segment.text, partPath, voice, langCode);
        partPaths.push(partPath);
        totalDuration += result.durationSeconds;

        if ((i + 1) % 10 === 0) {
          logger.info({
            event: 'podcast_tts_progress',
            episode_id: episodeId,
            segment: i + 1,
            total: segments.length,
          });
        }
      }

      // Step 3: Concatenate
      await query(
        "UPDATE podcast_episodes SET status = 'concatenating', updated_at = NOW() WHERE id = $1",
        [episodeId],
      );

      const fileLabel = episode.chapter_id
        ? `ch${String(episode.chapter_id).padStart(3, '0')}`
        : `p${episode.page_start}-${episode.page_end}`;
      const outputPath = path.join(
        episodeDir,
        `${fileLabel}-${episode.mode}.mp3`,
      );
      await concatenateAudio(partPaths, outputPath);

      await query(
        `UPDATE podcast_episodes
         SET status = 'ready', audio_path = $1, duration_s = $2, updated_at = NOW()
         WHERE id = $3`,
        [outputPath, totalDuration, episodeId],
      );

      logger.info({
        event: 'podcast_episode_complete',
        episode_id: episodeId,
        mode: episode.mode,
        segments: segments.length,
        duration_s: totalDuration,
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(
      "UPDATE podcast_episodes SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2",
      [message.slice(0, 1000), episodeId],
    );
    logger.error({ event: 'podcast_episode_failed', episode_id: episodeId, err: error });
    throw error;
  }
}
