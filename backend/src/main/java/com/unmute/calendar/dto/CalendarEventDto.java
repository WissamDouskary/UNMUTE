package com.unmute.calendar.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CalendarEventDto(
        String googleEventId,
        String title,
        Instant startsAt,
        Instant endsAt,
        List<AttendeeDto> attendees,
        String description,
        String htmlLink,
        String status,
        UUID taskId
) {
    public record AttendeeDto(String email, String name) {
    }
}
