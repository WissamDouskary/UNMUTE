package com.unmute.note.repository;

import com.unmute.note.domain.Note;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface NoteRepository extends JpaRepository<Note, UUID> {

    Optional<Note> findByIdAndUserId(UUID id, UUID userId);

    Page<Note> findByUserIdAndIsArchived(UUID userId, boolean isArchived, Pageable pageable);

    @Query("SELECT n FROM Note n WHERE n.user.id = :userId AND n.isArchived = :isArchived AND " +
           "(LOWER(n.title) LIKE LOWER(CONCAT('%', :query, '%')) OR LOWER(n.content) LIKE LOWER(CONCAT('%', :query, '%')))")
    Page<Note> searchNotes(
            @Param("userId") UUID userId,
            @Param("isArchived") boolean isArchived,
            @Param("query") String query,
            Pageable pageable
    );

    @Query("SELECT DISTINCT n FROM Note n JOIN n.tags t WHERE n.user.id = :userId AND n.isArchived = :isArchived AND LOWER(t) = LOWER(:tag)")
    Page<Note> findByUserIdAndIsArchivedAndTag(
            @Param("userId") UUID userId,
            @Param("isArchived") boolean isArchived,
            @Param("tag") String tag,
            Pageable pageable
    );

    @Query("SELECT DISTINCT t FROM Note n JOIN n.tags t WHERE n.user.id = :userId AND n.isArchived = false ORDER BY t ASC")
    List<String> findAllTagsByUserId(@Param("userId") UUID userId);

    long countByUserIdAndIsArchived(UUID userId, boolean isArchived);
}
