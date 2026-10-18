package com.unmute.source.dto;

import java.util.List;

/** Suggested summary, tasks, and tags stored on the source until the user approves them. */
public record ReviewPayload(String summary, List<ReviewTask> tasks, List<String> tags) {
}
