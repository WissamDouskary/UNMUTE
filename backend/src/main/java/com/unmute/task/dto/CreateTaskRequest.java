package com.unmute.task.dto;

import com.unmute.task.domain.TaskPriority;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public record CreateTaskRequest(
        @NotBlank(message = "Task title cannot be blank")
        @Size(max = 255, message = "Task title cannot exceed 255 characters")
        String title,

        String description,

        UUID noteId,

        TaskPriority priority,

        Instant dueDate
) {
}
