package com.unmute.ai.repository;

import com.unmute.ai.dto.SemanticSearchResultDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Repository
public class NoteEmbeddingRepository {

    private final JdbcTemplate jdbcTemplate;

    public NoteEmbeddingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void upsertEmbedding(UUID noteId, UUID userId, String vectorLiteral, String chunkText, String model) {
        String sql = """
            INSERT INTO note_embeddings (id, note_id, user_id, embedding, chunk_text, model, created_at, updated_at)
            VALUES (gen_random_uuid(), ?, ?, cast(? as vector), ?, ?, NOW(), NOW())
            ON CONFLICT (note_id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                chunk_text = EXCLUDED.chunk_text,
                model = EXCLUDED.model,
                updated_at = NOW();
            """;
        jdbcTemplate.update(sql, noteId, userId, vectorLiteral, chunkText, model);
    }

    /**
     * Must run inside a transaction: the HNSW index is shared by all users and the user filter is applied
     * after the index scan, so without iterative scanning a user can get fewer than {@code limit} rows
     * (or none) once other users' vectors dominate the candidate list. Requires pgvector >= 0.8.
     */
    @Transactional(readOnly = true)
    public List<SemanticSearchResultDto> searchSimilarNotes(UUID userId, String queryVectorLiteral, String model, int limit) {
        jdbcTemplate.execute("SET LOCAL hnsw.iterative_scan = strict_order");

        String sql = """
            SELECT n.id, n.title, n.content, n.summary,
                   1 - (ne.embedding <=> cast(? as vector)) AS similarity,
                   (SELECT string_agg(nt.tag, ',') FROM note_tags nt WHERE nt.note_id = n.id) AS tags_csv,
                   n.updated_at
            FROM notes n
            JOIN note_embeddings ne ON n.id = ne.note_id
            WHERE ne.user_id = ? AND ne.model = ? AND n.is_archived = false
            ORDER BY ne.embedding <=> cast(? as vector) ASC
            LIMIT ?;
            """;

        return jdbcTemplate.query(sql, new RowMapper<SemanticSearchResultDto>() {
            @Override
            public SemanticSearchResultDto mapRow(ResultSet rs, int rowNum) throws SQLException {
                UUID noteId = (UUID) rs.getObject("id");
                String title = rs.getString("title");
                String content = rs.getString("content");
                String summary = rs.getString("summary");
                double similarity = rs.getDouble("similarity");
                String tagsCsv = rs.getString("tags_csv");
                List<String> tags = (tagsCsv != null && !tagsCsv.isBlank())
                        ? Arrays.asList(tagsCsv.split(","))
                        : Collections.emptyList();
                Timestamp ts = rs.getTimestamp("updated_at");
                Instant updatedAt = ts != null ? ts.toInstant() : Instant.now();

                return new SemanticSearchResultDto(
                        noteId,
                        title,
                        content,
                        summary,
                        Math.max(0.0, Math.min(1.0, similarity)),
                        tags,
                        updatedAt
                );
            }
        }, queryVectorLiteral, userId, model, queryVectorLiteral, limit);
    }

    /** Notes with no vector, or one produced by a different model than the active one. */
    public List<UUID> findNoteIdsNeedingEmbedding(String model) {
        String sql = """
            SELECT n.id FROM notes n
            LEFT JOIN note_embeddings ne ON ne.note_id = n.id
            WHERE ne.note_id IS NULL OR ne.model <> ?;
            """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> (UUID) rs.getObject("id"), model);
    }
}
