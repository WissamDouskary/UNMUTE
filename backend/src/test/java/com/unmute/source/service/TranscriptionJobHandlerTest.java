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
import com.unmute.source.repository.SourceRepository;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TranscriptionJobHandlerTest {

    @Mock
    private SourceRepository sourceRepository;
    @Mock
    private TranscriptionService transcriptionService;
    @Mock
    private NoteRepository noteRepository;

    @Test
    void completedTranscriptionDoesNotCreateANote() throws Exception {
        UUID sourceId = UUID.randomUUID();
        User user = new User("alice@example.com", "hash", "Alice");
        user.setId(UUID.randomUUID());
        Path dir = Files.createTempDirectory("unmute-audio");
        Files.write(dir.resolve("memo.webm"), new byte[]{1, 2, 3});
        Source source = new Source(user, "memo.webm", "recording.webm", "audio/webm", 3);
        source.setId(sourceId);
        try {
            when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));
            when(transcriptionService.transcribe(any(), any(), any()))
                    .thenReturn(new TranscriptionService.TranscriptionResult("Meet Alex tomorrow.", 4));

            TranscriptionJobHandler handler = new TranscriptionJobHandler(
                    sourceRepository,
                    new FileStorageService(dir.toString()),
                    transcriptionService,
                    new EchoSuggester(),
                    new RecordingJobQueue(),
                    new LiveEventService(),
                    new ImmediateTransactions());
            handler.handle(new ClaimedJob(
                    UUID.randomUUID(),
                    JobTypes.TRANSCRIBE_SOURCE,
                    new ObjectMapper().valueToTree(Map.of("sourceId", sourceId.toString())),
                    1,
                    4,
                    UUID.randomUUID()));

            assertThat(source.getStatus()).isEqualTo(SourceStatus.READY);
            assertThat(source.getNote()).isNull();
            assertThat(source.getTranscript()).isEqualTo("Meet Alex tomorrow.");
            assertThat(source.getReviewPayload()).contains("Meet Alex tomorrow.");
            verify(noteRepository, never()).save(any());
        } finally {
            Files.deleteIfExists(dir.resolve("memo.webm"));
            Files.deleteIfExists(dir);
        }
    }

    private static final class EchoSuggester extends CaptureSuggester {
        private EchoSuggester() {
            super(null, null, new ObjectMapper());
        }

        @Override
        public ReviewPayload suggest(String text) {
            return new ReviewPayload(text, List.of(), List.of());
        }
    }
}
