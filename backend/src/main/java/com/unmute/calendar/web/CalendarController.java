package com.unmute.calendar.web;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.calendar.dto.AgendaResponse;
import com.unmute.calendar.dto.BlockRequest;
import com.unmute.calendar.dto.CalendarEventDto;
import com.unmute.calendar.dto.CalendarStatusResponse;
import com.unmute.calendar.dto.MeetingNoteResponse;
import com.unmute.calendar.sync.CalendarSyncService;
import com.unmute.common.exception.InvalidTokenException;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/calendar")
public class CalendarController {

    private final CalendarSyncService calendars;

    public CalendarController(CalendarSyncService calendars) {
        this.calendars = calendars;
    }

    @GetMapping("/status")
    public CalendarStatusResponse status(@AuthenticationPrincipal UserPrincipal principal) {
        return calendars.status(require(principal).getId());
    }

    @GetMapping("/agenda")
    public AgendaResponse agenda(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
            @RequestParam(defaultValue = "0") int offsetMinutes
    ) {
        return calendars.agenda(require(principal).getId(), day, offsetMinutes);
    }

    @PostMapping("/blocks")
    public CalendarEventDto block(@AuthenticationPrincipal UserPrincipal principal, @Valid @RequestBody BlockRequest request) {
        return calendars.block(require(principal).getId(), request);
    }

    @PostMapping("/events/{googleEventId}/notes")
    public MeetingNoteResponse meetingNote(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String googleEventId
    ) {
        return new MeetingNoteResponse(calendars.createMeetingNote(require(principal).getId(), googleEventId));
    }

    @DeleteMapping("/connection")
    public ResponseEntity<Void> disconnect(@AuthenticationPrincipal UserPrincipal principal) {
        calendars.disconnect(require(principal).getId());
        return ResponseEntity.noContent().build();
    }

    private static UserPrincipal require(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }
}
