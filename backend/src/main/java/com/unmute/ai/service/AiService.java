package com.unmute.ai.service;

import com.unmute.ai.dto.*;
import com.unmute.ai.provider.AiProvider;
import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.task.domain.Task;
import com.unmute.task.repository.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Model calls can take seconds, so they run without a transaction; only the resulting writes open one.
 */
@Service
public class AiService {

    private final AiProvider aiProvider;
    private final UserRepository userRepository;
    private final NoteRepository noteRepository;
    private final TaskRepository taskRepository;
    private final NoteJobScheduler noteJobs;
    private final TransactionTemplate tx;

    public AiService(
            AiProvider aiProvider,
            UserRepository userRepository,
            NoteRepository noteRepository,
            TaskRepository taskRepository,
            NoteJobScheduler noteJobs,
            PlatformTransactionManager transactionManager
    ) {
        this.aiProvider = aiProvider;
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.taskRepository = taskRepository;
        this.noteJobs = noteJobs;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public SummarizeResponse summarize(UUID userId, SummarizeRequest request) {
        SummarizeResponse response = aiProvider.summarize(request.content());

        if (request.noteId() != null) {
            tx.executeWithoutResult(status -> noteRepository.findByIdAndUserId(request.noteId(), userId).ifPresent(note -> {
                note.setSummary(response.summary());
                noteRepository.save(note);
                noteJobs.noteChanged(note);
            }));
        }

        return response;
    }

    /** Queues tagging for one of the user's notes; the result arrives as a {@code note.tagged} live event. */
    public void requestAutoTag(UUID userId, UUID noteId) {
        tx.executeWithoutResult(status -> {
            noteRepository.findByIdAndUserId(noteId, userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + noteId));
            noteJobs.requestAutoTag(noteId);
        });
    }

    public ExtractTasksResponse extractTasks(UUID userId, ExtractTasksRequest request) {
        List<ExtractedTaskItem> extracted = aiProvider.extractTasks(request.content());

        if (request.saveToTasks() && !extracted.isEmpty()) {
            List<ExtractedTaskItem> saved = tx.execute(status -> saveTasks(userId, request.noteId(), extracted));
            return new ExtractTasksResponse(saved, saved.size());
        }

        return new ExtractTasksResponse(extracted, extracted.size());
    }

    /** Re-running extraction on the same note links to existing tasks with the same title instead of duplicating. */
    private List<ExtractedTaskItem> saveTasks(UUID userId, UUID noteId, List<ExtractedTaskItem> extracted) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        Note note = noteId != null ? noteRepository.findByIdAndUserId(noteId, userId).orElse(null) : null;

        List<Task> existingTasks = (note != null)
                ? taskRepository.findByUserIdAndNoteIdOrderByCreatedAtDesc(userId, note.getId())
                : List.of();

        Map<String, Task> existingByTitle = new HashMap<>();
        for (Task t : existingTasks) {
            if (t.getTitle() != null) {
                existingByTitle.put(t.getTitle().trim().toLowerCase(), t);
            }
        }

        List<Task> tasksToSave = new ArrayList<>();
        List<ExtractedTaskItem> withIds = new ArrayList<>();

        for (ExtractedTaskItem item : extracted) {
            String cleanTitle = item.title() != null ? item.title().trim().toLowerCase() : "";
            Task existing = existingByTitle.get(cleanTitle);
            if (existing != null) {
                withIds.add(item.withSavedTaskId(existing.getId()));
            } else {
                tasksToSave.add(new Task(user, note, item.title(), item.description(), item.priority(), item.dueDate()));
            }
        }

        for (Task savedTask : taskRepository.saveAll(tasksToSave)) {
            ExtractedTaskItem original = extracted.stream()
                    .filter(e -> e.title() != null && e.title().equalsIgnoreCase(savedTask.getTitle()))
                    .findFirst()
                    .orElse(null);
            withIds.add(original != null
                    ? original.withSavedTaskId(savedTask.getId())
                    : new ExtractedTaskItem(savedTask.getTitle(), savedTask.getDescription(),
                    savedTask.getPriority(), savedTask.getDueDate(), savedTask.getId()));
        }

        return withIds;
    }
}
