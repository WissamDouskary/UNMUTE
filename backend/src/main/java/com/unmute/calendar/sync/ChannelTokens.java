package com.unmute.calendar.sync;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public final class ChannelTokens {

    private ChannelTokens() {
    }

    public static String hash(String token) {
        return HexFormat.of().formatHex(sha256(token));
    }

    public static boolean matches(String storedHash, String presented) {
        if (storedHash == null || presented == null || presented.isBlank()) {
            return false;
        }
        byte[] expected;
        try {
            expected = HexFormat.of().parseHex(storedHash);
        } catch (IllegalArgumentException ex) {
            return false;
        }
        byte[] actual = sha256(presented);
        return MessageDigest.isEqual(expected, actual);
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException("Channel token could not be hashed");
        }
    }
}
