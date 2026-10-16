package com.unmute.ai.controller;

import com.unmute.ai.dto.ExtractTasksRequest;
import com.unmute.ai.dto.ExtractTasksResponse;
import com.unmute.ai.dto.SummarizeRequest;
import com.unmute.ai.dto.SummarizeResponse;
import com.unmute.ai.service.AiService;
import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.exception.InvalidTokenException;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import com.unmute.ai.dto.AskRequest;
import com.unmute.ai.dto.AskResponse;
import com.unmute.ai.service.RagService;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ai")
public class AiController {

    private final AiService aiService;
    private final RagService ragService;

    public AiController(AiService aiService, RagService ragService) {
        this.aiService = aiService;
        this.ragService = ragService;
    }

    private UserPrincipal requirePrincipal(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }

    @PostMapping("/summarize")
    public ResponseEntity<SummarizeResponse> summarize(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SummarizeRequest request
    ) {
        requirePrincipal(principal);
        SummarizeResponse response = aiService.summarize(principal.getId(), request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/extract-tasks")
    public ResponseEntity<ExtractTasksResponse> extractTasks(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ExtractTasksRequest request
    ) {
        requirePrincipal(principal);
        ExtractTasksResponse response = aiService.extractTasks(principal.getId(), request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/ask")
    public ResponseEntity<AskResponse> ask(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody AskRequest request
    ) {
        requirePrincipal(principal);
        AskResponse response = ragService.ask(principal.getId(), request.question(), request.resolvedTopK());
        return ResponseEntity.ok(response);
    }
}
