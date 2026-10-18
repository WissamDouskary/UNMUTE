package com.unmute.briefing;

import com.unmute.briefing.dto.BriefingResponse;
import com.unmute.briefing.dto.BriefingResponse.AttentionSlice;
import com.unmute.briefing.dto.BriefingResponse.CalendarSlice;
import com.unmute.briefing.dto.BriefingResponse.DeadlineSlice;
import com.unmute.briefing.dto.BriefingResponse.TaskSlice;
import com.unmute.calendar.dto.CalendarEventDto;
import com.unmute.calendar.sync.CalendarAccountStore;
import com.unmute.calendar.sync.CalendarEventStore;
import com.unmute.calendar.sync.CalendarRefresh;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.repository.SourceRepository;
import com.unmute.task.domain.Task;
import com.unmute.task.repository.TaskRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class BriefingService {

    private final TaskRepository tasks;
    private final SourceRepository sources;
    private final NoteRepository notes;
    private final CalendarAccountStore accounts;
    private final CalendarEventStore events;
    private final CalendarRefresh refresh;

    public BriefingService(
            TaskRepository tasks,
            SourceRepository sources,
            NoteRepository notes,
            CalendarAccountStore accounts,
            CalendarEventStore events,
            CalendarRefresh refresh
    ) {
        this.tasks = tasks;
        this.sources = sources;
        this.notes = notes;
        this.accounts = accounts;
        this.events = events;
        this.refresh = refresh;
    }

    public BriefingResponse briefing(UUID userId, int offsetMinutes, Instant now) {
        int minutes = Math.max(-14 * 60, Math.min(14 * 60, offsetMinutes));
        ZoneOffset zone = ZoneOffset.ofTotalSeconds(-minutes * 60);
        LocalDate today = now.atZone(zone).toLocalDate();
        Instant dayStart = today.atStartOfDay(zone).toInstant();
        Instant windowEnd = today.plusDays(7).atStartOfDay(zone).toInstant();

        List<Task> openEntities = tasks.findTasksWithFilters(userId, false, null, null);
        List<BriefingRank.TaskRow> open = BriefingRank.rankOpenTasks(openEntities.stream().map(this::taskRow).toList());
        Set<UUID> noteIds = tasks.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(Task::getNote)
                .filter(Objects::nonNull)
                .map(Note::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        List<Source> sourceRows = sources.findByUserIdOrderByCreatedAtDesc(userId);
        List<Note> noteRows = notes.findByUserIdAndIsArchived(
                userId,
                false,
                PageRequest.of(0, 100, Sort.by(Sort.Direction.DESC, "updatedAt"))
        ).getContent();

        List<BriefingRank.Attention> waiting = BriefingRank.attention(
                sourceRows.stream().map(this::capture).toList(),
                noteRows.stream().map(this::noteRow).toList(),
                noteIds
        );

        return new BriefingResponse(
                open.isEmpty() ? null : taskSlice(open.getFirst()),
                open.stream().skip(1).limit(5).map(this::taskSlice).toList(),
                open.size(),
                BriefingRank.dueToday(open, dayStart),
                calendar(userId, now, dayStart, windowEnd),
                waiting.stream().limit(6).map(this::attentionSlice).toList(),
                (int) waiting.stream().filter(row -> "Ready for review".equals(row.reason())).count(),
                (int) sourceRows.stream().filter(source ->
                        source.getStatus() == SourceStatus.PENDING
                                || source.getStatus() == SourceStatus.TRANSCRIBING
                                || source.getStatus() == SourceStatus.EXTRACTING).count()
        );
    }

    private CalendarSlice calendar(UUID userId, Instant now, Instant dayStart, Instant windowEnd) {
        if (accounts.findByUserId(userId).isEmpty()) {
            return new CalendarSlice(false, List.of(), 0);
        }
        refresh.refreshIfStale(userId);
        List<BriefingRank.Deadline> approaching = BriefingRank.approaching(
                events.between(userId, dayStart, windowEnd).stream().map(this::deadline).toList(),
                now,
                dayStart,
                windowEnd
        );
        return new CalendarSlice(
                true,
                approaching.stream().limit(8).map(this::deadlineSlice).toList(),
                approaching.size()
        );
    }

    private BriefingRank.TaskRow taskRow(Task task) {
        Note note = task.getNote();
        return new BriefingRank.TaskRow(
                task.getId(),
                task.getTitle(),
                task.getPriority(),
                task.getDueDate(),
                task.getCreatedAt(),
                note == null ? null : note.getId(),
                note == null ? null : note.getTitle(),
                task.isCompleted()
        );
    }

    private BriefingRank.Capture capture(Source source) {
        return new BriefingRank.Capture(
                source.getId(),
                source.getOriginalName(),
                source.getStatus(),
                source.getNote() != null,
                source.getCreatedAt()
        );
    }

    private BriefingRank.NoteRow noteRow(Note note) {
        return new BriefingRank.NoteRow(note.getId(), note.getTitle(), note.getUpdatedAt(), note.isArchived());
    }

    private BriefingRank.Deadline deadline(CalendarEventDto event) {
        return new BriefingRank.Deadline(
                event.googleEventId(),
                event.title(),
                event.startsAt(),
                event.endsAt(),
                event.status()
        );
    }

    private TaskSlice taskSlice(BriefingRank.TaskRow task) {
        return new TaskSlice(task.id(), task.title(), task.priority(), task.dueDate(), task.noteId(), task.noteTitle());
    }

    private DeadlineSlice deadlineSlice(BriefingRank.Deadline event) {
        return new DeadlineSlice(event.googleEventId(), event.title(), event.startsAt(), event.endsAt());
    }

    private AttentionSlice attentionSlice(BriefingRank.Attention row) {
        return new AttentionSlice(row.kind(), row.id(), row.title(), row.reason());
    }
}
