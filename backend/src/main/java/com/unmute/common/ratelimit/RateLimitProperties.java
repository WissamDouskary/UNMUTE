package com.unmute.common.ratelimit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

@ConfigurationProperties("unmute.rate-limit")
public record RateLimitProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("10000") int maxKeys,
        Limit auth,
        Limit ai,
        Limit upload
) {
    public RateLimitProperties {
        if (maxKeys < 1) {
            throw new IllegalArgumentException("unmute.rate-limit.max-keys must be at least 1");
        }
        if (auth == null) {
            auth = new Limit(10, Duration.ofMinutes(1));
        }
        if (ai == null) {
            ai = new Limit(20, Duration.ofMinutes(1));
        }
        if (upload == null) {
            upload = new Limit(30, Duration.ofMinutes(1));
        }
    }

    public record Limit(
            @DefaultValue("10") int capacity,
            @DefaultValue("PT1M") Duration window
    ) {
        public Limit {
            if (capacity < 1) {
                throw new IllegalArgumentException("A rate limit capacity must be at least 1");
            }
            if (window == null || window.isZero() || window.isNegative()) {
                throw new IllegalArgumentException("A rate limit window must be positive");
            }
        }
    }
}
