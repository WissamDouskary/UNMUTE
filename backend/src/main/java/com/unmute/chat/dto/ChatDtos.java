package com.unmute.chat.dto;

import com.unmute.ai.dto.CitationDto;
import com.unmute.chat.domain.ChatRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ChatDtos {

    private ChatDtos() {
    }

    public record ChatSessionSummary(
            UUID id,
            String title,
            Instant updatedAt,
            String preview
    ) {
    }

    public record ChatMessageView(
            UUID id,
            ChatRole role,
            String content,
            List<CitationDto> citations,
            Instant createdAt
    ) {
    }

    public record ChatSessionDetail(
            UUID id,
            String title,
            Instant createdAt,
            Instant updatedAt,
            List<ChatMessageView> messages
    ) {
    }

    public record SendChatMessageRequest(
            @NotBlank(message = "Question must not be blank")
            @Size(max = 2000, message = "Question must be at most 2000 characters")
            String question,
            Integer topK
    ) {
        public int resolvedTopK() {
            if (topK == null || topK <= 0) {
                return 5;
            }
            return Math.min(topK, 10);
        }
    }

    public record ChatTurnResponse(
            ChatSessionSummary session,
            ChatMessageView userMessage,
            ChatMessageView assistantMessage
    ) {
    }
}
