package com.unmute.calendar.oauth;

import com.unmute.common.exception.InvalidTokenException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class OAuthStateServiceTest {

    private final UUID userId = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-17T12:00:00Z"));
    private final MemoryNonceStore store = new MemoryNonceStore();
    private final OAuthStateService states = new OAuthStateService(store, new byte[32], clock);

    @Test
    @DisplayName("A state is accepted once and rejected on replay")
    void singleUse() {
        String state = states.issue(userId);
        assertEquals(userId, states.consume(state));
        assertThrows(InvalidTokenException.class, () -> states.consume(state));
    }

    @Test
    @DisplayName("A flipped signature byte is rejected")
    void tamperedSignature() {
        String state = states.issue(userId);
        char last = state.charAt(state.length() - 1);
        char flipped = last == 'a' ? 'b' : 'a';
        String tampered = state.substring(0, state.length() - 1) + flipped;
        assertThrows(InvalidTokenException.class, () -> states.consume(tampered));
    }

    @Test
    @DisplayName("A state older than 10 minutes is rejected")
    void expired() {
        String state = states.issue(userId);
        clock.instant = clock.instant.plus(OAuthStateService.TTL).plusSeconds(1);
        assertThrows(InvalidTokenException.class, () -> states.consume(state));
    }

    private static final class MemoryNonceStore implements OAuthNonceStore {
        private final Map<String, Row> rows = new HashMap<>();

        @Override
        public void save(String nonceHash, UUID userId, Instant expiresAt) {
            rows.put(nonceHash, new Row(userId, expiresAt));
        }

        @Override
        public boolean consume(String nonceHash, UUID userId, Instant now) {
            Row row = rows.remove(nonceHash);
            return row != null && row.userId.equals(userId) && row.expiresAt.isAfter(now);
        }

        private record Row(UUID userId, Instant expiresAt) {
        }
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
