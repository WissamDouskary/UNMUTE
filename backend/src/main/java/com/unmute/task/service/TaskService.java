package com.unmute.task.service;

import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.task.domain.Task;
import com.unmute.task.domain.TaskPriority;
import com.unmute.task.dto.BatchCreateTasksRequest;
import com.unmute.task.dto.CreateTaskRequest;
import com.unmute.task.dto.TaskDto;
import com.unmute.task.dto.UpdateTaskRequest;
import com.unmute.task.repository.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class TaskService {

    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final NoteRepository noteRepository;

    public TaskService(TaskRepository taskRepository, UserRepository userRepository, NoteRepository noteRepository) {
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
    }

    @Transactional(readOnly = true)
    public List<TaskDto> getTasks(UUID userId, Boolean isCompleted, UUID noteId, TaskPriority priority) {
        List<Task> tasks = taskRepository.findTasksWithFilters(userId, isCompleted, noteId, priority);
        return tasks.stream().map(TaskDto::fromEntity).toList();
    }

    @Transactional(readOnly = true)
    public TaskDto getTask(UUID userId, UUID taskId) {
        Task task = taskRepository.findByIdAndUserId(taskId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Task not found with id: " + taskId));
        return TaskDto.fromEntity(task);
    }

    public TaskDto createTask(UUID userId, CreateTaskRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        Note note = null;
        if (request.noteId() != null) {
            note = noteRepository.findByIdAndUserId(request.noteId(), userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + request.noteId()));
        }

        Task task = new Task(
                user,
                note,
                request.title().trim(),
                request.description(),
                request.priority() != null ? request.priority() : TaskPriority.MEDIUM,
                request.dueDate()
        );

        Task saved = taskRepository.save(task);
        return TaskDto.fromEntity(saved);
    }

    public List<TaskDto> createBatch(UUID userId, BatchCreateTasksRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        Note note = null;
        if (request.noteId() != null) {
            note = noteRepository.findByIdAndUserId(request.noteId(), userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + request.noteId()));
        }

        List<Task> tasksToSave = new ArrayList<>();
        for (CreateTaskRequest taskReq : request.tasks()) {
            if (taskReq.title() == null || taskReq.title().trim().isBlank()) {
                continue;
            }
            // If request individually specifies noteId, check it; else use batch note
            Note targetNote = note;
            if (taskReq.noteId() != null && (note == null || !note.getId().equals(taskReq.noteId()))) {
                targetNote = noteRepository.findByIdAndUserId(taskReq.noteId(), userId).orElse(null);
            }

            Task task = new Task(
                    user,
                    targetNote,
                    taskReq.title().trim(),
                    taskReq.description(),
                    taskReq.priority() != null ? taskReq.priority() : TaskPriority.MEDIUM,
                    taskReq.dueDate()
            );
            tasksToSave.add(task);
        }

        List<Task> saved = taskRepository.saveAll(tasksToSave);
        return saved.stream().map(TaskDto::fromEntity).toList();
    }

    public TaskDto updateTask(UUID userId, UUID taskId, UpdateTaskRequest request) {
        Task task = taskRepository.findByIdAndUserId(taskId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Task not found with id: " + taskId));

        if (request.title() != null && !request.title().trim().isBlank()) {
            task.setTitle(request.title().trim());
        }
        if (request.description() != null) {
            task.setDescription(request.description());
        }
        if (request.isCompleted() != null) {
            task.setCompleted(request.isCompleted());
        }
        if (request.priority() != null) {
            task.setPriority(request.priority());
        }
        if (request.dueDate() != null) {
            task.setDueDate(request.dueDate());
        }
        if (request.noteId() != null) {
            Note note = noteRepository.findByIdAndUserId(request.noteId(), userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + request.noteId()));
            task.setNote(note);
        }

        Task updated = taskRepository.save(task);
        return TaskDto.fromEntity(updated);
    }

    public TaskDto toggleTask(UUID userId, UUID taskId) {
        Task task = taskRepository.findByIdAndUserId(taskId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Task not found with id: " + taskId));

        task.setCompleted(!task.isCompleted());
        Task updated = taskRepository.save(task);
        return TaskDto.fromEntity(updated);
    }

    public void deleteTask(UUID userId, UUID taskId) {
        Task task = taskRepository.findByIdAndUserId(taskId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Task not found with id: " + taskId));
        taskRepository.delete(task);
    }

    @Transactional(readOnly = true)
    public List<TaskDto> getTasksForNote(UUID userId, UUID noteId) {
        List<Task> tasks = taskRepository.findByUserIdAndNoteIdOrderByCreatedAtDesc(userId, noteId);
        return tasks.stream().map(TaskDto::fromEntity).toList();
    }
}
