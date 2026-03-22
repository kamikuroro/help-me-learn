# Help-Me-Learn: Product & Engineering Plan

## Context

Building a personal content library + audio-first knowledge base. The user experiences eye strain from excessive reading and wants to shift to an audio-first workflow: drop URLs, listen to content, chat with Claude about it by voice, and export knowledge for AI agents. No existing product covers this full loop — it's a genuine product gap.

**Constraints:** $200/mo Claude Code Max (Opus), $200/mo Cursor, iPhone + MacBook Pro, Typeless for voice input on both platforms.

---

## 1. Product Requirements

### Core Concept
Each **source** (ingested URL) is a first-class object supporting:
- **Store** — full original content preserved as-is
- **Listen (full)** — TTS of the entire article
- **Listen (summary)** — TTS of a Claude-generated summary
- **Chat (per-article)** — live conversation with full article as context
- **Chat (cross-KB)** — semantic search across all stored knowledge
- **Export** — convert to agent-friendly formats (skill.md, CLAUDE.md, .cursorrules, MCP)

### Use Cases

| ID | Use Case | Input | Output |
|----|----------|-------|--------|
| UC-1 | URL Ingestion | URL (article/paper) | Stored content + summary + chunks + embeddings |
| UC-2 | Full Article Audio | Tap play on a source | TTS of full original content |
| UC-3 | Summary Audio | Tap play summary | TTS of Claude-generated summary (2-5 min) |
| UC-4 | Per-Article Chat | Message + source_id | Claude response with full article as context |
| UC-5 | Cross-KB Chat | Message (no source) | RAG response with citations from all sources |
| UC-6 | Agent Export | Topic + artifact type | CLAUDE.md / .cursorrules / skill.md / MCP config |
| UC-7 | Mobile Portal | iOS app | Share Sheet, Feed, Chat, Audio Player, Library |
| UC-8 | Voice I/O | Typeless keyboard + ElevenLabs | Speech-in, audio-out on both platforms |

### Key Product Decisions
- TTS is **on-demand** (user triggers it), not auto-generated on ingestion — controls ElevenLabs costs
- Summary is auto-generated on ingestion (text is cheap, audio is not)
- Duplicate URL detection: re-submitting same URL updates, doesn't duplicate
- Audio generation: summary first (short, cheap), full article on explicit request

---

## 2. System Architecture

```
iPhone (SwiftUI)                MacBook Pro                         Cloud
  │                                │                                  │
  ├─ Share Extension ─────────→ Express Server (:3741) ──→ Jina Reader
  │   (URL from Safari/etc)        │                       (extract)
  │                                ├──→ Claude CLI          (summarize)
  ├─ Chat UI ─────────────────→    ├──→ db9.ai              (store/RAG)
  │   (Typeless voice keyboard)    ├──→ ElevenLabs          (TTS)
  │                                ├──→ Local filesystem    (audio files)
  ├─ Audio Player ◀───────────     │
  │   (background playback)        │
  │                                │
  └── Connected via Tailscale VPN (private mesh, no public exposure)
```

### Data Flow: Ingestion
```
URL submitted → Create source (status: pending)
  → Jina Reader fetches full content (status: extracting)
  → Claude summarizes + categorizes + tags (status: summarizing)
  → Split into chunks, respect heading/paragraph boundaries (status: chunking)
  → Generate embeddings via db9 embedding() (status: embedding)
  → Done (status: ready)
```

### Data Flow: Cross-KB Chat (RAG)
```
User question → Embed query via embedding()
  → Semantic search: top 20 chunks by cosine distance
  → Full-text search: top 20 chunks by ts_rank
  → Reciprocal Rank Fusion → top 10 merged results
  → Expand each chunk with neighbors for context
  → Claude answers with citations
  → Optional TTS of response
```

### Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| LLM | `claude -p` CLI | Uses existing $200/mo Max sub, zero extra cost |
| Database | db9.ai | Built-in embedding(), CHUNK_TEXT(), vector search, PostgreSQL-compatible |
| Audio storage | **Local Mac filesystem** | No 10MB fs9 limit, direct serving, simpler |
| TTS | ElevenLabs (primary), Fish Audio (fallback) | Best voice quality |
| Content extraction | Jina Reader (`r.jina.ai/{url}`) | Simple, handles most articles/papers |
| Phone↔Mac | Tailscale | Private VPN, stable hostnames, free |
| iOS | Native SwiftUI | Best Share Sheet + background audio integration |
| Backend | Node.js/TypeScript Express | db9 SDK is TypeScript-native, Claude CLI is easy to spawn |
| Job queue | In-process (no Redis) | Single user, crash recovery via DB status field |
| Search | Hybrid semantic + keyword + RRF | Better recall than either alone |
| Auth | Static bearer token | Single user on Tailscale, sufficient |

---

## 3. Database Schema (db9.ai)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS embedding;
CREATE EXTENSION IF NOT EXISTS fs9;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Sources: each ingested URL
CREATE TABLE sources (
    id                    SERIAL PRIMARY KEY,
    url                   TEXT NOT NULL,
    url_normalized        TEXT NOT NULL UNIQUE,
    title                 TEXT,
    raw_content           TEXT,
    summary               TEXT,
    category              TEXT,
    tags                  TEXT[] DEFAULT '{}',
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','extracting','summarizing',
                                            'chunking','embedding','ready','failed')),
    error_message         TEXT,
    word_count            INTEGER,
    audio_full_path       TEXT,
    audio_full_duration_s REAL,
    audio_summary_path    TEXT,
    audio_summary_duration_s REAL,
    content_hash          TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chunks: semantic chunks for RAG
CREATE TABLE chunks (
    id          SERIAL PRIMARY KEY,
    source_id   INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    token_count INTEGER,
    embedding   vector(1024),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_id, chunk_index)
);
CREATE INDEX idx_chunks_embedding ON chunks
    USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=200);

-- Conversations & Messages
CREATE TABLE conversations (
    id         SERIAL PRIMARY KEY,
    source_id  INTEGER REFERENCES sources(id),  -- NULL for cross-KB
    title      TEXT,
    type       TEXT NOT NULL DEFAULT 'per_article'
               CHECK (type IN ('per_article', 'cross_kb')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    audio_path      TEXT,
    cited_source_ids INTEGER[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly audio digests
CREATE TABLE audio_digests (
    id         SERIAL PRIMARY KEY,
    week_start DATE NOT NULL UNIQUE,
    source_ids INTEGER[] NOT NULL,
    transcript TEXT,
    audio_path TEXT,
    duration_s REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent artifacts
CREATE TABLE agent_artifacts (
    id           SERIAL PRIMARY KEY,
    type         TEXT NOT NULL CHECK (type IN ('claude_md','cursorrules','skill_md','mcp_config')),
    topic        TEXT NOT NULL,
    content      TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    version      INTEGER NOT NULL DEFAULT 1,
    source_ids   INTEGER[],
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. API Design

Base: `http://<tailscale-hostname>:3741/api`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ingest` | Submit URL → async ingestion |
| `GET` | `/api/ingest/:id/status` | Poll ingestion progress |
| `GET` | `/api/sources` | List sources (paginated, filterable) |
| `GET` | `/api/sources/:id` | Full source with content |
| `DELETE` | `/api/sources/:id` | Remove source + chunks |
| `POST` | `/api/sources/:id/retry` | Re-trigger failed ingestion |
| `POST` | `/api/chat` | Send message (per-article or cross-KB) |
| `GET` | `/api/conversations` | List conversations |
| `GET` | `/api/conversations/:id` | Conversation with messages |
| `GET` | `/api/search?q=` | Semantic + keyword hybrid search |
| `POST` | `/api/audio/generate/:id` | Generate TTS (type=full\|summary) |
| `GET` | `/api/audio/full/:id` | Stream full article audio |
| `GET` | `/api/audio/summary/:id` | Stream summary audio |
| `GET` | `/api/audio/digest/:year/:week` | Stream weekly digest |
| `POST` | `/api/artifacts/generate` | Generate agent doc from KB |
| `GET` | `/api/artifacts` | List artifacts |
| `GET` | `/api/artifacts/:id` | Get artifact content |
| `GET` | `/api/health` | Server + DB + queue status |

---

## 5. iOS App

### Screens
1. **Feed** — chronological list of sources, play buttons, category badges
2. **Chat** — message bubbles, Typeless voice input, per-article or cross-KB mode
3. **Audio Player** — mini-player (persistent), full player (scrubber, speed 0.75x-2.5x, skip ±15s), background playback with lock screen controls
4. **Library** — browse by category/tag, search
5. **Settings** — Tailscale hostname, auth token, voice preferences
6. **Share Extension** — appears in iOS Share Sheet, sends URL to `/api/ingest`

---

## 6. Project Structure

```
help-me-learn/
├── CLAUDE.md
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts                    # Express bootstrap
│   │   ├── config.ts                   # Typed env config, validated at startup
│   │   ├── routes/
│   │   │   ├── ingest.routes.ts
│   │   │   ├── sources.routes.ts
│   │   │   ├── chat.routes.ts
│   │   │   ├── search.routes.ts
│   │   │   ├── audio.routes.ts
│   │   │   └── artifacts.routes.ts
│   │   ├── services/
│   │   │   ├── db.service.ts           # pg Pool, query helpers
│   │   │   ├── ingestion.service.ts    # Jina fetch + orchestration
│   │   │   ├── chunking.service.ts     # Heading-aware text splitting
│   │   │   ├── claude.service.ts       # CLI wrapper (stdin, timeout, retry)
│   │   │   ├── tts.service.ts          # ElevenLabs + Fish Audio
│   │   │   ├── rag.service.ts          # Semantic search, RRF, context building
│   │   │   └── artifacts.service.ts    # Agent doc generation
│   │   ├── jobs/
│   │   │   ├── queue.ts                # In-process async job queue
│   │   │   ├── ingest.job.ts           # Ingestion pipeline handler
│   │   │   ├── tts.job.ts              # TTS generation handler
│   │   │   └── digest.job.ts           # Weekly digest handler
│   │   ├── middleware/
│   │   │   ├── auth.ts                 # Bearer token check
│   │   │   ├── error-handler.ts        # Global error handler
│   │   │   └── request-logger.ts       # Structured request logging
│   │   ├── types/
│   │   │   ├── db.types.ts             # Generated from db9 schema
│   │   │   ├── api.types.ts            # Request/response DTOs
│   │   │   └── errors.ts               # AppError hierarchy
│   │   └── utils/
│   │       ├── url.ts                  # URL normalization
│   │       ├── text.ts                 # Token counting, splitting
│   │       └── retry.ts               # Exponential backoff helper
│   ├── sql/
│   │   └── schema.sql
│   └── tests/
│       ├── unit/                       # Chunking, URL normalization
│       ├── integration/                # API routes, RAG pipeline
│       └── fixtures/                   # Sample articles
├── ios/
│   └── HelpMeLearn/
│       ├── HelpMeLearn.xcodeproj
│       ├── HelpMeLearn/
│       │   ├── HelpMeLearnApp.swift
│       │   ├── Models/                 # Source, Conversation, Message
│       │   ├── Services/
│       │   │   ├── APIClient.swift      # HTTP client (Tailscale)
│       │   │   ├── AudioPlayerService.swift  # AVPlayer, background audio
│       │   │   └── Settings.swift
│       │   ├── Views/
│       │   │   ├── Feed/
│       │   │   ├── Chat/
│       │   │   ├── Audio/
│       │   │   ├── Library/
│       │   │   └── Settings/
│       │   └── ViewModels/
│       └── ShareExtension/
│           ├── ShareViewController.swift
│           └── ShareView.swift
└── audio/                              # Local audio file storage
    ├── full/                           # Full article audio
    ├── summary/                        # Summary audio
    ├── messages/                       # Chat response audio
    └── digest/                         # Weekly digests
```

---

## 7. Engineering Best Practices

### 7.1 Code Organization
- **Routes are thin**: validate input (zod), call service, format response. Zero business logic in routes.
- **Services are stateless**: pure functions or classes with injected dependencies. Each does one thing.
- **Jobs handle async work**: routes never call slow operations synchronously. All ingestion/TTS happens via the job queue.
- **Types generated from DB**: run `db9 gen types` — don't hand-maintain type definitions for DB rows.

### 7.2 Error Handling
Custom error hierarchy in `types/errors.ts`:
- `AppError` (base) → `SourceNotFoundError` (404), `DuplicateSourceError` (409), `ExternalServiceError` (502), `ValidationError` (400)
- **Jina failures**: retry 3x with exponential backoff (1s, 4s, 16s), then mark source as `failed`
- **Claude CLI failures**: 120s timeout, retry once, then `failed`. Never let a hung process block the queue.
- **ElevenLabs failures**: on 429 check `Retry-After` and reschedule; on 5xx fall back to Fish Audio
- **Global error middleware**: catches unhandled errors, logs full stack, returns sanitized JSON

### 7.3 Claude CLI Rules
- **Always pass content via stdin** (articles can be 50K+ chars, exceeds shell arg limits)
- **Always set 120s timeout** via `child_process.spawn` timeout option
- **Limit to 1-2 concurrent invocations** (shared semaphore across queues)
- **Use `--output-format json`** for structured extraction (summary + category + tags in one call)
- **Capture stderr** for debugging but don't parse it as output
- **Retry once** on failure, then fail permanently

### 7.4 Testing Strategy (high-value, low-maintenance)
Priority order:
1. **Chunking logic** (unit) — pure logic, critical to get right, fast tests
2. **URL normalization** (unit) — edge cases matter for dedup
3. **RAG pipeline** (integration) — test with known articles, verify correct sources retrieved
4. **Ingestion pipeline** (integration) — real URL end-to-end, test failure recovery
5. **API routes** (integration) — valid/invalid inputs, response shapes

**Not tested**: TTS quality (manual), Claude output quality (manual), iOS app (manual via Xcode)

Tools: `vitest`, `msw` for mocking external APIs, db9 branch for isolated test database

### 7.5 Configuration
All config in `src/config.ts` loaded from env vars. Validated at startup — server refuses to start if required vars are missing. `.env.example` committed with explanations.

### 7.6 Logging
`pino` with structured JSON. Log every:
- Ingestion step with timing: `{event: "ingest_step", source_id, step, duration_ms, status}`
- Claude invocation: `{event: "claude_invoke", purpose, input_chars, output_chars, duration_ms}`
- TTS generation: `{event: "tts_generate", source_id, type, provider, chars, duration_ms}`
- API request: `{event: "http_request", method, path, status, duration_ms}`
- Queue status every 5 min: `{event: "queue_status", pending, active}`

### 7.7 Job Queue Design
- Two queues: `ingestionQueue` (concurrency 2), `ttsQueue` (concurrency 1)
- Claude calls limited to 1 concurrent (shared semaphore)
- **Crash recovery**: on startup, scan for sources with status != ready/failed, re-queue them
- **Graceful shutdown**: SIGTERM → stop accepting jobs → wait 30s for active jobs → exit

### 7.8 Security
- Server binds `0.0.0.0:3741`, accessible only via Tailscale
- Static bearer token (`openssl rand -hex 32`) in `.env`, iOS stores in Keychain
- All DB queries use parameterized queries (pg library)
- Content from Jina treated as untrusted for rendering
- API keys never logged, never in error responses

---

## 8. Implementation Phases

### Phase 1: Foundation (Days 1-10)
**Goal**: Mac server that ingests URLs, stores content, generates summaries.

**Steps**:
1. Initialize TypeScript project (`express`, `pg`, `pino`, `dotenv`, `zod`)
2. Install db9 CLI, create database, run schema.sql
3. Implement `db.service.ts` (connection pool, query helpers)
4. Implement `claude.service.ts` (child process wrapper, stdin, timeout)
5. Implement `ingestion.service.ts` (Jina fetch with retry)
6. Implement `chunking.service.ts` (heading-aware splitting, 500-800 tokens)
7. Implement job queue + `ingest.job.ts`
8. Implement routes: `POST /api/ingest`, `GET /api/sources`, `GET /api/ingest/:id/status`
9. Implement middleware: auth, error handler, request logger
10. Write chunking + URL normalization unit tests
11. Ingest 10-15 real articles, manually verify quality

**Exit criteria**: `curl POST /api/ingest` → source reaches `ready` within 60s with full content, summary, category, tags, and searchable chunks.

### Phase 2: Search & Chat (Days 11-20)
**Goal**: Semantic search + per-article chat + cross-KB RAG chat.

**Steps**:
1. Implement `rag.service.ts` (semantic search, keyword search, RRF merge, context expansion)
2. Implement `GET /api/search?q=`
3. Implement per-article chat: `POST /api/chat` with `source_id` (full article as system context)
4. Implement cross-KB chat: `POST /api/chat` without `source_id` (RAG retrieval)
5. Implement conversation persistence (conversations + messages tables)
6. Write RAG integration tests with known-answer queries

**Exit criteria**: Search returns relevant results. Per-article chat maintains multi-turn context. Cross-KB chat cites correct sources.

### Phase 3: Audio Pipeline (Days 21-30)
**Goal**: High-quality TTS for articles, summaries, and chat responses.

**Steps**:
1. Implement `tts.service.ts` (ElevenLabs API, segment splitting at paragraph boundaries, Fish Audio fallback)
2. Audio concatenation via ffmpeg for long articles
3. Implement `POST /api/audio/generate/:id?type=full|summary`
4. Implement audio streaming with Range header support (seek)
5. Implement TTS for chat responses (when `?tts=true`)
6. Implement weekly digest generation via `digest.job.ts`
7. Set up pg_cron for automatic weekly digest

**Exit criteria**: Full article audio plays smoothly. Summary audio is 2-5 min. Audio supports seeking. Weekly digest combines multiple summaries.

### Phase 4: iOS App MVP (Days 31-45)
**Goal**: Native app with Share Sheet, Feed, Chat, Audio Player.

**Steps**:
1. Create Xcode project (SwiftUI), set up Tailscale on iPhone
2. Implement `APIClient.swift` (URLSession, bearer auth, Tailscale hostname)
3. Build Feed view (source list, play buttons, pull-to-refresh)
4. Build Chat view (message bubbles, Typeless keyboard, per-article + cross-KB modes)
5. Build Audio Player (mini-player bar, full player, background playback via AVAudioSession, lock screen controls via MPRemoteCommandCenter)
6. Build Library view (browse by category/tag, search)
7. Build Share Extension (extract URL from share payload, POST to /api/ingest)
8. Build Settings view (server hostname, auth token, voice preferences)
9. Test on physical iPhone via Xcode direct install

**Exit criteria**: Share URL from Safari → appears in Feed. Chat works with voice + audio. Audio plays in background with lock screen controls.

### Phase 5: Agent Artifacts (Days 46-52)
**Goal**: Generate CLAUDE.md, .cursorrules, skill.md from KB knowledge.

**Steps**:
1. Implement `artifacts.service.ts` (RAG retrieval by topic → Claude generates artifact)
2. Artifact-type-specific prompts for each format convention
3. Implement `POST /api/artifacts/generate`, `GET /api/artifacts`
4. Versioning with content hash (increment only if content changed)
5. Test: generate CLAUDE.md from best-practice articles, verify usability

**Exit criteria**: Generated artifacts follow format conventions and are directly usable by Claude/Cursor.

### Phase 6: Polish (Days 53-60)
**Goal**: Reliability, offline support, auto-start.

**Steps**:
1. Crash recovery: re-queue stuck sources on startup
2. `POST /api/sources/:id/retry` for manual retry
3. `GET /api/health` endpoint
4. Graceful shutdown (drain queue, close connections)
5. iOS offline mode: cache metadata + recent audio
6. iOS empty/error states with retry buttons
7. launchd plist or pm2 for auto-start on boot
8. README with setup instructions

**Exit criteria**: Server recovers from restarts. iOS works offline for cached content. Project is self-documented.

---

## 9. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Claude CLI hangs/crashes | High | High | 120s timeout, retry once, shared concurrency semaphore, crash recovery |
| ElevenLabs character costs | High | Medium | TTS on-demand only, prefer summary over full, track usage, Fish Audio fallback |
| db9.ai outages/immaturity | Medium | High | Regular backups (`db9 db dump`), standard pg interface (can swap to any Postgres) |
| Tailscale connectivity | Medium | Medium | Mac must stay awake, clear "unreachable" UI, offline mode for cached content |
| Jina Reader extraction quality | Medium | Low-Med | `raw_content_override` field for manual paste, failure detection for login/paywall pages |
| iOS provisioning expiry | Low | Low | Paid Apple Developer account ($99/yr) for 1-year profiles |
| Audio storage growth | Medium | Low | Store locally on Mac, 90-day cleanup policy, regenerate on demand |
| Chunking quality → RAG quality | Medium | Medium | Heading-aware chunker, manual review, re-chunk endpoint if strategy changes |

---

## 10. Verification Plan

### Phase 1 Verification
```bash
# Start server
cd server && npm run dev

# Ingest a URL
curl -X POST http://localhost:3741/api/ingest \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{"url": "https://example.com/article"}'

# Check status (poll until ready)
curl http://localhost:3741/api/ingest/1/status -H 'Authorization: Bearer $TOKEN'

# Verify source has content, summary, chunks
curl http://localhost:3741/api/sources/1 -H 'Authorization: Bearer $TOKEN'

# Run tests
npm test
```

### Phase 2 Verification
```bash
# Search
curl 'http://localhost:3741/api/search?q=how+to+use+agents' -H 'Authorization: Bearer $TOKEN'

# Chat about a specific article
curl -X POST http://localhost:3741/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{"source_id": 1, "message": "What are the key takeaways?"}'

# Cross-KB chat
curl -X POST http://localhost:3741/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{"message": "What best practices exist for agent tool use?"}'
```

### Phase 4 Verification
- Install app on iPhone via Xcode
- Share a URL from Safari → verify it appears in Feed
- Chat using Typeless voice keyboard → verify response
- Play audio → verify background playback + lock screen controls
- Test on different WiFi networks via Tailscale
