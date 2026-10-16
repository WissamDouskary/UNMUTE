package com.unmute.live;

import java.util.List;
import java.util.UUID;

/** Event names and payloads sent over {@code GET /api/v1/events}; mirrored in the api-client types. */
public final class LiveEventTypes {

    public static final String NOTE_TAGGED = "note.tagged";
    public static final String NOTE_TAG_FAILED = "note.tag-failed";
    public static final String NOTE_CREATED = "note.created";
    public static final String SOURCE_UPDATED = "source.updated";

    private LiveEventTypes() {
    }

    public record NoteTagged(UUID noteId, List<String> addedTags, List<String> tags) {}

    public record NoteTagFailed(UUID noteId, String message) {}

    public record NoteCreated(UUID noteId, String title, UUID sourceId) {}

    public record SourceUpdated(UUID sourceId, String status, UUID noteId) {}
}
