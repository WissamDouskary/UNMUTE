-- V7__create_background_jobs.sql
-- Durable, PostgreSQL-backed job queue. Jobs are inserted in the same transaction as the domain write that
-- needs them (transactional outbox), so committed work can never lose its follow-up processing.

CREATE TABLE background_jobs (
    id            UUID PRIMARY KEY,
    job_type      VARCHAR(64)  NOT NULL,
    payload       TEXT         NOT NULL,
    dedup_key     VARCHAR(255),
    status        VARCHAR(16)  NOT NULL,
    attempts      INTEGER      NOT NULL DEFAULT 0,
    max_attempts  INTEGER      NOT NULL,
    run_at        TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_at     TIMESTAMP WITH TIME ZONE,
    locked_by     VARCHAR(100),
    lock_token    UUID,
    last_error    TEXT,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at  TIMESTAMP WITH TIME ZONE,

    CONSTRAINT chk_background_jobs_status CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'))
);

-- Claim scan: only due, pending work.
CREATE INDEX idx_background_jobs_due ON background_jobs (run_at) WHERE status = 'PENDING';
-- Coalescing lookups and the "same key already running" exclusion.
CREATE INDEX idx_background_jobs_dedup ON background_jobs (job_type, dedup_key) WHERE status IN ('PENDING', 'RUNNING');
-- Lease expiry sweep.
CREATE INDEX idx_background_jobs_lease ON background_jobs (locked_at) WHERE status = 'RUNNING';
-- Retention purge.
CREATE INDEX idx_background_jobs_finished ON background_jobs (status, completed_at) WHERE status IN ('SUCCEEDED', 'FAILED');
