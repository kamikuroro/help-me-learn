import { config } from '../config.js';
import { logger } from '../logger.js';
import { withRetry } from '../utils/retry.js';

const JINA_EMBEDDINGS_URL = 'https://api.jina.ai/v1/embeddings';
const MODEL = 'jina-embeddings-v3';
const DIMENSIONS = 1024;
const MAX_BATCH_SIZE = 64;

/**
 * Generate embeddings for one or more texts via Jina AI.
 * Returns an array of number arrays (one embedding per input text).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const start = Date.now();

    const data = await withRetry(
      async () => {
        const response = await fetch(JINA_EMBEDDINGS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.jina.apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            dimensions: DIMENSIONS,
            input: batch,
            task: 'retrieval.passage',
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Jina Embeddings API error ${response.status}: ${body.slice(0, 200)}`);
        }

        return await response.json() as {
          data: { embedding: number[]; index: number }[];
        };
      },
      { maxAttempts: 3, baseDelayMs: 2000, label: 'jina_embed' },
    );

    const duration = Date.now() - start;
    logger.info({
      event: 'jina_embed',
      batch_size: batch.length,
      dimensions: DIMENSIONS,
      duration_ms: duration,
    });

    // Sort by index to maintain order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    results.push(...sorted.map((d) => d.embedding));
  }

  return results;
}

/**
 * Generate embedding for a single text (convenience wrapper).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const results = await generateEmbeddings([text]);
  return results[0];
}

/**
 * Generate embedding for a search query (uses different task type).
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const data = await withRetry(
    async () => {
      const response = await fetch(JINA_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.jina.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          dimensions: DIMENSIONS,
          input: [text],
          task: 'retrieval.query',
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Jina Embeddings API error ${response.status}: ${body.slice(0, 200)}`);
      }

      return await response.json() as {
        data: { embedding: number[] }[];
      };
    },
    { maxAttempts: 3, baseDelayMs: 2000, label: 'jina_query_embed' },
  );

  return data.data[0].embedding;
}
