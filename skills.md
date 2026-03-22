# Help-Me-Learn Knowledge Base

You have access to the user's personal knowledge base — a collection of articles, papers, and web content they've ingested for learning. Use this skill to save URLs, search their knowledge, answer questions from their stored content, and manage their library.

## Server

- **Base URL**: `http://mac-mini:3741` (Tailscale hostname — adjust if different)
- **Auth**: All requests require `Authorization: Bearer <token>` header
- **Token**: Stored in the user's settings (ask them if you don't have it)

## When to Use This Skill

- User shares a URL or says "save this", "read this", "add this to my KB"
- User asks a question that might be answered by their stored knowledge
- User asks "what do I know about X", "search for X", "find articles about X"
- User asks about a specific article they saved
- User wants to check on ingestion status or manage their library

## Actions

### 1. Save a URL

When the user shares a link or asks you to save/ingest something.

```
POST /api/ingest
Content-Type: application/json

{"url": "https://example.com/article", "tags": ["optional", "tags"]}
```

Response (202): `{"id": 1, "status": "pending", "message": "Ingestion started"}`

Ingestion takes 30-60 seconds. Tell the user it's being processed. If they ask about status later, check it.

**For sites that block scraping (WeChat, paywalled sites, etc.):** If ingestion fails due to fetch timeout or the server can't extract content, read the article yourself using your browser/web access, then re-submit with the content included:

```
POST /api/ingest
Content-Type: application/json

{"url": "https://mp.weixin.qq.com/s/xxx", "title": "Article Title", "content": "Full article text..."}
```

When `content` is provided, the server skips the web scraper and goes straight to summarization + embedding. This is the standard approach for WeChat (mp.weixin.qq.com) URLs — always read them yourself and submit with content.

### 2. Check Ingestion Status

```
GET /api/ingest/{id}/status
```

Response: `{"id": 1, "status": "ready", "error_message": null}`

Statuses: `pending` → `extracting` → `summarizing` → `chunking` → `embedding` → `ready` (or `failed`)

### 3. Search the Knowledge Base

When the user asks "what do I know about X" or wants to find relevant content.

```
GET /api/search?q={query}&limit=10
```

Response:
```json
{
  "query": "RAG best practices",
  "results": [
    {"source_id": 1, "title": "...", "url": "...", "excerpt": "...", "relevance": 0.03}
  ],
  "total": 5
}
```

Present results as a concise list with titles and short excerpts.

### 4. Ask a Question (Cross-KB Chat)

When the user asks a question and you want the KB to help answer it. This performs RAG retrieval automatically.

```
POST /api/chat
Content-Type: application/json

{"message": "What are the best practices for building AI agents?"}
```

To continue a conversation, include `conversation_id` from the previous response:

```json
{"message": "Tell me more about tool use", "conversation_id": 7}
```

Response:
```json
{
  "message_id": 12,
  "conversation_id": 7,
  "content": "Based on your knowledge base...",
  "sources_referenced": [{"id": 1, "title": "...", "url": "..."}]
}
```

Always relay the answer to the user. If sources are referenced, mention them briefly ("According to [title]...").

### 5. Chat About a Specific Article

When the user asks about a specific article by name or ID.

```json
POST /api/chat

{"message": "Summarize the key points", "source_id": 3}
```

The full article content is used as context. Multi-turn works the same way via `conversation_id`.

### 6. List Recent Sources

```
GET /api/sources?limit=10&offset=0
```

Optional filters: `&category=ai_agents` or `&status=ready`

Response includes `data` array with `id`, `title`, `summary`, `category`, `tags`, `status`, `word_count`, `created_at`.

Present as a clean list. Categories: `ai_agents`, `prompt_engineering`, `ml_ops`, `software_engineering`, `web_development`, `data_science`, `devtools`, `career`, `product`, `design`, `other`.

### 7. Get Full Source Details

```
GET /api/sources/{id}
```

Returns full content including `raw_content` and `summary`. Use this if the user asks to read or review a specific article.

### 8. Delete a Source

```
DELETE /api/sources/{id}
```

Returns 204 on success. Confirm with the user before deleting.

### 9. Retry Failed Ingestion

```
POST /api/sources/{id}/retry
```

Only works for sources in `failed` status.

### 10. Generate Audio for an Article

Trigger TTS generation (async — takes 10-60 seconds depending on length).

```
POST /api/audio/generate/{source_id}
Content-Type: application/json

{"type": "summary"}
```

`type` is either `summary` (short, 2-5 min) or `full` (entire article).

Response (202): `{"message": "TTS generation started for summary", "source_id": 3, "type": "summary"}`

### 11. Get Audio File

After generation completes, download the audio as an MP3 file:

```
GET /api/audio/summary/{source_id}    — summary audio
GET /api/audio/full/{source_id}       — full article audio
GET /api/audio/messages/{message_id}  — chat response audio
```

Returns `audio/mpeg` binary data. Send this to the user as an audio attachment.

To check if audio is ready, list or get the source — `audio_summary_path` or `audio_full_path` will be non-null when ready.

## Behavior Guidelines

- **Be proactive about saving**: If the user shares a URL in conversation, offer to save it to their KB.
- **Search before answering**: If the user asks a knowledge question, search their KB first. Their stored articles may have better answers than your general knowledge.
- **Keep responses concise**: WhatsApp messages should be scannable. Use short paragraphs, not walls of text.
- **Cite sources**: When answering from the KB, mention the article title so the user knows where the info came from.
- **Handle async gracefully**: Ingestion takes time. Say "Got it, saving that article. I'll let you know when it's ready" rather than making them wait.
- **Don't guess source IDs**: Search or list first to find the right source before operating on it.
- **Offer audio when relevant**: If the user asks to "read me" or "listen to" an article, generate summary audio and send it. Prefer summary over full — it's shorter and cheaper. Only generate full audio if explicitly asked.
- **Audio is async**: Generate first, then poll the source to check if `audio_summary_path` is set, then fetch and send the file. Tell the user "Generating audio, one moment..." while waiting.
