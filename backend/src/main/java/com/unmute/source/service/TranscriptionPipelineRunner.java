package com.unmute.source.service;

import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.note.domain.Note;
import com.unmute.note.event.NoteContentChangedEvent;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.event.SourceTranscriptionRequestedEvent;
import com.unmute.source.repository.SourceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Set;
import java.util.UUID;

/**
 * Background transcription pipeline: PENDING -> TRANSCRIBING -> COMPLETED | FAILED.
 * <p>
 * Each state transition commits in its own short transaction, and the (potentially minutes-long)
 * transcription call runs with no transaction or pooled connection held. That makes TRANSCRIBING
 * visible to pollers and guarantees a failure can always be recorded.
 */
@Service
public class TranscriptionPipelineRunner {

    private static final Logger log = LoggerFactory.getLogger(TranscriptionPipelineRunner.class);
    private static final int MAX_ERROR_LENGTH = 1_000;

    private final SourceRepository sourceRepository;
    private final UserRepository userRepository;
    private final NoteRepository noteRepository;
    private final FileStorageService fileStorageService;
    private final TranscriptionService transcriptionService;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate tx;

    public TranscriptionPipelineRunner(SourceRepository sourceRepository,
                                       UserRepository userRepository,
                                       NoteRepository noteRepository,
                                       FileStorageService fileStorageService,
                                       TranscriptionService transcriptionService,
                                       ApplicationEventPublisher events,
                                       PlatformTransactionManager transactionManager) {
        this.sourceRepository = sourceRepository;
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.fileStorageService = fileStorageService;
        this.transcriptionService = transcriptionService;
        this.events = events;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** Runs only after the PENDING row is committed, so the worker can always see it. */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onTranscriptionRequested(SourceTranscriptionRequestedEvent event) {
        run(event.sourceId());
    }

    void run(UUID sourceId) {
        Job job = tx.execute(status -> claim(sourceId));
        if (job == null) {
            return;
        }

        try {
            String filePath = fileStorageService.getFilePath(job.filename()).toString();
            TranscriptionService.TranscriptionResult result =
                    transcriptionService.transcribe(filePath, job.fileType(), job.originalName());

            tx.executeWithoutResult(status -> complete(sourceId, job, result));
        } catch (Exception e) {
            log.error("Transcription pipeline failed for source {}: {}", sourceId, e.getMessage(), e);
            tx.executeWithoutResult(status -> fail(sourceId, e));
        }
    }

    private record Job(UUID userId, String filename, String fileType, String originalName) {}

    /** Atomically moves PENDING -> TRANSCRIBING; returns null if the source is gone or already claimed. */
    private Job claim(UUID sourceId) {
        if (sourceRepository.claimPending(sourceId, Instant.now()) == 0) {
            return null;
        }
        Source source = sourceRepository.findById(sourceId).orElseThrow();
        log.info("Source {} status set to TRANSCRIBING", sourceId);
        return new Job(source.getUser().getId(), source.getFilename(), source.getFileType(), source.getOriginalName());
    }

    private void complete(UUID sourceId, Job job, TranscriptionService.TranscriptionResult result) {
        Source source = sourceRepository.findById(sourceId).orElse(null);
        if (source == null) {
            log.info("Source {} was deleted during transcription; discarding transcript", sourceId);
            return;
        }

        User user = userRepository.getReferenceById(job.userId());
        Note note = new Note(
                user,
                generateNoteTitle(job.originalName()),
                formatTranscriptAsHtml(result.text(), job.originalName(), result.durationSeconds())
        );
        note.setTags(Set.of("voice-note", "transcription"));
        note = noteRepository.save(note);

        source.setTranscript(result.text());
        source.setDurationSeconds(result.durationSeconds());
        source.setNote(note);
        source.setStatus(SourceStatus.COMPLETED);
        source.setErrorMessage(null);

        events.publishEvent(new NoteContentChangedEvent(note.getId()));
        log.info("Transcription pipeline completed for source {} -> Note {}", sourceId, note.getId());
    }

    private void fail(UUID sourceId, Exception cause) {
        sourceRepository.findById(sourceId).ifPresent(source -> {
            String message = cause.getMessage() != null ? cause.getMessage() : cause.getClass().getSimpleName();
            source.setStatus(SourceStatus.FAILED);
            source.setErrorMessage(message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message);
        });
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
        String minutes = String.valueOf(durationSeconds / 60);
        String seconds = String.format("%02d", durationSeconds % 60);
        String duration = minutes + ":" + seconds;

        StringBuilder html = new StringBuilder();
        html.append("<p><strong>🎙 Voice Recording Transcript</strong></p>");
        html.append("<p><em>Source: ").append(escapeHtml(originalName))
                .append(" • Duration: ").append(duration).append("</em></p>");
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
