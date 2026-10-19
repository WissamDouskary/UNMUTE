package com.unmute.calendar.sync;

import com.unmute.calendar.crypto.TokenCipher;
import com.unmute.calendar.domain.GoogleCalendarAccount;
import com.unmute.calendar.google.GoogleCalendarClient;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class GoogleAccessTokensTest {

    private static final UUID USER = UUID.fromString("11111111-2222-3333-4444-555555555555");

    @Test
    void anExpiredAccessTokenIsRefreshedOnceAndTheStoredRefreshTokenSurvivesANewService() {
        byte[] key = new byte[32];
        TokenCipher cipher = TokenCipher.fromBase64Key(Base64.getEncoder().encodeToString(key));
        MemoryAccounts accounts = new MemoryAccounts();
        GoogleCalendarAccount account = new GoogleCalendarAccount(USER);
        account.setRefreshToken(cipher.encrypt("refresh-1"));
        account.setAccessToken(cipher.encrypt("access-1"));
        account.setAccessTokenExpiresAt(Instant.now().minus(1, ChronoUnit.MINUTES));
        accounts.account = account;
        FakeGoogle google = new FakeGoogle();

        GoogleAccessTokens first = new GoogleAccessTokens(accounts, google, cipher);
        assertThat(first.bearer(USER)).isEqualTo("access-2");
        assertThat(first.bearer(USER)).isEqualTo("access-2");
        assertThat(google.refreshes).isEqualTo(1);
        assertThat(cipher.decrypt(accounts.account.getRefreshToken())).isEqualTo("refresh-2");

        account.setAccessTokenExpiresAt(Instant.now().minus(1, ChronoUnit.MINUTES));
        GoogleAccessTokens restarted = new GoogleAccessTokens(accounts, google, cipher);
        assertThat(restarted.bearer(USER)).isEqualTo("access-3");
        assertThat(google.refreshes).isEqualTo(2);
    }

    private static final class MemoryAccounts implements CalendarAccountStore {
        private GoogleCalendarAccount account;

        @Override
        public Optional<GoogleCalendarAccount> findByUserId(UUID userId) {
            return account != null && account.getUserId().equals(userId) ? Optional.of(account) : Optional.empty();
        }

        @Override
        public Optional<GoogleCalendarAccount> findByChannelId(UUID channelId) {
            return Optional.empty();
        }

        @Override
        public GoogleCalendarAccount save(GoogleCalendarAccount account) {
            this.account = account;
            return account;
        }

        @Override
        public void delete(GoogleCalendarAccount account) {
            this.account = null;
        }

        @Override
        public List<GoogleCalendarAccount> channelsToRenew(Instant cutoff) {
            return List.of();
        }
    }

    private static final class FakeGoogle implements GoogleCalendarClient {
        private int refreshes;

        @Override
        public TokenResponse exchangeCode(String code) {
            throw new UnsupportedOperationException();
        }

        @Override
        public TokenResponse refresh(String refreshToken) {
            refreshes++;
            return new TokenResponse("access-" + (refreshes + 1), "refresh-" + (refreshes + 1), 3600);
        }

        @Override
        public ListWindow listEvents(String accessToken, String syncToken, Instant timeMin, Instant timeMax) {
            throw new UnsupportedOperationException();
        }

        @Override
        public GoogleEvent insertEvent(String accessToken, String summary, Instant start, Instant end, String taskId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public WatchResponse watch(String accessToken, String channelId, String token, String address, Instant expiration) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void stop(String accessToken, String channelId, String resourceId) {
            throw new UnsupportedOperationException();
        }
    }
}
