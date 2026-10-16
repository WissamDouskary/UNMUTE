package com.unmute.ai.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AutoTagRequest(
        @NotNull UUID noteId
) {
}
