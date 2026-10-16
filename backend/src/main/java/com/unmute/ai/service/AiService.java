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
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class AiService {

    private final AiProvider aiProvider;
    private final UserRepository userRepository;
    private final NoteRepository noteRepository;
    private final TaskRepository taskRepository;
    private final NoteJobScheduler noteJobs;

    public AiService(
            AiProvider aiProvider,
            UserRepository userRepository,
            NoteRepository noteRepository,
            TaskRepository taskRepository,
            NoteJobScheduler noteJobs
    ) {
        this.aiProvider = aiProvider;
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.taskRepository = taskRepository;
        this.noteJobs = noteJobs;
    }

    public SummarizeResponse summarize(UUID userId, SummarizeRequest request) {
        SummarizeResponse response = aiProvider.summarize(request.content());

        // If noteId provided, update note.summary in database
        if (request.noteId() != null) {
            noteRepository.findByIdAndUserId(request.noteId(), userId).ifPresent(note -> {
                note.setSummary(response.summary());
                noteRepository.save(note);
                noteJobs.contentChanged(note.getId());
            });
        }

        return response;
    }

    public ExtractTasksResponse extractTasks(UUID userId, ExtractTasksRequest request) {
        List<ExtractedTaskItem> extracted = aiProvider.extractTasks(request.content());

        if (request.saveToTasks() && !extracted.isEmpty()) {
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

            Note note = null;
            if (request.noteId() != null) {
                note = noteRepository.findByIdAndUserId(request.noteId(), userId).orElse(null);
            }

            List<Task> existingTasks = (note != null)
                    ? taskRepository.findByUserIdAndNoteIdOrderByCreatedAtDesc(userId, note.getId())
                    : List.of();

            java.util.Map<String, Task> existingByTitle = new java.util.HashMap<>();
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
                    Task task = new Task(
                            user,
                            note,
                            item.title(),
                            item.description(),
                            item.priority(),
                            item.dueDate()
                    );
                    tasksToSave.add(task);
                }
            }

            if (!tasksToSave.isEmpty()) {
                List<Task> saved = taskRepository.saveAll(tasksToSave);
                for (Task savedTask : saved) {
                    ExtractedTaskItem original = extracted.stream()
                            .filter(e -> e.title() != null && e.title().equalsIgnoreCase(savedTask.getTitle()))
                            .findFirst()
                            .orElse(null);
                    if (original != null) {
                        withIds.add(original.withSavedTaskId(savedTask.getId()));
                    } else {
                        withIds.add(new ExtractedTaskItem(
                                savedTask.getTitle(),
                                savedTask.getDescription(),
                                savedTask.getPriority(),
                                savedTask.getDueDate(),
                                savedTask.getId()
                        ));
                    }
                }
            }

            return new ExtractTasksResponse(withIds, withIds.size());
        }

        return new ExtractTasksResponse(extracted, extracted.size());
    }
}
