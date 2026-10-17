package com.unmute.calendar.sync;

import com.unmute.calendar.domain.GoogleCalendarAccount;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CalendarAccountStore {

    Optional<GoogleCalendarAccount> findByUserId(UUID userId);

    Optional<GoogleCalendarAccount> findByChannelId(UUID channelId);

    GoogleCalendarAccount save(GoogleCalendarAccount account);

    void delete(GoogleCalendarAccount account);

    List<GoogleCalendarAccount> channelsToRenew(Instant cutoff);
}
