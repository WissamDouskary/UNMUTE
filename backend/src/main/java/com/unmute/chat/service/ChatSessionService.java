package com.unmute.chat.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.ai.dto.AskResponse;
import com.unmute.ai.dto.CitationDto;
import com.unmute.ai.service.GroundedAnswers;
import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.chat.CitationMarkers;
import com.unmute.chat.domain.ChatMessage;
import com.unmute.chat.domain.ChatRole;
import com.unmute.chat.domain.ChatSession;
import com.unmute.chat.dto.ChatDtos.ChatMessageView;
import com.unmute.chat.dto.ChatDtos.ChatSessionDetail;
import com.unmute.chat.dto.ChatDtos.ChatSessionSummary;
import com.unmute.chat.dto.ChatDtos.ChatTurnResponse;
import com.unmute.chat.repository.ChatMessageRepository;
import com.unmute.chat.repository.ChatSessionRepository;
import com.unmute.common.exception.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

@Service
public class ChatSessionService {

    private static final TypeReference<List<CitationDto>> CITATION_LIST = new TypeReference<>() {
    };
    private static final int PREVIEW_LENGTH = 120;

    private final ChatSessionRepository sessions;
    private final ChatMessageRepository messages;
    private final UserRepository users;
    private final GroundedAnswers answers;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactions;

    public ChatSessionService(
            ChatSessionRepository sessions,
            ChatMessageRepository messages,
            UserRepository users,
            GroundedAnswers answers,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager
    ) {
        this.sessions = sessions;
        this.messages = messages;
        this.users = users;
        this.answers = answers;
        this.objectMapper = objectMapper;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    @Transactional
    public ChatSessionSummary create(UUID userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return summary(sessions.save(new ChatSession(user)), null);
    }

    @Transactional(readOnly = true)
    public List<ChatSessionSummary> list(UUID userId) {
        return sessions.findTop50ByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(session -> summary(session, messages.findFirstBySessionIdOrderByCreatedAtDesc(session.getId()).orElse(null)))
                .toList();
    }

    @Transactional(readOnly = true)
    public ChatSessionDetail get(UUID userId, UUID sessionId) {
        ChatSession session = require(userId, sessionId);
        List<ChatMessageView> views = messages.findBySessionIdOrderByCreatedAtAsc(session.getId()).stream()
                .map(this::toView)
                .toList();
        return new ChatSessionDetail(
                session.getId(),
                session.getTitle(),
                session.getCreatedAt(),
                session.getUpdatedAt(),
                views
        );
    }

    @Transactional
    public void delete(UUID userId, UUID sessionId) {
        ChatSession session = require(userId, sessionId);
        messages.deleteBySessionId(session.getId());
        sessions.delete(session);
    }

    /**
     * Persists the question, asks RAG outside a transaction so the model call does not hold a connection,
     * then stores the grounded answer.
     */
    public ChatTurnResponse send(UUID userId, UUID sessionId, String question, int topK) {
        String trimmed = question.strip();
        ChatMessageView userMessage = transactions.execute(status -> appendUser(userId, sessionId, trimmed));
        AskResponse answer = answers.ask(userId, trimmed, topK);
        String grounded = CitationMarkers.ensure(answer.answer(), answer.citations());
        ChatMessageView assistantMessage = transactions.execute(status ->
                appendAssistant(userId, sessionId, grounded, answer.citations()));
        ChatSessionSummary session = transactions.execute(status ->
                summary(require(userId, sessionId), messages.findFirstBySessionIdOrderByCreatedAtDesc(sessionId).orElse(null)));
        return new ChatTurnResponse(session, userMessage, assistantMessage);
    }

    private ChatMessageView appendUser(UUID userId, UUID sessionId, String question) {
        ChatSession session = require(userId, sessionId);
        if (ChatSession.DEFAULT_TITLE.equals(session.getTitle())) {
            session.setTitle(titleFrom(question));
        }
        session.touch();
        ChatMessage saved = messages.save(new ChatMessage(session, ChatRole.USER, question, null));
        return toView(saved);
    }

    private ChatMessageView appendAssistant(UUID userId, UUID sessionId, String content, List<CitationDto> citations) {
        ChatSession session = require(userId, sessionId);
        session.touch();
        ChatMessage saved = messages.save(new ChatMessage(session, ChatRole.ASSISTANT, content, writeCitations(citations)));
        return toView(saved);
    }

    private ChatSession require(UUID userId, UUID sessionId) {
        ChatSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Chat session not found"));
        if (!session.getUser().getId().equals(userId)) {
            throw new ResourceNotFoundException("Chat session not found");
        }
        return session;
    }

    private ChatSessionSummary summary(ChatSession session, ChatMessage latest) {
        return new ChatSessionSummary(session.getId(), session.getTitle(), session.getUpdatedAt(), preview(latest));
    }

    private ChatMessageView toView(ChatMessage message) {
        return new ChatMessageView(
                message.getId(),
                message.getRole(),
                message.getContent(),
                readCitations(message.getCitations()),
                message.getCreatedAt()
        );
    }

    private String writeCitations(List<CitationDto> citations) {
        try {
            return objectMapper.writeValueAsString(citations == null ? List.of() : citations);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not store citations", e);
        }
    }

    private List<CitationDto> readCitations(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, CITATION_LIST);
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private static String preview(ChatMessage message) {
        if (message == null || message.getContent() == null) {
            return null;
        }
        String single = message.getContent().replaceAll("\\s+", " ").strip();
        if (single.length() <= PREVIEW_LENGTH) {
            return single;
        }
        return single.substring(0, PREVIEW_LENGTH - 1) + "…";
    }

    static String titleFrom(String question) {
        String single = question.replaceAll("\\s+", " ").strip();
        if (single.length() <= 80) {
            return single;
        }
        return single.substring(0, 77) + "...";
    }
}
