package com.unmute.graph.dto;

public enum GraphEdgeType {
    /** tasks.note_id -> notes.id */
    TASK_OF_NOTE,
    /** sources.note_id -> notes.id */
    SOURCE_OF_NOTE,
    /** note_tags.note_id -> notes.id */
    NOTE_TAGGED
}
