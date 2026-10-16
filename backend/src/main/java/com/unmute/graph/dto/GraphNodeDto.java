package com.unmute.graph.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A node in the knowledge graph.
 *
 * @param id       graph-unique key, prefixed by type (e.g. {@code note:<uuid>}, {@code tag:<name>})
 * @param entityId backing row id; null for tags, which have no table of their own
 * @param status   type-specific state: NOTE = ACTIVE|PINNED|ARCHIVED, TASK = OPEN|COMPLETED,
 *                 SOURCE = {@link com.unmute.source.domain.SourceStatus}, TAG = null
 * @param priority TASK only; null otherwise
 */
public record GraphNodeDto(
        String id,
        UUID entityId,
        GraphNodeType type,
        String label,
        String status,
        String priority,
        Instant updatedAt
) {
}
