package com.unmute.common.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.ratelimit.RequestRateLimiter.Kind;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class RateLimitFilterTest {

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void classifiesOnlyTheSensitivePosts() {
        assertThat(RateLimitFilter.classify("POST", "/api/v1/auth/login")).isEqualTo(Kind.AUTH);
        assertThat(RateLimitFilter.classify("POST", "/api/v1/auth/register")).isEqualTo(Kind.AUTH);
        assertThat(RateLimitFilter.classify("POST", "/api/v1/auth/refresh")).isEqualTo(Kind.AUTH);
        assertThat(RateLimitFilter.classify("GET", "/api/v1/auth/login")).isNull();
        assertThat(RateLimitFilter.classify("POST", "/api/v1/ai/ask")).isEqualTo(Kind.AI);
        assertThat(RateLimitFilter.classify("POST", "/api/v1/chat/sessions/abc/messages")).isEqualTo(Kind.AI);
        assertThat(RateLimitFilter.classify("POST", "/api/v1/sources")).isEqualTo(Kind.UPLOAD);
        assertThat(RateLimitFilter.classify("POST", "/api/v1/sources/" + UUID.randomUUID() + "/approve")).isNull();
        assertThat(RateLimitFilter.classify("POST", "/api/v1/webhooks/calendar")).isNull();
    }

    @Test
    void aLimitedLoginReturns429WithoutEchoingTheBody() throws Exception {
        RateLimitFilter filter = filter(1);
        FilterChain chain = mock(FilterChain.class);
        byte[] body = "{\"email\":\"a@example.com\",\"password\":\"super-secret-password\"}".getBytes();
        MockHttpServletRequest firstRequest = post("/api/v1/auth/login", "203.0.113.9");
        firstRequest.setContent(body);
        MockHttpServletRequest secondRequest = post("/api/v1/auth/login", "203.0.113.9");
        secondRequest.setContent(body);
        MockHttpServletResponse first = new MockHttpServletResponse();
        MockHttpServletResponse second = new MockHttpServletResponse();

        filter.doFilter(firstRequest, first, chain);
        filter.doFilter(secondRequest, second, chain);

        verify(chain).doFilter(firstRequest, first);
        verify(chain, never()).doFilter(secondRequest, second);
        assertThat(second.getStatus()).isEqualTo(429);
        assertThat(second.getHeader("Retry-After")).isNotBlank();
        assertThat(second.getContentAsString()).contains("\"status\":429");
        assertThat(second.getContentAsString()).contains(RateLimitFilter.TOO_MANY);
        assertThat(second.getContentAsString()).doesNotContain("super-secret-password");
    }

    @Test
    void anAuthenticatedUploadIsCountedForThatUser() throws Exception {
        RateLimitFilter filter = filter(1);
        FilterChain chain = mock(FilterChain.class);
        signIn(UUID.randomUUID());

        filter.doFilter(post("/api/v1/sources", "203.0.113.9"), new MockHttpServletResponse(), chain);
        MockHttpServletResponse blocked = new MockHttpServletResponse();
        filter.doFilter(post("/api/v1/sources", "203.0.113.9"), blocked, chain);

        assertThat(blocked.getStatus()).isEqualTo(429);

        SecurityContextHolder.clearContext();
        signIn(UUID.randomUUID());
        MockHttpServletResponse otherUser = new MockHttpServletResponse();
        filter.doFilter(post("/api/v1/sources", "203.0.113.9"), otherUser, chain);
        assertThat(otherUser.getStatus()).isEqualTo(200);
    }

    private static RateLimitFilter filter(int capacity) {
        RateLimitProperties.Limit limit = new RateLimitProperties.Limit(capacity, Duration.ofMinutes(1));
        RequestRateLimiter limiter = new RequestRateLimiter(new RateLimitProperties(true, 100, limit, limit, limit));
        return new RateLimitFilter(limiter, new ObjectMapper().registerModule(new JavaTimeModule()));
    }

    private static MockHttpServletRequest post(String path, String address) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setRemoteAddr(address);
        return request;
    }

    private static void signIn(UUID userId) {
        UserPrincipal principal = new UserPrincipal(userId, "a@example.com", "hash", "Ada", List.of());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }
}
