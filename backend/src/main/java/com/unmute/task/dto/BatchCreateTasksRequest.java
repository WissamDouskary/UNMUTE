package com.unmute.task.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;
import java.util.UUID;

public record BatchCreateTasksRequest(
        UUID noteId,

        @NotEmpty(message = "Tasks list cannot be empty")
        List<@Valid CreateTaskRequest> tasks
) {
}
