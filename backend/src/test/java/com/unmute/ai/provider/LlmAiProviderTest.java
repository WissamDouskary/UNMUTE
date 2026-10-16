package com.unmute.ai.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.unmute.ai.client.LlmClient;
import com.unmute.ai.dto.AskResponse;
import com.unmute.ai.dto.ExtractedTaskItem;
import com.unmute.ai.dto.SemanticSearchResultDto;
import com.unmute.ai.dto.SummarizeResponse;
import com.unmute.task.domain.TaskPriority;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class LlmAiProviderTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-16T09:00:00Z"), ZoneOffset.UTC);

    /** Replays a canned JSON reply and records what was sent. */
    static final class FakeLlm implements LlmClient {
        final List<String> systems = new ArrayList<>();
        final List<String> users = new ArrayList<>();
        final List<String> schemaNames = new ArrayList<>();
        private final String reply;

        FakeLlm(String reply) {
            this.reply = reply;
        }

        @Override
        public String describe() {
            return "fake/model";
        }

        @Override
        public JsonNode completeJson(String system, String user, String schemaName, ObjectNode schema, boolean lightweight) {
            systems.add(system);
            users.add(user);
            schemaNames.add(schemaName);
            try {
                return MAPPER.readTree(reply);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
    }

    @Test
    @DisplayName("Summaries send plain text, not HTML, and cap key points")
    void summarize() {
        FakeLlm llm = new FakeLlm("""
                {"summary":"The team chose Kafka.","keyPoints":["a","b"," ","c"]}""");
        SummarizeResponse response = new LlmAiProvider(llm, CLOCK)
                .summarize("<h2>Arch</h2><p>We picked <strong>Kafka</strong> &amp; Postgres.</p>");

        assertThat(response.summary()).isEqualTo("The team chose Kafka.");
        assertThat(response.keyPoints()).containsExactly("a", "b", "c");
        assertThat(llm.users.get(0)).contains("We picked Kafka & Postgres.").doesNotContain("<strong>");
    }

    @Test
    @DisplayName("Empty notes are summarized without calling the model")
    void summarizeEmpty() {
        FakeLlm llm = new FakeLlm("{}");
        new LlmAiProvider(llm, CLOCK).summarize("<p> </p>");
        assertThat(llm.users).isEmpty();
    }

    @Test
    @DisplayName("Task extraction passes today's date, normalizes priority casing and parses due dates")
    void extractTasks() {
        FakeLlm llm = new FakeLlm("""
                {"tasks":[
                  {"title":"draft the migration plan.","description":"Sarah owns it","priority":"high","dueDate":"2026-10-23"},
                  {"title":"Draft the migration plan","description":null,"priority":"LOW","dueDate":null},
                  {"title":"Set up Kafka","description":" ","priority":"weird","dueDate":"next week"}
                ]}""");

        List<ExtractedTaskItem> tasks = new LlmAiProvider(llm, CLOCK)
                .extractTasks("<ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"true\"><p>Old</p></li></ul><p>Plan</p>");

        assertThat(llm.systems.get(0)).contains("2026-10-16");
        assertThat(llm.users.get(0)).contains("- [x] Old");
        assertThat(tasks).hasSize(2);
        assertThat(tasks.get(0).title()).isEqualTo("Draft the migration plan");
        assertThat(tasks.get(0).priority()).isEqualTo(TaskPriority.HIGH);
        assertThat(tasks.get(0).dueDate()).isEqualTo(Instant.parse("2026-10-23T12:00:00Z"));
        assertThat(tasks.get(1).priority()).isEqualTo(TaskPriority.MEDIUM);
        assertThat(tasks.get(1).description()).isNull();
        assertThat(tasks.get(1).dueDate()).isNull();
    }

    @Test
    @DisplayName("RAG answers map cited indices to notes and ignore out-of-range citations")
    void ragCitations() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        List<SemanticSearchResultDto> notes = List.of(
                new SemanticSearchResultDto(first, "Kafka decision", "<p>We chose Kafka for events.</p>", null, 0.8, List.of("arch"), Instant.now()),
                new SemanticSearchResultDto(second, "Lunch", "<p>Tacos on Friday.</p>", "Food plans", 0.4, List.of(), Instant.now()));
        FakeLlm llm = new FakeLlm("""
                {"answer":"You chose **Kafka** [Note: Kafka decision].",
                 "citations":[{"noteIndex":1,"quote":"We chose Kafka for events."},{"noteIndex":7,"quote":"x"}]}""");

        AskResponse response = new LlmAiProvider(llm, CLOCK).generateRagAnswer("What broker did we pick?", notes);

        assertThat(response.answer()).contains("[Note: Kafka decision]");
        assertThat(response.citations()).singleElement().satisfies(c -> {
            assertThat(c.noteId()).isEqualTo(first);
            assertThat(c.snippet()).isEqualTo("We chose Kafka for events.");
        });
        assertThat(llm.users.get(0)).contains("<note index=\"1\" title=\"Kafka decision\"").contains("Question: What broker did we pick?");
    }

    @Test
    @DisplayName("Tag suggestions send the vocabulary, cap the count, and ask for JSON tags")
    void suggestTags() {
        FakeLlm llm = new FakeLlm("""
                {"tags":["kafka","event-bus","architecture","misc","voice-note"]}""");
        List<String> tags = new LlmAiProvider(llm, CLOCK)
                .suggestTags("Architecture review", "<p>We are moving the event bus to Kafka.</p>",
                        List.of("architecture", "hiring"), 5);

        assertThat(llm.schemaNames.get(0)).isEqualTo("note_tags");
        assertThat(llm.systems.get(0)).contains("Return 3 to 5");
        assertThat(llm.users.get(0)).contains("<existing_tags>architecture, hiring</existing_tags>")
                .contains("We are moving the event bus to Kafka.");
        assertThat(tags).containsExactly("kafka", "event-bus", "architecture", "misc", "voice-note");
    }

    @Test
    @DisplayName("Without relevant notes the model is not called")
    void ragWithoutNotes() {
        FakeLlm llm = new FakeLlm("{}");
        AskResponse response = new LlmAiProvider(llm, CLOCK).generateRagAnswer("Anything?", List.of());
        assertThat(response.citations()).isEmpty();
        assertThat(llm.users).isEmpty();
    }
}
