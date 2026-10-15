package com.unmute.ai.dto;

import java.util.List;

public record SummarizeResponse(
        String summary,
        List<String> keyPoints
) {
}
