package com.unmute.ai.service;

import com.unmute.ai.dto.AskResponse;
import com.unmute.ai.dto.SemanticSearchResultDto;
import com.unmute.ai.provider.AiProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class RagService {

    private final SemanticSearchService semanticSearchService;
    private final AiProvider aiProvider;

    public RagService(
            SemanticSearchService semanticSearchService,
            AiProvider aiProvider
    ) {
        this.semanticSearchService = semanticSearchService;
        this.aiProvider = aiProvider;
    }

    public AskResponse ask(UUID userId, String question, int topK) {
        int limit = Math.max(1, Math.min(topK > 0 ? topK : 5, 10));

        // 1. Vector search query against user's notes to retrieve top relevant notes
        List<SemanticSearchResultDto> relevantNotes = semanticSearchService.search(userId, question, limit);

        // 2. Feed retrieved notes as context into AI model & generate grounded answer with citations
        return aiProvider.generateRagAnswer(question, relevantNotes);
    }
}
