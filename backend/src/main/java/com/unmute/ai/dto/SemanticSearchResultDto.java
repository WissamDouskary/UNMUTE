package com.unmute.ai.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SemanticSearchResultDto(
        UUID noteId,
        String title,
        String content,
        String summary,
        double similarity,
        List<String> tags,
        Instant updatedAt
) {
}
