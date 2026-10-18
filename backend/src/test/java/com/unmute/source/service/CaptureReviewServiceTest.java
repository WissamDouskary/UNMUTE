package com.unmute.source.service;

import com.unmute.ai.config.AiProperties;
import com.unmute.ai.service.NoteJobScheduler;
import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.jobs.JobTypes;
import com.unmute.live.LiveEventService;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.dto.ApproveCaptureRequest;
import com.unmute.source.dto.ReviewTask;
import com.unmute.source.dto.SourceDto;
import com.unmute.source.repository.SourceRepository;
import com.unmute.task.domain.Task;
import com.unmute.task.repository.TaskRepository;
import com.unmute.task.service.TaskService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CaptureReviewServiceTest {

    @Mock
    private SourceRepository sourceRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private NoteRepository noteRepository;
    @Mock
    private TaskRepository taskRepository;

    private RecordingJobQueue jobs;
    private CaptureReviewService service;

    @BeforeEach
    void setUp() {
        jobs = new RecordingJobQueue();
        service = new CaptureReviewService(
                sourceRepository,
                userRepository,
                noteRepository,
                new TaskService(taskRepository, userRepository, noteRepository),
                new NoteJobScheduler(jobs, aiProperties()),
                new LiveEventService());
    }

    @Test
    void approveCreatesOneNoteAndOnlyTheSubmittedTasks() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID noteId = UUID.randomUUID();
        User user = user(userId);
        Source source = readySource(user, sourceId);
        AtomicReference<Note> savedNote = new AtomicReference<>();
        when(sourceRepository.lockByIdAndUserId(sourceId, userId)).thenReturn(Optional.of(source));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(noteRepository.save(any())).thenAnswer(invocation -> {
            Note note = invocation.getArgument(0);
            note.setId(noteId);
            savedNote.set(note);
            return note;
        });
        when(noteRepository.findByIdAndUserId(eq(noteId), eq(userId)))
                .thenAnswer(invocation -> Optional.ofNullable(savedNote.get()));
        when(taskRepository.save(any())).thenAnswer(invocation -> {
            Task task = invocation.getArgument(0);
            task.setId(UUID.randomUUID());
            return task;
        });

        SourceDto saved = service.approve(userId, sourceId, new ApproveCaptureRequest(
                "Interview notes",
                "Call Alex tomorrow.",
                List.of(new ReviewTask("Call Alex", "Tomorrow")),
                List.of("hiring")));

        assertThat(savedNote.get().getAutoTaggedAt()).isNotNull();
        assertThat(savedNote.get().getTags()).containsExactly("hiring");
        verify(noteRepository, times(1)).save(any());
        verify(taskRepository, times(1)).save(any());
        assertThat(saved.getNoteId()).isEqualTo(noteId);
        assertThat(source.getStatus()).isEqualTo(SourceStatus.COMPLETED);
        assertThat(jobs.specs).extracting(spec -> spec.type()).containsExactly(JobTypes.EMBED_NOTE);
    }

    @Test
    void secondApproveDoesNotCreateAnotherNote() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID noteId = UUID.randomUUID();
        User user = user(userId);
        Source source = readySource(user, sourceId);
        when(sourceRepository.lockByIdAndUserId(sourceId, userId)).thenReturn(Optional.of(source));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(noteRepository.save(any())).thenAnswer(invocation -> {
            Note note = invocation.getArgument(0);
            note.setId(noteId);
            return note;
        });

        ApproveCaptureRequest request = new ApproveCaptureRequest(
                "Interview notes", "Call Alex tomorrow.", List.of(), List.of());
        service.approve(userId, sourceId, request);
        service.approve(userId, sourceId, request);

        verify(noteRepository, times(1)).save(any());
        verify(taskRepository, never()).save(any());
    }

    @Test
    void otherUsersSourceIsNotFound() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        when(sourceRepository.lockByIdAndUserId(sourceId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.approve(userId, sourceId, new ApproveCaptureRequest(
                "Title", "Body", List.of(), List.of())))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(noteRepository, never()).save(any());
        verify(taskRepository, never()).save(any());
    }

    private static AiProperties aiProperties() {
        return new AiProperties(
                "mock",
                "mock",
                "mock",
                new AiProperties.OpenAi("", "http://localhost", "m", "e", "t", 8, Duration.ofSeconds(1), Duration.ofSeconds(1), Duration.ofSeconds(1)),
                new AiProperties.Anthropic("", "http://localhost", "m", "low", 8, Duration.ofSeconds(1), Duration.ofSeconds(1)),
                new AiProperties.Gemini("", "http://localhost", "http://localhost", "m", "e", "t", 8, Duration.ofSeconds(1), Duration.ofSeconds(1), Duration.ofSeconds(1)),
                new AiProperties.AutoTag(true, Duration.ofSeconds(20), 120, 5));
    }

    private static User user(UUID id) {
        User user = new User("alice@example.com", "hash", "Alice");
        user.setId(id);
        return user;
    }

    private static Source readySource(User user, UUID sourceId) {
        Source source = new Source(user, "brief.txt", "brief.txt", "text/plain", 20);
        source.setId(sourceId);
        source.setStatus(SourceStatus.READY);
        source.setReviewPayload("""
                {"summary":"Summary","tasks":[{"title":"Call Alex","description":""},{"title":"Email Sam","description":""}],"tags":["hiring"]}
                """);
        return source;
    }
}
