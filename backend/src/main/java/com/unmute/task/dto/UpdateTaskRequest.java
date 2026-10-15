package com.unmute.task.dto;

import com.unmute.task.domain.TaskPriority;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public record UpdateTaskRequest(
        @Size(max = 255, message = "Task title cannot exceed 255 characters")
        String title,

        String description,

        UUID noteId,

        Boolean isCompleted,

        TaskPriority priority,

        Instant dueDate
) {
}
