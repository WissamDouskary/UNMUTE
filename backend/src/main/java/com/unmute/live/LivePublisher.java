package com.unmute.live;

import java.util.UUID;

/** Publishes a live event to a user's open streams. {@link LiveEventService} is the production implementation. */
public interface LivePublisher {

    void publish(UUID userId, String type, Object payload);
}
