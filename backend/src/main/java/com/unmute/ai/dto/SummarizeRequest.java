package com.unmute.ai.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public record SummarizeRequest(
        @NotBlank(message = "Content cannot be blank")
        String content,

        UUID noteId
) {
}
