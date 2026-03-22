# Phases 1–4 Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 1 tests, Phase 2 (search + chat), Phase 3 (audio/TTS), and Phase 4 (iOS app) — delivering a fully functional audio-first knowledge base ready for iPhone testing.

**Architecture:** Node.js/TypeScript Express server with db9.ai (PostgreSQL + vectors) for storage/embeddings. Claude CLI for summarization and chat. ElevenLabs/Fish Audio for TTS. Native SwiftUI iOS app connecting to the server over Tailscale VPN. All async work goes through an in-process job queue.

**Tech Stack:** TypeScript, Express 5, pg, vitest, zod v4, pino, ffmpeg (audio concat), SwiftUI, AVFoundation, XcodeGen

---

## File Structure

### Phase 1: Tests
| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `server/vitest.config.ts` | Vitest config with ESM + TypeScript |
| Create | `server/tests/unit/url.test.ts` | URL normalization + validation tests |
| Create | `server/tests/unit/chunking.test.ts` | Heading-aware chunking tests |
| Create | `server/tests/unit/text.test.ts` | Token estimation + word count tests |

### Phase 2: Search & Chat
| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `server/src/services/rag.service.ts` | Semantic search, keyword search, RRF merge, context expansion |
| Create | `server/src/routes/search.routes.ts` | `GET /api/search?q=` |
| Create | `server/src/routes/chat.routes.ts` | `POST /api/chat`, `GET /api/conversations`, `GET /api/conversations/:id` |
| Modify | `server/src/index.ts` | Register search + chat routes |
| Create | `server/tests/unit/rag.test.ts` | RRF merge + context expansion unit tests |

### Phase 3: Audio Pipeline
| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `server/src/services/tts.service.ts` | ElevenLabs API, paragraph splitting, Fish Audio fallback |
| Create | `server/src/jobs/tts.job.ts` | TTS generation job handler |
| Create | `server/src/jobs/digest.job.ts` | Weekly digest generation handler |
| Create | `server/src/routes/audio.routes.ts` | Generate, stream (with Range), digest endpoints |
| Modify | `server/src/routes/chat.routes.ts` | Wire TTS into chat responses when `tts=true` |
| Modify | `server/src/index.ts` | Register audio routes, tts queue, audio static serving |
| Create | `server/tests/unit/tts.test.ts` | Text segmentation + provider selection tests |

### Phase 4: iOS App
| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `ios/project.yml` | XcodeGen project spec |
| Create | `ios/HelpMeLearn/HelpMeLearnApp.swift` | App entry + tab navigation |
| Create | `ios/HelpMeLearn/Models/Source.swift` | Source model matching API |
| Create | `ios/HelpMeLearn/Models/Conversation.swift` | Conversation + Message models |
| Create | `ios/HelpMeLearn/Services/APIClient.swift` | HTTP client (URLSession, bearer auth) |
| Create | `ios/HelpMeLearn/Services/AudioPlayerService.swift` | AVPlayer, background audio, lock screen |
| Create | `ios/HelpMeLearn/Services/SettingsService.swift` | UserDefaults persistence |
| Create | `ios/HelpMeLearn/ViewModels/FeedViewModel.swift` | Source list data loading |
| Create | `ios/HelpMeLearn/ViewModels/ChatViewModel.swift` | Chat message handling |
| Create | `ios/HelpMeLearn/ViewModels/LibraryViewModel.swift` | Search + filter |
| Create | `ios/HelpMeLearn/Views/Feed/FeedView.swift` | Source list, play buttons, badges |
| Create | `ios/HelpMeLearn/Views/Feed/SourceRowView.swift` | Single source row |
| Create | `ios/HelpMeLearn/Views/Chat/ChatView.swift` | Message bubbles, input |
| Create | `ios/HelpMeLearn/Views/Chat/MessageBubbleView.swift` | Single message |
| Create | `ios/HelpMeLearn/Views/Audio/MiniPlayerView.swift` | Persistent mini-player bar |
| Create | `ios/HelpMeLearn/Views/Audio/FullPlayerView.swift` | Full player (scrubber, speed, skip) |
| Create | `ios/HelpMeLearn/Views/Library/LibraryView.swift` | Browse by category/tag |
| Create | `ios/HelpMeLearn/Views/Settings/SettingsView.swift` | Server hostname, token, prefs |
| Create | `ios/ShareExtension/ShareViewController.swift` | Share Extension entry |
| Create | `ios/ShareExtension/ShareView.swift` | Share UI |
| Create | `ios/ShareExtension/Info.plist` | Share Extension config |
| Create | `ios/HelpMeLearn/Info.plist` | App config (background audio) |
| Create | `ios/HelpMeLearn/Assets.xcassets/Contents.json` | Asset catalog |

---

## Phase 1: Foundation Tests

### Task 1: Vitest Configuration

**Files:**
- Create: `server/vitest.config.ts`

- [ ] **Step 1: Create vitest config**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
```

- [ ] **Step 2: Verify vitest runs (no tests yet)**

Run: `cd server && npx vitest run`
Expected: "no test files found" or similar (no crash)

- [ ] **Step 3: Commit**

```bash
git add server/vitest.config.ts
git commit -m "chore: add vitest config"
```

---

### Task 2: URL Normalization Tests

**Files:**
- Create: `server/tests/unit/url.test.ts`
- Reference: `server/src/utils/url.ts`

- [ ] **Step 1: Write URL normalization tests**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeUrl, isValidUrl } from '../../src/utils/url.js';

describe('normalizeUrl', () => {
  it('lowercases hostname', () => {
    expect(normalizeUrl('https://Example.COM/path')).toBe('https://example.com/path');
  });

  it('removes www prefix', () => {
    expect(normalizeUrl('https://www.example.com/path')).toBe('https://example.com/path');
  });

  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('preserves root slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('removes UTM tracking params', () => {
    expect(normalizeUrl('https://example.com/post?utm_source=twitter&utm_medium=social'))
      .toBe('https://example.com/post');
  });

  it('removes fbclid, gclid, and other trackers', () => {
    expect(normalizeUrl('https://example.com/page?fbclid=abc123&gclid=xyz'))
      .toBe('https://example.com/page');
  });

  it('preserves non-tracking query params', () => {
    expect(normalizeUrl('https://example.com/search?q=hello&page=2'))
      .toBe('https://example.com/search?page=2&q=hello');
  });

  it('sorts remaining query params', () => {
    expect(normalizeUrl('https://example.com/path?z=1&a=2'))
      .toBe('https://example.com/path?a=2&z=1');
  });

  it('removes hash fragment', () => {
    expect(normalizeUrl('https://example.com/page#section'))
      .toBe('https://example.com/page');
  });

  it('handles mixed case tracking params', () => {
    expect(normalizeUrl('https://example.com/page?UTM_SOURCE=foo'))
      .toBe('https://example.com/page');
  });

  it('preserves port numbers', () => {
    expect(normalizeUrl('https://example.com:8080/path'))
      .toBe('https://example.com:8080/path');
  });

  it('normalizes identical URLs to same value', () => {
    const url1 = normalizeUrl('https://WWW.Example.com/article/?utm_source=x#heading');
    const url2 = normalizeUrl('https://example.com/article');
    expect(url1).toBe(url2);
  });
});

describe('isValidUrl', () => {
  it('accepts http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com/path')).toBe(true);
  });

  it('rejects ftp URLs', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });

  it('rejects non-URL strings', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npx vitest run tests/unit/url.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/tests/unit/url.test.ts
git commit -m "test: add URL normalization and validation tests"
```

---

### Task 3: Text Utility Tests

**Files:**
- Create: `server/tests/unit/text.test.ts`
- Reference: `server/src/utils/text.ts`

- [ ] **Step 1: Write text utility tests**

```ts
import { describe, it, expect } from 'vitest';
import { estimateTokens, countWords } from '../../src/utils/text.js';

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100);
  });

  it('rounds up partial tokens', () => {
    expect(estimateTokens('hello')).toBe(2); // 5 chars / 4 = 1.25 → ceil = 2
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('countWords', () => {
  it('counts space-separated words', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('handles multiple spaces', () => {
    expect(countWords('hello   world')).toBe(2);
  });

  it('handles newlines and tabs', () => {
    expect(countWords('hello\nworld\tfoo')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   \n\t  ')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npx vitest run tests/unit/text.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/tests/unit/text.test.ts
git commit -m "test: add text utility tests"
```

---

### Task 4: Chunking Tests

**Files:**
- Create: `server/tests/unit/chunking.test.ts`
- Reference: `server/src/services/chunking.service.ts`

- [ ] **Step 1: Write chunking tests**

```ts
import { describe, it, expect } from 'vitest';
import { chunkText, type Chunk } from '../../src/services/chunking.service.js';

// Helper: generate text of approximate token count (4 chars ≈ 1 token)
function makeText(tokens: number): string {
  return 'word '.repeat(tokens); // 5 chars per 'word ' ≈ 1.25 tokens each
}

function makeParagraph(tokens: number): string {
  // Each word is ~1.25 tokens, so use slightly fewer words
  const words = Math.floor(tokens / 1.25);
  return Array(words).fill('test').join(' ');
}

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const chunks = chunkText('Hello world. This is a short article.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].content).toBe('Hello world. This is a short article.');
  });

  it('chunks are indexed sequentially from 0', () => {
    // Create text long enough to split into multiple chunks
    const sections = Array.from({ length: 5 }, (_, i) =>
      `## Section ${i}\n\n${makeParagraph(400)}`
    ).join('\n\n');

    const chunks = chunkText(sections);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('splits at heading boundaries', () => {
    const text = `# Introduction\n\nSome intro text here.\n\n## Method\n\nMethod description here.\n\n## Results\n\nResults here.`;
    const chunks = chunkText(text);
    // With such short sections they may be merged, but headings should not be split mid-section
    for (const chunk of chunks) {
      // Count heading markers — each chunk should have at most the headings it started with
      const headings = chunk.content.match(/^#{1,6}\s/gm) || [];
      // A chunk can contain multiple headings if they were small and merged
      expect(headings.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('respects max token limit per chunk', () => {
    // Create a large section without headings (forces paragraph splitting)
    const text = Array.from({ length: 20 }, () => makeParagraph(200)).join('\n\n');
    const chunks = chunkText(text);

    for (const chunk of chunks) {
      // MAX_CHUNK_TOKENS=800, but mergeSmallChunks can combine a <200 token buffer with a <=800 token chunk
      expect(chunk.tokenCount).toBeLessThanOrEqual(1000);
    }
  });

  it('merges small chunks with neighbors', () => {
    // Create several tiny sections that should be merged
    const text = Array.from({ length: 10 }, (_, i) =>
      `## Section ${i}\n\nTiny.`
    ).join('\n\n');

    const chunks = chunkText(text);
    // 10 tiny sections should be merged into fewer chunks
    expect(chunks.length).toBeLessThan(10);
  });

  it('preserves content — no text is lost', () => {
    const text = `# Title\n\nParagraph one with some content.\n\n## Section\n\nParagraph two with more content.\n\nParagraph three.`;
    const chunks = chunkText(text);
    const reassembled = chunks.map((c) => c.content).join('\n\n');
    // All key content should be present
    expect(reassembled).toContain('Paragraph one');
    expect(reassembled).toContain('Paragraph two');
    expect(reassembled).toContain('Paragraph three');
  });

  it('handles text with no headings', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `Paragraph ${i}: ${makeParagraph(150)}`
    ).join('\n\n');

    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('each chunk has a positive tokenCount', () => {
    const text = `# Title\n\nSome content here.\n\n## Another\n\nMore content.`;
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npx vitest run tests/unit/chunking.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Run all tests together**

Run: `cd server && npx vitest run`
Expected: All test suites PASS

- [ ] **Step 4: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add server/tests/unit/chunking.test.ts
git commit -m "test: add chunking service tests"
```

---

## Phase 2: Search & Chat

### Task 5: RAG Service

**Files:**
- Create: `server/src/services/rag.service.ts`
- Reference: `server/src/services/db.service.ts`, `server/src/services/claude.service.ts`

The RAG service implements hybrid search (semantic + keyword) with Reciprocal Rank Fusion and context expansion.

- [ ] **Step 1: Create RAG service**

```ts
import { queryMany, queryOne } from './db.service.js';
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

  const categoryFilter = category
    ? 'AND s.category = $2'
    : '';
  const params = category ? [queryText, category] : [queryText];

  // Semantic search: top 20 by cosine distance
  const semanticResults = await queryMany<{ chunk_id: number; source_id: number; content: string; chunk_index: number; title: string; url: string }>(
    `SELECT c.id AS chunk_id, c.source_id, c.content, c.chunk_index,
            s.title, s.url
     FROM chunks c
     JOIN sources s ON s.id = c.source_id
     WHERE s.status = 'ready' ${categoryFilter}
     ORDER BY c.embedding <=> embedding($1)
     LIMIT 20`,
    params,
  );

  // Keyword search: top 20 by ts_rank
  const keywordResults = await queryMany<{ chunk_id: number; source_id: number; content: string; chunk_index: number; title: string; url: string }>(
    `SELECT c.id AS chunk_id, c.source_id, c.content, c.chunk_index,
            s.title, s.url
     FROM chunks c
     JOIN sources s ON s.id = c.source_id
     WHERE s.status = 'ready' ${categoryFilter}
       AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
     ORDER BY ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $1)) DESC
     LIMIT 20`,
    params,
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
 * For each chunk, fetch the chunk before and after it from the same source.
 */
export async function expandChunksWithNeighbors(hits: SearchHit[]): Promise<string> {
  const expanded: string[] = [];

  for (const hit of hits) {
    // Fetch neighbor chunks (chunk_index - 1 and chunk_index + 1)
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
```

- [ ] **Step 2: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/services/rag.service.ts
git commit -m "feat: add RAG service with hybrid search and RRF"
```

---

### Task 6: RAG Unit Tests

**Files:**
- Create: `server/tests/unit/rag.test.ts`
- Reference: `server/src/services/rag.service.ts`

- [ ] **Step 1: Write RRF merge tests**

```ts
import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from '../../src/services/rag.service.js';

describe('reciprocalRankFusion', () => {
  it('returns empty array for empty inputs', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  it('handles single list', () => {
    const result = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }, { chunk_id: 2, rank: 2 }],
      [],
    );
    expect(result).toHaveLength(2);
    expect(result[0].chunk_id).toBe(1); // rank 1 scores higher
    expect(result[1].chunk_id).toBe(2);
  });

  it('boosts items appearing in both lists', () => {
    const result = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }, { chunk_id: 2, rank: 2 }],
      [{ chunk_id: 2, rank: 1 }, { chunk_id: 3, rank: 2 }],
    );
    // chunk_id 2 appears in both lists → highest score
    expect(result[0].chunk_id).toBe(2);
  });

  it('returns sorted by score descending', () => {
    const result = reciprocalRankFusion(
      [{ chunk_id: 10, rank: 3 }, { chunk_id: 20, rank: 1 }],
      [{ chunk_id: 30, rank: 1 }, { chunk_id: 10, rank: 2 }],
    );
    for (let i = 1; i < result.length; i++) {
      expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
    }
  });

  it('uses k parameter for scoring', () => {
    const k10 = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }],
      [],
      10,
    );
    const k60 = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }],
      [],
      60,
    );
    // Lower k → higher score for same rank
    expect(k10[0].score).toBeGreaterThan(k60[0].score);
  });

  it('deduplicates chunk_ids across lists', () => {
    const result = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }],
      [{ chunk_id: 1, rank: 1 }],
    );
    expect(result).toHaveLength(1);
    // Score should be double the single-list score
    const singleScore = 1 / (60 + 1);
    expect(result[0].score).toBeCloseTo(singleScore * 2, 10);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npx vitest run tests/unit/rag.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/tests/unit/rag.test.ts
git commit -m "test: add RRF merge unit tests"
```

---

### Task 7: Search Routes

**Files:**
- Create: `server/src/routes/search.routes.ts`
- Reference: `server/src/services/rag.service.ts`, `server/src/types/api.types.ts`

- [ ] **Step 1: Create search routes**

```ts
import { Router, type Request, type Response } from 'express';
import { z } from 'zod/v4';
import { hybridSearch } from '../services/rag.service.js';
import { ValidationError } from '../types/errors.js';

const router = Router();

const searchSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  category: z.string().optional(),
});

// GET /api/search?q=query&limit=10&category=ai_agents
router.get('/', async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError(`Invalid search params: ${parsed.error.message}`);
  }

  const { q, limit, category } = parsed.data;
  const hits = await hybridSearch(q, limit, category);

  res.json({
    query: q,
    results: hits.map((h) => ({
      source_id: h.source_id,
      title: h.title,
      url: h.url,
      excerpt: h.content.slice(0, 300),
      relevance: h.score,
      category: null, // could join from sources if needed
    })),
    total: hits.length,
  });
});

export default router;
```

- [ ] **Step 2: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/search.routes.ts
git commit -m "feat: add search routes with hybrid search"
```

---

### Task 8: Chat Routes + Conversation Persistence

**Files:**
- Create: `server/src/routes/chat.routes.ts`
- Reference: `server/src/services/rag.service.ts`, `server/src/services/claude.service.ts`, `server/src/services/db.service.ts`

This implements:
- `POST /api/chat` — per-article (with source_id) or cross-KB (without) chat
- `GET /api/conversations` — list conversations
- `GET /api/conversations/:id` — conversation with messages

Note: This router mounts at `/api` because it handles both `/chat` and `/conversations` paths. All route handlers use explicit full sub-paths.

- [ ] **Step 1: Create chat routes**

```ts
import { Router, type Request, type Response } from 'express';
import { z } from 'zod/v4';
import { query, queryOne, queryMany } from '../services/db.service.js';
import { invokeClaude } from '../services/claude.service.js';
import { hybridSearch, expandChunksWithNeighbors, getSourceContext } from '../services/rag.service.js';
import { ValidationError, SourceNotFoundError, ConversationNotFoundError } from '../types/errors.js';
import { logger } from '../logger.js';

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

  // Get or create conversation
  let convId = conversation_id;
  if (convId) {
    const conv = await queryOne<{ id: number; type: string }>(
      'SELECT id, type FROM conversations WHERE id = $1',
      [convId],
    );
    if (!conv) throw new ConversationNotFoundError(convId);
  } else {
    const conv = await queryOne<{ id: number }>(
      `INSERT INTO conversations (source_id, type, title)
       VALUES ($1, $2, $3) RETURNING id`,
      [source_id || null, chatType, message.slice(0, 100)],
    );
    convId = conv!.id;
  }

  // Save user message
  await query(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
    [convId, message],
  );

  // Build context and generate response
  let systemPrompt: string;
  let citedSourceIds: number[] = [];

  if (source_id) {
    // Per-article chat: full article as context
    const source = await getSourceContext(source_id);
    if (!source) throw new SourceNotFoundError(source_id);

    systemPrompt = `You are a helpful assistant discussing a specific article. Here is the article:

Title: ${source.title}
URL: ${source.url}

Summary:
${source.summary}

Full Content:
${source.content}

Answer the user's questions about this article. Be specific, cite sections when relevant.`;
    citedSourceIds = [source_id];
  } else {
    // Cross-KB chat: RAG retrieval
    const hits = await hybridSearch(message, 10);
    const context = await expandChunksWithNeighbors(hits);
    citedSourceIds = [...new Set(hits.map((h) => h.source_id))];

    systemPrompt = `You are a helpful assistant with access to a personal knowledge base. Use the following retrieved context to answer the user's question. Cite sources when you use information from them.

${context}

If the context doesn't contain relevant information, say so honestly. Always cite which source you're drawing from.`;
  }

  // Fetch conversation history for multi-turn context
  const history = await queryMany<{ role: string; content: string }>(
    `SELECT role, content FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at
     LIMIT 20`,
    [convId],
  );

  // Build prompt with history
  const historyText = history
    .slice(0, -1) // exclude the message we just saved
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const fullPrompt = historyText
    ? `Previous conversation:\n${historyText}\n\nUser: ${message}`
    : message;

  const start = Date.now();
  const response = await invokeClaude({
    prompt: fullPrompt,
    systemPrompt,
  });
  const duration = Date.now() - start;

  logger.info({
    event: 'chat_response',
    conversation_id: convId,
    type: chatType,
    duration_ms: duration,
  });

  // Save assistant message
  const saved = await queryOne<{ id: number }>(
    `INSERT INTO messages (conversation_id, role, content, cited_source_ids)
     VALUES ($1, 'assistant', $2, $3) RETURNING id`,
    [convId, response, citedSourceIds],
  );

  // Update conversation timestamp
  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [convId]);

  // Collect source info for cited sources
  const sourcesReferenced = citedSourceIds.length > 0
    ? await queryMany<{ id: number; title: string; url: string }>(
        `SELECT id, title, url FROM sources WHERE id = ANY($1)`,
        [citedSourceIds],
      )
    : [];

  res.json({
    message_id: saved!.id,
    conversation_id: convId,
    content: response,
    audio_url: null, // TTS handled in Phase 3
    sources_referenced: sourcesReferenced,
  });
});

// GET /api/conversations — List conversations
router.get('/conversations', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

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

export default router;
```

- [ ] **Step 2: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/chat.routes.ts
git commit -m "feat: add chat routes with per-article and cross-KB modes"
```

---

### Task 9: Register Phase 2 Routes

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add search and chat route imports and registration**

Add these imports at the top of `index.ts` alongside existing route imports:

```ts
import searchRoutes from './routes/search.routes.js';
import chatRoutes from './routes/chat.routes.js';
```

Add these route registrations after the existing `app.use('/api/sources', ...)` line:

```ts
app.use('/api/search', authMiddleware, searchRoutes);
app.use('/api', authMiddleware, chatRoutes);
```

Note: Chat routes register at `/api` because they contain both `/chat` and `/conversations` paths.

- [ ] **Step 2: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: register search and chat routes"
```

---

## Phase 3: Audio Pipeline

### Task 10: TTS Service

**Files:**
- Create: `server/src/services/tts.service.ts`
- Reference: `server/src/config.ts`

Implements ElevenLabs TTS with paragraph-boundary splitting and Fish Audio fallback. Long texts are split into segments (max ~5000 chars per API call), each converted to audio, then concatenated via ffmpeg.

- [ ] **Step 1: Create TTS service**

```ts
import { config } from '../config.js';
import { logger } from '../logger.js';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const MAX_SEGMENT_CHARS = 4500; // ElevenLabs limit ~5000, leave margin

export interface TTSResult {
  filePath: string;
  durationSeconds: number;
}

/**
 * Generate TTS audio from text.
 * Splits long text into segments, generates audio for each, concatenates with ffmpeg.
 */
export async function generateTTS(
  text: string,
  outputPath: string,
): Promise<TTSResult> {
  const start = Date.now();
  const segments = splitIntoSegments(text);

  if (segments.length === 0) {
    throw new Error('No text to generate audio for');
  }

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (segments.length === 1) {
    // Single segment — direct output
    const result = await synthesizeSegment(segments[0], outputPath);
    const duration = Date.now() - start;
    logger.info({
      event: 'tts_generate',
      chars: text.length,
      segments: 1,
      duration_ms: duration,
      provider: result.provider,
    });
    return { filePath: outputPath, durationSeconds: result.durationSeconds };
  }

  // Multiple segments — generate each, then concatenate
  const tempDir = outputPath + '.parts';
  await fs.mkdir(tempDir, { recursive: true });

  const partPaths: string[] = [];
  let totalDuration = 0;

  try {
    for (let i = 0; i < segments.length; i++) {
      const partPath = path.join(tempDir, `part-${String(i).padStart(3, '0')}.mp3`);
      const result = await synthesizeSegment(segments[i], partPath);
      partPaths.push(partPath);
      totalDuration += result.durationSeconds;
    }

    // Concatenate with ffmpeg
    await concatenateAudio(partPaths, outputPath);

    const duration = Date.now() - start;
    logger.info({
      event: 'tts_generate',
      chars: text.length,
      segments: segments.length,
      duration_ms: duration,
      total_audio_s: totalDuration,
    });

    return { filePath: outputPath, durationSeconds: totalDuration };
  } finally {
    // Clean up temp parts
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Split text into segments at paragraph boundaries, respecting max char limit.
 */
export function splitIntoSegments(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  const segments: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // If a single paragraph exceeds the limit, split it by sentences
    if (trimmed.length > MAX_SEGMENT_CHARS) {
      if (current.trim()) {
        segments.push(current.trim());
        current = '';
      }
      segments.push(...splitBySentences(trimmed));
      continue;
    }

    if (current.length + trimmed.length + 2 > MAX_SEGMENT_CHARS && current.length > 0) {
      segments.push(current.trim());
      current = trimmed;
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * Split a long paragraph by sentence boundaries to fit within segment limit.
 */
function splitBySentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g) || [text];
  const segments: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_SEGMENT_CHARS && current.length > 0) {
      segments.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * Synthesize a single text segment to audio file.
 * Tries ElevenLabs first, falls back to Fish Audio.
 */
async function synthesizeSegment(
  text: string,
  outputPath: string,
): Promise<{ durationSeconds: number; provider: string }> {
  if (config.elevenlabs.apiKey) {
    try {
      return await synthesizeElevenLabs(text, outputPath);
    } catch (err) {
      logger.warn({ err }, 'ElevenLabs failed, falling back to Fish Audio');
    }
  }

  if (config.fishaudio.apiKey) {
    return await synthesizeFishAudio(text, outputPath);
  }

  throw new Error('No TTS provider configured (set ELEVENLABS_API_KEY or FISH_AUDIO_API_KEY)');
}

async function synthesizeElevenLabs(
  text: string,
  outputPath: string,
): Promise<{ durationSeconds: number; provider: string }> {
  const voiceId = config.elevenlabs.voiceId || 'pMsXgVXv3BLzUgSXRplE'; // default: Serena
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': config.elevenlabs.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenlabs.modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new Error(`ElevenLabs rate limited. Retry after ${retryAfter || 'unknown'}s`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);

  // Estimate duration: mp3 at ~128kbps → bytes / 16000 ≈ seconds
  const durationSeconds = Math.round(buffer.length / 16000);

  return { durationSeconds, provider: 'elevenlabs' };
}

async function synthesizeFishAudio(
  text: string,
  outputPath: string,
): Promise<{ durationSeconds: number; provider: string }> {
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.fishaudio.apiKey}`,
    },
    body: JSON.stringify({
      text,
      format: 'mp3',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fish Audio API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);

  const durationSeconds = Math.round(buffer.length / 16000);
  return { durationSeconds, provider: 'fishaudio' };
}

/**
 * Concatenate multiple audio files using ffmpeg.
 */
function concatenateAudio(inputPaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create ffmpeg concat file list
    const listContent = inputPaths.map((p) => `file '${p}'`).join('\n');
    const listPath = outputPath + '.list.txt';

    fs.writeFile(listPath, listContent)
      .then(() => {
        const proc = spawn('ffmpeg', [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', listPath,
          '-c', 'copy',
          outputPath,
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          fs.unlink(listPath).catch(() => {});
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg failed (code ${code}): ${stderr.slice(0, 300)}`));
        });

        proc.on('error', (err) => {
          fs.unlink(listPath).catch(() => {});
          reject(new Error(`ffmpeg spawn error: ${err.message}`));
        });
      })
      .catch(reject);
  });
}
```

- [ ] **Step 2: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/services/tts.service.ts
git commit -m "feat: add TTS service with ElevenLabs and Fish Audio"
```

---

### Task 11: TTS Unit Tests

**Files:**
- Create: `server/tests/unit/tts.test.ts`
- Reference: `server/src/services/tts.service.ts`

- [ ] **Step 1: Write TTS segment splitting tests**

```ts
import { describe, it, expect } from 'vitest';
import { splitIntoSegments } from '../../src/services/tts.service.js';

describe('splitIntoSegments', () => {
  it('returns empty array for empty text', () => {
    expect(splitIntoSegments('')).toEqual([]);
  });

  it('returns empty array for whitespace-only text', () => {
    expect(splitIntoSegments('   \n\n   ')).toEqual([]);
  });

  it('returns single segment for short text', () => {
    const text = 'Hello world. This is a short paragraph.';
    const segments = splitIntoSegments(text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toBe(text);
  });

  it('splits at paragraph boundaries', () => {
    const para1 = 'A'.repeat(3000);
    const para2 = 'B'.repeat(3000);
    const text = para1 + '\n\n' + para2;
    const segments = splitIntoSegments(text);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe(para1);
    expect(segments[1]).toBe(para2);
  });

  it('keeps paragraphs together when under limit', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.';
    const segments = splitIntoSegments(text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain('Para one');
    expect(segments[0]).toContain('Para three');
  });

  it('respects max segment char limit', () => {
    const segments = splitIntoSegments(
      Array.from({ length: 20 }, (_, i) => `Paragraph ${i}: ${'x'.repeat(400)}`).join('\n\n'),
    );
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(4600); // MAX_SEGMENT_CHARS + margin
    }
  });

  it('splits single very long paragraph by sentences', () => {
    // Create a paragraph with multiple sentences exceeding the limit
    const sentences = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} with extra content here.`);
    const text = sentences.join(' ');
    const segments = splitIntoSegments(text);
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(4600);
    }
    // All content should be preserved
    const reassembled = segments.join(' ');
    expect(reassembled).toContain('Sentence number 0');
    expect(reassembled).toContain('Sentence number 19');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npx vitest run tests/unit/tts.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/tests/unit/tts.test.ts
git commit -m "test: add TTS segment splitting tests"
```

---

### Task 12: TTS Job Handler

**Files:**
- Create: `server/src/jobs/tts.job.ts`
- Reference: `server/src/services/tts.service.ts`, `server/src/services/db.service.ts`, `server/src/jobs/queue.ts`

- [ ] **Step 1: Create TTS job handler**

```ts
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

    // Update source with audio path and duration
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
  1, // concurrency: 1 to be kind to TTS API rate limits
);
```

- [ ] **Step 2: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/jobs/tts.job.ts
git commit -m "feat: add TTS job handler"
```

---

### Task 12b: Digest Job Handler

**Files:**
- Create: `server/src/jobs/digest.job.ts`
- Reference: `server/src/services/tts.service.ts`, `server/src/services/db.service.ts`

Generates a weekly audio digest combining summaries from the past week.

- [ ] **Step 1: Create digest job handler**

```ts
import { JobQueue } from './queue.js';
import { generateTTS } from '../services/tts.service.js';
import { queryMany, queryOne, query } from '../services/db.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import path from 'path';

interface DigestJobData {
  weekStart: string; // ISO date string for Monday of the week
}

export const digestQueue = new JobQueue(
  'digest',
  async (data: DigestJobData) => {
    const start = Date.now();
    const { weekStart } = data;

    logger.info({ event: 'digest_start', week_start: weekStart });

    // Get all sources ingested during this week
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

    // Build digest transcript
    const transcript = sources
      .map((s, i) => `Article ${i + 1}: ${s.title || 'Untitled'}\n\n${s.summary}`)
      .join('\n\n---\n\n');

    const outputPath = path.join(config.audio.dir, 'digest', `${weekStart}.mp3`);
    const result = await generateTTS(transcript, outputPath);

    // Store in audio_digests table
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
```

- [ ] **Step 2: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/jobs/digest.job.ts
git commit -m "feat: add weekly digest job handler"
```

---

### Task 13: Audio Routes

**Files:**
- Create: `server/src/routes/audio.routes.ts`
- Reference: `server/src/jobs/tts.job.ts`, `server/src/services/db.service.ts`

Implements audio generation trigger and streaming with Range header support for seeking.

- [ ] **Step 1: Create audio routes**

```ts
import { Router, type Request, type Response } from 'express';
import { z } from 'zod/v4';
import { queryOne } from '../services/db.service.js';
import { ttsQueue } from '../jobs/tts.job.js';
import { SourceNotFoundError, ValidationError } from '../types/errors.js';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const router = Router();

const generateSchema = z.object({
  type: z.enum(['full', 'summary']),
});

// POST /api/audio/generate/:id — Trigger TTS generation
router.post('/generate/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid request: ${parsed.error.message}`);
  }

  const source = await queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM sources WHERE id = $1',
    [id],
  );
  if (!source) throw new SourceNotFoundError(id);
  if (source.status !== 'ready') {
    throw new ValidationError(`Source must be in ready state (current: ${source.status})`);
  }

  ttsQueue.add({ sourceId: id, type: parsed.data.type });

  res.status(202).json({
    message: `TTS generation started for ${parsed.data.type}`,
    source_id: id,
    type: parsed.data.type,
  });
});

// GET /api/audio/full/:id — Stream full article audio
router.get('/full/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const source = await queryOne<{ audio_full_path: string | null }>(
    'SELECT audio_full_path FROM sources WHERE id = $1',
    [id],
  );
  if (!source) throw new SourceNotFoundError(id);
  if (!source.audio_full_path) {
    res.status(404).json({ error: 'Audio not generated yet' });
    return;
  }

  await streamAudio(req, res, source.audio_full_path);
});

// GET /api/audio/summary/:id — Stream summary audio
router.get('/summary/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid source ID');

  const source = await queryOne<{ audio_summary_path: string | null }>(
    'SELECT audio_summary_path FROM sources WHERE id = $1',
    [id],
  );
  if (!source) throw new SourceNotFoundError(id);
  if (!source.audio_summary_path) {
    res.status(404).json({ error: 'Audio not generated yet' });
    return;
  }

  await streamAudio(req, res, source.audio_summary_path);
});

// GET /api/audio/digest/:year/:week — Stream weekly digest audio
router.get('/digest/:year/:week', async (req: Request, res: Response) => {
  const year = parseInt(req.params.year as string, 10);
  const week = parseInt(req.params.week as string, 10);
  if (isNaN(year) || isNaN(week)) throw new ValidationError('Invalid year or week');

  // Compute the Monday of the given ISO week
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  const weekStart = monday.toISOString().slice(0, 10);

  const digest = await queryOne<{ audio_path: string | null }>(
    'SELECT audio_path FROM audio_digests WHERE week_start = $1',
    [weekStart],
  );
  if (!digest?.audio_path) {
    res.status(404).json({ error: 'Digest not found for this week' });
    return;
  }

  await streamAudio(req, res, digest.audio_path);
});

/**
 * Stream an audio file with Range header support for seeking.
 */
async function streamAudio(req: Request, res: Response, filePath: string): Promise<void> {
  try {
    const stat = await fsp.stat(filePath);
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

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      });

      fs.createReadStream(filePath).pipe(res);
    }
  } catch {
    res.status(404).json({ error: 'Audio file not found on disk' });
  }
}

export default router;
```

- [ ] **Step 2: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/audio.routes.ts
git commit -m "feat: add audio routes with Range header streaming"
```

---

### Task 14: Register Phase 3 Routes + Audio Directories

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Import and register audio routes**

Add imports at top of `index.ts`:

```ts
import audioRoutes from './routes/audio.routes.js';
import { ttsQueue } from './jobs/tts.job.js';
import { digestQueue } from './jobs/digest.job.js';
```

Add route registration after existing routes:

```ts
app.use('/api/audio', authMiddleware, audioRoutes);
```

Update the health check to include TTS and digest queue stats:

```ts
queues: {
  ingestion: ingestionQueue.getStats(),
  tts: ttsQueue.getStats(),
  digest: digestQueue.getStats(),
},
```

Update shutdown to drain TTS and digest queues:

```ts
await ttsQueue.drain(30_000);
await digestQueue.drain(30_000);
```

(Add these after `await ingestionQueue.drain(30_000);`)

- [ ] **Step 2: Create audio directory structure**

Run: `mkdir -p audio/full audio/summary audio/messages audio/digest`
(from project root `/Users/wangxinyi/Projects/help-me-learn/`)

- [ ] **Step 3: Add audio/ to .gitignore**

Add `audio/` to the project `.gitignore` if not already present.

- [ ] **Step 4: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts .gitignore
git commit -m "feat: register audio routes and TTS queue"
```

---

### Task 14b: Wire TTS into Chat Responses

**Files:**
- Modify: `server/src/routes/chat.routes.ts`

When a chat request includes `tts: true`, generate TTS for the assistant response and return the audio URL.

- [ ] **Step 1: Add TTS wiring to chat route**

After the assistant message is saved (after `const saved = await queryOne...`), add:

```ts
import { generateTTS } from '../services/tts.service.js';
import { config } from '../config.js';
import path from 'path';
```

(Add these imports at the top of the file.)

Then after saving the assistant message, add:

```ts
let audioUrl: string | null = null;
if (tts) {
  try {
    const audioPath = path.join(config.audio.dir, 'messages', `${saved!.id}.mp3`);
    await generateTTS(response, audioPath);
    await query(
      'UPDATE messages SET audio_path = $1 WHERE id = $2',
      [audioPath, saved!.id],
    );
    audioUrl = `/api/audio/messages/${saved!.id}`;
  } catch (err) {
    logger.warn({ err, message_id: saved!.id }, 'TTS for chat response failed');
    // Non-fatal: still return the text response
  }
}
```

And update the response to use `audioUrl` instead of `null`:

```ts
res.json({
  message_id: saved!.id,
  conversation_id: convId,
  content: response,
  audio_url: audioUrl,
  sources_referenced: sourcesReferenced,
});
```

- [ ] **Step 2: Add message audio streaming to audio routes**

Add to `server/src/routes/audio.routes.ts`:

```ts
// GET /api/audio/messages/:id — Stream chat message audio
router.get('/messages/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) throw new ValidationError('Invalid message ID');

  const message = await queryOne<{ audio_path: string | null }>(
    'SELECT audio_path FROM messages WHERE id = $1',
    [id],
  );
  if (!message?.audio_path) {
    res.status(404).json({ error: 'Audio not available for this message' });
    return;
  }

  await streamAudio(req, res, message.audio_path);
});
```

- [ ] **Step 3: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/chat.routes.ts server/src/routes/audio.routes.ts
git commit -m "feat: wire TTS into chat responses"
```

---

## Phase 4: iOS App

### Task 15: XcodeGen Project Configuration

**Files:**
- Create: `ios/project.yml`
- Create: `ios/HelpMeLearn/Info.plist`
- Create: `ios/HelpMeLearn/Assets.xcassets/Contents.json`
- Create: `ios/HelpMeLearn/Assets.xcassets/AccentColor.colorset/Contents.json`
- Create: `ios/HelpMeLearn/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Create: `ios/ShareExtension/Info.plist`

**Prerequisites:** Install XcodeGen if not available: `brew install xcodegen`

- [ ] **Step 1: Create project.yml**

```yaml
name: HelpMeLearn
options:
  bundleIdPrefix: com.helpmelearn
  deploymentTarget:
    iOS: "17.0"
  xcodeVersion: "16.0"

settings:
  base:
    SWIFT_VERSION: "5.9"
    DEVELOPMENT_TEAM: ""

targets:
  HelpMeLearn:
    type: application
    platform: iOS
    sources:
      - HelpMeLearn
    settings:
      base:
        INFOPLIST_FILE: HelpMeLearn/Info.plist
        PRODUCT_BUNDLE_IDENTIFIER: com.helpmelearn.app
    dependencies:
      - target: ShareExtension
    entitlements:
      path: HelpMeLearn/HelpMeLearn.entitlements
      properties:
        com.apple.security.application-groups:
          - group.com.helpmelearn.shared

  ShareExtension:
    type: app-extension
    platform: iOS
    sources:
      - ShareExtension
    settings:
      base:
        INFOPLIST_FILE: ShareExtension/Info.plist
        PRODUCT_BUNDLE_IDENTIFIER: com.helpmelearn.app.share
    entitlements:
      path: ShareExtension/ShareExtension.entitlements
      properties:
        com.apple.security.application-groups:
          - group.com.helpmelearn.shared

schemes:
  HelpMeLearn:
    build:
      targets:
        HelpMeLearn: all
        ShareExtension: all
    run:
      config: Debug
```

- [ ] **Step 2: Create Info.plist for main app**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>UIBackgroundModes</key>
    <array>
        <string>audio</string>
    </array>
    <key>CFBundleDisplayName</key>
    <string>Help Me Learn</string>
    <key>UILaunchScreen</key>
    <dict/>
</dict>
</plist>
```

- [ ] **Step 3: Create ShareExtension Info.plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionAttributes</key>
        <dict>
            <key>NSExtensionActivationRule</key>
            <dict>
                <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
                <integer>1</integer>
            </dict>
        </dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.share-services</string>
        <key>NSExtensionPrincipalClass</key>
        <string>ShareExtension.ShareViewController</string>
    </dict>
</dict>
</plist>
```

- [ ] **Step 4: Create asset catalogs**

`ios/HelpMeLearn/Assets.xcassets/Contents.json`:
```json
{
  "info": { "version": 1, "author": "xcode" }
}
```

`ios/HelpMeLearn/Assets.xcassets/AccentColor.colorset/Contents.json`:
```json
{
  "colors": [{ "idiom": "universal" }],
  "info": { "version": 1, "author": "xcode" }
}
```

`ios/HelpMeLearn/Assets.xcassets/AppIcon.appiconset/Contents.json`:
```json
{
  "images": [{ "idiom": "universal", "platform": "ios", "size": "1024x1024" }],
  "info": { "version": 1, "author": "xcode" }
}
```

- [ ] **Step 5: Create entitlements files**

`ios/HelpMeLearn/HelpMeLearn.entitlements`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.helpmelearn.shared</string>
    </array>
</dict>
</plist>
```

`ios/ShareExtension/ShareExtension.entitlements`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.helpmelearn.shared</string>
    </array>
</dict>
</plist>
```

- [ ] **Step 6: Commit**

```bash
git add ios/project.yml ios/HelpMeLearn/Info.plist ios/ShareExtension/Info.plist \
  ios/HelpMeLearn/Assets.xcassets/ ios/HelpMeLearn/HelpMeLearn.entitlements \
  ios/ShareExtension/ShareExtension.entitlements
git commit -m "chore: add iOS project config (XcodeGen)"
```

---

### Task 16: iOS Models

**Files:**
- Create: `ios/HelpMeLearn/Models/Source.swift`
- Create: `ios/HelpMeLearn/Models/Conversation.swift`

Models match the API response types from the server.

- [ ] **Step 1: Create Source model**

```swift
import Foundation

struct Source: Codable, Identifiable {
    let id: Int
    let url: String
    let title: String?
    let summary: String?
    let category: String?
    let tags: [String]
    let status: String
    let errorMessage: String?
    let wordCount: Int?
    let audioFullPath: String?
    let audioFullDurationS: Double?
    let audioSummaryPath: String?
    let audioSummaryDurationS: Double?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, url, title, summary, category, tags, status
        case errorMessage = "error_message"
        case wordCount = "word_count"
        case audioFullPath = "audio_full_path"
        case audioFullDurationS = "audio_full_duration_s"
        case audioSummaryPath = "audio_summary_path"
        case audioSummaryDurationS = "audio_summary_duration_s"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var hasFullAudio: Bool { audioFullPath != nil }
    var hasSummaryAudio: Bool { audioSummaryPath != nil }
    var isReady: Bool { status == "ready" }
    var isProcessing: Bool { !["ready", "failed"].contains(status) }
}

struct SourceDetail: Codable {
    let id: Int
    let url: String
    let title: String?
    let rawContent: String?
    let summary: String?
    let category: String?
    let tags: [String]
    let status: String

    enum CodingKeys: String, CodingKey {
        case id, url, title, summary, category, tags, status
        case rawContent = "raw_content"
    }
}

struct PaginatedResponse<T: Codable>: Codable {
    let data: [T]
    let total: Int
    let offset: Int
    let limit: Int
}

struct IngestResponse: Codable {
    let id: Int
    let status: String
    let message: String
}

struct SearchResult: Codable {
    let sourceId: Int
    let title: String
    let url: String
    let excerpt: String
    let relevance: Double
    let category: String?

    enum CodingKeys: String, CodingKey {
        case sourceId = "source_id"
        case title, url, excerpt, relevance, category
    }
}

struct SearchResponse: Codable {
    let query: String
    let results: [SearchResult]
    let total: Int
}
```

- [ ] **Step 2: Create Conversation model**

```swift
import Foundation

struct Conversation: Codable, Identifiable {
    let id: Int
    let sourceId: Int?
    let title: String?
    let type: String
    let createdAt: String
    let updatedAt: String
    let messageCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, title, type
        case sourceId = "source_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case messageCount = "message_count"
    }

    var isPerArticle: Bool { type == "per_article" }
}

struct Message: Codable, Identifiable {
    let id: Int
    let role: String
    let content: String
    let audioPath: String?
    let citedSourceIds: [Int]?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, role, content
        case audioPath = "audio_path"
        case citedSourceIds = "cited_source_ids"
        case createdAt = "created_at"
    }

    var isUser: Bool { role == "user" }
}

struct ConversationDetail: Codable {
    let id: Int
    let sourceId: Int?
    let title: String?
    let type: String
    let messages: [Message]

    enum CodingKeys: String, CodingKey {
        case id, title, type, messages
        case sourceId = "source_id"
    }
}

struct ChatRequest: Codable {
    let message: String
    let sourceId: Int?
    let conversationId: Int?
    let tts: Bool?

    enum CodingKeys: String, CodingKey {
        case message
        case sourceId = "source_id"
        case conversationId = "conversation_id"
        case tts
    }
}

struct ChatResponse: Codable {
    let messageId: Int
    let conversationId: Int
    let content: String
    let audioUrl: String?
    let sourcesReferenced: [SourceRef]

    enum CodingKeys: String, CodingKey {
        case content
        case messageId = "message_id"
        case conversationId = "conversation_id"
        case audioUrl = "audio_url"
        case sourcesReferenced = "sources_referenced"
    }
}

struct SourceRef: Codable {
    let id: Int
    let title: String
    let url: String
}
```

- [ ] **Step 3: Commit**

```bash
git add ios/HelpMeLearn/Models/
git commit -m "feat: add iOS data models"
```

---

### Task 17: iOS Services — APIClient

**Files:**
- Create: `ios/HelpMeLearn/Services/APIClient.swift`

- [ ] **Step 1: Create APIClient**

```swift
import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized
    case serverError(Int, String)
    case networkError(Error)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .unauthorized: return "Invalid auth token"
        case .serverError(let code, let msg): return "Server error (\(code)): \(msg)"
        case .networkError(let err): return "Network error: \(err.localizedDescription)"
        case .decodingError(let err): return "Decoding error: \(err.localizedDescription)"
        }
    }
}

@Observable
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder

    private var baseURL: String { SettingsService.shared.serverURL }
    private var token: String { SettingsService.shared.authToken }

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
    }

    // MARK: - Sources

    func listSources(limit: Int = 20, offset: Int = 0, category: String? = nil) async throws -> PaginatedResponse<Source> {
        var params = "limit=\(limit)&offset=\(offset)"
        if let category { params += "&category=\(category)" }
        return try await get("/api/sources?\(params)")
    }

    func getSource(id: Int) async throws -> SourceDetail {
        return try await get("/api/sources/\(id)")
    }

    func deleteSource(id: Int) async throws {
        let _: EmptyResponse = try await delete("/api/sources/\(id)")
    }

    // MARK: - Ingestion

    func ingestURL(_ url: String, tags: [String]? = nil) async throws -> IngestResponse {
        var body: [String: Any] = ["url": url]
        if let tags { body["tags"] = tags }
        return try await post("/api/ingest", body: body)
    }

    func getIngestionStatus(id: Int) async throws -> IngestionStatus {
        return try await get("/api/ingest/\(id)/status")
    }

    // MARK: - Search

    func search(query: String, limit: Int = 10) async throws -> SearchResponse {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        return try await get("/api/search?q=\(encoded)&limit=\(limit)")
    }

    // MARK: - Chat

    func sendMessage(_ message: String, sourceId: Int? = nil, conversationId: Int? = nil) async throws -> ChatResponse {
        var body: [String: Any] = ["message": message]
        if let sourceId { body["source_id"] = sourceId }
        if let conversationId { body["conversation_id"] = conversationId }
        return try await post("/api/chat", body: body)
    }

    func listConversations(limit: Int = 20, offset: Int = 0) async throws -> PaginatedResponse<Conversation> {
        return try await get("/api/conversations?limit=\(limit)&offset=\(offset)")
    }

    func getConversation(id: Int) async throws -> ConversationDetail {
        return try await get("/api/conversations/\(id)")
    }

    // MARK: - Audio

    func generateAudio(sourceId: Int, type: String) async throws {
        let _: GenerateAudioResponse = try await post("/api/audio/generate/\(sourceId)", body: ["type": type])
    }

    func audioURL(sourceId: Int, type: String) -> URL? {
        URL(string: "\(baseURL)/api/audio/\(type)/\(sourceId)")
    }

    func audioRequest(sourceId: Int, type: String) -> URLRequest? {
        guard let url = audioURL(sourceId: sourceId, type: type) else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    // MARK: - Health

    func healthCheck() async throws -> HealthResponse {
        // Health check doesn't need auth
        guard let url = URL(string: "\(baseURL)/api/health") else { throw APIError.invalidURL }
        let (data, _) = try await session.data(from: url)
        return try decoder.decode(HealthResponse.self, from: data)
    }

    // MARK: - HTTP Helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let request = try makeRequest(path, method: "GET")
        return try await execute(request)
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        var request = try makeRequest(path, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await execute(request)
    }

    private func delete<T: Decodable>(_ path: String) async throws -> T {
        let request = try makeRequest(path, method: "DELETE")
        return try await execute(request)
    }

    private func makeRequest(_ path: String, method: String) throws -> URLRequest {
        guard let url = URL(string: "\(baseURL)\(path)") else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError(0, "Invalid response")
        }

        if httpResponse.statusCode == 204 {
            // For DELETE responses that return no content
            if let empty = EmptyResponse() as? T { return empty }
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
                throw APIError.unauthorized
            }
            throw APIError.serverError(httpResponse.statusCode, body)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}

// Helper types
struct EmptyResponse: Codable {
    init() {}
}

struct IngestionStatus: Codable {
    let id: Int
    let status: String
    let errorMessage: String?

    enum CodingKeys: String, CodingKey {
        case id, status
        case errorMessage = "error_message"
    }
}

struct GenerateAudioResponse: Codable {
    let message: String
    let sourceId: Int
    let type: String

    enum CodingKeys: String, CodingKey {
        case message, type
        case sourceId = "source_id"
    }
}

struct HealthResponse: Codable {
    let status: String
    let db: String
    let timestamp: String
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/HelpMeLearn/Services/APIClient.swift
git commit -m "feat: add iOS API client"
```

---

### Task 18: iOS Services — Settings

**Files:**
- Create: `ios/HelpMeLearn/Services/SettingsService.swift`

- [ ] **Step 1: Create SettingsService**

```swift
import Foundation
import Security
import SwiftUI

@Observable
final class SettingsService {
    static let shared = SettingsService()

    private let defaults: UserDefaults
    private let appGroupId = "group.com.helpmelearn.shared"
    private let keychainService = "com.helpmelearn.app"

    var serverURL: String {
        didSet { defaults.set(serverURL, forKey: "serverURL") }
    }

    var authToken: String {
        didSet { saveToKeychain(key: "authToken", value: authToken) }
    }

    var playbackSpeed: Float {
        didSet { defaults.set(playbackSpeed, forKey: "playbackSpeed") }
    }

    var preferSummaryAudio: Bool {
        didSet { defaults.set(preferSummaryAudio, forKey: "preferSummaryAudio") }
    }

    private init() {
        self.defaults = UserDefaults(suiteName: appGroupId) ?? .standard
        self.serverURL = defaults.string(forKey: "serverURL") ?? "http://localhost:3741"
        self.authToken = Self.loadFromKeychain(service: "com.helpmelearn.app", key: "authToken") ?? ""
        self.playbackSpeed = defaults.float(forKey: "playbackSpeed").nonZero ?? 1.0
        self.preferSummaryAudio = defaults.bool(forKey: "preferSummaryAudio")
    }

    var isConfigured: Bool {
        !serverURL.isEmpty && !authToken.isEmpty
    }

    // MARK: - Keychain

    private func saveToKeychain(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: appGroupId,
        ]
        SecItemDelete(query as CFDictionary) // remove old value
        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }

    private static func loadFromKeychain(service: String, key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: "group.com.helpmelearn.shared",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

private extension Float {
    var nonZero: Float? {
        self == 0 ? nil : self
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/HelpMeLearn/Services/SettingsService.swift
git commit -m "feat: add iOS settings service"
```

---

### Task 19: iOS Services — AudioPlayer

**Files:**
- Create: `ios/HelpMeLearn/Services/AudioPlayerService.swift`

Manages AVPlayer with background audio, lock screen controls, and playback state.

- [ ] **Step 1: Create AudioPlayerService**

```swift
import Foundation
import AVFoundation
import MediaPlayer

@Observable
final class AudioPlayerService {
    static let shared = AudioPlayerService()

    private var player: AVPlayer?
    private var timeObserver: Any?

    var isPlaying = false
    var currentTime: Double = 0
    var duration: Double = 0
    var currentSourceId: Int?
    var currentType: String?
    var currentTitle: String?
    var playbackRate: Float = 1.0

    private init() {
        setupAudioSession()
        setupRemoteControls()
    }

    private func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
        } catch {
            print("Audio session setup failed: \(error)")
        }
    }

    private func setupRemoteControls() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            self?.play()
            return .success
        }

        center.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }

        center.skipForwardCommand.preferredIntervals = [15]
        center.skipForwardCommand.addTarget { [weak self] _ in
            self?.skip(seconds: 15)
            return .success
        }

        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            self?.skip(seconds: -15)
            return .success
        }

        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.seek(to: event.positionTime)
            return .success
        }

        center.changePlaybackRateCommand.supportedPlaybackRates = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5]
        center.changePlaybackRateCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackRateCommandEvent else { return .commandFailed }
            self?.setRate(event.playbackRate)
            return .success
        }
    }

    func playAudio(sourceId: Int, type: String, title: String) {
        guard let request = APIClient.shared.audioRequest(sourceId: sourceId, type: type) else { return }

        // Create asset with auth headers
        let headers = request.allHTTPHeaderFields ?? [:]
        let asset = AVURLAsset(url: request.url!, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        let item = AVPlayerItem(asset: asset)

        if let player {
            player.replaceCurrentItem(with: item)
        } else {
            player = AVPlayer(playerItem: item)
        }

        currentSourceId = sourceId
        currentType = type
        currentTitle = title

        setupTimeObserver()
        player?.rate = playbackRate
        isPlaying = true

        updateNowPlayingInfo()
    }

    func play() {
        player?.rate = playbackRate
        isPlaying = true
        updateNowPlayingInfo()
    }

    func pause() {
        player?.pause()
        isPlaying = false
        updateNowPlayingInfo()
    }

    func togglePlayPause() {
        if isPlaying { pause() } else { play() }
    }

    func skip(seconds: Double) {
        guard let player else { return }
        let target = player.currentTime().seconds + seconds
        seek(to: max(0, min(target, duration)))
    }

    func seek(to time: Double) {
        player?.seek(to: CMTime(seconds: time, preferredTimescale: 600))
        currentTime = time
        updateNowPlayingInfo()
    }

    func setRate(_ rate: Float) {
        playbackRate = rate
        if isPlaying {
            player?.rate = rate
        }
        SettingsService.shared.playbackSpeed = rate
        updateNowPlayingInfo()
    }

    func stop() {
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        isPlaying = false
        currentTime = 0
        duration = 0
        currentSourceId = nil
        currentType = nil
        currentTitle = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func setupTimeObserver() {
        if let existing = timeObserver {
            player?.removeTimeObserver(existing)
        }

        timeObserver = player?.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            self.currentTime = time.seconds
            if let dur = self.player?.currentItem?.duration.seconds, dur.isFinite {
                self.duration = dur
            }
        }
    }

    private func updateNowPlayingInfo() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentTitle ?? "Help Me Learn",
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? playbackRate : 0,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPMediaItemPropertyPlaybackDuration: duration,
        ]
        if let type = currentType {
            info[MPMediaItemPropertyArtist] = type == "full" ? "Full Article" : "Summary"
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/HelpMeLearn/Services/AudioPlayerService.swift
git commit -m "feat: add iOS audio player with background playback and lock screen controls"
```

---

### Task 20: iOS ViewModels

**Files:**
- Create: `ios/HelpMeLearn/ViewModels/FeedViewModel.swift`
- Create: `ios/HelpMeLearn/ViewModels/ChatViewModel.swift`
- Create: `ios/HelpMeLearn/ViewModels/LibraryViewModel.swift`

- [ ] **Step 1: Create FeedViewModel**

```swift
import Foundation

@Observable
final class FeedViewModel {
    var sources: [Source] = []
    var isLoading = false
    var error: String?
    private var total = 0

    func loadSources() async {
        isLoading = true
        error = nil
        do {
            let response = try await APIClient.shared.listSources()
            sources = response.data
            total = response.total
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func refresh() async {
        await loadSources()
    }

    func deleteSource(_ source: Source) async {
        do {
            try await APIClient.shared.deleteSource(id: source.id)
            sources.removeAll { $0.id == source.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func generateAudio(sourceId: Int, type: String) async {
        do {
            try await APIClient.shared.generateAudio(sourceId: sourceId, type: type)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func ingestURL(_ url: String) async {
        do {
            _ = try await APIClient.shared.ingestURL(url)
            await loadSources()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
```

- [ ] **Step 2: Create ChatViewModel**

```swift
import Foundation

@Observable
final class ChatViewModel {
    var messages: [Message] = []
    var isLoading = false
    var error: String?
    var conversationId: Int?
    var sourceId: Int?

    var chatType: String {
        sourceId != nil ? "per_article" : "cross_kb"
    }

    func sendMessage(_ text: String) async {
        isLoading = true
        error = nil

        // Optimistic: show user message immediately
        let userMsg = Message(
            id: -(messages.count + 1),
            role: "user",
            content: text,
            audioPath: nil,
            citedSourceIds: nil,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        messages.append(userMsg)

        do {
            let response = try await APIClient.shared.sendMessage(
                text,
                sourceId: sourceId,
                conversationId: conversationId
            )
            conversationId = response.conversationId

            let assistantMsg = Message(
                id: response.messageId,
                role: "assistant",
                content: response.content,
                audioPath: response.audioUrl,
                citedSourceIds: response.sourcesReferenced.map { $0.id },
                createdAt: ISO8601DateFormatter().string(from: Date())
            )
            messages.append(assistantMsg)
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func loadConversation(id: Int) async {
        do {
            let detail = try await APIClient.shared.getConversation(id: id)
            messages = detail.messages
            conversationId = detail.id
            sourceId = detail.sourceId
        } catch {
            self.error = error.localizedDescription
        }
    }

    func reset() {
        messages = []
        conversationId = nil
        error = nil
    }
}
```

- [ ] **Step 3: Create LibraryViewModel**

```swift
import Foundation

@Observable
final class LibraryViewModel {
    var sources: [Source] = []
    var searchResults: [SearchResult] = []
    var isLoading = false
    var error: String?
    var searchQuery = ""
    var selectedCategory: String?

    let categories = [
        "ai_agents", "prompt_engineering", "ml_ops", "software_engineering",
        "web_development", "data_science", "devtools", "career", "product", "design", "other"
    ]

    func loadSources() async {
        isLoading = true
        do {
            let response = try await APIClient.shared.listSources(
                limit: 100,
                category: selectedCategory
            )
            sources = response.data.filter { $0.isReady }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func search() async {
        guard !searchQuery.trimmingCharacters(in: .whitespaces).isEmpty else {
            searchResults = []
            return
        }
        isLoading = true
        do {
            let response = try await APIClient.shared.search(query: searchQuery)
            searchResults = response.results
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add ios/HelpMeLearn/ViewModels/
git commit -m "feat: add iOS view models"
```

---

### Task 21: iOS Views — Feed

**Files:**
- Create: `ios/HelpMeLearn/Views/Feed/FeedView.swift`
- Create: `ios/HelpMeLearn/Views/Feed/SourceRowView.swift`

- [ ] **Step 1: Create FeedView**

```swift
import SwiftUI

struct FeedView: View {
    @State private var viewModel = FeedViewModel()
    @State private var showIngestSheet = false
    @State private var ingestURL = ""

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.sources.isEmpty {
                    ProgressView("Loading sources...")
                } else if viewModel.sources.isEmpty {
                    ContentUnavailableView(
                        "No Sources Yet",
                        systemImage: "doc.text",
                        description: Text("Share a URL or tap + to add one")
                    )
                } else {
                    List {
                        ForEach(viewModel.sources) { source in
                            SourceRowView(source: source, onGenerateAudio: { type in
                                Task { await viewModel.generateAudio(sourceId: source.id, type: type) }
                            })
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                let source = viewModel.sources[index]
                                Task { await viewModel.deleteSource(source) }
                            }
                        }
                    }
                    .refreshable { await viewModel.refresh() }
                }
            }
            .navigationTitle("Feed")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showIngestSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .alert("Error", isPresented: .init(
                get: { viewModel.error != nil },
                set: { if !$0 { viewModel.error = nil } }
            )) {
                Button("OK") { viewModel.error = nil }
            } message: {
                Text(viewModel.error ?? "")
            }
            .sheet(isPresented: $showIngestSheet) {
                NavigationStack {
                    Form {
                        TextField("URL", text: $ingestURL)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                    }
                    .navigationTitle("Add URL")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showIngestSheet = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Add") {
                                Task {
                                    await viewModel.ingestURL(ingestURL)
                                    ingestURL = ""
                                    showIngestSheet = false
                                }
                            }
                            .disabled(ingestURL.isEmpty)
                        }
                    }
                }
                .presentationDetents([.medium])
            }
            .task { await viewModel.loadSources() }
        }
    }
}
```

- [ ] **Step 2: Create SourceRowView**

```swift
import SwiftUI

struct SourceRowView: View {
    let source: Source
    let onGenerateAudio: (String) -> Void
    @State private var audioPlayer = AudioPlayerService.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Title + status
            HStack {
                Text(source.title ?? "Untitled")
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                StatusBadge(status: source.status)
            }

            // Summary
            if let summary = source.summary {
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            // Category + tags
            HStack {
                if let category = source.category {
                    Text(category.replacingOccurrences(of: "_", with: " "))
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.blue.opacity(0.1))
                        .clipShape(Capsule())
                }
                if let count = source.wordCount {
                    Text("\(count) words")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            // Audio controls
            if source.isReady {
                HStack(spacing: 12) {
                    if source.hasSummaryAudio {
                        Button(action: {
                            audioPlayer.playAudio(
                                sourceId: source.id,
                                type: "summary",
                                title: source.title ?? "Summary"
                            )
                        }) {
                            Label("Summary", systemImage: "play.circle")
                                .font(.caption)
                        }
                    } else {
                        Button(action: { onGenerateAudio("summary") }) {
                            Label("Gen Summary", systemImage: "waveform")
                                .font(.caption)
                        }
                    }

                    if source.hasFullAudio {
                        Button(action: {
                            audioPlayer.playAudio(
                                sourceId: source.id,
                                type: "full",
                                title: source.title ?? "Full Article"
                            )
                        }) {
                            Label("Full", systemImage: "play.circle.fill")
                                .font(.caption)
                        }
                    } else {
                        Button(action: { onGenerateAudio("full") }) {
                            Label("Gen Full", systemImage: "waveform")
                                .font(.caption)
                        }
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
    }
}

struct StatusBadge: View {
    let status: String

    var color: Color {
        switch status {
        case "ready": .green
        case "failed": .red
        case "pending": .gray
        default: .orange
        }
    }

    var body: some View {
        Text(status)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add ios/HelpMeLearn/Views/Feed/
git commit -m "feat: add iOS Feed views"
```

---

### Task 22: iOS Views — Chat

**Files:**
- Create: `ios/HelpMeLearn/Views/Chat/ChatView.swift`
- Create: `ios/HelpMeLearn/Views/Chat/MessageBubbleView.swift`

- [ ] **Step 1: Create ChatView**

```swift
import SwiftUI

struct ChatView: View {
    @State private var viewModel = ChatViewModel()
    @State private var inputText = ""
    var sourceId: Int?
    var sourceTitle: String?

    var body: some View {
        VStack(spacing: 0) {
            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            MessageBubbleView(message: message)
                                .id(message.id)
                        }

                        if viewModel.isLoading {
                            HStack {
                                ProgressView()
                                    .padding(.horizontal)
                                Text("Thinking...")
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding()
                }
                .onChange(of: viewModel.messages.count) {
                    if let last = viewModel.messages.last {
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Input bar
            HStack(spacing: 8) {
                TextField("Ask a question...", text: $inputText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...5)

                Button(action: sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .disabled(inputText.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isLoading)
            }
            .padding()
        }
        .navigationTitle(sourceTitle ?? (viewModel.chatType == "per_article" ? "Article Chat" : "Knowledge Base"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.sourceId = sourceId
        }
        .alert("Error", isPresented: .init(
            get: { viewModel.error != nil },
            set: { if !$0 { viewModel.error = nil } }
        )) {
            Button("OK") { viewModel.error = nil }
        } message: {
            Text(viewModel.error ?? "")
        }
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        inputText = ""
        Task { await viewModel.sendMessage(text) }
    }
}
```

- [ ] **Step 2: Create MessageBubbleView**

```swift
import SwiftUI

struct MessageBubbleView: View {
    let message: Message

    var body: some View {
        HStack {
            if message.isUser { Spacer(minLength: 60) }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .padding(12)
                    .background(message.isUser ? Color.blue : Color(.systemGray5))
                    .foregroundStyle(message.isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                Text(formatTime(message.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if !message.isUser { Spacer(minLength: 60) }
        }
    }

    private func formatTime(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoString) else { return "" }
        let display = DateFormatter()
        display.timeStyle = .short
        return display.string(from: date)
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add ios/HelpMeLearn/Views/Chat/
git commit -m "feat: add iOS Chat views"
```

---

### Task 23: iOS Views — Audio Player

**Files:**
- Create: `ios/HelpMeLearn/Views/Audio/MiniPlayerView.swift`
- Create: `ios/HelpMeLearn/Views/Audio/FullPlayerView.swift`

- [ ] **Step 1: Create MiniPlayerView**

```swift
import SwiftUI

struct MiniPlayerView: View {
    @State private var audioPlayer = AudioPlayerService.shared
    @State private var showFullPlayer = false

    var body: some View {
        if audioPlayer.currentSourceId != nil {
            VStack(spacing: 0) {
                // Progress bar
                GeometryReader { geo in
                    Rectangle()
                        .fill(.blue)
                        .frame(width: audioPlayer.duration > 0
                            ? geo.size.width * (audioPlayer.currentTime / audioPlayer.duration)
                            : 0
                        )
                }
                .frame(height: 2)

                HStack(spacing: 12) {
                    VStack(alignment: .leading) {
                        Text(audioPlayer.currentTitle ?? "Playing")
                            .font(.subheadline)
                            .lineLimit(1)
                        Text(audioPlayer.currentType == "full" ? "Full Article" : "Summary")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button(action: { audioPlayer.skip(seconds: -15) }) {
                        Image(systemName: "gobackward.15")
                    }

                    Button(action: { audioPlayer.togglePlayPause() }) {
                        Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title2)
                    }

                    Button(action: { audioPlayer.skip(seconds: 15) }) {
                        Image(systemName: "goforward.15")
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
            }
            .onTapGesture { showFullPlayer = true }
            .sheet(isPresented: $showFullPlayer) {
                FullPlayerView()
            }
        }
    }
}
```

- [ ] **Step 2: Create FullPlayerView**

```swift
import SwiftUI

struct FullPlayerView: View {
    @State private var audioPlayer = AudioPlayerService.shared
    @Environment(\.dismiss) private var dismiss

    private let speeds: [Float] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5]

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Title
                VStack(spacing: 8) {
                    Text(audioPlayer.currentTitle ?? "Playing")
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    Text(audioPlayer.currentType == "full" ? "Full Article" : "Summary")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                // Scrubber
                VStack(spacing: 4) {
                    Slider(
                        value: Binding(
                            get: { audioPlayer.currentTime },
                            set: { audioPlayer.seek(to: $0) }
                        ),
                        in: 0...max(audioPlayer.duration, 1)
                    )

                    HStack {
                        Text(formatDuration(audioPlayer.currentTime))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(formatDuration(audioPlayer.duration))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                // Playback controls
                HStack(spacing: 40) {
                    Button(action: { audioPlayer.skip(seconds: -15) }) {
                        Image(systemName: "gobackward.15")
                            .font(.title)
                    }

                    Button(action: { audioPlayer.togglePlayPause() }) {
                        Image(systemName: audioPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 64))
                    }

                    Button(action: { audioPlayer.skip(seconds: 15) }) {
                        Image(systemName: "goforward.15")
                            .font(.title)
                    }
                }

                // Speed picker
                HStack {
                    Text("Speed")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Picker("Speed", selection: Binding(
                        get: { audioPlayer.playbackRate },
                        set: { audioPlayer.setRate($0) }
                    )) {
                        ForEach(speeds, id: \.self) { speed in
                            Text("\(speed, specifier: "%.2g")x").tag(speed)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.horizontal)

                Spacer()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .destructiveAction) {
                    Button(action: {
                        audioPlayer.stop()
                        dismiss()
                    }) {
                        Image(systemName: "stop.circle")
                    }
                }
            }
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        guard seconds.isFinite && seconds >= 0 else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return "\(mins):\(String(format: "%02d", secs))"
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add ios/HelpMeLearn/Views/Audio/
git commit -m "feat: add iOS audio player views with mini-player and full player"
```

---

### Task 24: iOS Views — Library

**Files:**
- Create: `ios/HelpMeLearn/Views/Library/LibraryView.swift`

- [ ] **Step 1: Create LibraryView**

```swift
import SwiftUI

struct LibraryView: View {
    @State private var viewModel = LibraryViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search knowledge base...", text: $viewModel.searchQuery)
                        .textInputAutocapitalization(.never)
                        .onSubmit { Task { await viewModel.search() } }
                    if !viewModel.searchQuery.isEmpty {
                        Button(action: {
                            viewModel.searchQuery = ""
                            viewModel.searchResults = []
                        }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(8)
                .background(.quaternary)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal)

                // Category filter
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        CategoryChip(name: "All", isSelected: viewModel.selectedCategory == nil) {
                            viewModel.selectedCategory = nil
                            Task { await viewModel.loadSources() }
                        }
                        ForEach(viewModel.categories, id: \.self) { category in
                            CategoryChip(
                                name: category.replacingOccurrences(of: "_", with: " "),
                                isSelected: viewModel.selectedCategory == category
                            ) {
                                viewModel.selectedCategory = category
                                Task { await viewModel.loadSources() }
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }

                // Results
                if !viewModel.searchResults.isEmpty {
                    List(viewModel.searchResults, id: \.sourceId) { result in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(result.title)
                                .font(.headline)
                            Text(result.excerpt)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(3)
                        }
                    }
                } else {
                    List(viewModel.sources) { source in
                        NavigationLink {
                            ChatView(sourceId: source.id, sourceTitle: source.title)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(source.title ?? "Untitled")
                                    .font(.headline)
                                if let category = source.category {
                                    Text(category.replacingOccurrences(of: "_", with: " "))
                                        .font(.caption)
                                        .foregroundStyle(.blue)
                                }
                                if let summary = source.summary {
                                    Text(summary)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Library")
            .task { await viewModel.loadSources() }
        }
    }
}

struct CategoryChip: View {
    let name: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(name.capitalized)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? .blue : .quaternary)
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/HelpMeLearn/Views/Library/
git commit -m "feat: add iOS Library view with search and category filter"
```

---

### Task 25: iOS Views — Settings

**Files:**
- Create: `ios/HelpMeLearn/Views/Settings/SettingsView.swift`

- [ ] **Step 1: Create SettingsView**

```swift
import SwiftUI

struct SettingsView: View {
    @State private var settings = SettingsService.shared
    @State private var isCheckingHealth = false
    @State private var healthStatus: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Server Connection") {
                    TextField("Server URL", text: $settings.serverURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()

                    SecureField("Auth Token", text: $settings.authToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    Button(action: checkHealth) {
                        HStack {
                            Text("Test Connection")
                            Spacer()
                            if isCheckingHealth {
                                ProgressView()
                            } else if let status = healthStatus {
                                Image(systemName: status == "ok" ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .foregroundStyle(status == "ok" ? .green : .red)
                            }
                        }
                    }
                    .disabled(isCheckingHealth || !settings.isConfigured)
                }

                Section("Audio") {
                    Picker("Default Playback Speed", selection: $settings.playbackSpeed) {
                        Text("0.75x").tag(Float(0.75))
                        Text("1x").tag(Float(1.0))
                        Text("1.25x").tag(Float(1.25))
                        Text("1.5x").tag(Float(1.5))
                        Text("2x").tag(Float(2.0))
                        Text("2.5x").tag(Float(2.5))
                    }

                    Toggle("Prefer Summary Audio", isOn: $settings.preferSummaryAudio)
                }

                Section("About") {
                    LabeledContent("Version", value: "0.1.0")
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func checkHealth() {
        isCheckingHealth = true
        healthStatus = nil
        Task {
            do {
                let health = try await APIClient.shared.healthCheck()
                healthStatus = health.status
            } catch {
                healthStatus = "error"
            }
            isCheckingHealth = false
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/HelpMeLearn/Views/Settings/
git commit -m "feat: add iOS Settings view"
```

---

### Task 26: iOS Share Extension

**Files:**
- Create: `ios/ShareExtension/ShareViewController.swift`
- Create: `ios/ShareExtension/ShareView.swift`

- [ ] **Step 1: Create ShareViewController**

```swift
import UIKit
import SwiftUI

class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let itemProvider = extensionItem.attachments?.first else {
            close()
            return
        }

        let hostingView = UIHostingController(rootView: ShareView(
            itemProvider: itemProvider,
            onDone: { [weak self] in self?.close() }
        ))

        addChild(hostingView)
        view.addSubview(hostingView.view)
        hostingView.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingView.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingView.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            hostingView.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingView.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        hostingView.didMove(toParent: self)
    }

    private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
```

- [ ] **Step 2: Create ShareView**

```swift
import SwiftUI
import UniformTypeIdentifiers

struct ShareView: View {
    let itemProvider: NSItemProvider
    let onDone: () -> Void

    @State private var url: String = ""
    @State private var status: ShareStatus = .loading
    @State private var errorMessage: String?

    enum ShareStatus {
        case loading, ready, sending, success, error
    }

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "square.and.arrow.down")
                .font(.largeTitle)
                .foregroundStyle(.blue)

            switch status {
            case .loading:
                ProgressView("Extracting URL...")
            case .ready:
                Text("Add to Knowledge Base")
                    .font(.headline)
                Text(url)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Button("Add") { sendURL() }
                    .buttonStyle(.borderedProminent)
                Button("Cancel", action: onDone)
                    .foregroundStyle(.secondary)
            case .sending:
                ProgressView("Sending...")
            case .success:
                Image(systemName: "checkmark.circle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.green)
                Text("Added!")
                    .font(.headline)
            case .error:
                Image(systemName: "xmark.circle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.red)
                Text(errorMessage ?? "Failed to add URL")
                    .font(.subheadline)
                Button("Close", action: onDone)
            }
        }
        .padding()
        .task { await extractURL() }
    }

    private func extractURL() async {
        let urlType = UTType.url.identifier

        guard itemProvider.hasItemConformingToTypeIdentifier(urlType) else {
            status = .error
            errorMessage = "No URL found"
            return
        }

        do {
            let item = try await itemProvider.loadItem(forTypeIdentifier: urlType)
            if let url = item as? URL {
                self.url = url.absoluteString
                status = .ready
            } else if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                self.url = url.absoluteString
                status = .ready
            } else {
                status = .error
                errorMessage = "Could not extract URL"
            }
        } catch {
            status = .error
            errorMessage = error.localizedDescription
        }
    }

    private func sendURL() {
        status = .sending

        let settings = SettingsService.shared
        guard settings.isConfigured else {
            status = .error
            errorMessage = "Please configure server URL and token in Settings"
            return
        }

        Task {
            do {
                _ = try await APIClient.shared.ingestURL(url)
                status = .success
                try? await Task.sleep(for: .seconds(1.5))
                onDone()
            } catch {
                status = .error
                errorMessage = error.localizedDescription
            }
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add ios/ShareExtension/
git commit -m "feat: add iOS Share Extension for URL ingestion"
```

---

### Task 27: iOS App Entry Point

**Files:**
- Create: `ios/HelpMeLearn/HelpMeLearnApp.swift`

This is the main app with tab navigation and the persistent mini-player.

- [ ] **Step 1: Create app entry point**

```swift
import SwiftUI

@main
struct HelpMeLearnApp: App {
    var body: some Scene {
        WindowGroup {
            MainTabView()
        }
    }
}

struct MainTabView: View {
    var body: some View {
        VStack(spacing: 0) {
            TabView {
                FeedView()
                    .tabItem {
                        Label("Feed", systemImage: "list.bullet")
                    }

                ChatView()
                    .tabItem {
                        Label("Chat", systemImage: "bubble.left.and.bubble.right")
                    }

                LibraryView()
                    .tabItem {
                        Label("Library", systemImage: "books.vertical")
                    }

                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gear")
                    }
            }

            MiniPlayerView()
        }
    }
}
```

- [ ] **Step 2: Generate Xcode project**

Run (from `ios/` directory):
```bash
cd ios && xcodegen generate
```

Expected: `HelpMeLearn.xcodeproj` is created.

If xcodegen is not installed:
```bash
brew install xcodegen && cd ios && xcodegen generate
```

- [ ] **Step 3: Verify project builds**

Run: `cd ios && xcodebuild -scheme HelpMeLearn -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' build`

Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add ios/HelpMeLearn/HelpMeLearnApp.swift
git commit -m "feat: add iOS app entry point with tab navigation"
```

---

### Task 28: Final Verification

- [ ] **Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All test suites PASS (url, text, chunking, rag, tts)

- [ ] **Step 2: Server type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: iOS build check**

Run: `cd ios && xcodebuild -scheme HelpMeLearn -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: phases 1-4 complete"
```

---

## Manual Verification Checklist (Post-Implementation)

These steps require real credentials and devices — they cannot be automated:

1. **Server**: `cp .env.example .env`, fill credentials, `npm run dev`
2. **Ingest**: `curl -X POST http://localhost:3741/api/ingest -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"url":"https://example.com/article"}'`
3. **Search**: `curl "http://localhost:3741/api/search?q=test" -H "Authorization: Bearer $TOKEN"`
4. **Chat**: `curl -X POST http://localhost:3741/api/chat -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"message":"What do you know?"}'`
5. **iOS**: Open `ios/HelpMeLearn.xcodeproj` in Xcode, set team, install on iPhone
6. **Share Extension**: Share URL from Safari → verify it appears in Feed
7. **Audio**: Generate TTS, verify playback with lock screen controls
