package com.unmute.ai.provider;

import com.unmute.ai.dto.ExtractedTaskItem;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MockAiProviderTest {

    private final MockAiProvider provider = new MockAiProvider();

    private List<String> titles(String content) {
        return provider.extractTasks(content).stream().map(ExtractedTaskItem::title).toList();
    }

    @Test
    @DisplayName("Suggested tags reuse existing vocabulary, then recurring words, skipping filler")
    void suggestsTags() {
        List<String> tags = provider.suggestTags("Architecture review",
                "<p>We discussed Kafka for the event bus. Kafka clusters need monitoring, and the event schema "
                        + "registry should be shared. Kafka topics map to services.</p>",
                List.of("architecture", "hiring", "event-bus"), 5);

        assertEquals(List.of("architecture", "event-bus", "kafka"), tags);
    }

    @Test
    @DisplayName("Transcript header lines never become tasks")
    void skipsTranscriptMetadata() {
        List<String> titles = titles("""
                <h2>🎙 Voice Recording Transcript</h2>
                <p>Source: standup.webm • Duration: 3:12</p>
                <p>We should integrate the notification system with the calendar API.</p>
                """);

        assertEquals(List.of("We should integrate the notification system with the calendar API"), titles);
    }

    @Test
    @DisplayName("Ordinal lead-ins are stripped from inferred task titles")
    void stripsOrdinalLeadIns() {
        List<String> titles = titles(
                "We need to prioritize three things: first, the onboarding flow needs a redesign. "
                        + "Second, we should migrate the billing tables.");

        assertEquals(List.of("The onboarding flow needs a redesign", "We should migrate the billing tables"), titles);
    }

    @Test
    @DisplayName("An inline action-items list yields one task per item")
    void splitsActionItemsList() {
        List<String> titles = titles(
                "Action items: Sarah will draft the RFC; Tom to book the venue, and Priya should email the vendor.");

        assertEquals(List.of("Sarah will draft the RFC", "Tom to book the venue", "Priya should email the vendor"), titles);
    }

    @Test
    @DisplayName("Words that merely start with a task keyword keep their prefix")
    void keepsKeywordPrefixedWords() {
        List<String> titles = titles("<ul><li>Task force needs to review the Q3 budget</li><li>TODOs must be triaged weekly</li></ul>");

        assertEquals(List.of("Task force needs to review the Q3 budget", "TODOs must be triaged weekly"), titles);
    }

    @Test
    @DisplayName("Descriptive sentences with noun uses of verbs are not tasks")
    void ignoresNonActionableSentences() {
        List<String> titles = titles("Notes from the architecture review. The latest test results look stable.");

        assertEquals(List.of("Review and follow up on this note"), titles);
    }

    @Test
    @DisplayName("A clock time is a proposed event; a dateless action stays a task")
    void clockTimeIsAnEvent() {
        ExtractedTaskItem event = provider.extractTasks("Call John tomorrow at 3 PM.").stream()
                .filter(item -> item.kind() == ExtractedTaskItem.ExtractionKind.EVENT)
                .findFirst()
                .orElseThrow();
        assertEquals(15, event.startAt().atZone(ZoneOffset.UTC).getHour());
        assertEquals(event.startAt().plus(1, ChronoUnit.HOURS), event.endAt());

        assertEquals(
                List.of(ExtractedTaskItem.ExtractionKind.TASK),
                provider.extractTasks("We should integrate the notification system with the calendar API.").stream()
                        .map(ExtractedTaskItem::kind)
                        .toList());
    }
}
