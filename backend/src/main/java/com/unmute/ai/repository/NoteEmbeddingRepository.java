package com.unmute.ai.repository;

import com.unmute.ai.dto.SemanticSearchResultDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

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

    public void upsertEmbedding(UUID noteId, UUID userId, String vectorLiteral, String chunkText) {
        String sql = """
            INSERT INTO note_embeddings (id, note_id, user_id, embedding, chunk_text, created_at, updated_at)
            VALUES (gen_random_uuid(), ?, ?, cast(? as vector), ?, NOW(), NOW())
            ON CONFLICT (note_id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                chunk_text = EXCLUDED.chunk_text,
                updated_at = NOW();
            """;
        jdbcTemplate.update(sql, noteId, userId, vectorLiteral, chunkText);
    }

    public void deleteByNoteId(UUID noteId) {
        String sql = "DELETE FROM note_embeddings WHERE note_id = ?";
        jdbcTemplate.update(sql, noteId);
    }

    public List<SemanticSearchResultDto> searchSimilarNotes(UUID userId, String queryVectorLiteral, int limit) {
        String sql = """
            SELECT n.id, n.title, n.content, n.summary,
                   1 - (ne.embedding <=> cast(? as vector)) AS similarity,
                   (SELECT string_agg(nt.tag, ',') FROM note_tags nt WHERE nt.note_id = n.id) AS tags_csv,
                   n.updated_at
            FROM notes n
            JOIN note_embeddings ne ON n.id = ne.note_id
            WHERE ne.user_id = ? AND n.is_archived = false
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
        }, queryVectorLiteral, userId, queryVectorLiteral, limit);
    }

    public List<UUID> findNoteIdsWithoutEmbeddings() {
        String sql = """
            SELECT n.id FROM notes n
            WHERE n.id NOT IN (SELECT ne.note_id FROM note_embeddings ne);
            """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> (UUID) rs.getObject("id"));
    }
}
