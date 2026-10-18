package com.unmute.source.service;

import com.unmute.jobs.ClaimedJob;
import com.unmute.jobs.JobHandler;
import com.unmute.jobs.JobQueue;
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
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The {@link JobTypes#TRANSCRIBE_SOURCE} handler: PENDING to TRANSCRIBING to READY or FAILED.
 * A transcript is stored for review. It does not create a note, task, or tag.
 */
@Service
public class TranscriptionJobHandler implements JobHandler {

    private static final Logger log = LoggerFactory.getLogger(TranscriptionJobHandler.class);
    private static final int MAX_ERROR_LENGTH = 1_000;
    static final int MAX_ATTEMPTS = 4;

    private final SourceRepository sourceRepository;
    private final FileStorageService fileStorageService;
    private final TranscriptionService transcriptionService;
    private final CaptureSuggester suggester;
    private final JobQueue jobQueue;
    private final LiveEventService liveEvents;
    private final TransactionTemplate tx;

    public TranscriptionJobHandler(SourceRepository sourceRepository,
                                   FileStorageService fileStorageService,
                                   TranscriptionService transcriptionService,
                                   CaptureSuggester suggester,
                                   JobQueue jobQueue,
                                   LiveEventService liveEvents,
                                   PlatformTransactionManager transactionManager) {
        this.sourceRepository = sourceRepository;
        this.fileStorageService = fileStorageService;
        this.transcriptionService = transcriptionService;
        this.suggester = suggester;
        this.jobQueue = jobQueue;
        this.liveEvents = liveEvents;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** Enqueue inside the transaction that made the source PENDING. */
    public static JobSpec jobFor(UUID sourceId) {
        return JobSpec.of(JobTypes.TRANSCRIBE_SOURCE, Map.of("sourceId", sourceId))
                .dedupedBy(sourceId.toString())
                .withMaxAttempts(MAX_ATTEMPTS);
    }

    @Override
    public String type() {
        return JobTypes.TRANSCRIBE_SOURCE;
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
            throw new NonRetryableJobException("The uploaded audio file is no longer available. Please upload it again.");
        }

        TranscriptionService.TranscriptionResult result =
                transcriptionService.transcribe(file.toString(), work.fileType(), work.originalName());
        if (result.text() == null || result.text().isBlank()) {
            throw new NonRetryableJobException("No speech was detected in this recording.");
        }

        tx.executeWithoutResult(status -> complete(sourceId, work, result));
    }

    @Override
    public void onRetryScheduled(ClaimedJob job, Exception error, Instant nextRunAt) {
        UUID sourceId = job.uuid("sourceId");
        tx.executeWithoutResult(status -> sourceRepository.findById(sourceId)
                .filter(source -> source.getStatus() == SourceStatus.TRANSCRIBING)
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

    /** Re-queues sources accepted before the durable queue existed, or whose job row was lost. */
    @EventListener(ApplicationReadyEvent.class)
    public void requeueOrphanedSourcesOnStartup() {
        try {
            Integer requeued = tx.execute(status -> {
                List<Source> inFlight = sourceRepository.findByStatusIn(List.of(
                        SourceStatus.PENDING, SourceStatus.TRANSCRIBING, SourceStatus.EXTRACTING));
                int count = 0;
                for (Source source : inFlight) {
                    boolean audio = CaptureKinds.audio(source.getFileType());
                    String type = audio ? JobTypes.TRANSCRIBE_SOURCE : JobTypes.EXTRACT_CAPTURE;
                    if (!CaptureKinds.supported(source.getFileType())) {
                        continue;
                    }
                    if (!jobQueue.hasActiveJob(type, source.getId().toString())) {
                        jobQueue.enqueue(audio
                                ? jobFor(source.getId())
                                : CaptureExtractJobHandler.jobFor(source.getId()));
                        count++;
                    }
                }
                return count;
            });
            if (requeued != null && requeued > 0) {
                log.info("Re-queued {} in-flight capture(s) without a job", requeued);
            }
        } catch (Exception e) {
            log.warn("Capture startup reconciliation skipped: {}", e.getMessage());
        }
    }

    private record Work(UUID userId, String filename, String fileType, String originalName) {}

    /** Moves the source to TRANSCRIBING; null if it is gone, not audio, or already settled. */
    private Work start(UUID sourceId) {
        Source source = sourceRepository.findById(sourceId).orElse(null);
        if (source == null
                || !CaptureKinds.audio(source.getFileType())
                || source.getStatus() == SourceStatus.COMPLETED
                || source.getStatus() == SourceStatus.FAILED
                || source.getStatus() == SourceStatus.READY) {
            return null;
        }
        source.setStatus(SourceStatus.TRANSCRIBING);
        publishStatus(source.getUser().getId(), source);
        log.info("Source {} status set to TRANSCRIBING", sourceId);
        return new Work(source.getUser().getId(), source.getFilename(), source.getFileType(), source.getOriginalName());
    }

    private void complete(UUID sourceId, Work work, TranscriptionService.TranscriptionResult result) {
        Source source = sourceRepository.findById(sourceId).orElse(null);
        if (source == null) {
            log.info("Source {} was deleted during transcription; discarding transcript", sourceId);
            return;
        }
        if (source.getNote() != null || source.getStatus() == SourceStatus.COMPLETED) {
            return;
        }

        ReviewPayload suggestions = suggester.suggest(result.text());
        source.setTranscript(result.text());
        source.setDurationSeconds(result.durationSeconds());
        source.setReviewPayload(ReviewPayloads.write(suggestions));
        source.setStatus(SourceStatus.READY);
        source.setErrorMessage(null);
        publishStatus(work.userId(), source);
        log.info("Transcription ready for review on source {}", sourceId);
    }

    /** Sent after commit, so a tab that refetches on the event sees the new status. */
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
