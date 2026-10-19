package com.unmute.calendar.web;

import com.unmute.calendar.crypto.TokenCipher;
import com.unmute.calendar.domain.GoogleCalendarAccount;
import com.unmute.calendar.google.GoogleCalendarClient;
import com.unmute.calendar.google.SyncTokenExpiredException;
import com.unmute.calendar.sync.CalendarAccountStore;
import com.unmute.calendar.sync.CalendarEventStore;
import com.unmute.calendar.sync.CalendarPuller;
import com.unmute.calendar.sync.CalendarWebhookHandler;
import com.unmute.calendar.sync.ChannelTokens;
import com.unmute.calendar.sync.GoogleAccessTokens;
import com.unmute.calendar.dto.CalendarEventDto;
import com.unmute.live.LivePublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CalendarWebhookControllerTest {

    private static final UUID USER = UUID.fromString("11111111-2222-3333-4444-555555555555");
    private static final UUID CHANNEL = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    private final MemoryAccounts accounts = new MemoryAccounts();
    private final FakeGoogle google = new FakeGoogle();
    private final RecordingEvents events = new RecordingEvents();
    private final RecordingLive live = new RecordingLive();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        byte[] key = new byte[32];
        TokenCipher cipher = TokenCipher.fromBase64Key(Base64.getEncoder().encodeToString(key));
        GoogleCalendarAccount account = new GoogleCalendarAccount(USER);
        account.setRefreshToken(cipher.encrypt("refresh"));
        account.setAccessToken(cipher.encrypt("access"));
        account.setAccessTokenExpiresAt(Instant.now().plus(1, ChronoUnit.HOURS));
        account.setSyncToken("sync-1");
        account.setChannelId(CHANNEL);
        account.setChannelTokenHash(ChannelTokens.hash("secret"));
        accounts.account = account;

        CalendarPuller puller = new CalendarPuller(
                accounts, events, new GoogleAccessTokens(accounts, google, cipher), google, live);
        mvc = MockMvcBuilders.standaloneSetup(new CalendarWebhookController(new CalendarWebhookHandler(accounts, puller))).build();
    }

    @Test
    @DisplayName("A wrong channel token returns 200 and does not list or publish")
    void wrongToken() throws Exception {
        send("wrong", "exists");
        assertEquals(0, google.lists);
        assertEquals(0, live.publishes);
    }

    @Test
    @DisplayName("The watch handshake does not list events")
    void syncHandshake() throws Exception {
        send("secret", "sync");
        assertEquals(0, google.lists);
        assertEquals(0, live.publishes);
    }

    @Test
    @DisplayName("A matching exists notification lists once and publishes calendar.updated")
    void exists() throws Exception {
        send("secret", "exists");
        assertEquals(1, google.lists);
        assertEquals(1, events.applied);
        assertEquals(1, live.publishes);
    }

    @Test
    @DisplayName("A second identical exists notification pulls again")
    void duplicateExists() throws Exception {
        send("secret", "exists");
        send("secret", "exists");
        assertEquals(2, google.lists);
        assertEquals(2, events.applied);
        assertEquals(2, live.publishes);
    }

    @Test
    @DisplayName("A 410 clears the sync token and lists the window once more")
    void expiredSyncToken() throws Exception {
        google.expireOnce = true;
        send("secret", "exists");
        assertEquals(2, google.lists);
        assertEquals(1, live.publishes);
    }

    private void send(String token, String state) throws Exception {
        mvc.perform(post("/api/v1/webhooks/calendar")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Goog-Channel-ID", CHANNEL.toString())
                        .header("X-Goog-Channel-Token", token)
                        .header("X-Goog-Resource-State", state))
                .andExpect(status().isOk());
    }

    private static final class MemoryAccounts implements CalendarAccountStore {
        private GoogleCalendarAccount account;

        @Override
        public Optional<GoogleCalendarAccount> findByUserId(UUID userId) {
            return account != null && account.getUserId().equals(userId) ? Optional.of(account) : Optional.empty();
        }

        @Override
        public Optional<GoogleCalendarAccount> findByChannelId(UUID channelId) {
            return account != null && channelId.equals(account.getChannelId()) ? Optional.of(account) : Optional.empty();
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

    private static final class RecordingEvents implements CalendarEventStore {
        private int applied;

        @Override
        public void apply(UUID userId, List<GoogleCalendarClient.GoogleEvent> incoming) {
            applied++;
        }

        @Override
        public List<CalendarEventDto> between(UUID userId, Instant start, Instant end) {
            return List.of();
        }

        @Override
        public Optional<CalendarEventDto> find(UUID userId, String googleEventId) {
            return Optional.empty();
        }

        @Override
        public void deleteAll(UUID userId) {
        }
    }

    private static final class RecordingLive implements LivePublisher {
        private int publishes;

        @Override
        public void publish(UUID userId, String type, Object payload) {
            publishes++;
        }
    }

    private static final class FakeGoogle implements GoogleCalendarClient {
        private int lists;
        private boolean expireOnce;

        @Override
        public TokenResponse exchangeCode(String code) {
            throw new UnsupportedOperationException();
        }

        @Override
        public TokenResponse refresh(String refreshToken) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ListWindow listEvents(String accessToken, String syncToken, Instant timeMin, Instant timeMax) {
            lists++;
            if (syncToken != null && expireOnce) {
                expireOnce = false;
                throw new SyncTokenExpiredException();
            }
            return new ListWindow(List.of(), "next-sync");
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
