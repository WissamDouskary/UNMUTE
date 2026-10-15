package com.unmute.task.dto;

import com.unmute.task.domain.Task;
import com.unmute.task.domain.TaskPriority;

import java.time.Instant;
import java.util.UUID;

public record TaskDto(
        UUID id,
        UUID userId,
        UUID noteId,
        String noteTitle,
        String title,
        String description,
        boolean isCompleted,
        TaskPriority priority,
        Instant dueDate,
        Instant createdAt,
        Instant updatedAt
) {
    public static TaskDto fromEntity(Task task) {
        UUID noteId = task.getNote() != null ? task.getNote().getId() : null;
        String noteTitle = task.getNote() != null ? task.getNote().getTitle() : null;
        return new TaskDto(
                task.getId(),
                task.getUser().getId(),
                noteId,
                noteTitle,
                task.getTitle(),
                task.getDescription(),
                task.isCompleted(),
                task.getPriority(),
                task.getDueDate(),
                task.getCreatedAt(),
                task.getUpdatedAt()
        );
    }
}
