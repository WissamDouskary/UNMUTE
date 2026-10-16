package com.unmute.jobs;

import java.time.Duration;
import java.util.Map;

/**
 * What to enqueue. A non-null {@code dedupKey} makes the request coalesce into an already pending job of the
 * same type and key (its run time and payload are replaced), which turns bursts like autosave into one job.
 */
public record JobSpec(String type, Map<String, ?> payload, String dedupKey, Duration delay, Integer maxAttempts) {

    public static JobSpec of(String type, Map<String, ?> payload) {
        return new JobSpec(type, payload, null, Duration.ZERO, null);
    }

    public JobSpec dedupedBy(String key) {
        return new JobSpec(type, payload, key, delay, maxAttempts);
    }

    public JobSpec delayedBy(Duration value) {
        return new JobSpec(type, payload, dedupKey, value, maxAttempts);
    }

    public JobSpec withMaxAttempts(int value) {
        return new JobSpec(type, payload, dedupKey, delay, value);
    }
}
