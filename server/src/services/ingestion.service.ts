import { config } from '../config.js';
import { logger } from '../logger.js';
import { query, queryOne } from './db.service.js';
import { invokeClaude, invokeClaudeJson } from './claude.service.js';
import { chunkText } from './chunking.service.js';
import { normalizeUrl } from '../utils/url.js';
import { countWords } from '../utils/text.js';
import { withRetry } from '../utils/retry.js';
import { DuplicateSourceError, IngestionFailedError } from '../types/errors.js';
import { generateEmbeddings } from './embedding.service.js';
import crypto from 'crypto';

interface SummarizationResult {
  summary: string;
  category: string;
  tags: string[];
  title: string;
}

/**
 * Create a new source record for a URL. Returns the source ID.
 * Throws DuplicateSourceError if the URL was already ingested.
 */
export async function createSource(url: string, userTags?: string[]): Promise<number> {
  const normalized = normalizeUrl(url);

  // Check for duplicate
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM sources WHERE url_normalized = $1',
    [normalized],
  );
  if (existing) {
    throw new DuplicateSourceError(url, existing.id);
  }

  const result = await queryOne<{ id: number }>(
    `INSERT INTO sources (url, url_normalized, tags, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [url, normalized, userTags || []],
  );

  return result!.id;
}

/**
 * Run the full ingestion pipeline for a source.
 */
export async function runIngestionPipeline(sourceId: number, rawContent?: string, rawTitle?: string): Promise<void> {
  try {
    // Step 1: Extract content — use provided content or fetch via Jina Reader
    let content: string;
    let title: string;
    if (rawContent) {
      content = rawContent;
      title = rawTitle || '';
      logger.info({ event: 'ingest_step', source_id: sourceId, step: 'content_provided', status: 'success' });
    } else {
      await updateStatus(sourceId, 'extracting');
      const fetched = await fetchContent(sourceId);
      content = fetched.content;
      title = fetched.title;
    }

    // Step 2: Summarize + categorize via Claude
    await updateStatus(sourceId, 'summarizing');
    const result = await summarizeContent(content, title);

    // Update source with content + summary
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    await query(
      `UPDATE sources
       SET raw_content = $1, title = $2, summary = $3, category = $4,
           tags = tags || $5, word_count = $6, content_hash = $7, updated_at = NOW()
       WHERE id = $8`,
      [content, result.title || title, result.summary, result.category, result.tags, countWords(content), contentHash, sourceId],
    );

    // Step 3: Chunk content
    await updateStatus(sourceId, 'chunking');
    const chunks = chunkText(content);

    // Step 4: Generate embeddings via Jina AI
    await updateStatus(sourceId, 'embedding');
    const validChunks = chunks.filter((c) => c.content.trim().length >= 10);
    const embeddings = await generateEmbeddings(validChunks.map((c) => c.content));

    // Step 5: Store chunks with embeddings
    for (let i = 0; i < validChunks.length; i++) {
      const chunk = validChunks[i];
      const vector = embeddings[i];
      const vectorLiteral = `[${vector.join(',')}]`;

      await query(
        `INSERT INTO chunks (source_id, chunk_index, content, token_count, embedding)
         VALUES ($1, $2, $3, $4, '${vectorLiteral}'::vector(1024))`,
        [sourceId, chunk.index, chunk.content, chunk.tokenCount],
      );
    }
    logger.info({ source_id: sourceId, total_chunks: chunks.length, embedded: validChunks.length });

    // Done
    await updateStatus(sourceId, 'ready');
    logger.info({ event: 'ingest_complete', source_id: sourceId, chunks: chunks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(
      `UPDATE sources SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message.slice(0, 1000), sourceId],
    );
    logger.error({ event: 'ingest_failed', source_id: sourceId, err: error });
    throw error;
  }
}

/**
 * Fetch content from a URL via Jina Reader.
 */
async function fetchContent(sourceId: number): Promise<{ content: string; title: string }> {
  const source = await queryOne<{ url: string }>('SELECT url FROM sources WHERE id = $1', [sourceId]);
  if (!source) throw new IngestionFailedError(sourceId, 'fetch', 'Source not found');

  const result = await withRetry(
    async () => {
      const start = Date.now();
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (config.jina.apiKey) {
        headers['Authorization'] = `Bearer ${config.jina.apiKey}`;
      }

      const response = await fetch(`${config.jina.baseUrl}/${source.url}`, {
        headers,
        signal: AbortSignal.timeout(config.jina.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Jina Reader returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { data?: { content?: string; title?: string } };
      const duration = Date.now() - start;

      logger.info({
        event: 'ingest_step',
        source_id: sourceId,
        step: 'jina_fetch',
        duration_ms: duration,
        status: 'success',
      });

      const content = data?.data?.content;
      if (!content || content.trim().length < 50) {
        throw new Error('Jina Reader returned empty or insufficient content');
      }

      return { content, title: data?.data?.title || '' };
    },
    { maxAttempts: 3, baseDelayMs: 1000, label: 'jina_fetch' },
  );

  return result;
}

/**
 * Use Claude to summarize content and extract metadata.
 */
async function summarizeContent(content: string, title: string): Promise<SummarizationResult> {
  const start = Date.now();

  const systemPrompt = `You are a knowledge base assistant. Given an article, produce a JSON object with:
- "title": a clear, concise title for the article (use the original title if good, improve if needed)
- "summary": a 3-5 paragraph narrative summary capturing the key ideas, arguments, and conclusions. Write in clear prose, not bullet points.
- "category": one of: "ai_agents", "prompt_engineering", "ml_ops", "software_engineering", "web_development", "data_science", "devtools", "career", "product", "design", "other"
- "tags": an array of 3-7 specific, lowercase tags relevant to the content (e.g. ["rag", "vector-search", "embeddings"])

Respond with ONLY the JSON object, no markdown code blocks.`;

  const truncated = content.length > 100_000 ? content.slice(0, 100_000) + '\n\n[Content truncated]' : content;
  const prompt = title ? `Title: ${title}\n\n${truncated}` : truncated;

  const result = await invokeClaudeJson<SummarizationResult>({
    prompt,
    systemPrompt,
  });

  const duration = Date.now() - start;
  logger.info({
    event: 'ingest_step',
    source_id: 'summarize',
    step: 'claude_summarize',
    duration_ms: duration,
    status: 'success',
  });

  return result;
}

async function updateStatus(sourceId: number, status: string): Promise<void> {
  await query(
    'UPDATE sources SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, sourceId],
  );
}
