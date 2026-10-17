package com.unmute.calendar.web;

import com.unmute.calendar.sync.CalendarWebhookHandler;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/webhooks/calendar")
public class CalendarWebhookController {

    private final CalendarWebhookHandler handler;

    public CalendarWebhookController(CalendarWebhookHandler handler) {
        this.handler = handler;
    }

    @PostMapping
    public ResponseEntity<Void> receive(
            @RequestHeader(value = "X-Goog-Channel-ID", required = false) String channelId,
            @RequestHeader(value = "X-Goog-Channel-Token", required = false) String token,
            @RequestHeader(value = "X-Goog-Resource-State", required = false) String resourceState
    ) {
        handler.handle(channelId, token, resourceState);
        return ResponseEntity.ok().build();
    }
}
