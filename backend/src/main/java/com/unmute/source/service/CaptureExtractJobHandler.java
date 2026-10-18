package com.unmute.source.service;

import com.unmute.jobs.ClaimedJob;
import com.unmute.jobs.JobHandler;
import com.unmute.jobs.JobSpec;
import com.unmute.jobs.JobTypes;
import com.unmute.jobs.NonRetryableJobException;
import com.unmute.live.LiveEventService;
import com.unmute.live.LiveEventTypes;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.dto.ReviewPayload;
import com.unmute.source.repository.SourceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Reads a document, image, or link into review suggestions. It does not create a note, task, or tag,
 * and it never sends the file to the transcriber.
 */
@Service
public class CaptureExtractJobHandler implements JobHandler {

    private static final Logger log = LoggerFactory.getLogger(CaptureExtractJobHandler.class);
    private static final int MAX_ERROR_LENGTH = 1_000;
    static final int MAX_ATTEMPTS = 4;

    private final SourceRepository sourceRepository;
    private final FileStorageService fileStorageService;
    private final CaptureSuggester suggester;
    private final LiveEventService liveEvents;
    private final TransactionTemplate tx;

    public CaptureExtractJobHandler(SourceRepository sourceRepository,
                                    FileStorageService fileStorageService,
                                    CaptureSuggester suggester,
                                    LiveEventService liveEvents,
                                    PlatformTransactionManager transactionManager) {
        this.sourceRepository = sourceRepository;
        this.fileStorageService = fileStorageService;
        this.suggester = suggester;
        this.liveEvents = liveEvents;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public static JobSpec jobFor(UUID sourceId) {
        return JobSpec.of(JobTypes.EXTRACT_CAPTURE, Map.of("sourceId", sourceId))
                .dedupedBy(sourceId.toString())
                .withMaxAttempts(MAX_ATTEMPTS);
    }

    @Override
    public String type() {
        return JobTypes.EXTRACT_CAPTURE;
    }

    @Override
    public void handle(ClaimedJob job) {
        UUID sourceId = job.uuid("sourceId");
        Work work = tx.execute(status -> start(sourceId));
        if (work == null) {
            return;
        }

        Path file = fileStorageService.getFilePath(work.filename());
        if (!Files.isRegularFile(file)) {
            throw new NonRetryableJobException("The uploaded file is no longer available. Please upload it again.");
        }

        Read extracted = read(file, work.fileType());
        tx.executeWithoutResult(status -> complete(sourceId, extracted));
    }

    @Override
    public void onRetryScheduled(ClaimedJob job, Exception error, Instant nextRunAt) {
        UUID sourceId = job.uuid("sourceId");
        tx.executeWithoutResult(status -> sourceRepository.findById(sourceId)
                .filter(source -> source.getStatus() == SourceStatus.EXTRACTING)
                .ifPresent(source -> {
                    source.setStatus(SourceStatus.PENDING);
                    source.setErrorMessage(truncate("Attempt " + job.attempt() + " of " + job.maxAttempts()
                            + " failed, retrying shortly: " + messageOf(error)));
                    publishStatus(source.getUser().getId(), source);
                }));
    }

    @Override
    public void onFinalFailure(ClaimedJob job, Exception error) {
        UUID sourceId = job.uuid("sourceId");
        tx.executeWithoutResult(status -> sourceRepository.findById(sourceId)
                .filter(source -> source.getStatus() != SourceStatus.COMPLETED && source.getStatus() != SourceStatus.READY)
                .ifPresent(source -> {
                    source.setStatus(SourceStatus.FAILED);
                    source.setErrorMessage(truncate(messageOf(error)));
                    publishStatus(source.getUser().getId(), source);
                }));
    }

    private Read read(Path file, String mime) {
        try {
            if ("text/plain".equals(CaptureKinds.baseType(mime))) {
                String text = Files.readString(file);
                return new Read(text, suggester.suggest(text));
            }
            return new Read(null, suggester.suggestFile(Files.readAllBytes(file), CaptureKinds.baseType(mime)));
        } catch (IOException e) {
            throw new NonRetryableJobException("The uploaded file could not be read.");
        }
    }

    private record Work(UUID userId, String filename, String fileType) {}

    private record Read(String transcript, ReviewPayload suggestions) {}

    private Work start(UUID sourceId) {
        Source source = sourceRepository.findById(sourceId).orElse(null);
        if (source == null
                || CaptureKinds.audio(source.getFileType())
                || source.getStatus() == SourceStatus.COMPLETED
                || source.getStatus() == SourceStatus.FAILED
                || source.getStatus() == SourceStatus.READY) {
            return null;
        }
        source.setStatus(SourceStatus.EXTRACTING);
        publishStatus(source.getUser().getId(), source);
        log.info("Source {} status set to EXTRACTING", sourceId);
        return new Work(source.getUser().getId(), source.getFilename(), source.getFileType());
    }

    private void complete(UUID sourceId, Read extracted) {
        Source source = sourceRepository.findById(sourceId).orElse(null);
        if (source == null || source.getNote() != null || source.getStatus() == SourceStatus.COMPLETED) {
            return;
        }
        source.setTranscript(extracted.transcript());
        source.setReviewPayload(ReviewPayloads.write(extracted.suggestions()));
        source.setStatus(SourceStatus.READY);
        source.setErrorMessage(null);
        publishStatus(source.getUser().getId(), source);
        log.info("Capture ready for review on source {}", sourceId);
    }

    private void publishStatus(UUID userId, Source source) {
        liveEvents.publish(userId, LiveEventTypes.SOURCE_UPDATED, new LiveEventTypes.SourceUpdated(
                source.getId(), source.getStatus().name(), source.getNote() != null ? source.getNote().getId() : null));
    }

    private static String messageOf(Exception error) {
        return error.getMessage() != null ? error.getMessage() : error.getClass().getSimpleName();
    }

    private static String truncate(String message) {
        return message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message;
    }
}
