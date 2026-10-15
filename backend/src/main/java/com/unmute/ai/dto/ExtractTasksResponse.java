package com.unmute.ai.dto;

import java.util.List;

public record ExtractTasksResponse(
        List<ExtractedTaskItem> tasks,
        int count
) {
}
