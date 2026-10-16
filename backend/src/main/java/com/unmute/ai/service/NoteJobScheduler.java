package com.unmute.ai.service;

import com.unmute.jobs.JobQueue;
import com.unmute.jobs.JobSpec;
import com.unmute.jobs.JobTypes;
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

    private final JobQueue jobQueue;

    public NoteJobScheduler(JobQueue jobQueue) {
        this.jobQueue = jobQueue;
    }

    public void contentChanged(UUID noteId) {
        enqueueEmbedding(noteId, EMBED_DEBOUNCE);
    }

    public void reindex(UUID noteId) {
        enqueueEmbedding(noteId, Duration.ZERO);
    }

    private void enqueueEmbedding(UUID noteId, Duration delay) {
        jobQueue.enqueue(JobSpec.of(JobTypes.EMBED_NOTE, Map.of("noteId", noteId))
                .dedupedBy(noteId.toString())
                .delayedBy(delay));
    }
}
