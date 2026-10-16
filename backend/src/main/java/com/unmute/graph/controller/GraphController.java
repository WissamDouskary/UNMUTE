package com.unmute.graph.controller;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.exception.InvalidTokenException;
import com.unmute.graph.dto.GraphTopologyDto;
import com.unmute.graph.service.GraphService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/graph")
public class GraphController {

    private final GraphService graphService;

    public GraphController(GraphService graphService) {
        this.graphService = graphService;
    }

    private UserPrincipal requirePrincipal(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }

    /**
     * GET /api/v1/graph/topology?includeArchived=false&includeTags=true
     * Returns every Note, Task, Source (and optionally Tag) node for the user, linked by foreign keys.
     */
    @GetMapping("/topology")
    public ResponseEntity<GraphTopologyDto> getTopology(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived,
            @RequestParam(name = "includeTags", defaultValue = "true") boolean includeTags
    ) {
        requirePrincipal(principal);
        return ResponseEntity.ok(graphService.getTopology(principal.getId(), includeArchived, includeTags));
    }
}
