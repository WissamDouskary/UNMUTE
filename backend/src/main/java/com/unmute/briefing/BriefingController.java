package com.unmute.briefing;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.briefing.dto.BriefingResponse;
import com.unmute.common.exception.InvalidTokenException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api/v1/briefing")
public class BriefingController {

    private final BriefingService briefing;

    public BriefingController(BriefingService briefing) {
        this.briefing = briefing;
    }

    @GetMapping
    public BriefingResponse briefing(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "0") int offsetMinutes
    ) {
        return briefing.briefing(require(principal).getId(), offsetMinutes, Instant.now());
    }

    private static UserPrincipal require(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }
}
