package com.unmute.ai.service;

import com.unmute.ai.dto.AskResponse;
import com.unmute.ai.dto.SemanticSearchResultDto;
import com.unmute.ai.provider.AiProvider;
import com.unmute.ai.provider.EmbeddingProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * Not transactional on purpose: answer generation can be a multi-second LLM call and must not pin a
 * DB connection. Retrieval opens its own short transaction.
 */
@Service
public class RagService implements GroundedAnswers {

    private final SemanticSearchService semanticSearchService;
    private final AiProvider aiProvider;
    private final double minSimilarity;
    private final double relativeCutoff;

    /**
     * @param minSimilarityOverride {@code unmute.ai.rag.min-similarity}; when unset the embedding model's
     *                              own calibrated floor is used
     */
    public RagService(
            SemanticSearchService semanticSearchService,
            AiProvider aiProvider,
            EmbeddingProvider embeddingProvider,
            @Value("${unmute.ai.rag.min-similarity:#{null}}") Double minSimilarityOverride,
            @Value("${unmute.ai.rag.relative-cutoff:0.6}") double relativeCutoff
    ) {
        this.semanticSearchService = semanticSearchService;
        this.aiProvider = aiProvider;
        this.minSimilarity = minSimilarityOverride != null ? minSimilarityOverride : embeddingProvider.relevanceFloor();
        this.relativeCutoff = relativeCutoff;
    }

    public AskResponse ask(UUID userId, String question, int topK) {
        int limit = Math.max(1, Math.min(topK > 0 ? topK : 5, 10));
        List<SemanticSearchResultDto> candidates = semanticSearchService.search(userId, question, limit);
        return aiProvider.generateRagAnswer(question.trim(), selectGrounding(candidates));
    }

    /**
     * Nearest-neighbour search always returns the top K, even when nothing is related. Grounding an answer
     * in those would produce confident citations to unrelated notes, so keep only results that clear an
     * absolute floor and stay within a fraction of the best match.
     */
    List<SemanticSearchResultDto> selectGrounding(List<SemanticSearchResultDto> candidates) {
        if (candidates.isEmpty()) {
            return candidates;
        }
        double best = candidates.get(0).similarity();
        double threshold = Math.max(minSimilarity, best * relativeCutoff);
        return candidates.stream()
                .filter(c -> c.similarity() >= threshold)
                .toList();
    }
}
