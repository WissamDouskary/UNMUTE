package com.unmute.calendar.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "google_oauth_states")
public class GoogleOAuthState {

    @Id
    @Column(name = "nonce_hash")
    private String nonceHash;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    public GoogleOAuthState() {
    }

    public GoogleOAuthState(String nonceHash, UUID userId, Instant expiresAt) {
        this.nonceHash = nonceHash;
        this.userId = userId;
        this.expiresAt = expiresAt;
    }

    public String getNonceHash() {
        return nonceHash;
    }

    public UUID getUserId() {
        return userId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
