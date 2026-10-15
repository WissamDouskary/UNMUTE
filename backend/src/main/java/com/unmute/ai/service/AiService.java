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

    public AiService(
            AiProvider aiProvider,
            UserRepository userRepository,
            NoteRepository noteRepository,
            TaskRepository taskRepository
    ) {
        this.aiProvider = aiProvider;
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.taskRepository = taskRepository;
    }

    public SummarizeResponse summarize(UUID userId, SummarizeRequest request) {
        SummarizeResponse response = aiProvider.summarize(request.content());

        // If noteId provided, update note.summary in database
        if (request.noteId() != null) {
            noteRepository.findByIdAndUserId(request.noteId(), userId).ifPresent(note -> {
                note.setSummary(response.summary());
                noteRepository.save(note);
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

            List<Task> tasksToSave = new ArrayList<>();
            for (ExtractedTaskItem item : extracted) {
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

            List<Task> saved = taskRepository.saveAll(tasksToSave);

            // Re-map with savedTaskId
            List<ExtractedTaskItem> withIds = new ArrayList<>();
            for (int i = 0; i < extracted.size(); i++) {
                ExtractedTaskItem original = extracted.get(i);
                UUID savedId = (i < saved.size()) ? saved.get(i).getId() : null;
                withIds.add(original.withSavedTaskId(savedId));
            }

            return new ExtractTasksResponse(withIds, withIds.size());
        }

        return new ExtractTasksResponse(extracted, extracted.size());
    }
}
