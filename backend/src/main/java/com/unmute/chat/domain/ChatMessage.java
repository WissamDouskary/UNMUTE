package com.unmute.chat.domain;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_messages")
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private ChatSession session;

    @Enumerated(EnumType.STRING)
    @Column(name = "message_role", nullable = false, length = 16)
    private ChatRole role;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(columnDefinition = "TEXT")
    private String citations;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChatMessage() {
    }

    public ChatMessage(ChatSession session, ChatRole role, String content, String citations) {
        this.session = session;
        this.role = role;
        this.content = content;
        this.citations = citations;
    }

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public ChatRole getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public String getCitations() {
        return citations;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
