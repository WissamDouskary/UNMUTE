package com.unmute.ai.dto;

import java.util.List;

public record AskResponse(
        String answer,
        List<CitationDto> citations
) {
}
