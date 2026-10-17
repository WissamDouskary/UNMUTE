package com.unmute.calendar.crypto;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.security.SecureRandom;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TokenCipherTest {

    private final TokenCipher cipher = TokenCipher.fromBase64Key(randomKey());

    @Test
    @DisplayName("AES-256-GCM round-trips a refresh token")
    void roundTrip() {
        byte[] packed = cipher.encrypt("1//refresh-token");
        assertEquals("1//refresh-token", cipher.decrypt(packed));
    }

    @Test
    @DisplayName("A flipped ciphertext byte does not decrypt")
    void tamper() {
        byte[] packed = cipher.encrypt("1//refresh-token");
        packed[20] ^= 0x01;
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(packed));
    }

    private static String randomKey() {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        return Base64.getEncoder().encodeToString(raw);
    }
}
