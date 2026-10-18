package com.unmute.source.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.auth.domain.User;
import com.unmute.jobs.ClaimedJob;
import com.unmute.jobs.JobTypes;
import com.unmute.live.LiveEventService;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.dto.ReviewPayload;
import com.unmute.source.dto.ReviewTask;
import com.unmute.source.repository.SourceRepository;
import com.unmute.task.repository.TaskRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CaptureSuggesterTest {

    @Mock
    private SourceRepository sourceRepository;
    @Mock
    private NoteRepository noteRepository;
    @Mock
    private TaskRepository taskRepository;

    @Test
    void suggestionsAreStoredAndNoNoteOrTaskIsCreated() throws Exception {
        UUID sourceId = UUID.randomUUID();
        User user = new User("alice@example.com", "hash", "Alice");
        user.setId(UUID.randomUUID());
        Path dir = Files.createTempDirectory("unmute-capture");
        Files.writeString(dir.resolve("brief.txt"), "Meet Alex tomorrow about the role.");
        Source source = new Source(user, "brief.txt", "brief.txt", "text/plain", 20);
        source.setId(sourceId);
        try {
            when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));
            CaptureExtractJobHandler handler = new CaptureExtractJobHandler(
                    sourceRepository,
                    new FileStorageService(dir.toString()),
                    new FixedSuggester(),
                    new LiveEventService(),
                    new ImmediateTransactions());
            handler.handle(new ClaimedJob(
                    UUID.randomUUID(),
                    JobTypes.EXTRACT_CAPTURE,
                    new ObjectMapper().valueToTree(Map.of("sourceId", sourceId.toString())),
                    1,
                    4,
                    UUID.randomUUID()));

            assertThat(source.getStatus()).isEqualTo(SourceStatus.READY);
            assertThat(source.getNote()).isNull();
            assertThat(source.getReviewPayload()).contains("Call Alex").contains("hiring");
            verify(noteRepository, never()).save(any());
            verify(taskRepository, never()).save(any());
        } finally {
            Files.deleteIfExists(dir.resolve("brief.txt"));
            Files.deleteIfExists(dir);
        }
    }

    private static final class FixedSuggester extends CaptureSuggester {
        private FixedSuggester() {
            super(null, null, new ObjectMapper());
        }

        @Override
        public ReviewPayload suggest(String text) {
            return new ReviewPayload(
                    "Summary",
                    List.of(new ReviewTask("Call Alex", "About the role")),
                    List.of("hiring"));
        }
    }
}
