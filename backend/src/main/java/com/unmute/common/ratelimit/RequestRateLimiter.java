package com.unmute.common.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * One token bucket per caller, kept in this process. A second backend would not share these counts.
 */
@Component
public class RequestRateLimiter {

    public enum Kind {
        AUTH, AI, UPLOAD
    }

    public record Decision(boolean permitted, Duration retryAfter) {
        static Decision permit() {
            return new Decision(true, Duration.ZERO);
        }

        static Decision reject(Duration retryAfter) {
            Duration wait = retryAfter == null || retryAfter.isNegative() ? Duration.ZERO : retryAfter;
            return new Decision(false, wait);
        }
    }

    private final RateLimitProperties properties;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    public RequestRateLimiter(RateLimitProperties properties) {
        this.properties = properties;
    }

    public Decision consume(Kind kind, String owner) {
        if (!properties.enabled()) {
            return Decision.permit();
        }
        RateLimitProperties.Limit limit = switch (kind) {
            case AUTH -> properties.auth();
            case AI -> properties.ai();
            case UPLOAD -> properties.upload();
        };
        String key = kind.name() + ":" + owner;
        if (!buckets.containsKey(key) && buckets.size() >= properties.maxKeys()) {
            return Decision.reject(limit.window());
        }
        Bucket bucket = buckets.computeIfAbsent(key, ignored -> Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(limit.capacity())
                        .refillGreedy(limit.capacity(), limit.window())
                        .build())
                .build());
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            return Decision.permit();
        }
        return Decision.reject(Duration.ofNanos(probe.getNanosToWaitForRefill()));
    }
}
