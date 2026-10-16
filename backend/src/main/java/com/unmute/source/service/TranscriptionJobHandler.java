package com.unmute.source.service;

import com.unmute.ai.service.NoteJobScheduler;
import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.jobs.ClaimedJob;
import com.unmute.jobs.JobHandler;
import com.unmute.jobs.JobQueue;
import com.unmute.jobs.JobSpec;
import com.unmute.jobs.JobTypes;
import com.unmute.jobs.NonRetryableJobException;
import com.unmute.live.LiveEventService;
import com.unmute.live.LiveEventTypes;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
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
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The {@link JobTypes#TRANSCRIBE_SOURCE} handler: PENDING -> TRANSCRIBING -> COMPLETED | FAILED.
 * <p>
 * Each state transition commits in its own short transaction and the (potentially minutes-long) provider
 * call holds no transaction or pooled connection. Transient provider failures are retried by the queue;
 * the source only turns FAILED once retries are exhausted or the failure is permanent.
 */
@Service
public class TranscriptionJobHandler implements JobHandler {

    private static final Logger log = LoggerFactory.getLogger(TranscriptionJobHandler.class);
    private static final int MAX_ERROR_LENGTH = 1_000;
    static final int MAX_ATTEMPTS = 4;

    private final SourceRepository sourceRepository;
    private final UserRepository userRepository;
    private final NoteRepository noteRepository;
    private final FileStorageService fileStorageService;
    private final TranscriptionService transcriptionService;
    private final NoteJobScheduler noteJobs;
    private final JobQueue jobQueue;
    private final LiveEventService liveEvents;
    private final TransactionTemplate tx;

    public TranscriptionJobHandler(SourceRepository sourceRepository,
                                   UserRepository userRepository,
                                   NoteRepository noteRepository,
                                   FileStorageService fileStorageService,
                                   TranscriptionService transcriptionService,
                                   NoteJobScheduler noteJobs,
                                   JobQueue jobQueue,
                                   LiveEventService liveEvents,
                                   PlatformTransactionManager transactionManager) {
        this.sourceRepository = sourceRepository;
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.fileStorageService = fileStorageService;
        this.transcriptionService = transcriptionService;
        this.noteJobs = noteJobs;
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
                .filter(source -> source.getStatus() != SourceStatus.COMPLETED)
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
                List<Source> inFlight = sourceRepository.findByStatusIn(List.of(SourceStatus.PENDING, SourceStatus.TRANSCRIBING));
                int count = 0;
                for (Source source : inFlight) {
                    if (!jobQueue.hasActiveJob(JobTypes.TRANSCRIBE_SOURCE, source.getId().toString())) {
                        jobQueue.enqueue(jobFor(source.getId()));
                        count++;
                    }
                }
                return count;
            });
            if (requeued != null && requeued > 0) {
                log.info("Re-queued {} in-flight transcription(s) without a job", requeued);
            }
        } catch (Exception e) {
            log.warn("Transcription startup reconciliation skipped: {}", e.getMessage());
        }
    }

    private record Work(UUID userId, String filename, String fileType, String originalName) {}

    /** Moves the source to TRANSCRIBING; null if it is gone or already settled (a stale or duplicate job). */
    private Work start(UUID sourceId) {
        Source source = sourceRepository.findById(sourceId).orElse(null);
        if (source == null || source.getStatus() == SourceStatus.COMPLETED || source.getStatus() == SourceStatus.FAILED) {
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
        if (source.getNote() != null) {
            return; // A previous delivery of this job already created the note.
        }

        User user = userRepository.getReferenceById(work.userId());
        Note note = new Note(
                user,
                generateNoteTitle(work.originalName()),
                formatTranscriptAsHtml(result.text(), work.originalName(), result.durationSeconds())
        );
        note.setTags(Set.of("voice-note", "transcription"));
        note = noteRepository.save(note);

        source.setTranscript(result.text());
        source.setDurationSeconds(result.durationSeconds());
        source.setNote(note);
        source.setStatus(SourceStatus.COMPLETED);
        source.setErrorMessage(null);

        noteJobs.transcriptNoteCreated(note);
        liveEvents.publish(work.userId(), LiveEventTypes.NOTE_CREATED,
                new LiveEventTypes.NoteCreated(note.getId(), note.getTitle(), sourceId));
        publishStatus(work.userId(), source);
        log.info("Transcription completed for source {} -> Note {}", sourceId, note.getId());
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

    private String generateNoteTitle(String originalName) {
        String baseName = originalName;
        int lastDot = originalName.lastIndexOf('.');
        if (lastDot > 0) {
            baseName = originalName.substring(0, lastDot);
        }

        if (baseName.toLowerCase().startsWith("recording") || baseName.toLowerCase().startsWith("blob")) {
            String date = LocalDate.now().format(DateTimeFormatter.ofPattern("MMM dd, yyyy"));
            String time = LocalTime.now().format(DateTimeFormatter.ofPattern("hh:mm a"));
            return "Voice Note — " + date + " at " + time;
        }

        return "Transcription: " + baseName;
    }

    private String formatTranscriptAsHtml(String transcript, String originalName, int durationSeconds) {
        StringBuilder html = new StringBuilder();
        html.append("<p><strong>🎙 Voice Recording Transcript</strong></p>");
        html.append("<p><em>Source: ").append(escapeHtml(originalName));
        if (durationSeconds > 0) {
            html.append(" • Duration: ").append(durationSeconds / 60).append(':')
                    .append(String.format("%02d", durationSeconds % 60));
        }
        html.append("</em></p>");
        html.append("<hr>");

        String[] sentences = transcript.split("(?<=[.!?])\\s+");
        StringBuilder paragraph = new StringBuilder();
        int sentenceCount = 0;

        for (String sentence : sentences) {
            paragraph.append(escapeHtml(sentence)).append(" ");
            sentenceCount++;
            if (sentenceCount >= 3) {
                html.append("<p>").append(paragraph.toString().trim()).append("</p>");
                paragraph = new StringBuilder();
                sentenceCount = 0;
            }
        }
        if (paragraph.length() > 0) {
            html.append("<p>").append(paragraph.toString().trim()).append("</p>");
        }

        return html.toString();
    }

    private String escapeHtml(String text) {
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
