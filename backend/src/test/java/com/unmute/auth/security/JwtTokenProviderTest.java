package com.unmute.auth.security;

import com.unmute.auth.domain.User;
import com.unmute.common.exception.InvalidTokenException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JwtTokenProviderTest {

    private JwtTokenProvider tokenProvider;
    private User testUser;

    @BeforeEach
    void setUp() {
        tokenProvider = new JwtTokenProvider(
                "very-secure-test-secret-key-that-exceeds-sixty-four-characters-for-hmac-sha-256!!",
                900,
                604800
        );

        testUser = new User("tester@example.com", "hashed_password", "Test User");
        testUser.setId(UUID.randomUUID());
    }

    @Test
    @DisplayName("Generate access token and extract claims successfully")
    void shouldGenerateAndValidateAccessToken() {
        String token = tokenProvider.generateAccessToken(testUser);

        assertNotNull(token);
        assertTrue(tokenProvider.validateToken(token));
        assertEquals(testUser.getId(), tokenProvider.getUserIdFromToken(token));
        assertEquals(testUser.getEmail(), tokenProvider.getEmailFromToken(token));
    }

    @Test
    @DisplayName("Fail validation on corrupted token")
    void shouldFailOnCorruptedToken() {
        String token = tokenProvider.generateAccessToken(testUser);
        String corruptedToken = token + "tampered";

        assertFalse(tokenProvider.validateToken(corruptedToken));
        assertThrows(InvalidTokenException.class, () -> tokenProvider.parseAndValidateToken(corruptedToken));
    }

    @Test
    @DisplayName("Fail validation on expired token")
    void shouldFailOnExpiredToken() {
        JwtTokenProvider shortLivedProvider = new JwtTokenProvider(
                "very-secure-test-secret-key-that-exceeds-sixty-four-characters-for-hmac-sha-256!!",
                -10, // already expired
                604800
        );

        String expiredToken = shortLivedProvider.generateAccessToken(testUser);

        assertFalse(shortLivedProvider.validateToken(expiredToken));
        assertThrows(InvalidTokenException.class, () -> shortLivedProvider.parseAndValidateToken(expiredToken));
    }

    @Test
    @DisplayName("Generate unique refresh tokens and hashes")
    void shouldGenerateUniqueRefreshTokens() {
        String rawToken1 = tokenProvider.generateRawRefreshToken();
        String rawToken2 = tokenProvider.generateRawRefreshToken();

        assertNotEquals(rawToken1, rawToken2);

        String hash1 = tokenProvider.hashToken(rawToken1);
        String hash2 = tokenProvider.hashToken(rawToken2);

        assertNotEquals(hash1, hash2);
        assertEquals(hash1, tokenProvider.hashToken(rawToken1)); // Deterministic hashing
    }
}
