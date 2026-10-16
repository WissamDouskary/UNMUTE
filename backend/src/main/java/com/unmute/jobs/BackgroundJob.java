package com.unmute.jobs;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "background_jobs")
public class BackgroundJob {

    @Id
    private UUID id;

    @Column(name = "job_type", nullable = false, length = 64)
    private String jobType;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String payload;

    @Column(name = "dedup_key", length = 255)
    private String dedupKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private JobStatus status;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts;

    @Column(name = "run_at", nullable = false)
    private Instant runAt;

    @Column(name = "locked_at")
    private Instant lockedAt;

    @Column(name = "locked_by", length = 100)
    private String lockedBy;

    @Column(name = "lock_token")
    private UUID lockToken;

    @Column(name = "last_error", columnDefinition = "TEXT")
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected BackgroundJob() {
    }

    BackgroundJob(String jobType, String payload, String dedupKey, int maxAttempts, Instant runAt, Instant now) {
        this.id = UUID.randomUUID();
        this.jobType = jobType;
        this.payload = payload;
        this.dedupKey = dedupKey;
        this.status = JobStatus.PENDING;
        this.maxAttempts = maxAttempts;
        this.runAt = runAt;
        this.createdAt = now;
        this.updatedAt = now;
    }

    void markRunning(String workerId, UUID token, Instant now) {
        this.status = JobStatus.RUNNING;
        this.attempts++;
        this.lockedBy = workerId;
        this.lockToken = token;
        this.lockedAt = now;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public String getJobType() {
        return jobType;
    }

    public String getPayload() {
        return payload;
    }

    public String getDedupKey() {
        return dedupKey;
    }

    public JobStatus getStatus() {
        return status;
    }

    public int getAttempts() {
        return attempts;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    public Instant getRunAt() {
        return runAt;
    }

    public Instant getLockedAt() {
        return lockedAt;
    }

    public UUID getLockToken() {
        return lockToken;
    }

    public String getLastError() {
        return lastError;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }
}
