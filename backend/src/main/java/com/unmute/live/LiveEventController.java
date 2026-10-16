package com.unmute.live;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.exception.InvalidTokenException;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/events")
public class LiveEventController {

    private final LiveEventService liveEvents;

    public LiveEventController(LiveEventService liveEvents) {
        this.liveEvents = liveEvents;
    }

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@AuthenticationPrincipal UserPrincipal principal, HttpServletResponse response) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        response.setHeader("Cache-Control", "no-cache, no-transform");
        // Stops nginx-style reverse proxies from buffering the stream.
        response.setHeader("X-Accel-Buffering", "no");
        return liveEvents.subscribe(principal.getId());
    }
}
