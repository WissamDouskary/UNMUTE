package com.unmute.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AskRequest(
        @NotBlank(message = "Question must not be blank")
        @Size(max = 2000, message = "Question must be at most 2000 characters")
        String question,
        Integer topK
) {
    public int resolvedTopK() {
        if (topK == null || topK <= 0) {
            return 5;
        }
        return Math.min(topK, 10);
    }
}
