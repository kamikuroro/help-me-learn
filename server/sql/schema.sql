-- Help-Me-Learn Knowledge Base Schema (db9.ai)

-- Extensions
CREATE EXTENSION IF NOT EXISTS embedding;
CREATE EXTENSION IF NOT EXISTS fs9;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- Sources: each ingested URL / article
-- ============================================================
CREATE TABLE sources (
    id                       SERIAL PRIMARY KEY,
    url                      TEXT NOT NULL,
    url_normalized           TEXT NOT NULL UNIQUE,
    title                    TEXT,
    raw_content              TEXT,
    summary                  TEXT,
    category                 TEXT,
    tags                     TEXT[] DEFAULT '{}',
    status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'extracting', 'summarizing',
                                               'chunking', 'embedding', 'ready', 'failed')),
    error_message            TEXT,
    word_count               INTEGER,
    audio_full_path          TEXT,
    audio_full_duration_s    REAL,
    audio_summary_path       TEXT,
    audio_summary_duration_s REAL,
    content_hash             TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sources_status ON sources (status);
CREATE INDEX idx_sources_category ON sources (category);
CREATE INDEX idx_sources_tags ON sources USING GIN (tags);
CREATE INDEX idx_sources_created ON sources (created_at DESC);

-- Full-text search on sources (title weighted higher)
CREATE INDEX idx_sources_fts ON sources
    USING GIN ((
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        to_tsvector('english', COALESCE(raw_content, ''))
    ));

-- ============================================================
-- Chunks: semantic chunks for RAG / vector search
-- ============================================================
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

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX idx_chunks_embedding ON chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- Full-text search on chunk content
CREATE INDEX idx_chunks_fts ON chunks
    USING GIN (to_tsvector('english', content));

CREATE INDEX idx_chunks_source ON chunks (source_id);

-- ============================================================
-- Conversations & Messages
-- ============================================================
CREATE TABLE conversations (
    id                SERIAL PRIMARY KEY,
    source_id         INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    title             TEXT,
    type              TEXT NOT NULL DEFAULT 'per_article'
                      CHECK (type IN ('per_article', 'cross_kb')),
    claude_session_id UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
    id               SERIAL PRIMARY KEY,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content          TEXT NOT NULL,
    audio_path       TEXT,
    cited_source_ids INTEGER[],
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);

-- ============================================================
-- Audio Digests (weekly summaries)
-- ============================================================
CREATE TABLE audio_digests (
    id         SERIAL PRIMARY KEY,
    week_start DATE NOT NULL UNIQUE,
    source_ids INTEGER[] NOT NULL,
    transcript TEXT,
    audio_path TEXT,
    duration_s REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Agent Artifacts (CLAUDE.md, .cursorrules, skill.md)
-- ============================================================
CREATE TABLE agent_artifacts (
    id           SERIAL PRIMARY KEY,
    type         TEXT NOT NULL CHECK (type IN ('claude_md', 'cursorrules', 'skill_md', 'mcp_config')),
    topic        TEXT NOT NULL,
    content      TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    version      INTEGER NOT NULL DEFAULT 1,
    source_ids   INTEGER[],
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_type_topic ON agent_artifacts (type, topic);
