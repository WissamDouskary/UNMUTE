package com.unmute.ai.dto;

import java.util.UUID;

public record CitationDto(
        UUID noteId,
        String title,
        String snippet,
        double similarity
) {
}
