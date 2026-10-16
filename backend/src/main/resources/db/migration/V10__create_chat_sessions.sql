-- V10__create_chat_sessions.sql
-- Persistent Ask UNMUTE threads. A session is one conversation; messages keep the question, the grounded
-- answer, and the citations that deep-link back to notes.

CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_chat_sessions_user_updated ON chat_sessions (user_id, updated_at DESC);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    message_role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    citations TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_chat_messages_session_created ON chat_messages (session_id, created_at);
