package com.unmute.ai.service;

import com.unmute.ai.dto.SemanticSearchResultDto;
import com.unmute.ai.repository.NoteEmbeddingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class SemanticSearchService {

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
        if (query == null || query.trim().isBlank()) {
            return Collections.emptyList();
        }

        int sanitizedLimit = Math.max(1, Math.min(limit, 50));
        String queryVectorStr = embeddingService.generateQueryVector(query.trim());
        return noteEmbeddingRepository.searchSimilarNotes(userId, queryVectorStr, sanitizedLimit);
    }
}
