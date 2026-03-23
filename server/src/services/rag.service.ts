import { queryMany, queryOne } from './db.service.js';
import { generateQueryEmbedding } from './embedding.service.js';
import { toVectorLiteral } from '../utils/vector.js';
import { logger } from '../logger.js';

export interface SearchHit {
  chunk_id: number;
  source_id: number;
  content: string;
  chunk_index: number;
  title: string;
  url: string;
  score: number;
}

interface RankedItem {
  chunk_id: number;
  rank: number;
}

/**
 * Hybrid search: semantic + keyword with Reciprocal Rank Fusion.
 */
export async function hybridSearch(
  queryText: string,
  limit = 10,
  category?: string,
): Promise<SearchHit[]> {
  const start = Date.now();

  // Generate query embedding via Jina
  const queryVector = await generateQueryEmbedding(queryText);
  const vectorLiteral = toVectorLiteral(queryVector);

  const categoryFilter = category
    ? `AND s.category = $${category ? 1 : 0}`
    : '';
  const keywordParamOffset = category ? 2 : 1;
  const keywordParams = category ? [queryText, category] : [queryText];

  // Semantic search: top 20 by cosine distance (vector literal, safe — from Jina API, not user input)
  const semanticCategoryFilter = category ? 'AND s.category = $1' : '';
  const semanticParams = category ? [category] : [];
  const semanticResults = await queryMany<{ chunk_id: number; source_id: number; content: string; chunk_index: number; title: string; url: string }>(
    `SELECT c.id AS chunk_id, c.source_id, c.content, c.chunk_index,
            s.title, s.url
     FROM chunks c
     JOIN sources s ON s.id = c.source_id
     WHERE s.status = 'ready' AND c.embedding IS NOT NULL ${semanticCategoryFilter}
     ORDER BY c.embedding <=> '${vectorLiteral}'::vector(1024)
     LIMIT 20`,
    semanticParams,
  );

  // Keyword search: top 20 by ts_rank
  const keywordCategoryFilter = category ? 'AND s.category = $2' : '';
  const keywordResults = await queryMany<{ chunk_id: number; source_id: number; content: string; chunk_index: number; title: string; url: string }>(
    `SELECT c.id AS chunk_id, c.source_id, c.content, c.chunk_index,
            s.title, s.url
     FROM chunks c
     JOIN sources s ON s.id = c.source_id
     WHERE s.status = 'ready' ${keywordCategoryFilter}
       AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
     ORDER BY ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $1)) DESC
     LIMIT 20`,
    keywordParams,
  );

  // Reciprocal Rank Fusion
  const merged = reciprocalRankFusion(
    semanticResults.map((r, i) => ({ chunk_id: r.chunk_id, rank: i + 1 })),
    keywordResults.map((r, i) => ({ chunk_id: r.chunk_id, rank: i + 1 })),
  );

  // Build result map for lookup
  const allResults = new Map<number, (typeof semanticResults)[0]>();
  for (const r of [...semanticResults, ...keywordResults]) {
    allResults.set(r.chunk_id, r);
  }

  const hits: SearchHit[] = merged.slice(0, limit).map((m) => {
    const r = allResults.get(m.chunk_id)!;
    return { ...r, score: m.score };
  });

  const duration = Date.now() - start;
  logger.info({
    event: 'hybrid_search',
    query_length: queryText.length,
    semantic_hits: semanticResults.length,
    keyword_hits: keywordResults.length,
    merged_hits: hits.length,
    duration_ms: duration,
  });

  return hits;
}

/**
 * Reciprocal Rank Fusion: merge two ranked lists.
 * RRF score = sum(1 / (k + rank)) across lists. k=60 is standard.
 */
export function reciprocalRankFusion(
  listA: RankedItem[],
  listB: RankedItem[],
  k = 60,
): { chunk_id: number; score: number }[] {
  const scores = new Map<number, number>();

  for (const item of listA) {
    const current = scores.get(item.chunk_id) || 0;
    scores.set(item.chunk_id, current + 1 / (k + item.rank));
  }

  for (const item of listB) {
    const current = scores.get(item.chunk_id) || 0;
    scores.set(item.chunk_id, current + 1 / (k + item.rank));
  }

  return [...scores.entries()]
    .map(([chunk_id, score]) => ({ chunk_id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Expand chunks with their neighbors for better context.
 */
export async function expandChunksWithNeighbors(hits: SearchHit[]): Promise<string> {
  const expanded: string[] = [];

  for (const hit of hits) {
    const neighbors = await queryMany<{ content: string; chunk_index: number }>(
      `SELECT content, chunk_index FROM chunks
       WHERE source_id = $1 AND chunk_index BETWEEN $2 AND $3
       ORDER BY chunk_index`,
      [hit.source_id, hit.chunk_index - 1, hit.chunk_index + 1],
    );

    const context = neighbors.map((n) => n.content).join('\n\n');
    expanded.push(`[Source: ${hit.title} (${hit.url})]\n${context}`);
  }

  return expanded.join('\n\n---\n\n');
}

/**
 * Get full article content for per-article chat.
 */
export async function getSourceContext(sourceId: number): Promise<{
  title: string;
  url: string;
  content: string;
  summary: string;
} | null> {
  return queryOne<{ title: string; url: string; content: string; summary: string }>(
    `SELECT title, url, raw_content AS content, summary
     FROM sources WHERE id = $1 AND status = 'ready'`,
    [sourceId],
  );
}
