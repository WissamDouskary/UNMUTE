package com.unmute.jobs;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.UUID;

/** Immutable snapshot of a job claimed by this worker; handlers run on it outside any transaction. */
public record ClaimedJob(UUID id, String type, JsonNode payload, int attempt, int maxAttempts, UUID lockToken) {

    public UUID uuid(String field) {
        JsonNode value = payload.get(field);
        if (value == null || value.isNull()) {
            throw new NonRetryableJobException("Job payload is missing '" + field + "'");
        }
        return UUID.fromString(value.asText());
    }

    public boolean flag(String field) {
        JsonNode value = payload.get(field);
        return value != null && value.asBoolean(false);
    }

    public boolean isLastAttempt() {
        return attempt >= maxAttempts;
    }
}
