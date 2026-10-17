package com.unmute.calendar.crypto;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/** AES-256-GCM. Packed form is {@code iv(12) || ciphertext || tag}. */
public final class TokenCipher {

    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    private TokenCipher(SecretKey key) {
        this.key = key;
    }

    public static TokenCipher disabled() {
        return new TokenCipher(null);
    }

    public static TokenCipher fromBase64Key(String base64) {
        byte[] raw = Base64.getDecoder().decode(base64.trim());
        if (raw.length != 32) {
            throw new IllegalArgumentException("GOOGLE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
        }
        return new TokenCipher(new SecretKeySpec(raw, "AES"));
    }

    public boolean enabled() {
        return key != null;
    }

    public byte[] encrypt(String plaintext) {
        requireKey();
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] sealed = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] packed = new byte[IV_BYTES + sealed.length];
            System.arraycopy(iv, 0, packed, 0, IV_BYTES);
            System.arraycopy(sealed, 0, packed, IV_BYTES, sealed.length);
            return packed;
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Calendar token could not be encrypted");
        }
    }

    public String decrypt(byte[] packed) {
        requireKey();
        if (packed == null || packed.length < IV_BYTES + (TAG_BITS / 8)) {
            throw new IllegalStateException("Calendar token could not be decrypted");
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            System.arraycopy(packed, 0, iv, 0, IV_BYTES);
            byte[] sealed = new byte[packed.length - IV_BYTES];
            System.arraycopy(packed, IV_BYTES, sealed, 0, sealed.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Calendar token could not be decrypted");
        }
    }

    private void requireKey() {
        if (key == null) {
            throw new IllegalStateException("Calendar token encryption is not configured");
        }
    }
}
