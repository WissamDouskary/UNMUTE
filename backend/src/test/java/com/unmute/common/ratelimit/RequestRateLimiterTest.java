package com.unmute.common.ratelimit;

import com.unmute.common.ratelimit.RequestRateLimiter.Decision;
import com.unmute.common.ratelimit.RequestRateLimiter.Kind;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class RequestRateLimiterTest {

    @Test
    void allowsTheCapacityAndRejectsTheNextCall() {
        RequestRateLimiter limiter = limiter(2, 100);

        assertThat(limiter.consume(Kind.AUTH, "ip:203.0.113.5").permitted()).isTrue();
        assertThat(limiter.consume(Kind.AUTH, "ip:203.0.113.5").permitted()).isTrue();
        Decision blocked = limiter.consume(Kind.AUTH, "ip:203.0.113.5");
        assertThat(blocked.permitted()).isFalse();
        assertThat(blocked.retryAfter()).isPositive();
    }

    @Test
    void authenticatedCallersDoNotShareABucket() {
        RequestRateLimiter limiter = limiter(1, 100);

        assertThat(limiter.consume(Kind.AI, "user:alice").permitted()).isTrue();
        assertThat(limiter.consume(Kind.AI, "user:alice").permitted()).isFalse();
        assertThat(limiter.consume(Kind.AI, "user:bob").permitted()).isTrue();
    }

    @Test
    void anonymousAndAuthenticatedBudgetsStaySeparate() {
        RequestRateLimiter limiter = limiter(1, 100);

        assertThat(limiter.consume(Kind.UPLOAD, "ip:203.0.113.8").permitted()).isTrue();
        assertThat(limiter.consume(Kind.UPLOAD, "user:alice").permitted()).isTrue();
        assertThat(limiter.consume(Kind.UPLOAD, "ip:203.0.113.8").permitted()).isFalse();
    }

    @Test
    void aFullKeyTableRejectsANewCallerAndStillServesAnExistingOne() {
        RequestRateLimiter limiter = limiter(2, 1);

        assertThat(limiter.consume(Kind.AUTH, "ip:203.0.113.1").permitted()).isTrue();
        assertThat(limiter.consume(Kind.AUTH, "ip:203.0.113.2").permitted()).isFalse();
        assertThat(limiter.consume(Kind.AUTH, "ip:203.0.113.1").permitted()).isTrue();
    }

    @Test
    void disabledLimiterDoesNotCount() {
        RequestRateLimiter limiter = new RequestRateLimiter(new RateLimitProperties(
                false, 1,
                new RateLimitProperties.Limit(1, Duration.ofMinutes(1)),
                new RateLimitProperties.Limit(1, Duration.ofMinutes(1)),
                new RateLimitProperties.Limit(1, Duration.ofMinutes(1))));

        assertThat(limiter.consume(Kind.AUTH, "ip:203.0.113.1").permitted()).isTrue();
        assertThat(limiter.consume(Kind.AUTH, "ip:203.0.113.1").permitted()).isTrue();
    }

    private static RequestRateLimiter limiter(int capacity, int maxKeys) {
        RateLimitProperties.Limit limit = new RateLimitProperties.Limit(capacity, Duration.ofMinutes(1));
        return new RequestRateLimiter(new RateLimitProperties(true, maxKeys, limit, limit, limit));
    }
}
