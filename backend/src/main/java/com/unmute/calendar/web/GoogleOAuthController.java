package com.unmute.calendar.web;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.calendar.GoogleSettings;
import com.unmute.calendar.dto.GoogleAuthUrlResponse;
import com.unmute.calendar.google.GoogleCalendarClient;
import com.unmute.calendar.oauth.OAuthStateService;
import com.unmute.calendar.sync.CalendarSyncService;
import com.unmute.common.exception.ConflictException;
import com.unmute.common.exception.InvalidTokenException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/auth/google")
public class GoogleOAuthController {

    private static final String SCOPE = "https://www.googleapis.com/auth/calendar.events";
    private static final Logger log = LoggerFactory.getLogger(GoogleOAuthController.class);

    private final GoogleSettings settings;
    private final OAuthStateService states;
    private final GoogleCalendarClient google;
    private final CalendarSyncService calendars;
    private final String webOrigin;

    public GoogleOAuthController(
            GoogleSettings settings,
            OAuthStateService states,
            GoogleCalendarClient google,
            CalendarSyncService calendars,
            @Value("${unmute.web.origin:http://localhost:3000}") String webOrigin
    ) {
        this.settings = settings;
        this.states = states;
        this.google = google;
        this.calendars = calendars;
        this.webOrigin = webOrigin;
    }

    @GetMapping("/start")
    public GoogleAuthUrlResponse start(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        if (!settings.configured()) {
            throw new ConflictException("Google Calendar is not configured");
        }
        String url = UriComponentsBuilder.fromUriString("https://accounts.google.com/o/oauth2/v2/auth")
                .queryParam("client_id", settings.getClientId())
                .queryParam("redirect_uri", settings.getRedirectUri())
                .queryParam("response_type", "code")
                .queryParam("scope", SCOPE)
                .queryParam("access_type", "offline")
                .queryParam("prompt", "consent")
                .queryParam("state", states.issue(principal.getId()))
                .build()
                .encode()
                .toUriString();
        return new GoogleAuthUrlResponse(url);
    }

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state
    ) {
        int connected = 0;
        if (code != null && !code.isBlank() && state != null && !state.isBlank()) {
            try {
                var userId = states.consume(state);
                GoogleCalendarClient.TokenResponse tokens = google.exchangeCode(code);
                calendars.connect(userId, tokens);
                connected = tokens.refreshToken() == null || tokens.refreshToken().isBlank() ? 0 : 1;
            } catch (RuntimeException ex) {
                log.warn("Google calendar connect failed: {}", ex.getClass().getSimpleName());
            }
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(webOrigin + "/calendar?connected=" + connected))
                .build();
    }
}
