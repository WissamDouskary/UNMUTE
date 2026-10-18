package com.unmute.graph.dto;

public record GraphEdgeDto(
        String id,
        String source,
        String target,
        GraphEdgeType type,
        /** EXPLICIT for foreign keys and tags. ACCEPTED for a reviewed suggestion. */
        String origin
) {
}
