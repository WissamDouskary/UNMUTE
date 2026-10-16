package com.unmute.source.service;

import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.repository.SourceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Set;
import java.util.UUID;

@Service
public class TranscriptionPipelineRunner {

    private static final Logger log = LoggerFactory.getLogger(TranscriptionPipelineRunner.class);

    private final SourceRepository sourceRepository;
    private final UserRepository userRepository;
    private final NoteRepository noteRepository;
    private final FileStorageService fileStorageService;
    private final TranscriptionService transcriptionService;
    private final com.unmute.ai.service.EmbeddingService embeddingService;

    public TranscriptionPipelineRunner(SourceRepository sourceRepository,
                                       UserRepository userRepository,
                                       NoteRepository noteRepository,
                                       FileStorageService fileStorageService,
                                       TranscriptionService transcriptionService,
                                       com.unmute.ai.service.EmbeddingService embeddingService) {
        this.sourceRepository = sourceRepository;
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.fileStorageService = fileStorageService;
        this.transcriptionService = transcriptionService;
        this.embeddingService = embeddingService;
    }

    /**
     * Executes the background transcription pipeline in a separate thread.
     */
    @Async
    @Transactional
    public void runPipelineAsync(UUID sourceId, UUID userId) {
        try {
            // Small pause to guarantee caller transaction has fully committed
            Thread.sleep(250);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        Source source = sourceRepository.findById(sourceId).orElse(null);
        if (source == null) {
            log.error("Source not found for transcription: {}", sourceId);
            return;
        }

        try {
            // Update status to TRANSCRIBING
            source.setStatus(SourceStatus.TRANSCRIBING);
            source = sourceRepository.save(source);
            log.info("Source {} status set to TRANSCRIBING", sourceId);

            // Get file path
            String filePath = fileStorageService.getFilePath(source.getFilename()).toString();

            // Run transcription
            TranscriptionService.TranscriptionResult result = transcriptionService.transcribe(
                    filePath, source.getFileType(), source.getOriginalName()
            );

            // Save transcript and duration
            source.setTranscript(result.text());
            source.setDurationSeconds(result.durationSeconds());

            // Auto-create a Note from the transcript
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

            String noteTitle = generateNoteTitle(source.getOriginalName());
            String noteContent = formatTranscriptAsHtml(result.text(), source.getOriginalName(), result.durationSeconds());

            Note note = new Note(user, noteTitle, noteContent);
            note.setTags(Set.of("voice-note", "transcription"));
            note = noteRepository.save(note);
            embeddingService.syncNoteEmbedding(note);

            source.setNote(note);
            source.setStatus(SourceStatus.COMPLETED);
            sourceRepository.save(source);

            log.info("Transcription pipeline completed successfully for source {} -> Note {}", sourceId, note.getId());

        } catch (Exception e) {
            log.error("Transcription pipeline failed for source {}: {}", sourceId, e.getMessage(), e);
            source.setStatus(SourceStatus.FAILED);
            source.setErrorMessage(e.getMessage());
            sourceRepository.save(source);
        }
    }

    private String generateNoteTitle(String originalName) {
        String baseName = originalName;
        int lastDot = originalName.lastIndexOf('.');
        if (lastDot > 0) {
            baseName = originalName.substring(0, lastDot);
        }

        if (baseName.toLowerCase().startsWith("recording") || baseName.toLowerCase().startsWith("blob")) {
            String date = LocalDate.now().format(DateTimeFormatter.ofPattern("MMM dd, yyyy"));
            String time = java.time.LocalTime.now().format(DateTimeFormatter.ofPattern("hh:mm a"));
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
            paragraph.append(sentence).append(" ");
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
