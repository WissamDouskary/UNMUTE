package com.unmute.jobs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Polls {@code background_jobs} and runs due jobs on a bounded pool.
 * <ul>
 *   <li>Claiming uses {@code FOR UPDATE SKIP LOCKED}, so several backend instances can share the queue.</li>
 *   <li>Handlers run outside any transaction; claim, ack and retry bookkeeping are short transactions.</li>
 *   <li>Running jobs hold a lease renewed by heartbeat; a crashed worker's jobs return to the queue once the
 *       lease expires, so no job is stranded.</li>
 *   <li>Failures retry with exponential backoff and jitter until {@code maxAttempts}.</li>
 * </ul>
 */
@Component
public class JobWorker {

    private static final Logger log = LoggerFactory.getLogger(JobWorker.class);
    private static final int MAX_ERROR_LENGTH = 2_000;
    private static final Duration LEASE_SWEEP_INTERVAL = Duration.ofSeconds(30);
    private static final Duration PURGE_INTERVAL = Duration.ofHours(1);

    private final BackgroundJobRepository repository;
    private final ObjectMapper objectMapper;
    private final JobProperties properties;
    private final TransactionTemplate tx;
    private final Map<String, JobHandler> handlers;
    private final String workerId;
    private final Semaphore slots;
    private final Set<UUID> activeLeases = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean wakeUpPending = new AtomicBoolean();

    private ThreadPoolTaskScheduler scheduler;
    private ThreadPoolTaskExecutor executor;
    private volatile boolean running;

    public JobWorker(BackgroundJobRepository repository,
                     ObjectMapper objectMapper,
                     JobProperties properties,
                     PlatformTransactionManager transactionManager,
                     List<JobHandler> handlers) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.tx = new TransactionTemplate(transactionManager);
        this.handlers = handlers.stream().collect(Collectors.toMap(JobHandler::type, Function.identity(), (a, b) -> {
            throw new IllegalStateException("Two handlers registered for job type " + a.type());
        }));
        String id = ManagementFactory.getRuntimeMXBean().getName() + "/" + UUID.randomUUID().toString().substring(0, 8);
        this.workerId = id.length() > 100 ? id.substring(0, 100) : id;
        this.slots = new Semaphore(Math.max(1, properties.concurrency()));
    }

    @EventListener(ApplicationReadyEvent.class)
    public synchronized void start() {
        if (running) {
            return;
        }
        if (!properties.workerEnabled()) {
            log.info("Background job worker is disabled (unmute.jobs.worker-enabled=false); jobs will queue up.");
            return;
        }

        executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(Math.max(1, properties.concurrency()));
        executor.setMaxPoolSize(Math.max(1, properties.concurrency()));
        executor.setThreadNamePrefix("job-");
        executor.initialize();

        scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("job-scheduler-");
        scheduler.setErrorHandler(t -> log.error("Job scheduler task failed", t));
        scheduler.initialize();

        running = true;
        scheduler.scheduleWithFixedDelay(this::pollSafely, properties.pollInterval());
        scheduler.scheduleWithFixedDelay(this::heartbeatSafely, properties.heartbeatInterval());
        scheduler.scheduleWithFixedDelay(this::releaseExpiredLeasesSafely, LEASE_SWEEP_INTERVAL);
        scheduler.scheduleWithFixedDelay(this::purgeSafely, PURGE_INTERVAL);

        log.info("Background job worker {} started: handlers={}, concurrency={}, pending={}",
                workerId, handlers.keySet(), properties.concurrency(), repository.countByStatus(JobStatus.PENDING));
    }

    @PreDestroy
    public synchronized void stop() {
        if (!running) {
            return;
        }
        running = false;
        scheduler.shutdown();
        executor.getThreadPoolExecutor().shutdown();
        try {
            if (!executor.getThreadPoolExecutor().awaitTermination(properties.shutdownGrace().toMillis(), TimeUnit.MILLISECONDS)) {
                log.warn("{} job(s) still running at shutdown; they will be retried once their lease expires",
                        activeLeases.size());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** Due work enqueued by a committed transaction starts immediately instead of on the next poll tick. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onJobsEnqueued(JobsEnqueuedEvent event) {
        if (!event.runAt().isAfter(Instant.now().plus(properties.pollInterval()))) {
            wakeUp();
        }
    }

    public void wakeUp() {
        if (running && wakeUpPending.compareAndSet(false, true)) {
            try {
                scheduler.execute(this::pollSafely);
            } catch (TaskRejectedException e) {
                wakeUpPending.set(false);
            }
        }
    }

    /**
     * Runs every due job on the calling thread until none is left and returns how many ran. Used by tests
     * (with the background worker disabled) and safe to call alongside it.
     */
    public int drain() {
        int executed = 0;
        for (int round = 0; round < 1_000; round++) {
            List<ClaimedJob> claimed = claim(properties.batchSize());
            if (claimed.isEmpty()) {
                break;
            }
            for (ClaimedJob job : claimed) {
                execute(job);
                executed++;
            }
        }
        return executed;
    }

    private void pollSafely() {
        wakeUpPending.set(false);
        try {
            poll();
        } catch (Exception e) {
            log.warn("Job poll failed: {}", e.getMessage());
        }
    }

    private void poll() {
        while (running) {
            int capacity = Math.min(slots.availablePermits(), properties.batchSize());
            if (capacity <= 0) {
                return;
            }
            List<ClaimedJob> claimed = claim(capacity);
            for (ClaimedJob job : claimed) {
                slots.acquireUninterruptibly();
                activeLeases.add(job.lockToken());
                try {
                    executor.execute(() -> {
                        try {
                            execute(job);
                        } finally {
                            activeLeases.remove(job.lockToken());
                            slots.release();
                            wakeUp();
                        }
                    });
                } catch (TaskRejectedException e) {
                    activeLeases.remove(job.lockToken());
                    slots.release();
                    log.warn("Worker is shutting down; job {} goes back to the queue when its lease expires", job.id());
                    return;
                }
            }
            if (claimed.size() < capacity) {
                return;
            }
        }
    }

    List<ClaimedJob> claim(int limit) {
        List<ClaimedJob> claimed = tx.execute(status -> {
            Instant now = Instant.now();
            Set<String> claimedKeys = new HashSet<>();
            List<ClaimedJob> out = new ArrayList<>();
            for (BackgroundJob job : repository.lockDueJobs(now, Limit.of(limit))) {
                // Two pending jobs for one key can be due together; run them one after the other.
                if (job.getDedupKey() != null && !claimedKeys.add(job.getJobType() + '\u0000' + job.getDedupKey())) {
                    continue;
                }
                UUID token = UUID.randomUUID();
                job.markRunning(workerId, token, now);
                out.add(new ClaimedJob(job.getId(), job.getJobType(), parse(job.getPayload()),
                        job.getAttempts(), job.getMaxAttempts(), token));
            }
            return out;
        });
        return claimed != null ? claimed : List.of();
    }

    void execute(ClaimedJob job) {
        JobHandler handler = handlers.get(job.type());
        if (handler == null) {
            fail(job, null, new NonRetryableJobException("No handler registered for job type " + job.type()));
            return;
        }
        if (job.attempt() > job.maxAttempts()) {
            fail(job, handler, new NonRetryableJobException("Gave up after " + job.maxAttempts()
                    + " attempts; the last one never finished (worker lease expired)"));
            return;
        }

        long started = System.nanoTime();
        try {
            handler.handle(job);
            Integer acked = tx.execute(s -> repository.markSucceeded(job.id(), job.lockToken(), Instant.now()));
            if (acked == null || acked == 0) {
                log.warn("Job {} {} finished after its lease was reclaimed; it may run again", job.type(), job.id());
            } else {
                log.debug("Job {} {} succeeded in {} ms (attempt {})", job.type(), job.id(),
                        TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started), job.attempt());
            }
        } catch (Exception e) {
            onFailure(job, handler, e);
        }
    }

    private void onFailure(ClaimedJob job, JobHandler handler, Exception error) {
        if (!isRetryable(error) || job.isLastAttempt()) {
            fail(job, handler, error);
            return;
        }
        Instant nextRunAt = Instant.now().plus(backoff(job.attempt()));
        String message = describe(error);
        tx.executeWithoutResult(s -> repository.scheduleRetry(job.id(), job.lockToken(), Instant.now(), nextRunAt, message));
        log.warn("Job {} {} failed (attempt {}/{}), retrying at {}: {}",
                job.type(), job.id(), job.attempt(), job.maxAttempts(), nextRunAt, message);
        safely(job, () -> handler.onRetryScheduled(job, error, nextRunAt));
    }

    private void fail(ClaimedJob job, JobHandler handler, Exception error) {
        String message = describe(error);
        tx.executeWithoutResult(s -> repository.markFailed(job.id(), job.lockToken(), Instant.now(), message));
        if (error instanceof RetryHint) {
            log.error("Job {} {} failed permanently after {} attempt(s): {}", job.type(), job.id(), job.attempt(), message);
        } else {
            log.error("Job {} {} failed permanently after {} attempt(s)", job.type(), job.id(), job.attempt(), error);
        }
        if (handler != null) {
            safely(job, () -> handler.onFinalFailure(job, error));
        }
    }

    Duration backoff(int attempt) {
        double base = properties.retryBackoff().toMillis() * Math.pow(3, Math.max(0, attempt - 1));
        double capped = Math.min(base, properties.maxRetryBackoff().toMillis());
        double jittered = capped * ThreadLocalRandom.current().nextDouble(0.8, 1.2);
        return Duration.ofMillis((long) jittered);
    }

    private static boolean isRetryable(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            if (t instanceof RetryHint hint) {
                return hint.isRetryable();
            }
            if (t.getCause() == t) {
                break;
            }
        }
        return true;
    }

    private static String describe(Throwable error) {
        String message = error.getMessage() != null ? error.getMessage() : error.getClass().getSimpleName();
        return message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message;
    }

    private JsonNode parse(String payload) {
        try {
            return objectMapper.readTree(payload);
        } catch (Exception e) {
            return MissingNode.getInstance();
        }
    }

    private void safely(ClaimedJob job, Runnable callback) {
        try {
            callback.run();
        } catch (Exception e) {
            log.error("Failure callback for job {} {} threw", job.type(), job.id(), e);
        }
    }

    private void heartbeatSafely() {
        if (activeLeases.isEmpty()) {
            return;
        }
        try {
            List<UUID> leases = List.copyOf(activeLeases);
            tx.executeWithoutResult(s -> repository.heartbeat(leases, Instant.now()));
        } catch (Exception e) {
            log.warn("Job lease heartbeat failed: {}", e.getMessage());
        }
    }

    private void releaseExpiredLeasesSafely() {
        try {
            Instant now = Instant.now();
            Integer released = tx.execute(s -> repository.releaseExpiredLeases(now, now.minus(properties.lease())));
            if (released != null && released > 0) {
                log.warn("Returned {} job(s) with expired worker leases to the queue", released);
                wakeUp();
            }
        } catch (Exception e) {
            log.warn("Job lease sweep failed: {}", e.getMessage());
        }
    }

    private void purgeSafely() {
        try {
            Instant now = Instant.now();
            tx.executeWithoutResult(s -> {
                repository.deleteFinishedBefore(JobStatus.SUCCEEDED, now.minus(properties.succeededRetention()));
                repository.deleteFinishedBefore(JobStatus.FAILED, now.minus(properties.failedRetention()));
            });
        } catch (Exception e) {
            log.warn("Job purge failed: {}", e.getMessage());
        }
    }
}
