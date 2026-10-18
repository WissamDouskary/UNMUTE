package com.unmute.graph.dto;

import java.time.Instant;
import java.util.UUID;

public record GraphSuggestionDto(
        UUID id,
        String sourceKey,
        String targetKey,
        String sourceLabel,
        String targetLabel,
        String relationType,
        String explanation,
        String evidence,
        String origin,
        String status,
        Instant createdAt
) {
}
