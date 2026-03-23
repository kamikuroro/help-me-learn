# Help Me Learn

Audio-first personal knowledge base. Ingest URLs or raw text, listen to AI-generated audio summaries, chat with Claude about your content, and export structured knowledge for AI agents.

## What it does

1. **Ingest** — Drop in a URL or paste text. Content is extracted via [Jina Reader](https://jina.ai/reader), summarized by Claude, chunked, and embedded for semantic search.
2. **Listen** — Generate text-to-speech audio for summaries or full articles. Supports ElevenLabs, Fish Audio, Qwen3-TTS, and Kokoro (local).
3. **Chat** — Ask Claude questions about your ingested content. Relevant chunks are retrieved via vector search and used as context.
4. **Export** — Generate CLAUDE.md, .cursorrules, and other artifacts from your knowledge base for use with AI coding agents.

## Architecture

| Component | Technology |
|-----------|-----------|
| Backend | Node.js / TypeScript / Express |
| Database | [db9.ai](https://db9.ai) (PostgreSQL + built-in vector search) |
| LLM | Claude CLI (`claude -p`) via Max subscription |
| TTS | ElevenLabs, Fish Audio, Qwen3-TTS, Kokoro |
| Content extraction | Jina Reader |
| Embeddings | Jina Embeddings v3 (1024-dim) |
| iOS app | SwiftUI (in `ios/`) |

## Getting started

```bash
cd server
cp .env.example .env  # fill in your credentials
npm install
npm run dev           # starts with tsx watch on port 3741
```

See `.env.example` for all configuration options — database connection, TTS provider, Claude model, etc.

### Prerequisites

- Node.js 20+
- A [db9.ai](https://db9.ai) database (or any PostgreSQL with pgvector)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- At least one TTS provider configured (or use local Kokoro/Qwen3-TTS)

## Project structure

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

ios/                    # SwiftUI iOS app
```

## Scripts

```bash
npm run dev          # development server with hot reload
npm run build        # compile TypeScript
npm start            # run compiled server
npm test             # run tests (vitest)
npx tsc --noEmit     # type-check without emitting
```

## License

[AGPL-3.0](LICENSE)
