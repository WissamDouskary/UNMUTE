package com.unmute.chat.controller;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.chat.dto.ChatDtos.ChatSessionDetail;
import com.unmute.chat.dto.ChatDtos.ChatSessionSummary;
import com.unmute.chat.dto.ChatDtos.ChatTurnResponse;
import com.unmute.chat.dto.ChatDtos.SendChatMessageRequest;
import com.unmute.chat.service.ChatSessionService;
import com.unmute.common.exception.InvalidTokenException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/chat/sessions")
public class ChatController {

    private final ChatSessionService chatSessionService;

    public ChatController(ChatSessionService chatSessionService) {
        this.chatSessionService = chatSessionService;
    }

    @GetMapping
    public ResponseEntity<List<ChatSessionSummary>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(chatSessionService.list(require(principal).getId()));
    }

    @PostMapping
    public ResponseEntity<ChatSessionSummary> create(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(chatSessionService.create(require(principal).getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ChatSessionDetail> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        return ResponseEntity.ok(chatSessionService.get(require(principal).getId(), id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        chatSessionService.delete(require(principal).getId(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<ChatTurnResponse> send(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody SendChatMessageRequest request
    ) {
        ChatTurnResponse turn = chatSessionService.send(
                require(principal).getId(),
                id,
                request.question(),
                request.resolvedTopK()
        );
        return ResponseEntity.ok(turn);
    }

    private UserPrincipal require(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }
}
