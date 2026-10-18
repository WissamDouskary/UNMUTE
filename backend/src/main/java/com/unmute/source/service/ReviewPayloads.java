package com.unmute.source.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.source.dto.ReviewPayload;
import com.unmute.source.dto.ReviewTask;

import java.util.List;

/** JSON stored in {@code sources.review_payload}. A bad payload reads as empty suggestions, not a saved note. */
public final class ReviewPayloads {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ReviewPayloads() {
    }

    public static String write(ReviewPayload payload) {
        ReviewPayload safe = payload == null
                ? new ReviewPayload("", List.of(), List.of())
                : new ReviewPayload(
                        payload.summary() == null ? "" : payload.summary(),
                        payload.tasks() == null ? List.of() : payload.tasks(),
                        payload.tags() == null ? List.of() : payload.tags());
        try {
            return MAPPER.writeValueAsString(safe);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not store the capture review", e);
        }
    }

    public static ReviewPayload read(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            ReviewPayload payload = MAPPER.readValue(json, ReviewPayload.class);
            return new ReviewPayload(
                    payload.summary() == null ? "" : payload.summary(),
                    payload.tasks() == null ? List.of() : payload.tasks().stream()
                            .filter(task -> task != null)
                            .map(task -> new ReviewTask(
                                    task.title() == null ? "" : task.title(),
                                    task.description() == null ? "" : task.description()))
                            .toList(),
                    payload.tags() == null ? List.of() : payload.tags());
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
