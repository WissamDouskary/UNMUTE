package com.unmute.jobs;

/** Lets an exception tell the worker whether retrying can help. Exceptions without it are retried. */
public interface RetryHint {

    boolean isRetryable();
}
