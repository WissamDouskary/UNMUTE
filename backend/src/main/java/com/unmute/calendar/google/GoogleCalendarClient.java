package com.unmute.calendar.google;

import java.time.Instant;
import java.util.List;

public interface GoogleCalendarClient {

    TokenResponse exchangeCode(String code);

    TokenResponse refresh(String refreshToken);

    ListWindow listEvents(String accessToken, String syncToken, Instant timeMin, Instant timeMax);

    GoogleEvent insertEvent(String accessToken, String summary, Instant start, Instant end, String taskId);

    WatchResponse watch(String accessToken, String channelId, String token, String address, Instant expiration);

    void stop(String accessToken, String channelId, String resourceId);

    record TokenResponse(String accessToken, String refreshToken, long expiresIn) {
    }

    record ListWindow(List<GoogleEvent> events, String nextSyncToken) {
    }

    record GoogleEvent(
            String id,
            String title,
            Instant startsAt,
            Instant endsAt,
            String description,
            String htmlLink,
            String status,
            List<Attendee> attendees,
            String taskId
    ) {
        public record Attendee(String email, String name) {
        }
    }

    record WatchResponse(String resourceId, Instant expiration) {
    }
}
