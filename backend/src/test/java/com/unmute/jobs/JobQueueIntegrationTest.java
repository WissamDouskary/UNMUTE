package com.unmute.jobs;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
class JobQueueIntegrationTest {

    @Autowired
    private JobQueue jobQueue;

    @Autowired
    private JobWorker jobWorker;

    @Autowired
    private BackgroundJobRepository repository;

    @Autowired
    private RecordingJobHandler handler;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void cleanQueue() {
        repository.deleteAll();
        handler.reset();
    }

    private static JobSpec job(String mode, String marker) {
        return JobSpec.of(RecordingJobHandler.TYPE, Map.of("mode", mode, "marker", marker));
    }

    private BackgroundJob onlyJob() {
        List<BackgroundJob> jobs = repository.findAll();
        assertThat(jobs).hasSize(1);
        return jobs.get(0);
    }

    private void makeAllDue() {
        jdbc.update("UPDATE background_jobs SET run_at = ?", Timestamp.from(Instant.now().minusSeconds(1)));
    }

    @Test
    @DisplayName("An enqueued job runs once and is marked SUCCEEDED")
    void runsJobToSuccess() {
        jobQueue.enqueue(job("ok", "a"));

        assertThat(jobWorker.drain()).isEqualTo(1);

        assertThat(handler.handled).containsExactly("a");
        BackgroundJob stored = onlyJob();
        assertThat(stored.getStatus()).isEqualTo(JobStatus.SUCCEEDED);
        assertThat(stored.getAttempts()).isEqualTo(1);
        assertThat(stored.getLockToken()).isNull();
        assertThat(stored.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("Jobs enqueued in a rolled-back transaction are never persisted")
    void enqueueIsTransactional() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            jobQueue.enqueue(job("ok", "rolled-back"));
            throw new IllegalStateException("domain write failed");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(repository.count()).isZero();
    }

    @Test
    @DisplayName("Pending jobs with the same dedup key coalesce into one, keeping the latest payload")
    void coalescesPendingJobs() {
        jobQueue.enqueue(job("ok", "first").dedupedBy("note-1"));
        jobQueue.enqueue(job("ok", "second").dedupedBy("note-1"));
        jobQueue.enqueue(job("ok", "other").dedupedBy("note-2"));

        assertThat(repository.count()).isEqualTo(2);
        jobWorker.drain();

        assertThat(handler.handled).containsExactlyInAnyOrder("second", "other");
    }

    @Test
    @DisplayName("Delayed jobs wait until they are due")
    void respectsDelay() {
        jobQueue.enqueue(job("ok", "later").delayedBy(Duration.ofMinutes(5)));

        assertThat(jobWorker.drain()).isZero();
        makeAllDue();
        assertThat(jobWorker.drain()).isEqualTo(1);
    }

    @Test
    @DisplayName("A retryable failure is rescheduled with backoff and succeeds on the next attempt")
    void retriesTransientFailures() {
        jobQueue.enqueue(job("fail-once", "flaky"));

        jobWorker.drain();
        BackgroundJob afterFirst = onlyJob();
        assertThat(afterFirst.getStatus()).isEqualTo(JobStatus.PENDING);
        assertThat(afterFirst.getAttempts()).isEqualTo(1);
        assertThat(afterFirst.getLastError()).contains("transient failure");
        assertThat(afterFirst.getRunAt()).isAfter(Instant.now());
        assertThat(handler.retried).containsExactly("flaky");

        assertThat(jobWorker.drain()).as("not due yet").isZero();
        makeAllDue();
        jobWorker.drain();

        BackgroundJob afterSecond = onlyJob();
        assertThat(afterSecond.getStatus()).isEqualTo(JobStatus.SUCCEEDED);
        assertThat(afterSecond.getAttempts()).isEqualTo(2);
        assertThat(handler.finallyFailed).isEmpty();
    }

    @Test
    @DisplayName("A job that keeps failing is marked FAILED after maxAttempts")
    void givesUpAfterMaxAttempts() {
        jobQueue.enqueue(job("fail-always", "broken").withMaxAttempts(2));

        jobWorker.drain();
        makeAllDue();
        jobWorker.drain();

        BackgroundJob stored = onlyJob();
        assertThat(stored.getStatus()).isEqualTo(JobStatus.FAILED);
        assertThat(stored.getAttempts()).isEqualTo(2);
        assertThat(stored.getLastError()).contains("still broken");
        assertThat(handler.handled).hasSize(2);
        assertThat(handler.finallyFailed).containsExactly("broken");
    }

    @Test
    @DisplayName("A non-retryable failure fails the job immediately")
    void doesNotRetryPermanentFailures() {
        jobQueue.enqueue(job("fatal", "bad"));

        jobWorker.drain();

        BackgroundJob stored = onlyJob();
        assertThat(stored.getStatus()).isEqualTo(JobStatus.FAILED);
        assertThat(stored.getAttempts()).isEqualTo(1);
        assertThat(handler.retried).isEmpty();
        assertThat(handler.finallyFailed).containsExactly("bad");
    }

    @Test
    @DisplayName("A job abandoned by a crashed worker returns to the queue once its lease expires")
    void recoversExpiredLeases() {
        jobQueue.enqueue(job("ok", "orphan"));
        List<ClaimedJob> claimed = jobWorker.claim(10);
        assertThat(claimed).hasSize(1);
        assertThat(onlyJob().getStatus()).isEqualTo(JobStatus.RUNNING);

        // The "crashed" worker never acks; its lease is now stale.
        jdbc.update("UPDATE background_jobs SET locked_at = ?", Timestamp.from(Instant.now().minus(Duration.ofMinutes(10))));
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        Integer released = tx.execute(s -> repository.releaseExpiredLeases(Instant.now(), Instant.now().minus(Duration.ofMinutes(2))));
        assertThat(released).isEqualTo(1);

        jobWorker.drain();
        BackgroundJob stored = onlyJob();
        assertThat(stored.getStatus()).isEqualTo(JobStatus.SUCCEEDED);
        assertThat(stored.getAttempts()).isEqualTo(2);

        // The stale worker's late ack is ignored: its lock token no longer matches.
        Integer lateAck = tx.execute(s -> repository.markFailed(stored.getId(), claimed.get(0).lockToken(), Instant.now(), "late"));
        assertThat(lateAck).isZero();
    }

    @Test
    @DisplayName("Claimed jobs are invisible to other claimers, and a running key blocks its pending sibling")
    void claimedJobsAreExclusive() {
        jobQueue.enqueue(job("ok", "one").dedupedBy("shared"));
        assertThat(jobWorker.claim(10)).hasSize(1);

        jobQueue.enqueue(job("ok", "two").dedupedBy("shared"));
        assertThat(repository.count()).as("running job is not coalesced into").isEqualTo(2);
        assertThat(jobWorker.claim(10)).as("same key is still running").isEmpty();
    }

    @Test
    @DisplayName("Backoff grows exponentially and is capped")
    void backoffIsCapped() {
        assertThat(jobWorker.backoff(1)).isBetween(Duration.ofSeconds(8), Duration.ofSeconds(12));
        assertThat(jobWorker.backoff(2)).isBetween(Duration.ofSeconds(24), Duration.ofSeconds(36));
        assertThat(jobWorker.backoff(20)).isLessThanOrEqualTo(Duration.ofMinutes(18));
    }
}
