package com.unmute.chat.repository;

import com.unmute.chat.domain.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ChatSessionRepository extends JpaRepository<ChatSession, UUID> {

    List<ChatSession> findTop50ByUserIdOrderByUpdatedAtDesc(UUID userId);
}
