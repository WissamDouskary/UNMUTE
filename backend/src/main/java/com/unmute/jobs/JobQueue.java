package com.unmute.jobs;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Enqueues jobs as rows in {@code background_jobs}. Call it inside the transaction of the write that needs
 * the job: the job then commits (or rolls back) atomically with that write, so no work is lost to a crash.
 */
@Service
public class JobQueue {

    private final EntityManager entityManager;
    private final BackgroundJobRepository repository;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher events;
    private final JobProperties properties;

    public JobQueue(EntityManager entityManager,
                    BackgroundJobRepository repository,
                    ObjectMapper objectMapper,
                    ApplicationEventPublisher events,
                    JobProperties properties) {
        this.entityManager = entityManager;
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.events = events;
        this.properties = properties;
    }

    @Transactional
    public void enqueue(JobSpec spec) {
        Instant now = Instant.now();
        Instant runAt = now.plus(spec.delay());
        String payload = serialize(spec);

        boolean coalesced = spec.dedupKey() != null
                && repository.reschedulePending(spec.type(), spec.dedupKey(), payload, runAt, now) > 0;
        if (!coalesced) {
            int maxAttempts = spec.maxAttempts() != null ? spec.maxAttempts() : properties.defaultMaxAttempts();
            entityManager.persist(new BackgroundJob(spec.type(), payload, spec.dedupKey(), maxAttempts, runAt, now));
        }
        events.publishEvent(new JobsEnqueuedEvent(runAt));
    }

    @Transactional(readOnly = true)
    public boolean hasActiveJob(String type, String dedupKey) {
        return repository.existsByJobTypeAndDedupKeyAndStatusIn(type, dedupKey, List.of(JobStatus.PENDING, JobStatus.RUNNING));
    }

    private String serialize(JobSpec spec) {
        try {
            return objectMapper.writeValueAsString(spec.payload());
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Job payload is not serializable: " + spec.type(), e);
        }
    }
}
