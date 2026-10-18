package com.unmute.source.service;

import com.unmute.ai.provider.TagNormalizer;
import com.unmute.ai.service.NoteJobScheduler;
import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.exception.BadRequestException;
import com.unmute.common.exception.ConflictException;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.live.LiveEventService;
import com.unmute.live.LiveEventTypes;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.dto.ApproveCaptureRequest;
import com.unmute.source.dto.ReviewTask;
import com.unmute.source.dto.SourceDto;
import com.unmute.source.repository.SourceRepository;
import com.unmute.task.domain.TaskPriority;
import com.unmute.task.dto.CreateTaskRequest;
import com.unmute.task.service.TaskService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Turns an accepted review into one note and the tasks the user kept.
 * Tags the user did not send are not saved, and auto-tag does not add more.
 */
@Service
public class CaptureReviewService {

    private static final int MAX_TITLE = 255;

    private final SourceRepository sourceRepository;
    private final UserRepository userRepository;
    private final NoteRepository noteRepository;
    private final TaskService taskService;
    private final NoteJobScheduler noteJobs;
    private final LiveEventService liveEvents;

    public CaptureReviewService(SourceRepository sourceRepository,
                                UserRepository userRepository,
                                NoteRepository noteRepository,
                                TaskService taskService,
                                NoteJobScheduler noteJobs,
                                LiveEventService liveEvents) {
        this.sourceRepository = sourceRepository;
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.taskService = taskService;
        this.noteJobs = noteJobs;
        this.liveEvents = liveEvents;
    }

    @Transactional
    public SourceDto approve(UUID userId, UUID sourceId, ApproveCaptureRequest request) {
        if (request == null
                || request.title() == null || request.title().isBlank()
                || request.body() == null || request.body().isBlank()) {
            throw new BadRequestException("A title and a body are required.");
        }
        String title = request.title().trim();
        if (title.length() > MAX_TITLE) {
            throw new BadRequestException("The title cannot exceed 255 characters.");
        }

        Source source = sourceRepository.findByIdAndUserId(sourceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Source not found with id: " + sourceId));
        if (source.getStatus() == SourceStatus.COMPLETED && source.getNote() != null) {
            return SourceDto.fromEntity(source);
        }
        if (source.getStatus() != SourceStatus.READY) {
            throw new ConflictException("This capture is not ready for review.");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));
        Note note = new Note(user, title, toHtml(request.body().trim()));
        note.setTags(acceptedTags(request));
        note.setAutoTaggedAt(Instant.now());
        note = noteRepository.save(note);

        if (request.tasks() != null) {
            for (ReviewTask task : request.tasks()) {
                if (task == null || task.title() == null || task.title().isBlank()) {
                    continue;
                }
                String taskTitle = task.title().trim();
                if (taskTitle.length() > MAX_TITLE) {
                    taskTitle = taskTitle.substring(0, MAX_TITLE);
                }
                String description = task.description() == null || task.description().isBlank()
                        ? null
                        : task.description().trim();
                taskService.createTask(userId, new CreateTaskRequest(
                        taskTitle, description, note.getId(), TaskPriority.MEDIUM, null));
            }
        }

        source.setNote(note);
        source.setStatus(SourceStatus.COMPLETED);
        source.setErrorMessage(null);
        sourceRepository.save(source);
        noteJobs.noteChanged(note);
        liveEvents.publish(userId, LiveEventTypes.NOTE_CREATED,
                new LiveEventTypes.NoteCreated(note.getId(), note.getTitle(), sourceId));
        liveEvents.publish(userId, LiveEventTypes.SOURCE_UPDATED, new LiveEventTypes.SourceUpdated(
                source.getId(), source.getStatus().name(), note.getId()));
        return SourceDto.fromEntity(source);
    }

    private static Set<String> acceptedTags(ApproveCaptureRequest request) {
        LinkedHashSet<String> tags = new LinkedHashSet<>();
        if (request.tags() == null) {
            return tags;
        }
        for (String raw : request.tags()) {
            TagNormalizer.normalize(raw).ifPresent(tags::add);
        }
        return tags;
    }

    private static String toHtml(String body) {
        StringBuilder html = new StringBuilder();
        for (String paragraph : body.split("\\n{2,}")) {
            html.append("<p>")
                    .append(escape(paragraph).replace("\n", "<br>"))
                    .append("</p>");
        }
        return html.toString();
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
