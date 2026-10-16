-- V5__create_sources_table.sql
-- Audio & file sources for voice-to-text pipeline

CREATE TABLE sources (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL,
    note_id         UUID,
    filename        VARCHAR(500) NOT NULL,
    original_name   VARCHAR(500) NOT NULL,
    file_type       VARCHAR(100) NOT NULL,
    file_size       BIGINT NOT NULL DEFAULT 0,
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    transcript      TEXT,
    duration_seconds INTEGER,
    error_message   TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sources_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sources_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE INDEX idx_sources_user_id ON sources (user_id);
CREATE INDEX idx_sources_user_status ON sources (user_id, status);
CREATE INDEX idx_sources_note_id ON sources (note_id);
