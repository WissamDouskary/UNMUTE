-- V6__create_note_embeddings.sql
-- Enable pgvector extension and create note_embeddings table for semantic search & RAG

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE note_embeddings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id     UUID NOT NULL,
    user_id     UUID NOT NULL,
    embedding   vector(384) NOT NULL,
    chunk_text  TEXT,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_note_embeddings_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_note_embeddings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_note_embeddings_note UNIQUE (note_id)
);

CREATE INDEX idx_note_embeddings_user_id ON note_embeddings (user_id);
CREATE INDEX idx_note_embeddings_note_id ON note_embeddings (note_id);
CREATE INDEX idx_note_embeddings_vector ON note_embeddings USING hnsw (embedding vector_cosine_ops);
