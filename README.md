# Help Me Learn

Audio-first personal knowledge base. Ingest URLs, upload PDF books, listen to AI-generated podcasts and narrations, chat with Claude about your content, and export structured knowledge for AI agents.

## What it does

1. **Ingest** — Drop in a URL or paste text. Content is extracted via [Jina Reader](https://jina.ai/reader), summarized by Claude, chunked, and embedded for semantic search.
2. **Upload Books** — Upload PDF books from the iOS app. Table of contents is extracted automatically. Generate podcast episodes on-demand by chapter or page range.
3. **Listen** — Generate audio for articles and books with three modes:
   - **Narration** (default) — Claude generates a spoken-word script, handling code blocks, tables, and equations conversationally. Single narrator voice.
   - **Podcast** — Two-host conversational format. HOST_A explains, HOST_B asks follow-up questions.
   - **Direct** — Raw text-to-speech without script generation (legacy).
4. **Chat** — Ask Claude questions about your knowledge base. Relevant chunks are retrieved via hybrid search (BM25 + vector similarity) and used as context. Supports per-article and cross-KB conversations.
5. **Export** — Generate CLAUDE.md, .cursorrules, and other artifacts from your knowledge base for use with AI coding agents.

## Architecture

| Component | Technology |
|-----------|-----------|
| Backend | Node.js / TypeScript / Express |
| Database | [db9.ai](https://db9.ai) (PostgreSQL + built-in vector search) |
| LLM | Claude CLI (`claude -p`) via Max subscription |
| TTS | Kokoro via mlx-audio (local, Apple Silicon GPU), ElevenLabs, Fish Audio, Qwen3-TTS |
| Content extraction | Jina Reader (URLs), Marker API / pymupdf4llm (PDFs) |
| Embeddings | Jina Embeddings v3 (1024-dim) |
| iOS app | SwiftUI 5.5+ with PDFKit, AVFoundation |

## iOS App

Native SwiftUI app with six tabs:

- **Feed** — Ingested articles with smart audio generation (narration/podcast/direct mode selection)
- **Chat** — Multi-turn conversations with Claude across your knowledge base. Markdown rendering, gradient chat bubbles, animated typing indicator.
- **Audio** — Unified audio library aggregating article audio and book podcast episodes. Play, share, or delete.
- **Books** — Upload PDFs, preview with native PDFKit, generate podcast episodes by chapter selection or page range.
- **Library** — Browse and search all sources by category.
- **Settings** — Server config, playback speed (0.75x-2.5x), TTS quota monitoring.

Includes a Share Extension for ingesting URLs directly from Safari.

## Book-to-Podcast Pipeline

1. **Upload** — PDF uploaded via iOS document picker (multipart, up to 200MB)
2. **TOC Extraction** — pymupdf extracts table of contents, chapter titles, and page ranges (< 1 second)
3. **On-Demand Generation** — Select chapters or enter a page range. Content is extracted only for the requested pages.
4. **Script Generation** — Claude writes a speaker-tagged script (verbatim narration or two-host conversational)
5. **Multi-Voice TTS** — Each speaker gets a distinct Kokoro voice. Segments synthesized individually, then concatenated.
6. **Playback** — Stream audio via the iOS app with background playback and lock screen controls.

## Getting Started

```bash
cd server
cp .env.example .env  # fill in your credentials
npm install
npm run dev           # starts with tsx watch on port 3741
```

See `.env.example` for all configuration options — database connection, TTS provider, Claude model, Marker API URL, voice configuration, etc.

### Prerequisites

- Node.js 20+
- A [db9.ai](https://db9.ai) database (or any PostgreSQL with pgvector)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Python 3 with `pymupdf` for PDF processing (`pip install pymupdf`)
- At least one TTS provider configured (Kokoro recommended for local use on Apple Silicon)
- Xcode 16+ for the iOS app (iOS 17+)

## Project Structure

```
server/src/
├── index.ts            # Express bootstrap, graceful shutdown
├── config.ts           # Typed env config, validated at startup
├── logger.ts           # Pino structured logging
├── routes/
│   ├── ingest.routes   # URL ingestion
│   ├── sources.routes  # Source CRUD
│   ├── search.routes   # Hybrid search (BM25 + vector)
│   ├── chat.routes     # Multi-turn Claude chat + conversation management
│   ├── audio.routes    # TTS generation + audio streaming
│   └── podcast.routes  # Book upload, PDF serving, episode generation
├── services/
│   ├── ingestion       # Jina fetch → Claude summarize → chunk → embed
│   ├── claude          # Claude CLI wrapper (semaphore, timeout, retry)
│   ├── tts             # Multi-provider TTS (Kokoro, ElevenLabs, Fish, Qwen3)
│   ├── podcast         # Book upload processing, on-demand episode generation
│   ├── script-generation # Claude-powered narration/podcast scripts
│   ├── pdf             # PDF extraction (Marker API, pymupdf4llm, TOC extraction)
│   ├── rag             # Hybrid search, chunk neighbor expansion
│   ├── chunking        # Heading-aware text splitting
│   ├── embedding       # Jina embeddings (1024-dim)
│   └── db              # PostgreSQL connection pool
├── jobs/               # Async job queues (ingestion, TTS, book, podcast)
├── middleware/          # Auth, error handling, request logging
├── types/              # Error classes, API DTOs
└── utils/              # URL normalization, text utils, language detection

ios/HelpMeLearn/
├── Models/             # Codable models (Source, Book, Message, Episode)
├── Services/           # APIClient, AudioPlayerService, SettingsService
├── ViewModels/         # Observable view models per tab
└── Views/
    ├── Feed/           # Article list, audio generation with mode selection
    ├── Chat/           # Chat bubbles, markdown rendering, typing indicator
    ├── Audio/          # Unified audio library
    ├── Books/          # Upload, PDF preview, chapter selection, generation
    ├── Library/        # Source browsing with category filters
    └── Settings/       # Server config, playback preferences
```

## Scripts

```bash
npm run dev          # development server with hot reload
npm run build        # compile TypeScript
npm start            # run compiled server
npm test             # run tests (vitest)
npx tsc --noEmit     # type-check without emitting
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ingest` | Ingest a URL |
| GET | `/api/sources` | List sources (paginated, filterable) |
| DELETE | `/api/sources/:id` | Delete a source |
| GET | `/api/search` | Hybrid search across knowledge base |
| POST | `/api/chat` | Send a chat message (with optional TTS) |
| GET | `/api/conversations` | List conversations |
| DELETE | `/api/conversations/:id` | Delete a conversation |
| POST | `/api/books` | Upload a PDF book (multipart) |
| GET | `/api/books/:id/pdf` | Stream book PDF |
| POST | `/api/books/:id/episodes` | Generate podcast episodes (by chapter or page range) |
| DELETE | `/api/books/:id` | Delete a book and all its data |
| DELETE | `/api/podcast/episodes/:id` | Delete a podcast episode |
| POST | `/api/audio/generate/:id` | Generate TTS audio (narration/podcast/direct mode) |
| GET | `/api/audio/full/:id` | Stream full article audio |
| GET | `/api/podcast/episodes/:id/audio` | Stream podcast episode audio |

## License

[AGPL-3.0](LICENSE)
