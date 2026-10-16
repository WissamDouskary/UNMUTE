package com.unmute.ai.service;

import com.unmute.ai.config.AiProperties;
import com.unmute.ai.provider.AiProvider;
import com.unmute.ai.provider.NoteText;
import com.unmute.ai.provider.TagNormalizer;
import com.unmute.jobs.ClaimedJob;
import com.unmute.jobs.JobHandler;
import com.unmute.jobs.JobTypes;
import com.unmute.live.LiveEventService;
import com.unmute.live.LiveEventTypes;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.*;

/**
 * The {@link JobTypes#AUTO_TAG_NOTE} handler: asks the model for tags, merges new ones into the note, and
 * tells open tabs over live events. The model call runs between two short transactions, and the merge
 * re-reads the note so edits made meanwhile are kept. Tags are only ever added, never removed.
 */
@Service
public class AutoTagService implements JobHandler {

    private static final Logger log = LoggerFactory.getLogger(AutoTagService.class);

    /** A forced run still needs something to work with. */
    private static final int FORCED_MIN_CHARS = 20;
    private static final int MAX_TAGS_PER_NOTE = 20;

    private final NoteRepository noteRepository;
    private final AiProvider aiProvider;
    private final NoteJobScheduler noteJobs;
    private final LiveEventService liveEvents;
    private final AiProperties.AutoTag properties;
    private final TransactionTemplate tx;
    private final TransactionTemplate readOnlyTx;

    public AutoTagService(NoteRepository noteRepository,
                          AiProvider aiProvider,
                          NoteJobScheduler noteJobs,
                          LiveEventService liveEvents,
                          AiProperties aiProperties,
                          PlatformTransactionManager transactionManager) {
        this.noteRepository = noteRepository;
        this.aiProvider = aiProvider;
        this.noteJobs = noteJobs;
        this.liveEvents = liveEvents;
        this.properties = aiProperties.autoTag();
        this.tx = new TransactionTemplate(transactionManager);
        this.readOnlyTx = new TransactionTemplate(transactionManager);
        this.readOnlyTx.setReadOnly(true);
    }

    @Override
    public String type() {
        return JobTypes.AUTO_TAG_NOTE;
    }

    @Override
    public void handle(ClaimedJob job) {
        UUID noteId = job.uuid("noteId");
        boolean force = job.flag("force");

        Input input = readOnlyTx.execute(status -> load(noteId, force));
        if (input == null) {
            return;
        }
        if (input.skipReason() != null) {
            log.debug("Auto-tag skipped for note {}: {}", noteId, input.skipReason());
            if (force) {
                liveEvents.publish(input.userId(), LiveEventTypes.NOTE_TAGGED,
                        new LiveEventTypes.NoteTagged(noteId, List.of(), List.copyOf(input.currentTags())));
            }
            return;
        }

        List<String> suggested = TagNormalizer.normalizeSuggestions(
                aiProvider.suggestTags(input.title(), input.content(), input.vocabulary(), properties.maxTags()),
                properties.maxTags());

        Result result = tx.execute(status -> merge(noteId, force, suggested));
        if (result == null) {
            return;
        }
        log.info("Auto-tagged note {} with {}", noteId, result.added());
        liveEvents.publish(result.userId(), LiveEventTypes.NOTE_TAGGED,
                new LiveEventTypes.NoteTagged(noteId, result.added(), result.tags()));
    }

    /** Automatic runs fail silently; a user who asked for tags is told. */
    @Override
    public void onFinalFailure(ClaimedJob job, Exception error) {
        if (!job.flag("force")) {
            return;
        }
        UUID noteId = job.uuid("noteId");
        UUID userId = readOnlyTx.execute(status -> noteRepository.findById(noteId).map(n -> n.getUser().getId()).orElse(null));
        if (userId != null) {
            String message = error.getMessage() != null ? error.getMessage() : "Auto-tagging failed";
            liveEvents.publish(userId, LiveEventTypes.NOTE_TAG_FAILED, new LiveEventTypes.NoteTagFailed(noteId, message));
        }
    }

    private record Input(UUID userId, String title, String content, List<String> vocabulary,
                         Set<String> currentTags, String skipReason) {}

    private record Result(UUID userId, List<String> added, List<String> tags) {}

    private Input load(UUID noteId, boolean force) {
        Note note = noteRepository.findById(noteId).orElse(null);
        if (note == null || (!force && note.getAutoTaggedAt() != null)) {
            return null;
        }
        UUID userId = note.getUser().getId();
        Set<String> currentTags = new TreeSet<>(note.getTags());

        int length = NoteText.toPlainText(note.getContent()).length();
        int minChars = force ? FORCED_MIN_CHARS : properties.minChars();
        if (length < minChars) {
            // Not marked as tagged: the next edit tries again once the note has grown.
            return new Input(userId, null, null, null, currentTags, "too short (" + length + " < " + minChars + " chars)");
        }
        if (currentTags.size() >= MAX_TAGS_PER_NOTE) {
            return new Input(userId, null, null, null, currentTags, "already has " + currentTags.size() + " tags");
        }
        List<String> vocabulary = noteRepository.findAllTagsByUserId(userId);
        return new Input(userId, note.getTitle(), note.getContent(), vocabulary, currentTags, null);
    }

    private Result merge(UUID noteId, boolean force, List<String> suggested) {
        Note note = noteRepository.findById(noteId).orElse(null);
        if (note == null || (!force && note.getAutoTaggedAt() != null)) {
            return null; // Deleted, or another run already tagged it.
        }

        List<String> added = new ArrayList<>();
        for (String tag : suggested) {
            if (note.getTags().size() >= MAX_TAGS_PER_NOTE) {
                break;
            }
            if (note.getTags().add(tag)) {
                added.add(tag);
            }
        }
        note.setAutoTaggedAt(Instant.now());
        noteRepository.save(note);
        if (!added.isEmpty()) {
            noteJobs.reindex(noteId); // Tags are part of the embedded text.
        }
        return new Result(note.getUser().getId(), added, List.copyOf(new TreeSet<>(note.getTags())));
    }
}
