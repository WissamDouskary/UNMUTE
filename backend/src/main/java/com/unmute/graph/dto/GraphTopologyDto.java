package com.unmute.graph.dto;

import java.time.Instant;
import java.util.List;

public record GraphTopologyDto(
        List<GraphNodeDto> nodes,
        List<GraphEdgeDto> edges,
        Instant generatedAt
) {
}
