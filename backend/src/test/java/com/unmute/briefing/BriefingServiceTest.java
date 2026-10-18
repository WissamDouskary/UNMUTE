package com.unmute.briefing;

import com.unmute.briefing.dto.BriefingResponse;
import com.unmute.calendar.domain.GoogleCalendarAccount;
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
import com.unmute.task.domain.TaskPriority;
import com.unmute.task.repository.TaskRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BriefingServiceTest {

    private static final UUID USER = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final Instant NOW = Instant.parse("2026-10-18T15:00:00Z");

    @Mock
    private TaskRepository tasks;
    @Mock
    private SourceRepository sources;
    @Mock
    private NoteRepository notes;
    @Mock
    private CalendarAccountStore accounts;
    @Mock
    private CalendarEventStore events;
    @Mock
    private CalendarRefresh refresh;

    @Test
    void disconnectedDoesNotInventEvents() {
        UUID taskId = UUID.fromString("10000000-0000-0000-0000-000000000002");
        when(tasks.findTasksWithFilters(USER, false, null, null)).thenReturn(List.of(openTask(taskId, "Ship the briefing")));
        when(tasks.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of());
        when(sources.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of());
        when(notes.findByUserIdAndIsArchived(eq(USER), eq(false), any(Pageable.class))).thenReturn(new PageImpl<>(List.of()));
        when(accounts.findByUserId(USER)).thenReturn(Optional.empty());

        BriefingResponse response = service().briefing(USER, 0, NOW);

        assertThat(response.focus().id()).isEqualTo(taskId);
        assertThat(response.focus().title()).isEqualTo("Ship the briefing");
        assertThat(response.calendar().connected()).isFalse();
        assertThat(response.calendar().deadlines()).isEmpty();
        assertThat(response.calendar().deadlineCount()).isZero();
        verify(refresh, never()).refreshIfStale(any());
        verify(events, never()).between(any(), any(), any());
    }

    @Test
    void connectedReadsTheStoredWeek() {
        when(tasks.findTasksWithFilters(USER, false, null, null)).thenReturn(List.of());
        when(tasks.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of());
        when(sources.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of());
        when(notes.findByUserIdAndIsArchived(eq(USER), eq(false), any(Pageable.class))).thenReturn(new PageImpl<>(List.of()));
        when(accounts.findByUserId(USER)).thenReturn(Optional.of(new GoogleCalendarAccount(USER)));
        Instant start = Instant.parse("2026-10-18T16:00:00Z");
        Instant end = Instant.parse("2026-10-18T17:00:00Z");
        when(events.between(eq(USER), any(), any())).thenReturn(List.of(
                new CalendarEventDto("evt-1", "Standup", start, end, List.of(), null, null, "confirmed", null)
        ));

        BriefingResponse response = service().briefing(USER, 0, NOW);

        verify(refresh).refreshIfStale(USER);
        assertThat(response.calendar().connected()).isTrue();
        assertThat(response.calendar().deadlines()).extracting(BriefingResponse.DeadlineSlice::googleEventId)
                .containsExactly("evt-1");
        assertThat(response.calendar().deadlineCount()).isEqualTo(1);
    }

    @Test
    void sevenReadyCapturesReportTheFullCount() {
        List<Source> ready = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            Source source = new Source();
            source.setId(UUID.fromString("20000000-0000-0000-0000-00000000000" + i));
            source.setOriginalName("capture-" + i + ".txt");
            source.setStatus(SourceStatus.READY);
            ready.add(source);
        }
        Note idea = new Note();
        idea.setId(UUID.fromString("30000000-0000-0000-0000-000000000001"));
        idea.setTitle("Loose idea");
        when(tasks.findTasksWithFilters(USER, false, null, null)).thenReturn(List.of());
        when(tasks.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of());
        when(sources.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(ready);
        when(notes.findByUserIdAndIsArchived(eq(USER), eq(false), any(Pageable.class))).thenReturn(new PageImpl<>(List.of(idea)));
        when(accounts.findByUserId(USER)).thenReturn(Optional.empty());

        BriefingResponse response = service().briefing(USER, 0, NOW);

        assertThat(response.readyCount()).isEqualTo(7);
        assertThat(response.attention()).hasSize(6);
        assertThat(response.attention()).allMatch(row -> "capture".equals(row.kind()));
        assertThat(response.attention()).extracting(BriefingResponse.AttentionSlice::id).doesNotContain(idea.getId());
    }

    @Test
    void emptyUser() {
        when(tasks.findTasksWithFilters(USER, false, null, null)).thenReturn(List.of());
        when(tasks.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of());
        when(sources.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of());
        when(notes.findByUserIdAndIsArchived(eq(USER), eq(false), any(Pageable.class))).thenReturn(new PageImpl<>(List.of()));
        when(accounts.findByUserId(USER)).thenReturn(Optional.empty());

        BriefingResponse response = service().briefing(USER, 0, NOW);

        assertThat(response.focus()).isNull();
        assertThat(response.openCount()).isZero();
        assertThat(response.dueTodayCount()).isZero();
        assertThat(response.attention()).isEmpty();
        assertThat(response.readyCount()).isZero();
        assertThat(response.readingCount()).isZero();
    }

    private BriefingService service() {
        return new BriefingService(tasks, sources, notes, accounts, events, refresh);
    }

    private static Task openTask(UUID id, String title) {
        Task task = new Task();
        task.setId(id);
        task.setTitle(title);
        task.setPriority(TaskPriority.HIGH);
        task.setCreatedAt(NOW);
        return task;
    }
}
