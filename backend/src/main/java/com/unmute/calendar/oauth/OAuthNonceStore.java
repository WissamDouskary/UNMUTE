package com.unmute.calendar.oauth;

import java.time.Instant;
import java.util.UUID;

public interface OAuthNonceStore {

    void save(String nonceHash, UUID userId, Instant expiresAt);

    /** Deletes the nonce. Returns false when it is missing, belongs to someone else, or is expired. */
    boolean consume(String nonceHash, UUID userId, Instant now);
}
