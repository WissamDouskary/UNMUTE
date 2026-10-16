package com.unmute.chat;

import com.unmute.ai.dto.CitationDto;

import java.util.List;

/** Makes sure every cited note appears in the answer as [Note: title], which the chat UI turns into a link. */
public final class CitationMarkers {

    private CitationMarkers() {
    }

    public static String ensure(String answer, List<CitationDto> citations) {
        String text = answer == null ? "" : answer;
        if (citations == null || citations.isEmpty()) {
            return text;
        }
        StringBuilder result = new StringBuilder(text);
        for (CitationDto citation : citations) {
            if (citation.title() == null || citation.title().isBlank()) {
                continue;
            }
            String marker = "[Note: " + citation.title().strip() + "]";
            if (result.indexOf(marker) >= 0) {
                continue;
            }
            if (!result.isEmpty() && result.charAt(result.length() - 1) != '\n') {
                result.append('\n');
            }
            result.append(marker);
        }
        return result.toString();
    }
}
