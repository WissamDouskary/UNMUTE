package com.unmute.chat;

import com.unmute.ai.dto.CitationDto;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CitationMarkersTest {

    @Test
    void appendsAMarkerWhenTheAnswerDidNotCiteTheNote() {
        CitationDto citation = new CitationDto(UUID.randomUUID(), "Q1 roadmap", "ship the queue", 0.8);

        String marked = CitationMarkers.ensure("The plan is to ship the queue.", List.of(citation));

        assertTrue(marked.contains("[Note: Q1 roadmap]"));
    }

    @Test
    void leavesAnExistingMarkerAlone() {
        String answer = "See [Note: Q1 roadmap] for the plan.";
        CitationDto citation = new CitationDto(UUID.randomUUID(), "Q1 roadmap", "ship the queue", 0.8);

        assertEquals(answer, CitationMarkers.ensure(answer, List.of(citation)));
    }
}
