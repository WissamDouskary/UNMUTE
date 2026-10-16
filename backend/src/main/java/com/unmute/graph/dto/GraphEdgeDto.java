package com.unmute.graph.dto;

public record GraphEdgeDto(
        String id,
        String source,
        String target,
        GraphEdgeType type
) {
}
