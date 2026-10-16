package com.unmute.jobs;

import java.time.Instant;

/**
 * Executes one job type. Delivery is at-least-once (a crash after the work but before the ack re-runs it),
 * so {@link #handle} must be idempotent.
 */
public interface JobHandler {

    String type();

    void handle(ClaimedJob job) throws Exception;

    /** Called after a failed attempt that will be retried at {@code nextRunAt}. */
    default void onRetryScheduled(ClaimedJob job, Exception error, Instant nextRunAt) {
    }

    /** Called once the job is permanently failed (non-retryable error or attempts exhausted). */
    default void onFinalFailure(ClaimedJob job, Exception error) {
    }
}
