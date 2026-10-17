package com.unmute.calendar.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CalendarEventRepository extends JpaRepository<CalendarEvent, UUID> {

    Optional<CalendarEvent> findByUserIdAndGoogleEventId(UUID userId, String googleEventId);

    List<CalendarEvent> findByUserIdAndStartsAtLessThanAndEndsAtGreaterThan(UUID userId, Instant dayEnd, Instant dayStart);

    void deleteByUserId(UUID userId);
}
