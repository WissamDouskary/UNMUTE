package com.unmute.source.dto;

import java.util.List;

/** What the user accepted on the review sheet. Stored suggestions that are left off are not saved. */
public record ApproveCaptureRequest(
        String title,
        String body,
        List<ReviewTask> tasks,
        List<String> tags
) {
}
