package com.unmute.jobs;

/** A failure that another attempt cannot fix (missing input, rejected request); the job fails immediately. */
public class NonRetryableJobException extends RuntimeException implements RetryHint {

    public NonRetryableJobException(String message) {
        super(message);
    }

    public NonRetryableJobException(String message, Throwable cause) {
        super(message, cause);
    }

    @Override
    public boolean isRetryable() {
        return false;
    }
}
