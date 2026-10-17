package com.unmute.calendar.oauth;

import com.unmute.calendar.domain.GoogleOAuthState;
import com.unmute.calendar.domain.GoogleOAuthStateRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Repository
public class JpaOAuthNonceStore implements OAuthNonceStore {

    private final GoogleOAuthStateRepository states;

    public JpaOAuthNonceStore(GoogleOAuthStateRepository states) {
        this.states = states;
    }

    @Override
    @Transactional
    public void save(String nonceHash, UUID userId, Instant expiresAt) {
        states.save(new GoogleOAuthState(nonceHash, userId, expiresAt));
    }

    @Override
    @Transactional
    public boolean consume(String nonceHash, UUID userId, Instant now) {
        return states.findById(nonceHash).map(row -> {
            states.delete(row);
            states.flush();
            return row.getUserId().equals(userId) && row.getExpiresAt().isAfter(now);
        }).orElse(false);
    }
}
