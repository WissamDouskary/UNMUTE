package com.unmute.note.event;

import java.util.UUID;

/**
 * Published whenever a note's searchable content (title, body, summary, tags) is created or changed.
 * Consumers must not assume the publishing transaction has committed unless they listen AFTER_COMMIT.
 */
public record NoteContentChangedEvent(UUID noteId) {
}
