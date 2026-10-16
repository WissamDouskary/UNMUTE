package com.unmute.search.controller;

import com.unmute.ai.dto.SemanticSearchRequest;
import com.unmute.ai.dto.SemanticSearchResultDto;
import com.unmute.ai.service.SemanticSearchService;
import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.exception.InvalidTokenException;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/search")
public class SearchController {

    private final SemanticSearchService semanticSearchService;

    public SearchController(SemanticSearchService semanticSearchService) {
        this.semanticSearchService = semanticSearchService;
    }

    private UserPrincipal requirePrincipal(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }

    /**
     * GET /api/v1/search/semantic?q=query&limit=10
     * Semantic vector search using pgvector cosine similarity.
     */
    @GetMapping("/semantic")
    public ResponseEntity<List<SemanticSearchResultDto>> searchGet(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "q", defaultValue = "") String query,
            @RequestParam(name = "limit", defaultValue = "10") int limit
    ) {
        requirePrincipal(principal);
        List<SemanticSearchResultDto> results = semanticSearchService.search(principal.getId(), query, limit);
        return ResponseEntity.ok(results);
    }

    /**
     * POST /api/v1/search/semantic
     * Semantic vector search using pgvector cosine similarity with JSON body.
     */
    @PostMapping("/semantic")
    public ResponseEntity<List<SemanticSearchResultDto>> searchPost(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SemanticSearchRequest request
    ) {
        requirePrincipal(principal);
        List<SemanticSearchResultDto> results = semanticSearchService.search(
                principal.getId(),
                request.query(),
                request.resolvedLimit()
        );
        return ResponseEntity.ok(results);
    }
}
