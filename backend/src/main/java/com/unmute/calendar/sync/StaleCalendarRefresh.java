package com.unmute.calendar.sync;

import com.unmute.calendar.domain.GoogleCalendarAccount;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Component
public class StaleCalendarRefresh implements CalendarRefresh {

    private static final Logger log = LoggerFactory.getLogger(StaleCalendarRefresh.class);

    private final CalendarAccountStore accounts;
    private final CalendarPuller puller;

    public StaleCalendarRefresh(CalendarAccountStore accounts, CalendarPuller puller) {
        this.accounts = accounts;
        this.puller = puller;
    }

    @Override
    public void refreshIfStale(UUID userId) {
        accounts.findByUserId(userId).ifPresent(account -> refresh(userId, account));
    }

    private void refresh(UUID userId, GoogleCalendarAccount account) {
        Instant last = account.getLastSyncedAt();
        if (last != null && !last.isBefore(Instant.now().minus(2, ChronoUnit.MINUTES))) {
            return;
        }
        try {
            puller.pull(userId);
        } catch (RuntimeException ex) {
            log.warn("Calendar refresh failed for user {}: {}", userId, ex.getClass().getSimpleName());
        }
    }
}
