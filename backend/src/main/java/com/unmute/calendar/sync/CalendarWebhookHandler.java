package com.unmute.calendar.sync;

import com.unmute.calendar.domain.GoogleCalendarAccount;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

@Service
public class CalendarWebhookHandler {

    private static final Logger log = LoggerFactory.getLogger(CalendarWebhookHandler.class);

    private final CalendarAccountStore accounts;
    private final CalendarPuller puller;

    public CalendarWebhookHandler(CalendarAccountStore accounts, CalendarPuller puller) {
        this.accounts = accounts;
        this.puller = puller;
    }

    /**
     * Always returns normally for a missing or wrong channel token so Google does not retry.
     * {@code sync} is the watch handshake and does not list events.
     */
    public void handle(String channelId, String token, String resourceState) {
        if (channelId == null || channelId.isBlank() || token == null || token.isBlank()) {
            return;
        }
        UUID id;
        try {
            id = UUID.fromString(channelId);
        } catch (IllegalArgumentException ex) {
            return;
        }
        Optional<GoogleCalendarAccount> account = accounts.findByChannelId(id);
        if (account.isEmpty() || !ChannelTokens.matches(account.get().getChannelTokenHash(), token)) {
            log.debug("Ignored calendar push for channel {}", id);
            return;
        }
        if (resourceState == null || "sync".equalsIgnoreCase(resourceState)) {
            return;
        }
        puller.pull(account.get().getUserId());
    }
}
