package com.unmute.calendar.sync;

import com.unmute.calendar.crypto.TokenCipher;
import com.unmute.calendar.domain.GoogleCalendarAccount;
import com.unmute.calendar.google.GoogleCalendarClient;
import com.unmute.common.exception.ConflictException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class GoogleAccessTokens {

    private final CalendarAccountStore accounts;
    private final GoogleCalendarClient google;
    private final TokenCipher cipher;

    public GoogleAccessTokens(CalendarAccountStore accounts, GoogleCalendarClient google, TokenCipher cipher) {
        this.accounts = accounts;
        this.google = google;
        this.cipher = cipher;
    }

    public String bearer(UUID userId) {
        GoogleCalendarAccount account = accounts.findByUserId(userId)
                .orElseThrow(() -> new ConflictException("Google Calendar is not connected"));
        Instant expires = account.getAccessTokenExpiresAt();
        if (account.getAccessToken() != null && expires != null && expires.isAfter(Instant.now().plusSeconds(60))) {
            return cipher.decrypt(account.getAccessToken());
        }
        String refresh = cipher.decrypt(account.getRefreshToken());
        GoogleCalendarClient.TokenResponse tokens = google.refresh(refresh);
        account.setAccessToken(cipher.encrypt(tokens.accessToken()));
        account.setAccessTokenExpiresAt(Instant.now().plusSeconds(Math.max(tokens.expiresIn(), 60)));
        if (tokens.refreshToken() != null && !tokens.refreshToken().isBlank()) {
            account.setRefreshToken(cipher.encrypt(tokens.refreshToken()));
        }
        accounts.save(account);
        return tokens.accessToken();
    }
}
