package com.unmute.ai.service;

import com.unmute.ai.dto.SemanticSearchResultDto;
import com.unmute.ai.repository.NoteEmbeddingRepository;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Deliberately non-transactional: the query embedding may be a remote model call and must not hold a
 * pooled DB connection. The repository opens its own short read-only transaction for the vector query.
 */
@Service
public class SemanticSearchService {

    static final int MAX_QUERY_LENGTH = 2_000;

    private final EmbeddingService embeddingService;
    private final NoteEmbeddingRepository noteEmbeddingRepository;

    public SemanticSearchService(
            EmbeddingService embeddingService,
            NoteEmbeddingRepository noteEmbeddingRepository
    ) {
        this.embeddingService = embeddingService;
        this.noteEmbeddingRepository = noteEmbeddingRepository;
    }

    public List<SemanticSearchResultDto> search(UUID userId, String query, int limit) {
        if (query == null || query.isBlank()) {
            return Collections.emptyList();
        }

        String trimmed = query.trim();
        if (trimmed.length() > MAX_QUERY_LENGTH) {
            trimmed = trimmed.substring(0, MAX_QUERY_LENGTH);
        }

        int sanitizedLimit = Math.max(1, Math.min(limit, 50));
        String queryVectorStr = embeddingService.generateQueryVector(trimmed);
        return noteEmbeddingRepository.searchSimilarNotes(userId, queryVectorStr, embeddingService.modelId(), sanitizedLimit);
    }
}
