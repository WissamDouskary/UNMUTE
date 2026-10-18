package com.unmute.graph.repository;

import com.unmute.graph.dto.GraphSuggestionDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class GraphSuggestionRepository {

    public record NoteBrief(UUID id, String title) {}

    private final JdbcTemplate jdbc;

    public GraphSuggestionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<NoteBrief> findNotes(UUID userId) {
        return jdbc.query("""
                SELECT id, title FROM notes
                WHERE user_id = ? AND is_archived = false
                """, (rs, i) -> new NoteBrief((UUID) rs.getObject("id"), rs.getString("title")), userId);
    }

    public List<GraphRepository.NoteTagRow> findTags(UUID userId) {
        return jdbc.query("""
                SELECT nt.note_id, nt.tag
                FROM note_tags nt
                JOIN notes n ON n.id = nt.note_id
                WHERE n.user_id = ? AND n.is_archived = false
                """, (rs, i) -> new GraphRepository.NoteTagRow((UUID) rs.getObject("note_id"), rs.getString("tag")), userId);
    }

    public boolean noteOwned(UUID userId, UUID noteId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM notes WHERE user_id = ? AND id = ?",
                Integer.class,
                userId,
                noteId
        );
        return count != null && count > 0;
    }

    public List<String> blockedPairs(UUID userId) {
        List<String> pairs = jdbc.query("""
                SELECT source_key, target_key FROM graph_suggestions WHERE user_id = ?
                """, (rs, i) -> rs.getString("source_key") + "|" + rs.getString("target_key"), userId);
        pairs.addAll(jdbc.query("""
                SELECT source_key, target_key FROM graph_links WHERE user_id = ?
                """, (rs, i) -> rs.getString("source_key") + "|" + rs.getString("target_key"), userId));
        return pairs;
    }

    public void insertPending(UUID userId, String sourceKey, String targetKey, String explanation, String evidence) {
        jdbc.update("""
                INSERT INTO graph_suggestions
                    (user_id, source_key, target_key, relation_type, explanation, evidence, origin, status)
                VALUES (?, ?, ?, 'RELATED_TO', ?, ?, 'SHARED_TAG', 'PENDING')
                ON CONFLICT (user_id, source_key, target_key, relation_type) DO NOTHING
                """, userId, sourceKey, targetKey, explanation, evidence);
    }

    public List<GraphSuggestionDto> listPending(UUID userId) {
        return jdbc.query("""
                SELECT s.id, s.source_key, s.target_key, s.relation_type, s.explanation, s.evidence,
                       s.origin, s.status, s.created_at,
                       sn.title AS source_title, tn.title AS target_title
                FROM graph_suggestions s
                LEFT JOIN notes sn ON sn.id = CAST(substring(s.source_key FROM 6) AS uuid) AND sn.user_id = s.user_id
                LEFT JOIN notes tn ON tn.id = CAST(substring(s.target_key FROM 6) AS uuid) AND tn.user_id = s.user_id
                WHERE s.user_id = ? AND s.status = 'PENDING'
                ORDER BY s.created_at DESC
                """, (rs, i) -> new GraphSuggestionDto(
                (UUID) rs.getObject("id"),
                rs.getString("source_key"),
                rs.getString("target_key"),
                rs.getString("source_title"),
                rs.getString("target_title"),
                rs.getString("relation_type"),
                rs.getString("explanation"),
                rs.getString("evidence"),
                rs.getString("origin"),
                rs.getString("status"),
                toInstant(rs.getTimestamp("created_at"))
        ), userId);
    }

    public Optional<GraphSuggestionDto> find(UUID userId, UUID id) {
        List<GraphSuggestionDto> rows = jdbc.query("""
                SELECT id, source_key, target_key, relation_type, explanation, evidence, origin, status, created_at
                FROM graph_suggestions
                WHERE user_id = ? AND id = ?
                """, (rs, i) -> new GraphSuggestionDto(
                (UUID) rs.getObject("id"),
                rs.getString("source_key"),
                rs.getString("target_key"),
                null,
                null,
                rs.getString("relation_type"),
                rs.getString("explanation"),
                rs.getString("evidence"),
                rs.getString("origin"),
                rs.getString("status"),
                toInstant(rs.getTimestamp("created_at"))
        ), userId, id);
        return rows.stream().findFirst();
    }

    public int mark(UUID userId, UUID id, String status) {
        return jdbc.update("""
                UPDATE graph_suggestions
                SET status = ?, updated_at = NOW()
                WHERE user_id = ? AND id = ? AND status = 'PENDING'
                """, status, userId, id);
    }

    public void insertLink(UUID userId, String sourceKey, String targetKey, String relationType) {
        jdbc.update("""
                INSERT INTO graph_links (user_id, source_key, target_key, relation_type, origin)
                VALUES (?, ?, ?, ?, 'ACCEPTED')
                ON CONFLICT (user_id, source_key, target_key, relation_type) DO NOTHING
                """, userId, sourceKey, targetKey, relationType);
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
