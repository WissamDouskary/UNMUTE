package com.unmute.ai.dto;

import jakarta.validation.constraints.NotBlank;

public record AskRequest(
        @NotBlank(message = "Question must not be blank")
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
