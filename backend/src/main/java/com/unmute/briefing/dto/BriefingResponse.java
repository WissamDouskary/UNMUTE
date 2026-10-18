package com.unmute.briefing.dto;

import com.unmute.task.domain.TaskPriority;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record BriefingResponse(
        TaskSlice focus,
        List<TaskSlice> nextTasks,
        int openCount,
        int dueTodayCount,
        CalendarSlice calendar,
        List<AttentionSlice> attention,
        int readyCount,
        int readingCount
) {
    public record TaskSlice(
            UUID id,
            String title,
            TaskPriority priority,
            Instant dueDate,
            UUID noteId,
            String noteTitle
    ) {
    }

    public record CalendarSlice(boolean connected, List<DeadlineSlice> deadlines, int deadlineCount) {
    }

    public record DeadlineSlice(String googleEventId, String title, Instant startsAt, Instant endsAt) {
    }

    public record AttentionSlice(String kind, UUID id, String title, String reason) {
    }
}
