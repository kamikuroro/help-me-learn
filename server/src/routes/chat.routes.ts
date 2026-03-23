import { Router, type Request, type Response } from 'express';
import { z } from 'zod/v4';
import crypto from 'crypto';
import { query, queryOne, queryMany } from '../services/db.service.js';
import { invokeClaude } from '../services/claude.service.js';
import { hybridSearch, expandChunksWithNeighbors, getSourceContext } from '../services/rag.service.js';
import { ValidationError, SourceNotFoundError, ConversationNotFoundError } from '../types/errors.js';
import { logger } from '../logger.js';
import { generateTTS } from '../services/tts.service.js';
import { config } from '../config.js';
import path from 'path';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1),
  source_id: z.number().int().positive().optional(),
  conversation_id: z.number().int().positive().optional(),
  tts: z.boolean().optional().default(false),
});

// POST /api/chat — Send a message
router.post('/chat', async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid request: ${parsed.error.message}`);
  }

  const { message, source_id, conversation_id, tts } = parsed.data;
  const chatType = source_id ? 'per_article' : 'cross_kb';

  // Get or create conversation, resolving session ID
  let convId = conversation_id;
  let claudeSessionId: string | null = null;
  let isNewConversation = false;

  if (convId) {
    const conv = await queryOne<{ id: number; type: string; claude_session_id: string | null }>(
      'SELECT id, type, claude_session_id FROM conversations WHERE id = $1',
      [convId],
    );
    if (!conv) throw new ConversationNotFoundError(convId);
    claudeSessionId = conv.claude_session_id;
  } else {
    isNewConversation = true;
    claudeSessionId = crypto.randomUUID();
    const conv = await queryOne<{ id: number }>(
      `INSERT INTO conversations (source_id, type, title, claude_session_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [source_id || null, chatType, message.slice(0, 100), claudeSessionId],
    );
    convId = conv!.id;
  }

  // Save user message
  await query(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
    [convId, message],
  );

  // Build context
  let systemPrompt: string | undefined;
  let citedSourceIds: number[] = [];
  let promptText = message;

  if (source_id) {
    const source = await getSourceContext(source_id);
    if (!source) throw new SourceNotFoundError(source_id);
    citedSourceIds = [source_id];

    // System prompt only on first message — session remembers it
    if (isNewConversation) {
      systemPrompt = `You are a helpful assistant discussing a specific article. Here is the article:

Title: ${source.title}
URL: ${source.url}

Summary:
${source.summary}

Full Content:
${source.content}

Answer the user's questions about this article. Be specific, cite sections when relevant.`;
    }
  } else {
    // Cross-KB: fresh RAG context per turn, included in the message
    const hits = await hybridSearch(message, 10);
    const context = await expandChunksWithNeighbors(hits);
    citedSourceIds = [...new Set(hits.map((h) => h.source_id))];

    if (isNewConversation) {
      systemPrompt = `You are a helpful assistant with access to a personal knowledge base. When provided with retrieved context, use it to answer questions. Cite sources when you use information from them. If the context doesn't contain relevant information, say so honestly.`;
    }

    // Prepend RAG context to the user message so each turn gets fresh results
    if (context) {
      promptText = `[Retrieved context for this query]\n${context}\n\n[User question]\n${message}`;
    }
  }

  // Invoke Claude with session-based multi-turn
  const start = Date.now();
  const response = await invokeClaude({
    prompt: promptText,
    systemPrompt,
    ...(claudeSessionId
      ? isNewConversation
        ? { sessionId: claudeSessionId }
        : { resumeSessionId: claudeSessionId }
      : {}),
  });
  const duration = Date.now() - start;

  logger.info({
    event: 'chat_response',
    conversation_id: convId,
    type: chatType,
    duration_ms: duration,
  });

  const saved = await queryOne<{ id: number }>(
    `INSERT INTO messages (conversation_id, role, content, cited_source_ids)
     VALUES ($1, 'assistant', $2, $3) RETURNING id`,
    [convId, response, citedSourceIds],
  );

  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [convId]);

  const sourcesReferenced = citedSourceIds.length > 0
    ? await queryMany<{ id: number; title: string; url: string }>(
        `SELECT id, title, url FROM sources WHERE id = ANY($1)`,
        [citedSourceIds],
      )
    : [];

  // Return text response immediately
  const audioUrl = tts ? `/api/audio/messages/${saved!.id}` : null;

  res.json({
    message_id: saved!.id,
    conversation_id: convId,
    content: response,
    audio_url: audioUrl,
    sources_referenced: sourcesReferenced,
  });

  // Generate TTS in background (non-blocking) after response is sent
  if (tts) {
    const messageId = saved!.id;
    const audioPath = path.join(config.audio.dir, 'messages', `${messageId}.mp3`);
    generateTTS(response, audioPath)
      .then(() => query('UPDATE messages SET audio_path = $1 WHERE id = $2', [audioPath, messageId]))
      .then(() => logger.info({ event: 'chat_tts_complete', message_id: messageId }))
      .catch((err) => logger.warn({ err, message_id: messageId }, 'TTS for chat response failed'));
  }
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/conversations — List conversations
router.get('/conversations', async (req: Request, res: Response) => {
  const { limit, offset } = paginationSchema.parse(req.query);

  const countResult = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM conversations',
  );
  const total = parseInt(countResult?.count || '0', 10);

  const conversations = await queryMany(
    `SELECT c.id, c.source_id, c.title, c.type, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
     FROM conversations c
     ORDER BY c.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  res.json({ data: conversations, total, offset, limit });
});

// GET /api/conversations/:id — Conversation with messages
router.get('/conversations/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid conversation ID');

  const conversation = await queryOne(
    `SELECT id, source_id, title, type, created_at, updated_at
     FROM conversations WHERE id = $1`,
    [id],
  );
  if (!conversation) throw new ConversationNotFoundError(id);

  const messages = await queryMany(
    `SELECT id, role, content, audio_path, cited_source_ids, created_at
     FROM messages WHERE conversation_id = $1 ORDER BY created_at`,
    [id],
  );

  res.json({ ...conversation, messages });
});

// DELETE /api/conversations/:id — Delete a conversation, its messages, and audio files
router.delete('/conversations/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid conversation ID');

  const conv = await queryOne<{ id: number }>('SELECT id FROM conversations WHERE id = $1', [id]);
  if (!conv) throw new ConversationNotFoundError(id);

  // Clean up message audio files
  const messages = await queryMany<{ audio_path: string | null }>(
    'SELECT audio_path FROM messages WHERE conversation_id = $1 AND audio_path IS NOT NULL',
    [id],
  );
  const fsp = await import('fs/promises');
  for (const msg of messages) {
    if (msg.audio_path) {
      await fsp.unlink(msg.audio_path).catch(() => {});
    }
  }

  // Delete conversation (messages cascade)
  await query('DELETE FROM conversations WHERE id = $1', [id]);

  res.status(204).send();
});

export default router;
