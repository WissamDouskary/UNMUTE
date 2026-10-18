package com.unmute.source.service;

import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.exception.UnsupportedMediaTypeException;
import com.unmute.jobs.JobTypes;
import com.unmute.source.repository.SourceRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SourceUploadRoutingTest {

    @Mock
    private SourceRepository sourceRepository;
    @Mock
    private UserRepository userRepository;

    private Path uploads;
    private RecordingJobQueue jobs;
    private SourceService service;

    @BeforeEach
    void setUp() throws Exception {
        TransactionSynchronizationManager.initSynchronization();
        uploads = Files.createTempDirectory("unmute-uploads");
        jobs = new RecordingJobQueue();
        service = new SourceService(sourceRepository, userRepository, new FileStorageService(uploads.toString()), jobs);
    }

    @AfterEach
    void tearDown() throws Exception {
        TransactionSynchronizationManager.clearSynchronization();
        if (uploads != null && Files.exists(uploads)) {
            try (var files = Files.list(uploads)) {
                files.forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (Exception ignored) {
                        // The assertion already ran; leftover temp files are harmless.
                    }
                });
            }
            Files.deleteIfExists(uploads);
        }
    }

    @Test
    void pdfIsNotSentToTheTranscriber() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("alice@example.com", "hash", "Alice");
        user.setId(userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(sourceRepository.save(any())).thenAnswer(invocation -> {
            var source = invocation.getArgument(0, com.unmute.source.domain.Source.class);
            source.setId(UUID.randomUUID());
            return source;
        });

        service.uploadSource(userId, new MockMultipartFile(
                "file", "notes.pdf", "application/pdf", "hello".getBytes()));

        assertThat(jobs.specs).hasSize(1);
        assertThat(jobs.specs.getFirst().type()).isEqualTo(JobTypes.EXTRACT_CAPTURE);
    }

    @Test
    void unknownMimeIsRejected() {
        UUID userId = UUID.randomUUID();
        User user = new User("alice@example.com", "hash", "Alice");
        user.setId(userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> service.uploadSource(userId, new MockMultipartFile(
                "file", "payload.bin", "application/octet-stream", new byte[]{1})))
                .isInstanceOf(UnsupportedMediaTypeException.class);
        assertThat(jobs.specs).isEmpty();
    }
}
