package com.unmute.common.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.exception.ApiErrorResponse;
import com.unmute.common.ratelimit.RequestRateLimiter.Decision;
import com.unmute.common.ratelimit.RequestRateLimiter.Kind;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Counts login, model, and upload calls. The bucket key is a user id or the socket address.
 * Request bodies and tokens are not read and are not logged.
 */
public class RateLimitFilter extends OncePerRequestFilter {

    static final String TOO_MANY = "Too many requests. Try again later.";
    private static final Pattern CHAT_MESSAGE = Pattern.compile("^/api/v1/chat/sessions/[^/]+/messages$");

    private final RequestRateLimiter limiter;
    private final ObjectMapper objectMapper;

    public RateLimitFilter(RequestRateLimiter limiter, ObjectMapper objectMapper) {
        this.limiter = limiter;
        this.objectMapper = objectMapper;
    }

    static Kind classify(String method, String path) {
        if (!"POST".equals(method) || path == null) {
            return null;
        }
        if (path.equals("/api/v1/auth/login")
                || path.equals("/api/v1/auth/register")
                || path.equals("/api/v1/auth/refresh")) {
            return Kind.AUTH;
        }
        if (path.startsWith("/api/v1/ai/") || CHAT_MESSAGE.matcher(path).matches()) {
            return Kind.AI;
        }
        if (path.equals("/api/v1/sources")) {
            return Kind.UPLOAD;
        }
        return null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Kind kind = classify(request.getMethod(), path(request));
        if (kind == null) {
            filterChain.doFilter(request, response);
            return;
        }
        Decision decision = limiter.consume(kind, owner(request, kind));
        if (decision.permitted()) {
            filterChain.doFilter(request, response);
            return;
        }
        long retryAfter = Math.max(1, decision.retryAfter().toSeconds());
        response.setStatus(429);
        response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retryAfter));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), new ApiErrorResponse(429, TOO_MANY));
    }

    private static String path(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && uri.startsWith(context)) {
            return uri.substring(context.length());
        }
        return uri;
    }

    private static String owner(HttpServletRequest request, Kind kind) {
        if (kind != Kind.AUTH) {
            UUID userId = currentUserId();
            if (userId != null) {
                return "user:" + userId;
            }
        }
        return "ip:" + request.getRemoteAddr();
    }

    private static UUID currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserPrincipal principal) {
            return principal.getId();
        }
        return null;
    }
}
