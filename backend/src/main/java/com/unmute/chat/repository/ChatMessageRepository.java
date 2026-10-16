package com.unmute.chat.repository;

import com.unmute.chat.domain.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    List<ChatMessage> findBySessionIdOrderByCreatedAtAsc(UUID sessionId);

    Optional<ChatMessage> findFirstBySessionIdOrderByCreatedAtDesc(UUID sessionId);

    void deleteBySessionId(UUID sessionId);
}
