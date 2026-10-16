package com.unmute.ai.service;

import com.unmute.ai.config.AiProperties;
import com.unmute.jobs.JobQueue;
import com.unmute.jobs.JobSpec;
import com.unmute.jobs.JobTypes;
import com.unmute.note.domain.Note;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Enqueues the background AI work a note needs. Call it inside the transaction that changed the note, so
 * the jobs commit atomically with the change and survive a crash.
 */
@Service
public class NoteJobScheduler {

    /** Autosave fires every few seconds while typing; embed once the burst settles. */
    static final Duration EMBED_DEBOUNCE = Duration.ofSeconds(3);
    static final int AUTO_TAG_MAX_ATTEMPTS = 3;

    private final JobQueue jobQueue;
    private final AiProperties.AutoTag autoTag;

    public NoteJobScheduler(JobQueue jobQueue, AiProperties aiProperties) {
        this.jobQueue = jobQueue;
        this.autoTag = aiProperties.autoTag();
    }

    /**
     * Re-embeds the note and, until it has been auto-tagged once, schedules tagging for when edits pause
     * (each change pushes the pending job back, so a half-written note is not tagged).
     */
    public void noteChanged(Note note) {
        enqueueEmbedding(note.getId(), EMBED_DEBOUNCE);
        if (autoTag.enabled() && note.getAutoTaggedAt() == null) {
            enqueueAutoTag(note.getId(), autoTag.debounce(), false, false);
        }
    }

    /** A transcript is complete on arrival, so it is embedded and tagged right away. */
    public void transcriptNoteCreated(Note note) {
        enqueueEmbedding(note.getId(), Duration.ZERO);
        if (autoTag.enabled()) {
            enqueueAutoTag(note.getId(), Duration.ZERO, false, true);
        }
    }

    /** User-requested tagging; runs even if the note was tagged before. */
    public void requestAutoTag(UUID noteId) {
        enqueueAutoTag(noteId, Duration.ZERO, true, false);
    }

    public void reindex(UUID noteId) {
        enqueueEmbedding(noteId, Duration.ZERO);
    }

    private void enqueueEmbedding(UUID noteId, Duration delay) {
        jobQueue.enqueue(JobSpec.of(JobTypes.EMBED_NOTE, Map.of("noteId", noteId))
                .dedupedBy(noteId.toString())
                .delayedBy(delay));
    }

    /** Forced requests use their own key so a pending automatic run cannot swallow them. */
    private void enqueueAutoTag(UUID noteId, Duration delay, boolean force, boolean fromTranscript) {
        jobQueue.enqueue(JobSpec.of(JobTypes.AUTO_TAG_NOTE,
                        Map.of("noteId", noteId, "force", force, "fromTranscript", fromTranscript))
                .dedupedBy(force ? noteId + ":force" : noteId.toString())
                .delayedBy(delay)
                .withMaxAttempts(AUTO_TAG_MAX_ATTEMPTS));
    }
}
