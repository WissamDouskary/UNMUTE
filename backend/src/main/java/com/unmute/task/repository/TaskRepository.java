package com.unmute.task.repository;

import com.unmute.task.domain.Task;
import com.unmute.task.domain.TaskPriority;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TaskRepository extends JpaRepository<Task, UUID> {

    Optional<Task> findByIdAndUserId(UUID id, UUID userId);

    Optional<Task> findFirstByUserIdAndGoogleEventId(UUID userId, String googleEventId);

    List<Task> findByUserIdAndGoogleEventIdIsNotNull(UUID userId);

    List<Task> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<Task> findByUserIdAndNoteIdOrderByCreatedAtDesc(UUID userId, UUID noteId);

    long countByUserIdAndIsCompleted(UUID userId, boolean isCompleted);

    long countByUserIdAndNoteId(UUID userId, UUID noteId);

    @Query("""
        SELECT t FROM Task t
        LEFT JOIN FETCH t.note
        WHERE t.user.id = :userId
          AND (:isCompleted IS NULL OR t.isCompleted = :isCompleted)
          AND (:noteId IS NULL OR t.note.id = :noteId)
          AND (:priority IS NULL OR t.priority = :priority)
        ORDER BY
          CASE WHEN t.isCompleted = false THEN 0 ELSE 1 END ASC,
          CASE
            WHEN t.priority = com.unmute.task.domain.TaskPriority.URGENT THEN 1
            WHEN t.priority = com.unmute.task.domain.TaskPriority.HIGH THEN 2
            WHEN t.priority = com.unmute.task.domain.TaskPriority.MEDIUM THEN 3
            ELSE 4
          END ASC,
          t.dueDate ASC NULLS LAST,
          t.createdAt DESC
    """)
    List<Task> findTasksWithFilters(
            @Param("userId") UUID userId,
            @Param("isCompleted") Boolean isCompleted,
            @Param("noteId") UUID noteId,
            @Param("priority") TaskPriority priority
    );
}
