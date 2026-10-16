package com.unmute.jobs;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface BackgroundJobRepository extends JpaRepository<BackgroundJob, UUID> {

    /**
     * Locks due jobs with {@code FOR UPDATE SKIP LOCKED} (lock timeout -2), so concurrent workers never claim
     * the same row and never block on each other. A job whose dedup key is already running waits, which keeps
     * per-entity work (e.g. two embeddings of the same note) strictly sequential.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            SELECT j FROM BackgroundJob j
            WHERE j.status = com.unmute.jobs.JobStatus.PENDING AND j.runAt <= :now
              AND (j.dedupKey IS NULL OR NOT EXISTS (
                    SELECT 1 FROM BackgroundJob r
                    WHERE r.status = com.unmute.jobs.JobStatus.RUNNING
                      AND r.jobType = j.jobType AND r.dedupKey = j.dedupKey))
            ORDER BY j.runAt
            """)
    List<BackgroundJob> lockDueJobs(@Param("now") Instant now, Limit limit);

    /** Coalesces a repeated request into the job already waiting for the same key (debounce). */
    @Modifying
    @Query("""
            UPDATE BackgroundJob j SET j.runAt = :runAt, j.payload = :payload, j.updatedAt = :now
            WHERE j.jobType = :type AND j.dedupKey = :dedupKey AND j.status = com.unmute.jobs.JobStatus.PENDING
            """)
    int reschedulePending(@Param("type") String type, @Param("dedupKey") String dedupKey,
                          @Param("payload") String payload, @Param("runAt") Instant runAt, @Param("now") Instant now);

    @Modifying
    @Query("""
            UPDATE BackgroundJob j
            SET j.status = com.unmute.jobs.JobStatus.SUCCEEDED, j.completedAt = :now, j.updatedAt = :now,
                j.lockedAt = NULL, j.lockedBy = NULL, j.lockToken = NULL, j.lastError = NULL
            WHERE j.id = :id AND j.lockToken = :token
            """)
    int markSucceeded(@Param("id") UUID id, @Param("token") UUID token, @Param("now") Instant now);

    @Modifying
    @Query("""
            UPDATE BackgroundJob j
            SET j.status = com.unmute.jobs.JobStatus.FAILED, j.completedAt = :now, j.updatedAt = :now,
                j.lockedAt = NULL, j.lockedBy = NULL, j.lockToken = NULL, j.lastError = :error
            WHERE j.id = :id AND j.lockToken = :token
            """)
    int markFailed(@Param("id") UUID id, @Param("token") UUID token, @Param("now") Instant now,
                   @Param("error") String error);

    @Modifying
    @Query("""
            UPDATE BackgroundJob j
            SET j.status = com.unmute.jobs.JobStatus.PENDING, j.runAt = :runAt, j.updatedAt = :now,
                j.lockedAt = NULL, j.lockedBy = NULL, j.lockToken = NULL, j.lastError = :error
            WHERE j.id = :id AND j.lockToken = :token
            """)
    int scheduleRetry(@Param("id") UUID id, @Param("token") UUID token, @Param("now") Instant now,
                      @Param("runAt") Instant runAt, @Param("error") String error);

    @Modifying
    @Query("""
            UPDATE BackgroundJob j SET j.lockedAt = :now
            WHERE j.lockToken IN :tokens AND j.status = com.unmute.jobs.JobStatus.RUNNING
            """)
    int heartbeat(@Param("tokens") Collection<UUID> tokens, @Param("now") Instant now);

    /**
     * Returns jobs whose worker stopped heartbeating (crash, kill -9, network partition) to the queue. The
     * attempt already counted, so a job that keeps killing its worker still runs out of attempts.
     */
    @Modifying
    @Query("""
            UPDATE BackgroundJob j
            SET j.status = com.unmute.jobs.JobStatus.PENDING, j.runAt = :now, j.updatedAt = :now,
                j.lockedAt = NULL, j.lockedBy = NULL, j.lockToken = NULL,
                j.lastError = 'Worker lease expired before the job finished'
            WHERE j.status = com.unmute.jobs.JobStatus.RUNNING AND j.lockedAt < :cutoff
            """)
    int releaseExpiredLeases(@Param("now") Instant now, @Param("cutoff") Instant cutoff);

    @Modifying
    @Query("DELETE FROM BackgroundJob j WHERE j.status = :status AND j.completedAt < :cutoff")
    int deleteFinishedBefore(@Param("status") JobStatus status, @Param("cutoff") Instant cutoff);

    boolean existsByJobTypeAndDedupKeyAndStatusIn(String jobType, String dedupKey, Collection<JobStatus> statuses);

    long countByStatus(JobStatus status);
}
