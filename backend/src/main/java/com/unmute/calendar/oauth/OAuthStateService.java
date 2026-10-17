package com.unmute.calendar.oauth;

import com.unmute.common.exception.InvalidTokenException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

/** HMAC-signed OAuth state with a single-use nonce. The nonce is stored hashed; the signature covers the payload. */
public class OAuthStateService {

    static final Duration TTL = Duration.ofMinutes(10);

    private final OAuthNonceStore nonces;
    private final byte[] macKey;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public OAuthStateService(OAuthNonceStore nonces, byte[] macKey, Clock clock) {
        this.nonces = nonces;
        this.macKey = macKey.clone();
        this.clock = clock;
    }

    public String issue(UUID userId) {
        byte[] nonce = new byte[16];
        random.nextBytes(nonce);
        String nonceHex = HexFormat.of().formatHex(nonce);
        Instant expiresAt = clock.instant().plus(TTL);
        nonces.save(sha256(nonceHex), userId, expiresAt);
        String payload = userId + "." + expiresAt.getEpochSecond() + "." + nonceHex;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8))
                + "." + sign(payload);
    }

    public UUID consume(String state) {
        Parsed parsed = parse(state);
        if (!parsed.expiresAt.isAfter(clock.instant())) {
            throw new InvalidTokenException("OAuth state has expired");
        }
        if (!nonces.consume(sha256(parsed.nonce), parsed.userId, clock.instant())) {
            throw new InvalidTokenException("OAuth state was already used");
        }
        return parsed.userId;
    }

    private Parsed parse(String state) {
        if (state == null) {
            throw new InvalidTokenException("OAuth state is invalid");
        }
        int split = state.lastIndexOf('.');
        if (split <= 0 || split == state.length() - 1) {
            throw new InvalidTokenException("OAuth state is invalid");
        }
        String encoded = state.substring(0, split);
        String signature = state.substring(split + 1);
        String payload;
        try {
            payload = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            throw new InvalidTokenException("OAuth state is invalid");
        }
        if (!MessageDigest.isEqual(sign(payload).getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8))) {
            throw new InvalidTokenException("OAuth state is invalid");
        }
        String[] parts = payload.split("\\.", 3);
        if (parts.length != 3) {
            throw new InvalidTokenException("OAuth state is invalid");
        }
        try {
            return new Parsed(UUID.fromString(parts[0]), Instant.ofEpochSecond(Long.parseLong(parts[1])), parts[2]);
        } catch (IllegalArgumentException ex) {
            throw new InvalidTokenException("OAuth state is invalid");
        }
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(macKey, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("OAuth state could not be signed");
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("OAuth nonce could not be hashed");
        }
    }

    private record Parsed(UUID userId, Instant expiresAt, String nonce) {
    }
}
