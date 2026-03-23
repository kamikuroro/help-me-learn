import { config } from '../config.js';
import { logger } from '../logger.js';
import { query, queryOne, queryMany } from './db.service.js';
import { extractMarkdown, splitIntoChapters } from './pdf.service.js';
import { generateVerbatimScript, generateConversationalScript } from './script-generation.service.js';
import { synthesizeWithVoice, concatenateAudio } from './tts.service.js';
import { createSource, runIngestionPipeline } from './ingestion.service.js';
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
 * Ingest a book: extract PDF via Marker, split into chapters, store in DB,
 * and run the existing ingestion pipeline for each chapter (so they appear in RAG/chat).
 */
export async function ingestBook(bookId: number): Promise<void> {
  const book = await queryOne<{ id: number; file_path: string; title: string; metadata: Record<string, unknown> }>(
    'SELECT id, file_path, title, metadata FROM books WHERE id = $1',
    [bookId],
  );
  if (!book) throw new Error(`Book ${bookId} not found`);

  try {
    await query("UPDATE books SET status = 'extracting', updated_at = NOW() WHERE id = $1", [bookId]);

    const pageRange = (book.metadata as Record<string, unknown>)?.page_range as string | undefined;
    logger.info({ event: 'book_extract_starting', file_path: book.file_path, page_range: pageRange });
    let extractResult;
    try {
      extractResult = await extractMarkdown(book.file_path, pageRange);
    } catch (extractErr) {
      logger.error({ event: 'book_extract_error', error: (extractErr as Error).message, stack: (extractErr as Error).stack });
      throw extractErr;
    }
    const { markdown, metadata } = extractResult;

    logger.info({ event: 'book_extract_result', provider: extractResult.provider, has_metadata: !!metadata, has_markdown: !!markdown, md_len: markdown?.length });

    // Update book with metadata from extraction
    if (metadata?.total_pages) {
      await query(
        'UPDATE books SET total_pages = $1, updated_at = NOW() WHERE id = $2',
        [metadata.total_pages, bookId],
      );
    }

    // Split into chapters
    const chapters = splitIntoChapters(markdown);
    const bookLanguage = detectLanguage(markdown);

    await query(
      'UPDATE books SET total_chapters = $1, language = $2, updated_at = NOW() WHERE id = $3',
      [chapters.length, bookLanguage, bookId],
    );

    // Store each chapter and run ingestion pipeline
    for (const chapter of chapters) {
      const chapterLang = detectLanguage(chapter.markdown);
      const words = countWords(chapter.markdown);

      const row = await queryOne<{ id: number }>(
        `INSERT INTO book_chapters (book_id, chapter_index, title, markdown, word_count, language, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ready')
         RETURNING id`,
        [bookId, chapter.index, chapter.title, chapter.markdown, words, chapterLang],
      );

      const chapterId = row!.id;

      // Create a source record so this chapter is searchable via RAG
      try {
        const bookUrl = `book://${bookId}/ch/${chapter.index}`;
        const sourceId = await createSource(bookUrl);
        await runIngestionPipeline(sourceId, chapter.markdown, `${book.title} — ${chapter.title}`);

        await query(
          'UPDATE book_chapters SET source_id = $1 WHERE id = $2',
          [sourceId, chapterId],
        );
      } catch (err) {
        // Log but don't fail the whole book ingestion if one chapter's RAG ingestion fails
        logger.warn({
          event: 'chapter_rag_failed',
          book_id: bookId,
          chapter_index: chapter.index,
          error: (err as Error).message,
        });
      }
    }

    await query("UPDATE books SET status = 'ready', updated_at = NOW() WHERE id = $1", [bookId]);
    logger.info({ event: 'book_ingest_complete', book_id: bookId, chapters: chapters.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(
      "UPDATE books SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2",
      [message.slice(0, 1000), bookId],
    );
    logger.error({ event: 'book_ingest_failed', book_id: bookId, err: error });
    throw error;
  }
}

/**
 * Generate a podcast episode: create script via Claude, then synthesize audio.
 */
export async function generateEpisode(episodeId: number): Promise<void> {
  const episode = await queryOne<{
    id: number;
    book_id: number;
    chapter_id: number;
    mode: 'verbatim' | 'conversational';
    script: string | null;
  }>(
    'SELECT id, book_id, chapter_id, mode, script FROM podcast_episodes WHERE id = $1',
    [episodeId],
  );
  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const chapter = await queryOne<{ id: number; title: string; markdown: string; language: string }>(
    'SELECT id, title, markdown, language FROM book_chapters WHERE id = $1',
    [episode.chapter_id],
  );
  if (!chapter) throw new Error(`Chapter ${episode.chapter_id} not found`);

  const book = await queryOne<{ title: string }>(
    'SELECT title FROM books WHERE id = $1',
    [episode.book_id],
  );
  if (!book) throw new Error(`Book ${episode.book_id} not found`);

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
          chapter.markdown, chapter.title || 'Untitled', book.title, chapter.language || 'en',
        );
      } else {
        script = await generateConversationalScript(
          chapter.markdown, chapter.title || 'Untitled', book.title, chapter.language || 'en',
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

    const language = (chapter.language === 'zh' ? 'zh' : 'en') as 'en' | 'zh';
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

      const outputPath = path.join(
        episodeDir,
        `ch${String(chapter.id).padStart(3, '0')}-${episode.mode}.mp3`,
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
