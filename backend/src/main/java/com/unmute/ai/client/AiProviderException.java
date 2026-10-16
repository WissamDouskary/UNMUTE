package com.unmute.ai.client;

import com.unmute.jobs.RetryHint;

import java.util.regex.Pattern;

/**
 * A failed call to an external AI provider. The message is safe to show to users and to log: anything that
 * looks like an API key is redacted.
 */
public class AiProviderException extends RuntimeException implements RetryHint {

    private static final Pattern SECRET = Pattern.compile("(sk-[A-Za-z0-9_\\-]{4})[A-Za-z0-9_\\-]{6,}");

    private final String provider;
    private final int status;
    private final boolean retryable;

    public AiProviderException(String provider, int status, boolean retryable, String message) {
        this(provider, status, retryable, message, null);
    }

    public AiProviderException(String provider, int status, boolean retryable, String message, Throwable cause) {
        super(redact(message), cause);
        this.provider = provider;
        this.status = status;
        this.retryable = retryable;
    }

    /** Provider name, e.g. "OpenAI" or "Anthropic". */
    public String getProvider() {
        return provider;
    }

    /** Upstream HTTP status, or 0 when the request never got a response (timeout, connection failure). */
    public int getStatus() {
        return status;
    }

    @Override
    public boolean isRetryable() {
        return retryable;
    }

    /** Throttling and outages are temporary; everything else (bad key, rejected input) needs a fix first. */
    public static boolean isRetryableStatus(int status) {
        return status == 408 || status == 409 || status == 429 || status >= 500;
    }

    static String redact(String message) {
        return message == null ? null : SECRET.matcher(message).replaceAll("$1****");
    }
}
