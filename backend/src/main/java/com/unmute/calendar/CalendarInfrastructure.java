package com.unmute.calendar;

import com.unmute.calendar.crypto.TokenCipher;
import com.unmute.calendar.oauth.OAuthNonceStore;
import com.unmute.calendar.oauth.OAuthStateService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Base64;

@Configuration
public class CalendarInfrastructure {

    @Bean
    TokenCipher tokenCipher(GoogleSettings settings) {
        String key = settings.getTokenEncryptionKey();
        if (settings.configured() && (key == null || key.isBlank())) {
            throw new IllegalStateException("GOOGLE_TOKEN_ENCRYPTION_KEY is required when GOOGLE_CLIENT_ID is set");
        }
        if (key == null || key.isBlank()) {
            return TokenCipher.disabled();
        }
        return TokenCipher.fromBase64Key(key);
    }

    @Bean
    OAuthStateService oauthStateService(
            OAuthNonceStore nonces,
            GoogleSettings settings,
            @Value("${unmute.jwt.secret}") String jwtSecret
    ) {
        String key = settings.getTokenEncryptionKey();
        byte[] mac = key == null || key.isBlank()
                ? jwtSecret.getBytes(StandardCharsets.UTF_8)
                : Base64.getDecoder().decode(key.trim());
        return new OAuthStateService(nonces, mac, Clock.systemUTC());
    }
}
