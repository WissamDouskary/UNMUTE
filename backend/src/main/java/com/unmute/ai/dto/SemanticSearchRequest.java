package com.unmute.ai.dto;

import jakarta.validation.constraints.NotBlank;

public record SemanticSearchRequest(
        @NotBlank(message = "Search query must not be blank")
        String query,
        Integer limit
) {
    public int resolvedLimit() {
        if (limit == null || limit <= 0) {
            return 10;
        }
        return Math.min(limit, 50);
    }
}
