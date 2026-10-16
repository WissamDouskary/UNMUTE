package com.unmute.ai.service;

import com.unmute.ai.provider.EmbeddingProvider;
import com.unmute.ai.repository.NoteEmbeddingRepository;
import com.unmute.note.domain.Note;
import com.unmute.note.event.NoteContentChangedEvent;
import com.unmute.note.repository.NoteRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.regex.Pattern;

/**
 * Keeps pgvector embeddings in sync with notes, strictly outside of note persistence.
 * <p>
 * Notes publish {@link NoteContentChangedEvent}; embeddings are computed only after the note transaction
 * commits, on a dedicated single worker thread. A failing or slow embedding provider can therefore never
 * roll back, block, or slow down a note save.
 */
@Service
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    private static final int MAX_CHUNK_TEXT = 500;
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private final EmbeddingProvider embeddingProvider;
    private final NoteEmbeddingRepository noteEmbeddingRepository;
    private final NoteRepository noteRepository;
    private final TransactionTemplate readOnlyTx;

    /**
     * One worker keeps updates for the same note strictly ordered (no stale vector overwriting a fresh one).
     */
    private final ThreadPoolTaskExecutor worker;

    /** Notes already queued; repeated autosaves collapse into a single job that reads the latest state. */
    private final Set<UUID> queued = ConcurrentHashMap.newKeySet();

    public EmbeddingService(
            EmbeddingProvider embeddingProvider,
            NoteEmbeddingRepository noteEmbeddingRepository,
            NoteRepository noteRepository,
            PlatformTransactionManager transactionManager
    ) {
        this.embeddingProvider = embeddingProvider;
        this.noteEmbeddingRepository = noteEmbeddingRepository;
        this.noteRepository = noteRepository;

        this.readOnlyTx = new TransactionTemplate(transactionManager);
        this.readOnlyTx.setReadOnly(true);

        this.worker = new ThreadPoolTaskExecutor();
        this.worker.setCorePoolSize(1);
        this.worker.setMaxPoolSize(1);
        this.worker.setQueueCapacity(10_000);
        this.worker.setThreadNamePrefix("embedding-");
        // Under extreme backlog, degrade to inline execution rather than silently dropping updates.
        this.worker.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        this.worker.setWaitForTasksToCompleteOnShutdown(true);
        this.worker.setAwaitTerminationSeconds(10);
        this.worker.initialize();
    }

    @PreDestroy
    void shutdown() {
        worker.shutdown();
    }

    /**
     * Fires only once the note row is durably committed, so the note_embeddings FK always resolves.
     * {@code fallbackExecution} covers publishers that run without a transaction.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onNoteContentChanged(NoteContentChangedEvent event) {
        scheduleSync(event.noteId());
    }

    public void scheduleSync(UUID noteId) {
        if (noteId == null || !queued.add(noteId)) {
            return;
        }
        worker.execute(() -> {
            queued.remove(noteId);
            syncNoteEmbedding(noteId);
        });
    }

    /**
     * Generates and persists the embedding for the note's current state. Never throws.
     */
    void syncNoteEmbedding(UUID noteId) {
        try {
            EmbeddingInput input = readOnlyTx.execute(status ->
                    noteRepository.findById(noteId).map(EmbeddingService::toInput).orElse(null));
            if (input == null) {
                return; // Deleted before we got to it; the FK cascade already removed any old vector.
            }

            float[] vector = embeddingProvider.generateEmbedding(input.text());
            noteEmbeddingRepository.upsertEmbedding(
                    noteId,
                    input.userId(),
                    embeddingProvider.toVectorString(vector),
                    truncate(input.text(), MAX_CHUNK_TEXT)
            );
            log.debug("Synchronized pgvector embedding for note {}", noteId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Skipped embedding for note {}: note was deleted concurrently", noteId);
        } catch (Exception e) {
            log.error("Failed to generate or persist embedding for note {}: {}", noteId, e.getMessage(), e);
        }
    }

    public String generateQueryVector(String query) {
        float[] vector = embeddingProvider.generateEmbedding(query);
        return embeddingProvider.toVectorString(vector);
    }

    /**
     * Backfills embeddings for notes that predate pgvector or whose sync was lost (e.g. crash mid-queue).
     */
    @EventListener(ApplicationReadyEvent.class)
    public void syncMissingEmbeddingsOnStartup() {
        try {
            List<UUID> missingIds = noteEmbeddingRepository.findNoteIdsWithoutEmbeddings();
            if (missingIds.isEmpty()) {
                log.info("All notes have pgvector embeddings. Semantic search is fully warm.");
                return;
            }
            log.info("Queueing {} notes missing pgvector embeddings for backfill.", missingIds.size());
            missingIds.forEach(this::scheduleSync);
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
    private static String toPlainText(String html) {
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
