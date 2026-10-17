package com.unmute.calendar.sync;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.calendar.domain.CalendarEvent;
import com.unmute.calendar.domain.CalendarEventRepository;
import com.unmute.calendar.dto.CalendarEventDto;
import com.unmute.calendar.google.GoogleCalendarClient;
import com.unmute.task.domain.Task;
import com.unmute.task.repository.TaskRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JpaCalendarEventStore implements CalendarEventStore {

    private static final TypeReference<List<CalendarEventDto.AttendeeDto>> ATTENDEES = new TypeReference<>() {
    };

    private final CalendarEventRepository events;
    private final TaskRepository tasks;
    private final ObjectMapper json;

    public JpaCalendarEventStore(CalendarEventRepository events, TaskRepository tasks, ObjectMapper json) {
        this.events = events;
        this.tasks = tasks;
        this.json = json;
    }

    @Override
    @Transactional
    public void apply(UUID userId, List<GoogleCalendarClient.GoogleEvent> incoming) {
        for (GoogleCalendarClient.GoogleEvent event : incoming) {
            if ("cancelled".equals(event.status())) {
                events.findByUserIdAndGoogleEventId(userId, event.id()).ifPresent(events::delete);
                tasks.findFirstByUserIdAndGoogleEventId(userId, event.id()).ifPresent(task -> {
                    task.setScheduledStart(null);
                    task.setScheduledEnd(null);
                    tasks.save(task);
                });
                continue;
            }
            CalendarEvent row = events.findByUserIdAndGoogleEventId(userId, event.id()).orElseGet(CalendarEvent::new);
            row.setUserId(userId);
            row.setGoogleEventId(event.id());
            row.setTitle(event.title() == null || event.title().isBlank() ? "(No title)" : trim(event.title(), 500));
            row.setStartsAt(event.startsAt());
            row.setEndsAt(event.endsAt());
            row.setDescription(event.description());
            row.setHtmlLink(event.htmlLink());
            row.setStatus(event.status() == null ? "confirmed" : event.status());
            row.setAttendees(writeAttendees(event.attendees()));
            events.save(row);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<CalendarEventDto> between(UUID userId, Instant start, Instant end) {
        Map<String, UUID> tasksByEvent = taskIds(userId);
        return events.findByUserIdAndStartsAtLessThanAndEndsAtGreaterThan(userId, end, start).stream()
                .map(row -> toDto(row, tasksByEvent.get(row.getGoogleEventId())))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<CalendarEventDto> find(UUID userId, String googleEventId) {
        return events.findByUserIdAndGoogleEventId(userId, googleEventId)
                .map(row -> toDto(row, taskIds(userId).get(row.getGoogleEventId())));
    }

    @Override
    @Transactional
    public void deleteAll(UUID userId) {
        events.deleteByUserId(userId);
    }

    private Map<String, UUID> taskIds(UUID userId) {
        Map<String, UUID> byEvent = new HashMap<>();
        for (Task task : tasks.findByUserIdAndGoogleEventIdIsNotNull(userId)) {
            if (task.getGoogleEventId() != null) {
                byEvent.put(task.getGoogleEventId(), task.getId());
            }
        }
        return byEvent;
    }

    private CalendarEventDto toDto(CalendarEvent row, UUID taskId) {
        return new CalendarEventDto(
                row.getGoogleEventId(),
                row.getTitle(),
                row.getStartsAt(),
                row.getEndsAt(),
                readAttendees(row.getAttendees()),
                row.getDescription(),
                row.getHtmlLink(),
                row.getStatus(),
                taskId);
    }

    private String writeAttendees(List<GoogleCalendarClient.GoogleEvent.Attendee> attendees) {
        List<CalendarEventDto.AttendeeDto> mapped = attendees == null ? List.of() : attendees.stream()
                .map(attendee -> new CalendarEventDto.AttendeeDto(attendee.email(), attendee.name()))
                .toList();
        try {
            return json.writeValueAsString(mapped);
        } catch (JsonProcessingException ex) {
            return "[]";
        }
    }

    private List<CalendarEventDto.AttendeeDto> readAttendees(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            return json.readValue(raw, ATTENDEES);
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }

    private static String trim(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
