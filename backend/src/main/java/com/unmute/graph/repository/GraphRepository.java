package com.unmute.graph.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Lean projections for the knowledge graph. Reads only the columns needed to draw
 * nodes and foreign-key edges, skipping note bodies and transcripts entirely.
 */
@Repository
public class GraphRepository {

    public record NoteRow(UUID id, String title, boolean pinned, boolean archived, Instant updatedAt) {}

    public record TaskRow(UUID id, String title, boolean completed, String priority, UUID noteId, Instant updatedAt) {}

    public record SourceRow(UUID id, String originalName, String status, UUID noteId, Instant updatedAt) {}

    public record NoteTagRow(UUID noteId, String tag) {}

    public record LinkRow(UUID id, String sourceKey, String targetKey, String relationType) {}

    private final JdbcTemplate jdbcTemplate;

    public GraphRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<NoteRow> findNotes(UUID userId, boolean includeArchived) {
        String sql = """
            SELECT id, title, is_pinned, is_archived, updated_at
            FROM notes
            WHERE user_id = ? AND (? OR is_archived = false)
            """;
        return jdbcTemplate.query(sql, (rs, i) -> new NoteRow(
                (UUID) rs.getObject("id"),
                rs.getString("title"),
                rs.getBoolean("is_pinned"),
                rs.getBoolean("is_archived"),
                toInstant(rs, "updated_at")
        ), userId, includeArchived);
    }

    public List<TaskRow> findTasks(UUID userId) {
        String sql = """
            SELECT id, title, is_completed, priority, note_id, updated_at
            FROM tasks
            WHERE user_id = ?
            """;
        return jdbcTemplate.query(sql, (rs, i) -> new TaskRow(
                (UUID) rs.getObject("id"),
                rs.getString("title"),
                rs.getBoolean("is_completed"),
                rs.getString("priority"),
                (UUID) rs.getObject("note_id"),
                toInstant(rs, "updated_at")
        ), userId);
    }

    public List<SourceRow> findSources(UUID userId) {
        String sql = """
            SELECT id, original_name, status, note_id, updated_at
            FROM sources
            WHERE user_id = ?
            """;
        return jdbcTemplate.query(sql, (rs, i) -> new SourceRow(
                (UUID) rs.getObject("id"),
                rs.getString("original_name"),
                rs.getString("status"),
                (UUID) rs.getObject("note_id"),
                toInstant(rs, "updated_at")
        ), userId);
    }

    public List<NoteTagRow> findNoteTags(UUID userId, boolean includeArchived) {
        String sql = """
            SELECT nt.note_id, nt.tag
            FROM note_tags nt
            JOIN notes n ON n.id = nt.note_id
            WHERE n.user_id = ? AND (? OR n.is_archived = false)
            """;
        return jdbcTemplate.query(sql, (rs, i) -> new NoteTagRow(
                (UUID) rs.getObject("note_id"),
                rs.getString("tag")
        ), userId, includeArchived);
    }

    public List<LinkRow> findAcceptedLinks(UUID userId) {
        String sql = """
            SELECT id, source_key, target_key, relation_type
            FROM graph_links
            WHERE user_id = ?
            """;
        return jdbcTemplate.query(sql, (rs, i) -> new LinkRow(
                (UUID) rs.getObject("id"),
                rs.getString("source_key"),
                rs.getString("target_key"),
                rs.getString("relation_type")
        ), userId);
    }

    private static Instant toInstant(ResultSet rs, String column) throws SQLException {
        Timestamp ts = rs.getTimestamp(column);
        return ts != null ? ts.toInstant() : null;
    }
}
