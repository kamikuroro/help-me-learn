# Help-Me-Learn

Audio-first personal knowledge base. Ingest URLs, listen to content, chat with Claude about it, export knowledge for AI agents.

## Architecture

- **Backend**: Node.js/TypeScript Express server in `server/`
- **Database**: db9.ai (PostgreSQL-compatible with built-in embeddings, vector search)
- **LLM**: Claude CLI (`claude -p`) via Max subscription
- **TTS**: ElevenLabs (primary), Fish Audio (fallback)
- **Content extraction**: Jina Reader
- **iOS app**: SwiftUI in `ios/` (future)
- **Audio storage**: Local filesystem in `audio/`

## Development

```bash
cd server
cp .env.example .env  # fill in credentials
npm install
npm run dev           # starts with tsx watch
npm test              # vitest
npx tsc --noEmit      # type-check
```

## Project Structure

```
server/src/
├── index.ts            # Express bootstrap, graceful shutdown
├── config.ts           # Typed env config, validated at startup
├── logger.ts           # Pino structured logging
├── routes/             # Thin route handlers (validate → service → respond)
├── services/           # Business logic (stateless, one concern each)
├── jobs/               # Async job queue + handlers
├── middleware/          # Auth, error handling, request logging
├── types/              # Error classes, API DTOs
└── utils/              # URL normalization, text utils, retry
```

## Conventions

- Routes are thin: validate input with zod, call a service, format response. No business logic in routes.
- Services are stateless. Each does one thing.
- All async work (ingestion, TTS) goes through the job queue in `jobs/`.
- Claude CLI: always pass content via stdin, always set timeout, limit to 1 concurrent invocation.
- All DB queries use parameterized queries (never string interpolation).
- Error handling: use custom error classes from `types/errors.ts`. Operational errors get their HTTP status; programmer errors return 500.
- Logging: structured JSON via pino. Log every ingestion step, Claude invocation, and TTS generation with timing.
- Use ESM (`"type": "module"`) — all imports use `.js` extension.

## Key Files

- `server/sql/schema.sql` — full database DDL
- `server/src/services/ingestion.service.ts` — core pipeline: Jina fetch → Claude summarize → chunk → embed
- `server/src/services/claude.service.ts` — Claude CLI wrapper with semaphore, timeout, retry
- `server/src/services/chunking.service.ts` — heading-aware text splitting
- `server/src/jobs/queue.ts` — in-process async job queue with drain support

## Database

PostgreSQL on db9.ai. Key tables:
- `sources` — ingested URLs with full content, summary, metadata
- `chunks` — semantic chunks with vector embeddings (1024-dim)
- `conversations` / `messages` — chat history
- `agent_artifacts` — generated CLAUDE.md, .cursorrules, etc.
