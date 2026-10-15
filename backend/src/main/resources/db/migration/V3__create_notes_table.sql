-- V3__create_notes_table.sql
-- Notes storage and tagging schema

CREATE TABLE notes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL,
    title       VARCHAR(255) NOT NULL,
    content     TEXT,
    summary     TEXT,
    is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE note_tags (
    note_id UUID NOT NULL,
    tag     VARCHAR(50) NOT NULL,

    CONSTRAINT fk_note_tags_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    CONSTRAINT pk_note_tags PRIMARY KEY (note_id, tag)
);

CREATE INDEX idx_notes_user_id ON notes (user_id);
CREATE INDEX idx_notes_user_archived ON notes (user_id, is_archived);
CREATE INDEX idx_notes_user_updated ON notes (user_id, updated_at DESC);
CREATE INDEX idx_note_tags_tag ON note_tags (tag);
