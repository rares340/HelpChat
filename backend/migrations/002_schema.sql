-- {{EMBED_DIM}} este înlocuit de migrator cu valoarea EMBED_DIM din .env.

CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  rel_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'indexing'
    CHECK (status IN ('active', 'indexing', 'failed', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_versions (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  page_count INT,
  status TEXT NOT NULL DEFAULT 'indexing'
    CHECK (status IN ('indexing', 'active', 'failed')),
  error TEXT,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX document_versions_document_id_idx ON document_versions (document_id);

CREATE TABLE chunks (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page_start INT NOT NULL,
  page_end INT NOT NULL,
  source TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text', 'ocr')),
  text TEXT NOT NULL,
  embedding vector({{EMBED_DIM}}) NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('romanian', immutable_unaccent(text))) STORED,
  UNIQUE (version_id, chunk_index)
);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);
CREATE INDEX chunks_version_id_idx ON chunks (version_id);

CREATE TABLE conversations (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Conversație nouă',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON messages (conversation_id, id);

CREATE TABLE ingestion_events (
  id BIGSERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  stage TEXT NOT NULL,
  rel_path TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ingestion_events_created_at_idx ON ingestion_events (created_at DESC);
