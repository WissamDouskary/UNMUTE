-- V9__notes_auto_tagged_at.sql
-- Records when AI auto-tagging last ran on a note. New notes start NULL and get tagged once their content
-- settles; existing notes are marked as already handled so enabling the feature does not bulk-tag (and
-- bill for) the whole history. Users can still request tagging for any note explicitly.

ALTER TABLE notes ADD COLUMN auto_tagged_at TIMESTAMP WITH TIME ZONE;

UPDATE notes SET auto_tagged_at = updated_at;
