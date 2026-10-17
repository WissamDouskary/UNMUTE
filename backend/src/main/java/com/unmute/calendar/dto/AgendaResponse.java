package com.unmute.calendar.dto;

import java.util.List;

public record AgendaResponse(List<CalendarEventDto> events) {
}
