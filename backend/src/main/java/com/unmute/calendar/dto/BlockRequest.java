package com.unmute.calendar.dto;

import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public record BlockRequest(
        @NotNull UUID taskId,
        @NotNull Instant start,
        @NotNull Instant end
) {
}
