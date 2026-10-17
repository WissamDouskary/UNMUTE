package com.unmute.calendar.sync;

import com.unmute.calendar.dto.CalendarEventDto;
import com.unmute.calendar.google.GoogleCalendarClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CalendarEventStore {

    void apply(UUID userId, List<GoogleCalendarClient.GoogleEvent> events);

    List<CalendarEventDto> between(UUID userId, Instant start, Instant end);

    Optional<CalendarEventDto> find(UUID userId, String googleEventId);

    void deleteAll(UUID userId);
}
