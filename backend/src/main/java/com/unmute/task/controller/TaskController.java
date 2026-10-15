package com.unmute.task.controller;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.exception.InvalidTokenException;
import com.unmute.task.domain.TaskPriority;
import com.unmute.task.dto.BatchCreateTasksRequest;
import com.unmute.task.dto.CreateTaskRequest;
import com.unmute.task.dto.TaskDto;
import com.unmute.task.dto.UpdateTaskRequest;
import com.unmute.task.service.TaskService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    private UserPrincipal requirePrincipal(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }

    @GetMapping
    public ResponseEntity<List<TaskDto>> getTasks(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Boolean completed,
            @RequestParam(required = false) UUID noteId,
            @RequestParam(required = false) TaskPriority priority
    ) {
        requirePrincipal(principal);
        List<TaskDto> tasks = taskService.getTasks(principal.getId(), completed, noteId, priority);
        return ResponseEntity.ok(tasks);
    }

    @GetMapping("/{id}")
    public ResponseEntity<TaskDto> getTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        TaskDto task = taskService.getTask(principal.getId(), id);
        return ResponseEntity.ok(task);
    }

    @PostMapping
    public ResponseEntity<TaskDto> createTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateTaskRequest request
    ) {
        requirePrincipal(principal);
        TaskDto created = taskService.createTask(principal.getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping("/batch")
    public ResponseEntity<List<TaskDto>> createBatch(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BatchCreateTasksRequest request
    ) {
        requirePrincipal(principal);
        List<TaskDto> created = taskService.createBatch(principal.getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<TaskDto> updateTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTaskRequest request
    ) {
        requirePrincipal(principal);
        TaskDto updated = taskService.updateTask(principal.getId(), id, request);
        return ResponseEntity.ok(updated);
    }

    @PatchMapping("/{id}/toggle")
    public ResponseEntity<TaskDto> toggleTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        TaskDto updated = taskService.toggleTask(principal.getId(), id);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        taskService.deleteTask(principal.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/note/{noteId}")
    public ResponseEntity<List<TaskDto>> getTasksForNote(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID noteId
    ) {
        requirePrincipal(principal);
        List<TaskDto> tasks = taskService.getTasksForNote(principal.getId(), noteId);
        return ResponseEntity.ok(tasks);
    }
}
