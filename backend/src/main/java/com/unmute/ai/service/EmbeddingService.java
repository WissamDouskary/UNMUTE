package com.unmute.ai.service;

import com.unmute.ai.provider.EmbeddingProvider;
import com.unmute.ai.repository.NoteEmbeddingRepository;
import com.unmute.jobs.ClaimedJob;
import com.unmute.jobs.JobHandler;
import com.unmute.jobs.JobTypes;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Keeps pgvector embeddings in sync with notes as the {@link JobTypes#EMBED_NOTE} handler. Jobs are
 * enqueued in the note's own transaction and run on the durable worker, so a slow or failing provider never
 * blocks a save, and a crash never loses an update. Each run embeds the note's latest state, which makes
 * repeated runs harmless.
 */
@Service
public class EmbeddingService implements JobHandler {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    private static final int MAX_CHUNK_TEXT = 500;
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private final EmbeddingProvider embeddingProvider;
    private final NoteEmbeddingRepository noteEmbeddingRepository;
    private final NoteRepository noteRepository;
    private final NoteJobScheduler noteJobs;
    private final TransactionTemplate tx;
    private final TransactionTemplate readOnlyTx;

    public EmbeddingService(
            EmbeddingProvider embeddingProvider,
            NoteEmbeddingRepository noteEmbeddingRepository,
            NoteRepository noteRepository,
            NoteJobScheduler noteJobs,
            PlatformTransactionManager transactionManager
    ) {
        this.embeddingProvider = embeddingProvider;
        this.noteEmbeddingRepository = noteEmbeddingRepository;
        this.noteRepository = noteRepository;
        this.noteJobs = noteJobs;
        this.tx = new TransactionTemplate(transactionManager);
        this.readOnlyTx = new TransactionTemplate(transactionManager);
        this.readOnlyTx.setReadOnly(true);
    }

    @Override
    public String type() {
        return JobTypes.EMBED_NOTE;
    }

    @Override
    public void handle(ClaimedJob job) {
        syncNoteEmbedding(job.uuid("noteId"));
    }

    /** Generates and persists the embedding for the note's current state; provider errors propagate for retry. */
    void syncNoteEmbedding(UUID noteId) {
        EmbeddingInput input = readOnlyTx.execute(status ->
                noteRepository.findById(noteId).map(EmbeddingService::toInput).orElse(null));
        if (input == null) {
            return; // Deleted before we got to it; the FK cascade already removed any old vector.
        }

        String text = input.text().length() > embeddingProvider.maxInputChars()
                ? input.text().substring(0, embeddingProvider.maxInputChars())
                : input.text();
        float[] vector = embeddingProvider.generateEmbedding(text);
        try {
            noteEmbeddingRepository.upsertEmbedding(
                    noteId,
                    input.userId(),
                    embeddingProvider.toVectorString(vector),
                    truncate(text, MAX_CHUNK_TEXT),
                    embeddingProvider.modelId()
            );
            log.debug("Synchronized pgvector embedding for note {}", noteId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Skipped embedding for note {}: note was deleted concurrently", noteId);
        }
    }

    public String generateQueryVector(String query) {
        float[] vector = embeddingProvider.generateEmbedding(query);
        return embeddingProvider.toVectorString(vector);
    }

    public String modelId() {
        return embeddingProvider.modelId();
    }

    /**
     * Backfills notes without a vector and re-embeds those from another model (e.g. after adding an OpenAI
     * key). Pending jobs coalesce, so re-running this on every start is cheap.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void enqueueMissingEmbeddingsOnStartup() {
        try {
            List<UUID> missingIds = noteEmbeddingRepository.findNoteIdsNeedingEmbedding(embeddingProvider.modelId());
            if (missingIds.isEmpty()) {
                log.info("All notes have {} embeddings. Semantic search is fully warm.", embeddingProvider.modelId());
                return;
            }
            tx.executeWithoutResult(status -> missingIds.forEach(noteJobs::reindex));
            log.info("Queued {} notes for {} embedding.", missingIds.size(), embeddingProvider.modelId());
        } catch (Exception e) {
            log.warn("Startup embedding backfill skipped: {}", e.getMessage());
        }
    }

    private record EmbeddingInput(UUID userId, String text) {}

    private static EmbeddingInput toInput(Note note) {
        StringBuilder sb = new StringBuilder();
        if (note.getTitle() != null) {
            sb.append(note.getTitle()).append(". ");
        }
        if (note.getSummary() != null && !note.getSummary().isBlank()) {
            sb.append(toPlainText(note.getSummary())).append(' ');
        }
        if (note.getTags() != null && !note.getTags().isEmpty()) {
            sb.append(String.join(" ", note.getTags())).append(' ');
        }
        if (note.getContent() != null && !note.getContent().isBlank()) {
            sb.append(toPlainText(note.getContent()));
        }
        return new EmbeddingInput(note.getUser().getId(), sb.toString().trim());
    }

    /** Tiptap stores HTML; markup tokens would otherwise pollute both the vector and the stored chunk. */
    static String toPlainText(String html) {
        String text = HTML_TAG.matcher(html).replaceAll(" ")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
        return WHITESPACE.matcher(text).replaceAll(" ").trim();
    }

    private static String truncate(String text, int max) {
        return text.length() > max ? text.substring(0, max - 3) + "..." : text;
    }
}
