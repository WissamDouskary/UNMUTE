package com.unmute.briefing;

import com.unmute.source.domain.SourceStatus;
import com.unmute.task.domain.TaskPriority;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class BriefingRank {

    private BriefingRank() {
    }

    public record TaskRow(
            UUID id,
            String title,
            TaskPriority priority,
            Instant dueDate,
            Instant createdAt,
            UUID noteId,
            String noteTitle,
            boolean completed
    ) {
    }

    public record Deadline(
            String googleEventId,
            String title,
            Instant startsAt,
            Instant endsAt,
            String status
    ) {
    }

    public record Capture(
            UUID id,
            String originalName,
            SourceStatus status,
            boolean hasNote,
            Instant createdAt
    ) {
    }

    public record NoteRow(UUID id, String title, Instant updatedAt, boolean archived) {
    }

    public record Attention(String kind, UUID id, String title, String reason) {
    }

    public static List<TaskRow> rankOpenTasks(List<TaskRow> tasks) {
        return tasks.stream()
                .filter(task -> !task.completed())
                .sorted(Comparator
                        .comparingInt((TaskRow task) -> priorityRank(task.priority()))
                        .thenComparing(TaskRow::dueDate, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(TaskRow::createdAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(TaskRow::id, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    public static int dueToday(List<TaskRow> openRanked, Instant dayStart) {
        Instant dayEnd = dayStart.plus(1, ChronoUnit.DAYS);
        return (int) openRanked.stream()
                .filter(task -> task.dueDate() != null
                        && !task.dueDate().isBefore(dayStart)
                        && task.dueDate().isBefore(dayEnd))
                .count();
    }

    public static List<Deadline> approaching(
            List<Deadline> events,
            Instant now,
            Instant dayStart,
            Instant windowEnd
    ) {
        return events.stream()
                .filter(event -> event.status() == null || !"cancelled".equals(event.status()))
                .filter(event -> event.endsAt() != null && event.endsAt().isAfter(now))
                .filter(event -> event.startsAt() != null && event.startsAt().isBefore(windowEnd))
                .filter(event -> event.endsAt().isAfter(dayStart))
                .sorted(Comparator
                        .comparing(Deadline::startsAt)
                        .thenComparing(Deadline::googleEventId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    public static List<Attention> attention(
            List<Capture> sources,
            List<NoteRow> notes,
            Set<UUID> noteIdsWithAnyTask
    ) {
        List<Attention> rows = new ArrayList<>();
        sources.stream()
                .filter(BriefingRank::ready)
                .sorted(newestCapture())
                .map(source -> new Attention("capture", source.id(), captureTitle(source.originalName()), "Ready for review"))
                .forEach(rows::add);
        sources.stream()
                .filter(source -> source.status() == SourceStatus.FAILED)
                .sorted(newestCapture())
                .map(source -> new Attention("capture", source.id(), captureTitle(source.originalName()), "Failed"))
                .forEach(rows::add);
        notes.stream()
                .filter(note -> !note.archived())
                .filter(note -> note.id() == null || !noteIdsWithAnyTask.contains(note.id()))
                .sorted(Comparator
                        .comparing(NoteRow::updatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(NoteRow::id, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(note -> new Attention("note", note.id(), noteTitle(note.title()), "No task yet"))
                .forEach(rows::add);
        return List.copyOf(rows);
    }

    private static boolean ready(Capture source) {
        return source.status() == SourceStatus.READY
                || (source.status() == SourceStatus.COMPLETED && !source.hasNote());
    }

    private static Comparator<Capture> newestCapture() {
        return Comparator
                .comparing(Capture::createdAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(Capture::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private static String captureTitle(String originalName) {
        if (originalName == null || originalName.isBlank()) {
            return "Untitled capture";
        }
        if ("link.txt".equals(originalName)) {
            return "Shared link";
        }
        return originalName;
    }

    private static String noteTitle(String title) {
        if (title == null || title.isBlank()) {
            return "Untitled";
        }
        return title;
    }

    private static int priorityRank(TaskPriority priority) {
        if (priority == null) {
            return 4;
        }
        return switch (priority) {
            case URGENT -> 0;
            case HIGH -> 1;
            case MEDIUM -> 2;
            case LOW -> 3;
        };
    }
}
