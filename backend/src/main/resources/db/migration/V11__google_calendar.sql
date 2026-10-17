-- Google Calendar connection. Refresh tokens are AES-256-GCM ciphertext, never plaintext.

CREATE TABLE google_calendar_accounts (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    refresh_token BYTEA NOT NULL,
    access_token BYTEA,
    access_token_expires_at TIMESTAMPTZ,
    sync_token TEXT,
    channel_id UUID,
    channel_resource_id VARCHAR(512),
    channel_token_hash VARCHAR(128),
    channel_expires_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX google_calendar_accounts_channel_id_idx
    ON google_calendar_accounts (channel_id)
    WHERE channel_id IS NOT NULL;

CREATE TABLE google_oauth_states (
    nonce_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE calendar_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    google_event_id VARCHAR(1024) NOT NULL,
    title VARCHAR(500) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT,
    html_link VARCHAR(2048),
    status VARCHAR(32) NOT NULL,
    CONSTRAINT calendar_events_user_google_unique UNIQUE (user_id, google_event_id)
);

CREATE INDEX calendar_events_user_starts_idx ON calendar_events (user_id, starts_at);

ALTER TABLE tasks
    ADD COLUMN google_event_id VARCHAR(1024),
    ADD COLUMN scheduled_start TIMESTAMPTZ,
    ADD COLUMN scheduled_end TIMESTAMPTZ;

ALTER TABLE notes
    ADD COLUMN calendar_event_id VARCHAR(1024);
