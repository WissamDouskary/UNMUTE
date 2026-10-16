package com.unmute.ai.service;

import com.unmute.ai.provider.EmbeddingProvider;
import com.unmute.ai.repository.NoteEmbeddingRepository;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    private final EmbeddingProvider embeddingProvider;
    private final NoteEmbeddingRepository noteEmbeddingRepository;
    private final NoteRepository noteRepository;

    public EmbeddingService(
            EmbeddingProvider embeddingProvider,
            NoteEmbeddingRepository noteEmbeddingRepository,
            NoteRepository noteRepository
    ) {
        this.embeddingProvider = embeddingProvider;
        this.noteEmbeddingRepository = noteEmbeddingRepository;
        this.noteRepository = noteRepository;
    }

    /**
     * Generates a 384-dimensional vector embedding for the note and persists it in PostgreSQL (pgvector).
     */
    @Transactional
    public void syncNoteEmbedding(Note note) {
        if (note == null || note.getId() == null || note.getUser() == null) {
            return;
        }

        try {
            StringBuilder sb = new StringBuilder();
            if (note.getTitle() != null) {
                sb.append(note.getTitle()).append(". ");
            }
            if (note.getSummary() != null && !note.getSummary().isBlank()) {
                sb.append(note.getSummary()).append(" ");
            }
            if (note.getTags() != null && !note.getTags().isEmpty()) {
                sb.append(String.join(" ", note.getTags())).append(" ");
            }
            if (note.getContent() != null && !note.getContent().isBlank()) {
                sb.append(note.getContent());
            }

            String fullText = sb.toString();
            float[] vector = embeddingProvider.generateEmbedding(fullText);
            String vectorStr = embeddingProvider.toVectorString(vector);

            String chunkText = fullText.length() > 500
                    ? fullText.substring(0, 497) + "..."
                    : fullText;

            // The upsert goes through JDBC, which bypasses Hibernate's write-behind cache: a note saved
            // earlier in this transaction must be flushed or the note_embeddings FK insert fails.
            noteRepository.flush();
            noteEmbeddingRepository.upsertEmbedding(
                    note.getId(),
                    note.getUser().getId(),
                    vectorStr,
                    chunkText
            );

            log.debug("Synchronized pgvector embedding for note {} (user: {})", note.getId(), note.getUser().getId());
        } catch (Exception e) {
            log.error("Failed to generate or persist embedding for note {}: {}", note.getId(), e.getMessage(), e);
        }
    }

    /**
     * Removes the vector embedding for the given note.
     */
    @Transactional
    public void deleteNoteEmbedding(UUID noteId) {
        if (noteId == null) return;
        try {
            noteEmbeddingRepository.deleteByNoteId(noteId);
        } catch (Exception e) {
            log.error("Failed to delete embedding for note {}: {}", noteId, e.getMessage(), e);
        }
    }

    /**
     * Generates query embedding vector string for semantic search or RAG.
     */
    public String generateQueryVector(String query) {
        float[] vector = embeddingProvider.generateEmbedding(query);
        return embeddingProvider.toVectorString(vector);
    }

    /**
     * Warmup runner: automatically generates embeddings for any existing notes in the database
     * that do not yet have pgvector embeddings.
     */
    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void syncMissingEmbeddingsOnStartup() {
        try {
            List<UUID> missingIds = noteEmbeddingRepository.findNoteIdsWithoutEmbeddings();
            if (missingIds.isEmpty()) {
                log.info("All notes have pgvector embeddings. Semantic search is fully warm.");
                return;
            }

            log.info("Found {} notes missing pgvector embeddings. Generating embeddings...", missingIds.size());
            int count = 0;
            for (UUID noteId : missingIds) {
                noteRepository.findById(noteId).ifPresent(note -> {
                    syncNoteEmbedding(note);
                });
                count++;
            }
            log.info("Successfully synchronized {} note embeddings into pgvector.", count);
        } catch (Exception e) {
            log.warn("Notice: Startup vector embedding warmup deferred or skipped (database may be initialising): {}", e.getMessage());
        }
    }
}
