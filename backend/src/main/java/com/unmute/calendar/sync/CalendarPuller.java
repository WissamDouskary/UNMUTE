package com.unmute.calendar.sync;

import com.unmute.calendar.domain.GoogleCalendarAccount;
import com.unmute.calendar.google.GoogleCalendarClient;
import com.unmute.calendar.google.SyncTokenExpiredException;
import com.unmute.common.exception.ConflictException;
import com.unmute.live.LiveEventTypes;
import com.unmute.live.LivePublisher;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
public class CalendarPuller {

    private final CalendarAccountStore accounts;
    private final CalendarEventStore events;
    private final GoogleAccessTokens tokens;
    private final GoogleCalendarClient google;
    private final LivePublisher live;

    public CalendarPuller(
            CalendarAccountStore accounts,
            CalendarEventStore events,
            GoogleAccessTokens tokens,
            GoogleCalendarClient google,
            LivePublisher live
    ) {
        this.accounts = accounts;
        this.events = events;
        this.tokens = tokens;
        this.google = google;
        this.live = live;
    }

    /** Incremental when a sync token exists. A 410 from Google clears it and lists the visible window. */
    public void pull(UUID userId) {
        GoogleCalendarAccount account = accounts.findByUserId(userId)
                .orElseThrow(() -> new ConflictException("Google Calendar is not connected"));
        String access = tokens.bearer(userId);
        account = accounts.findByUserId(userId).orElseThrow();
        GoogleCalendarClient.ListWindow window;
        try {
            window = account.getSyncToken() == null
                    ? fullWindow(access)
                    : google.listEvents(access, account.getSyncToken(), null, null);
        } catch (SyncTokenExpiredException ex) {
            account.setSyncToken(null);
            accounts.save(account);
            window = fullWindow(access);
        }
        events.apply(userId, window.events());
        account = accounts.findByUserId(userId).orElseThrow();
        if (window.nextSyncToken() != null) {
            account.setSyncToken(window.nextSyncToken());
        }
        account.setLastSyncedAt(Instant.now());
        accounts.save(account);
        live.publish(userId, LiveEventTypes.CALENDAR_UPDATED, new LiveEventTypes.CalendarUpdated(true));
    }

    private GoogleCalendarClient.ListWindow fullWindow(String access) {
        Instant now = Instant.now();
        return google.listEvents(access, null, now.minus(1, ChronoUnit.DAYS), now.plus(30, ChronoUnit.DAYS));
    }
}
