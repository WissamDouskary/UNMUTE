package com.unmute.source.dto;

/** A task suggestion. It is not a task row until the user approves the capture. */
public record ReviewTask(String title, String description) {
}
