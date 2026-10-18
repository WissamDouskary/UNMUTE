package com.unmute.briefing;

import com.unmute.source.domain.SourceStatus;
import com.unmute.task.domain.TaskPriority;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BriefingRankTest {

    @Test
    void urgentWithoutDateOutranksOverdueLow() {
        Instant yesterday = Instant.parse("2026-10-17T12:00:00Z");
        UUID low = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID urgent = UUID.fromString("00000000-0000-0000-0000-000000000002");

        List<BriefingRank.TaskRow> ranked = BriefingRank.rankOpenTasks(List.of(
                task(low, TaskPriority.LOW, yesterday, Instant.parse("2026-10-01T00:00:00Z"), false),
                task(urgent, TaskPriority.URGENT, null, Instant.parse("2026-10-02T00:00:00Z"), false)
        ));

        assertThat(ranked).extracting(BriefingRank.TaskRow::id).containsExactly(urgent, low);
    }

    @Test
    void samePriorityUsesDueDateThenNewestCreated() {
        Instant earlierDue = Instant.parse("2026-10-18T08:00:00Z");
        Instant laterDue = Instant.parse("2026-10-19T08:00:00Z");
        UUID highEarly = UUID.fromString("00000000-0000-0000-0000-000000000011");
        UUID highLate = UUID.fromString("00000000-0000-0000-0000-000000000012");
        UUID mediumOlder = UUID.fromString("00000000-0000-0000-0000-000000000013");
        UUID mediumNewer = UUID.fromString("00000000-0000-0000-0000-000000000014");
        UUID done = UUID.fromString("00000000-0000-0000-0000-000000000015");

        List<BriefingRank.TaskRow> ranked = BriefingRank.rankOpenTasks(List.of(
                task(highLate, TaskPriority.HIGH, laterDue, Instant.parse("2026-10-01T00:00:00Z"), false),
                task(highEarly, TaskPriority.HIGH, earlierDue, Instant.parse("2026-10-01T00:00:00Z"), false),
                task(mediumOlder, TaskPriority.MEDIUM, earlierDue, Instant.parse("2026-10-01T00:00:00Z"), false),
                task(mediumNewer, TaskPriority.MEDIUM, earlierDue, Instant.parse("2026-10-03T00:00:00Z"), false),
                task(done, TaskPriority.URGENT, earlierDue, Instant.parse("2026-10-04T00:00:00Z"), true)
        ));

        assertThat(ranked).extracting(BriefingRank.TaskRow::id)
                .containsExactly(highEarly, highLate, mediumNewer, mediumOlder);
    }

    @Test
    void noOpenTasks() {
        UUID done = UUID.fromString("00000000-0000-0000-0000-000000000021");
        List<BriefingRank.TaskRow> ranked = BriefingRank.rankOpenTasks(List.of(
                task(done, TaskPriority.HIGH, Instant.parse("2026-10-18T08:00:00Z"), Instant.parse("2026-10-01T00:00:00Z"), true)
        ));
        assertThat(ranked).isEmpty();
    }

    @Test
    void dueTodayIgnoresNullAndOtherDays() {
        Instant dayStart = Instant.parse("2026-10-18T00:00:00Z");
        UUID yesterday = UUID.fromString("00000000-0000-0000-0000-000000000031");
        UUID today = UUID.fromString("00000000-0000-0000-0000-000000000032");
        UUID tomorrow = UUID.fromString("00000000-0000-0000-0000-000000000033");
        UUID undated = UUID.fromString("00000000-0000-0000-0000-000000000034");

        List<BriefingRank.TaskRow> open = List.of(
                task(yesterday, TaskPriority.HIGH, dayStart.minus(1, ChronoUnit.HOURS), dayStart, false),
                task(today, TaskPriority.HIGH, dayStart.plus(3, ChronoUnit.HOURS), dayStart, false),
                task(tomorrow, TaskPriority.HIGH, dayStart.plus(1, ChronoUnit.DAYS), dayStart, false),
                task(undated, TaskPriority.HIGH, null, dayStart, false)
        );

        assertThat(BriefingRank.dueToday(open, dayStart)).isEqualTo(1);
    }

    @Test
    void endedAndEighthDayAreExcluded() {
        Instant now = Instant.parse("2026-10-18T15:00:00Z");
        Instant dayStart = Instant.parse("2026-10-18T00:00:00Z");
        Instant windowEnd = Instant.parse("2026-10-25T00:00:00Z");

        List<BriefingRank.Deadline> ranked = BriefingRank.approaching(List.of(
                event("ended", now.minus(2, ChronoUnit.HOURS), now),
                event("day-8", windowEnd, windowEnd.plus(1, ChronoUnit.HOURS)),
                event("cancelled", now.plus(1, ChronoUnit.HOURS), now.plus(2, ChronoUnit.HOURS), "cancelled"),
                event("still-going", dayStart.minus(2, ChronoUnit.HOURS), now.plus(1, ChronoUnit.HOURS)),
                event("later", now.plus(3, ChronoUnit.HOURS), now.plus(4, ChronoUnit.HOURS))
        ), now, dayStart, windowEnd);

        assertThat(ranked).extracting(BriefingRank.Deadline::googleEventId)
                .containsExactly("still-going", "later");
    }

    @Test
    void savedCaptureIsNotWaiting() {
        UUID saved = UUID.fromString("00000000-0000-0000-0000-000000000041");
        UUID ready = UUID.fromString("00000000-0000-0000-0000-000000000042");
        UUID failed = UUID.fromString("00000000-0000-0000-0000-000000000043");
        UUID unfinished = UUID.fromString("00000000-0000-0000-0000-000000000044");
        UUID actioned = UUID.fromString("00000000-0000-0000-0000-000000000045");
        UUID archived = UUID.fromString("00000000-0000-0000-0000-000000000046");
        UUID waiting = UUID.fromString("00000000-0000-0000-0000-000000000047");

        List<BriefingRank.Attention> rows = BriefingRank.attention(
                List.of(
                        new BriefingRank.Capture(saved, "saved.webm", SourceStatus.COMPLETED, true, Instant.parse("2026-10-18T12:00:00Z")),
                        new BriefingRank.Capture(ready, "link.txt", SourceStatus.READY, false, Instant.parse("2026-10-18T11:00:00Z")),
                        new BriefingRank.Capture(failed, "photo.png", SourceStatus.FAILED, false, Instant.parse("2026-10-18T10:00:00Z")),
                        new BriefingRank.Capture(unfinished, "voice.webm", SourceStatus.EXTRACTING, false, Instant.parse("2026-10-18T13:00:00Z"))
                ),
                List.of(
                        new BriefingRank.NoteRow(actioned, "Has a task", Instant.parse("2026-10-18T09:00:00Z"), false),
                        new BriefingRank.NoteRow(archived, "Old", Instant.parse("2026-10-18T08:00:00Z"), true),
                        new BriefingRank.NoteRow(waiting, "  ", Instant.parse("2026-10-18T07:00:00Z"), false)
                ),
                Set.of(actioned)
        );

        assertThat(rows).containsExactly(
                new BriefingRank.Attention("capture", ready, "Shared link", "Ready for review"),
                new BriefingRank.Attention("capture", failed, "photo.png", "Failed"),
                new BriefingRank.Attention("note", waiting, "Untitled", "No task yet")
        );
    }

    private static BriefingRank.TaskRow task(
            UUID id, TaskPriority priority, Instant dueDate, Instant createdAt, boolean completed
    ) {
        return new BriefingRank.TaskRow(id, "task", priority, dueDate, createdAt, null, null, completed);
    }

    private static BriefingRank.Deadline event(String id, Instant startsAt, Instant endsAt) {
        return event(id, startsAt, endsAt, "confirmed");
    }

    private static BriefingRank.Deadline event(String id, Instant startsAt, Instant endsAt, String status) {
        return new BriefingRank.Deadline(id, id, startsAt, endsAt, status);
    }
}
