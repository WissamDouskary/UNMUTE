package com.unmute.graph.controller;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.exception.BadRequestException;
import com.unmute.common.exception.InvalidTokenException;
import com.unmute.graph.dto.GraphEdgeType;
import com.unmute.graph.dto.GraphSuggestionDto;
import com.unmute.graph.dto.GraphTopologyDto;
import com.unmute.graph.service.GraphService;
import com.unmute.graph.service.GraphSuggestionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/graph")
public class GraphController {

    private final GraphService graphService;
    private final GraphSuggestionService suggestionService;

    public GraphController(GraphService graphService, GraphSuggestionService suggestionService) {
        this.graphService = graphService;
        this.suggestionService = suggestionService;
    }

    private UserPrincipal requirePrincipal(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }

    /**
     * GET /api/v1/graph/topology?includeArchived=false&includeTags=true&relationTypes=TASK_OF_NOTE
     * Returns every Note, Task, Source (and optionally Tag) node for the user.
     * Omit relationTypes to include every relationship. Repeat the parameter to keep a subset of edges.
     */
    @GetMapping("/topology")
    public ResponseEntity<GraphTopologyDto> getTopology(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived,
            @RequestParam(name = "includeTags", defaultValue = "true") boolean includeTags,
            @RequestParam(name = "relationTypes", required = false) List<String> relationTypes
    ) {
        requirePrincipal(principal);
        return ResponseEntity.ok(graphService.getTopology(
                principal.getId(), includeArchived, includeTags, relationTypes(relationTypes)));
    }

    static Set<GraphEdgeType> relationTypes(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return Set.of();
        }
        EnumSet<GraphEdgeType> types = EnumSet.noneOf(GraphEdgeType.class);
        for (String value : raw) {
            if (value == null || value.isBlank()) {
                continue;
            }
            try {
                types.add(GraphEdgeType.valueOf(value.trim()));
            } catch (IllegalArgumentException ex) {
                throw new BadRequestException("Unknown relationship type: " + value.trim());
            }
        }
        return types;
    }

    @GetMapping("/suggestions")
    public ResponseEntity<List<GraphSuggestionDto>> listSuggestions(@AuthenticationPrincipal UserPrincipal principal) {
        requirePrincipal(principal);
        return ResponseEntity.ok(suggestionService.listPending(principal.getId()));
    }

    @PostMapping("/suggestions/generate")
    public ResponseEntity<List<GraphSuggestionDto>> generateSuggestions(@AuthenticationPrincipal UserPrincipal principal) {
        requirePrincipal(principal);
        return ResponseEntity.ok(suggestionService.generate(principal.getId()));
    }

    @PostMapping("/suggestions/{id}/accept")
    public ResponseEntity<GraphSuggestionDto> acceptSuggestion(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        return ResponseEntity.ok(suggestionService.accept(principal.getId(), id));
    }

    @PostMapping("/suggestions/{id}/reject")
    public ResponseEntity<GraphSuggestionDto> rejectSuggestion(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        return ResponseEntity.ok(suggestionService.reject(principal.getId(), id));
    }
}
