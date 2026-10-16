package com.unmute.source.event;

import java.util.UUID;

/** A source was persisted in PENDING state and should be transcribed once that state is committed. */
public record SourceTranscriptionRequestedEvent(UUID sourceId) {
}
