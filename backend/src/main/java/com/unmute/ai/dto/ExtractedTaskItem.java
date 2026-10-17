package com.unmute.ai.dto;

import com.unmute.task.domain.TaskPriority;

import java.time.Instant;
import java.util.UUID;

public record ExtractedTaskItem(
        String title,
        String description,
        TaskPriority priority,
        Instant dueDate,
        UUID savedTaskId,
        ExtractionKind kind,
        Instant startAt,
        Instant endAt
) {
    public ExtractedTaskItem withSavedTaskId(UUID id) {
        return new ExtractedTaskItem(title, description, priority, dueDate, id, kind == null ? ExtractionKind.TASK : kind, startAt, endAt);
    }

    public enum ExtractionKind {
        TASK,
        EVENT
    }
}
