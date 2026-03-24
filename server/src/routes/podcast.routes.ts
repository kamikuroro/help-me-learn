import { Router, type Request, type Response } from 'express';
import { z } from 'zod/v4';
import multer from 'multer';
import path from 'path';
import { config } from '../config.js';
import { queryOne, queryMany, query } from '../services/db.service.js';
import { bookIngestionQueue } from '../jobs/book-ingest.job.js';
import { podcastQueue } from '../jobs/podcast.job.js';
import {
  ValidationError,
  BookNotFoundError,
  EpisodeNotFoundError,
} from '../types/errors.js';
import fs from 'fs';
import fsp from 'fs/promises';

const router = Router();

// ------- Multer setup -------

const upload = multer({
  dest: path.join(config.audio.dir, 'books', 'uploads'),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf'));
  },
});

// ------- Books -------

// POST /api/books — Upload a PDF book
router.post('/books', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('A PDF file is required');
  }

  const title = (req.body.title as string) || 'Untitled Book';
  const author = (req.body.author as string) || null;

  // Insert book row with temp file path
  const row = await queryOne<{ id: number }>(
    `INSERT INTO books (title, author, file_path, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [title, author, req.file.path],
  );

  const bookId = row!.id;

  // Rename uploaded file to a permanent path
  const permanentPath = path.join(config.audio.dir, 'books', `${bookId}.pdf`);
  await fsp.rename(req.file.path, permanentPath);

  // Update file_path in DB
  await query('UPDATE books SET file_path = $1 WHERE id = $2', [permanentPath, bookId]);

  // Queue TOC extraction
  bookIngestionQueue.add({ bookId });

  res.status(202).json({
    id: bookId,
    status: 'pending',
    message: 'Book upload started',
  });
});

// GET /api/books — List all books
router.get('/books', async (_req: Request, res: Response) => {
  const books = await queryMany<{
    id: number;
    title: string;
    author: string | null;
    total_chapters: number | null;
    language: string | null;
    status: string;
    created_at: Date;
  }>(
    'SELECT id, title, author, total_chapters, language, status, created_at FROM books ORDER BY created_at DESC',
  );
  res.json(books);
});

// GET /api/books/:id — Book detail with chapters
router.get('/books/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid book ID');

  const book = await queryOne<{
    id: number;
    title: string;
    author: string | null;
    file_path: string;
    total_pages: number | null;
    total_chapters: number | null;
    language: string | null;
    status: string;
    error_message: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    'SELECT id, title, author, file_path, total_pages, total_chapters, language, status, error_message, metadata, created_at FROM books WHERE id = $1',
    [id],
  );
  if (!book) throw new BookNotFoundError(id);

  const chapters = await queryMany<{
    id: number;
    chapter_index: number;
    title: string | null;
    page_start: number | null;
    page_end: number | null;
    word_count: number | null;
    language: string | null;
    status: string;
  }>(
    'SELECT id, chapter_index, title, page_start, page_end, word_count, language, status FROM book_chapters WHERE book_id = $1 ORDER BY chapter_index',
    [id],
  );

  res.json({ ...book, chapters });
});

// GET /api/books/:id/pdf — Stream the book's PDF file
router.get('/books/:id/pdf', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid book ID');

  const book = await queryOne<{ file_path: string }>(
    'SELECT file_path FROM books WHERE id = $1',
    [id],
  );
  if (!book) throw new BookNotFoundError(id);

  try {
    const stat = await fsp.stat(book.file_path);
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
        'Content-Type': 'application/pdf',
      });

      const stream = fs.createReadStream(book.file_path, { start, end });
      req.on('close', () => stream.destroy());
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'application/pdf',
        'Accept-Ranges': 'bytes',
      });

      const stream = fs.createReadStream(book.file_path);
      req.on('close', () => stream.destroy());
      stream.pipe(res);
    }
  } catch {
    res.status(404).json({ error: 'PDF file not found on disk' });
  }
});

// ------- Episodes -------

const createEpisodesSchema = z.object({
  mode: z.enum(['verbatim', 'conversational']),
  chapters: z.array(z.number()).optional(),
  page_range: z.object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  }).optional(),
}).refine(
  d => !(d.chapters && d.page_range),
  'Specify chapters or page_range, not both',
);

// POST /api/books/:id/episodes — Generate podcast episodes
router.post('/books/:id/episodes', async (req: Request, res: Response) => {
  const bookId = parseInt(req.params.id as string, 10);
  if (isNaN(bookId)) throw new ValidationError('Invalid book ID');

  const parsed = createEpisodesSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid request: ${parsed.error.message}`);
  }

  const book = await queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM books WHERE id = $1',
    [bookId],
  );
  if (!book) throw new BookNotFoundError(bookId);
  if (book.status !== 'ready') {
    throw new ValidationError(`Book must be in ready state (current: ${book.status})`);
  }

  const { mode, chapters: chapterIndices, page_range } = parsed.data;

  const episodeIds: number[] = [];

  if (page_range) {
    // Page-range episode (no chapter)
    const episodeTitle = `Pages ${page_range.start}\u2013${page_range.end}`;
    const row = await queryOne<{ id: number }>(
      `INSERT INTO podcast_episodes (book_id, chapter_id, mode, page_start, page_end, title, status)
       VALUES ($1, NULL, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [bookId, mode, page_range.start, page_range.end, episodeTitle],
    );

    const episodeId = row!.id;
    podcastQueue.add({ episodeId });
    episodeIds.push(episodeId);
  } else {
    // Chapter-based episodes
    let chapters: { id: number; chapter_index: number }[];
    if (chapterIndices && chapterIndices.length > 0) {
      chapters = await queryMany<{ id: number; chapter_index: number }>(
        'SELECT id, chapter_index FROM book_chapters WHERE book_id = $1 AND id = ANY($2) ORDER BY chapter_index',
        [bookId, chapterIndices],
      );
    } else {
      chapters = await queryMany<{ id: number; chapter_index: number }>(
        'SELECT id, chapter_index FROM book_chapters WHERE book_id = $1 ORDER BY chapter_index',
        [bookId],
      );
    }

    if (chapters.length === 0) {
      throw new ValidationError('No chapters found for the specified criteria');
    }

    for (const chapter of chapters) {
      // Upsert: skip if episode already exists for this chapter+mode
      const existing = await queryOne<{ id: number; status: string }>(
        'SELECT id, status FROM podcast_episodes WHERE chapter_id = $1 AND mode = $2',
        [chapter.id, mode],
      );

      if (existing) {
        if (existing.status === 'ready' || existing.status === 'failed') {
          // Reset for re-generation
          await query(
            "UPDATE podcast_episodes SET status = 'pending', script = NULL, error_message = NULL, updated_at = NOW() WHERE id = $1",
            [existing.id],
          );
          podcastQueue.add({ episodeId: existing.id });
          episodeIds.push(existing.id);
        }
        // Skip if already in progress
        continue;
      }

      const row = await queryOne<{ id: number }>(
        `INSERT INTO podcast_episodes (book_id, chapter_id, mode, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [bookId, chapter.id, mode],
      );

      const episodeId = row!.id;
      podcastQueue.add({ episodeId });
      episodeIds.push(episodeId);
    }
  }

  res.status(202).json({
    message: `Podcast generation started for ${episodeIds.length} episode(s)`,
    episode_ids: episodeIds,
    mode,
  });
});

// GET /api/books/:id/episodes — List episodes for a book
router.get('/books/:id/episodes', async (req: Request, res: Response) => {
  const bookId = parseInt(req.params.id as string, 10);
  if (isNaN(bookId)) throw new ValidationError('Invalid book ID');

  const episodes = await queryMany<{
    id: number;
    chapter_id: number | null;
    chapter_title: string | null;
    chapter_index: number;
    mode: string;
    status: string;
    duration_s: number | null;
    created_at: Date;
    page_start: number | null;
    page_end: number | null;
  }>(
    `SELECT pe.id, pe.chapter_id,
            COALESCE(bc.title, pe.title) AS chapter_title,
            COALESCE(bc.chapter_index, -1) AS chapter_index,
            pe.mode, pe.status, pe.duration_s, pe.created_at,
            pe.page_start, pe.page_end
     FROM podcast_episodes pe
     LEFT JOIN book_chapters bc ON bc.id = pe.chapter_id
     WHERE pe.book_id = $1
     ORDER BY COALESCE(bc.chapter_index, 999), pe.mode`,
    [bookId],
  );

  res.json(episodes);
});

// GET /api/podcast/episodes/:id — Episode detail
router.get('/podcast/episodes/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid episode ID');

  const episode = await queryOne<{
    id: number;
    book_id: number;
    chapter_id: number;
    mode: string;
    script: string | null;
    status: string;
    duration_s: number | null;
    error_message: string | null;
    audio_path: string | null;
    created_at: Date;
  }>(
    'SELECT id, book_id, chapter_id, mode, script, status, duration_s, error_message, audio_path, created_at FROM podcast_episodes WHERE id = $1',
    [id],
  );
  if (!episode) throw new EpisodeNotFoundError(id);

  res.json(episode);
});

// GET /api/podcast/episodes/:id/audio — Stream episode audio
router.get('/podcast/episodes/:id/audio', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid episode ID');

  const episode = await queryOne<{ audio_path: string | null }>(
    'SELECT audio_path FROM podcast_episodes WHERE id = $1',
    [id],
  );
  if (!episode) throw new EpisodeNotFoundError(id);
  if (!episode.audio_path) {
    res.status(404).json({ error: 'Audio not generated yet' });
    return;
  }

  try {
    const stat = await fsp.stat(episode.audio_path);
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

      const stream = fs.createReadStream(episode.audio_path, { start, end });
      req.on('close', () => stream.destroy());
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      });

      const stream = fs.createReadStream(episode.audio_path);
      req.on('close', () => stream.destroy());
      stream.pipe(res);
    }
  } catch {
    res.status(404).json({ error: 'Audio file not found on disk' });
  }
});

// POST /api/podcast/episodes/:id/regenerate — Re-generate an episode
const regenerateSchema = z.object({
  regenerate_script: z.boolean().optional().default(true),
});

router.post('/podcast/episodes/:id/regenerate', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid episode ID');

  const parsed = regenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid request: ${parsed.error.message}`);
  }

  const episode = await queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM podcast_episodes WHERE id = $1',
    [id],
  );
  if (!episode) throw new EpisodeNotFoundError(id);

  if (parsed.data.regenerate_script) {
    await query(
      "UPDATE podcast_episodes SET status = 'pending', script = NULL, error_message = NULL, updated_at = NOW() WHERE id = $1",
      [id],
    );
  } else {
    await query(
      "UPDATE podcast_episodes SET status = 'pending', error_message = NULL, updated_at = NOW() WHERE id = $1",
      [id],
    );
  }

  podcastQueue.add({ episodeId: id });

  res.status(202).json({ message: 'Episode regeneration started', episode_id: id });
});

// DELETE /api/podcast/episodes/:id — Delete a single podcast episode and its audio file
router.delete('/podcast/episodes/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid episode ID');

  const episode = await queryOne<{ id: number; audio_path: string | null }>(
    'SELECT id, audio_path FROM podcast_episodes WHERE id = $1',
    [id],
  );
  if (!episode) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }

  if (episode.audio_path) {
    await fsp.unlink(episode.audio_path).catch(() => {});
  }

  await query('DELETE FROM podcast_episodes WHERE id = $1', [id]);

  res.status(204).send();
});

// DELETE /api/books/:id — Delete a book, its chapters, episodes, linked sources, and audio files
router.delete('/books/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid book ID');

  const book = await queryOne<{ id: number }>('SELECT id FROM books WHERE id = $1', [id]);
  if (!book) throw new BookNotFoundError(id);

  // Clean up audio files on disk
  const episodes = await queryMany<{ audio_path: string | null }>(
    'SELECT audio_path FROM podcast_episodes WHERE book_id = $1',
    [id],
  );
  for (const ep of episodes) {
    if (ep.audio_path) {
      await fsp.unlink(ep.audio_path).catch(() => {});
    }
  }

  // Delete linked sources (and their chunks via CASCADE)
  const chapters = await queryMany<{ source_id: number | null }>(
    'SELECT source_id FROM book_chapters WHERE book_id = $1 AND source_id IS NOT NULL',
    [id],
  );
  for (const ch of chapters) {
    if (ch.source_id) {
      await query('DELETE FROM sources WHERE id = $1', [ch.source_id]);
    }
  }

  // Delete book (chapters + episodes cascade)
  await query('DELETE FROM books WHERE id = $1', [id]);

  res.json({ message: `Book ${id} deleted` });
});

export default router;
