package com.unmute.source.repository;

import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SourceRepository extends JpaRepository<Source, UUID> {

    List<Source> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<Source> findByUserIdAndStatusOrderByCreatedAtDesc(UUID userId, SourceStatus status);

    Optional<Source> findByIdAndUserId(UUID id, UUID userId);

    @EntityGraph(attributePaths = "note")
    @Query("SELECT s FROM Source s WHERE s.user.id = :userId ORDER BY s.createdAt DESC")
    List<Source> findWithNoteByUserId(@Param("userId") UUID userId);

    /** Compare-and-set PENDING -> TRANSCRIBING; returns 1 only for the single worker that wins the claim. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
        UPDATE Source s
        SET s.status = com.unmute.source.domain.SourceStatus.TRANSCRIBING, s.updatedAt = :now
        WHERE s.id = :id AND s.status = com.unmute.source.domain.SourceStatus.PENDING
        """)
    int claimPending(@Param("id") UUID id, @Param("now") Instant now);
}
