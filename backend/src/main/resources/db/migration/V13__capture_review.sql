ALTER TABLE sources ADD COLUMN review_payload jsonb;

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_status_check;

ALTER TABLE sources ADD CONSTRAINT sources_status_check CHECK (
    status IN ('PENDING', 'TRANSCRIBING', 'EXTRACTING', 'READY', 'COMPLETED', 'FAILED')
);
