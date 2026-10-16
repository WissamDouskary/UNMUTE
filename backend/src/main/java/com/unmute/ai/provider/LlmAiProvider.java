package com.unmute.ai.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.unmute.ai.client.AiProviderException;
import com.unmute.ai.client.JsonSchemas;
import com.unmute.ai.client.LlmClient;
import com.unmute.ai.dto.AskResponse;
import com.unmute.ai.dto.CitationDto;
import com.unmute.ai.dto.ExtractedTaskItem;
import com.unmute.ai.dto.SemanticSearchResultDto;
import com.unmute.ai.dto.SummarizeResponse;
import com.unmute.task.domain.TaskPriority;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.*;

/** {@link AiProvider} backed by a real chat model (Claude or GPT) with schema-constrained JSON output. */
public class LlmAiProvider implements AiProvider {

    private static final int MAX_NOTE_CHARS = 60_000;
    private static final int MAX_RAG_NOTE_CHARS = 6_000;
    private static final int MAX_RAG_TOTAL_CHARS = 30_000;
    private static final int MAX_TASKS = 10;
    private static final int MAX_KEY_POINTS = 6;
    private static final int MAX_SNIPPET = 200;

    static final String SUMMARY_SYSTEM = """
            You summarize notes from the user's personal knowledge base.
            Write a summary of 2-3 sentences that captures the main point and any decisions, then 3-5 short key \
            points. Write in the same language as the note. State only what the note says; do not add advice \
            or outside facts.""";

    static final String TASKS_SYSTEM = """
            You extract action items from a note in the user's personal knowledge base.
            Today's date is %s (UTC).
            Rules:
            - Include only concrete tasks the author or their team still has to do. Skip completed checklist \
            items (marked [x]), general ideas, and things that already happened.
            - title: a short imperative phrase (max 80 characters) in the note's language, e.g. "Draft the migration plan".
            - description: one sentence of context from the note (who, why, or details), or null.
            - priority: URGENT only if the note says urgent, ASAP, critical or blocker; HIGH if it is called \
            important or is due within 2 days; LOW if optional or nice-to-have; otherwise MEDIUM.
            - dueDate: YYYY-MM-DD only when the note states or clearly implies a date; resolve relative dates \
            such as "by Friday" against today. Otherwise null.
            - At most %d tasks. Return an empty list when there are none.""";

    static final String RAG_SYSTEM = """
            You are UNMUTE, the user's second-brain assistant. Answer the question using ONLY the notes provided \
            between <notes> tags; they are the user's own notes.
            - If the notes do not contain the answer, say so plainly in one or two sentences. Never fill gaps with \
            outside knowledge.
            - Cite each note you rely on inline using exactly [Note: <exact note title>].
            - Be concise: a short paragraph, or lines starting with "- " for lists. Use **bold** for key facts. \
            No headings, tables or code blocks.
            - In citations, give the index of every note you used and a short verbatim quote (under 200 \
            characters) from it that supports the answer.""";

    static final String TAGS_SYSTEM = """
            You tag notes in the user's personal knowledge base so related notes can be found together.
            Suggest up to %d tags for the note.
            - Prefer tags from the user's existing tags (listed in <existing_tags>) whenever one fits; only \
            invent a new tag for a clearly distinct topic.
            - Tags are specific topics, projects, technologies, people, places or note types, e.g. \
            "product-roadmap", "kafka", "hiring", "meeting-notes".
            - Lowercase, 1-3 words joined with hyphens, in the note's language.
            - Avoid vague tags such as "note", "misc", "ideas", "important", "voice-note" or "transcription".
            - Return fewer tags, or none, if the note is too vague to tag well.""";

    private static final ObjectNode TAGS_SCHEMA = JsonSchemas.object(Map.of(
            "tags", JsonSchemas.arrayOf(JsonSchemas.string("one tag in lowercase kebab-case"), "suggested tags")));

    private static final int MAX_TAG_NOTE_CHARS = 12_000;
    private static final int MAX_VOCABULARY = 200;

    private static final ObjectNode SUMMARY_SCHEMA = JsonSchemas.object(linked(
            "summary", JsonSchemas.string("2-3 sentence summary of the note"),
            "keyPoints", JsonSchemas.arrayOf(JsonSchemas.string("one key point"), "3-5 key points")));

    private static final ObjectNode TASKS_SCHEMA = JsonSchemas.object(Map.of(
            "tasks", JsonSchemas.arrayOf(JsonSchemas.object(linked(
                    "title", JsonSchemas.string("short imperative task title"),
                    "description", JsonSchemas.nullableString("one sentence of context, or null"),
                    "priority", JsonSchemas.enumOf("task priority", "LOW", "MEDIUM", "HIGH", "URGENT"),
                    "dueDate", JsonSchemas.nullableString("due date as YYYY-MM-DD, or null"))),
                    "action items found in the note")));

    private static final ObjectNode RAG_SCHEMA = JsonSchemas.object(linked(
            "answer", JsonSchemas.string("the answer, citing notes inline as [Note: exact title]"),
            "citations", JsonSchemas.arrayOf(JsonSchemas.object(linked(
                    "noteIndex", JsonSchemas.integer("index attribute of the cited note"),
                    "quote", JsonSchemas.string("short verbatim quote from that note"))),
                    "notes the answer relies on")));

    private final LlmClient llm;
    private final Clock clock;

    public LlmAiProvider(LlmClient llm) {
        this(llm, Clock.systemUTC());
    }

    LlmAiProvider(LlmClient llm, Clock clock) {
        this.llm = llm;
        this.clock = clock;
    }

    public String describe() {
        return llm.describe();
    }

    @Override
    public SummarizeResponse summarize(String content) {
        String text = NoteText.toPlainText(content);
        if (text.isBlank()) {
            return new SummarizeResponse("This note is currently empty.", List.of("No actionable content detected."));
        }

        JsonNode result = llm.completeJson(SUMMARY_SYSTEM, wrapNote(text), "note_summary", SUMMARY_SCHEMA, false);
        String summary = result.path("summary").asText("").strip();
        if (summary.isEmpty()) {
            throw new AiProviderException(llm.describe(), 200, true, "The model returned an empty summary.");
        }
        List<String> keyPoints = new ArrayList<>();
        for (JsonNode point : result.path("keyPoints")) {
            String value = point.asText("").strip();
            if (!value.isEmpty() && keyPoints.size() < MAX_KEY_POINTS) {
                keyPoints.add(value);
            }
        }
        return new SummarizeResponse(summary, keyPoints);
    }

    @Override
    public List<ExtractedTaskItem> extractTasks(String content) {
        String text = NoteText.toPlainText(content);
        if (text.isBlank()) {
            return List.of();
        }

        LocalDate today = LocalDate.now(clock);
        String system = TASKS_SYSTEM.formatted(today, MAX_TASKS);
        JsonNode result = llm.completeJson(system, wrapNote(text), "action_items", TASKS_SCHEMA, false);

        List<ExtractedTaskItem> tasks = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode task : result.path("tasks")) {
            String title = cleanTitle(task.path("title").asText(""));
            if (title.length() < 3 || !seen.add(title.toLowerCase(Locale.ROOT))) {
                continue;
            }
            String description = task.path("description").isTextual() ? task.path("description").asText().strip() : null;
            tasks.add(new ExtractedTaskItem(
                    title,
                    description == null || description.isEmpty() ? null : description,
                    parsePriority(task.path("priority").asText("")),
                    parseDueDate(task.path("dueDate")),
                    null));
            if (tasks.size() >= MAX_TASKS) {
                break;
            }
        }
        return tasks;
    }

    @Override
    public AskResponse generateRagAnswer(String question, List<SemanticSearchResultDto> relevantNotes) {
        if (relevantNotes == null || relevantNotes.isEmpty()) {
            return noRelevantNotes(question);
        }

        StringBuilder user = new StringBuilder("<notes>\n");
        List<SemanticSearchResultDto> included = new ArrayList<>();
        int budget = MAX_RAG_TOTAL_CHARS;
        for (SemanticSearchResultDto note : relevantNotes) {
            if (budget <= 0) {
                break;
            }
            String body = NoteText.truncate(NoteText.toPlainText(note.content()), Math.min(MAX_RAG_NOTE_CHARS, budget));
            included.add(note);
            budget -= body.length();
            user.append("<note index=\"").append(included.size()).append("\" title=\"").append(attr(note.title()))
                    .append("\" updated=\"").append(note.updatedAt() != null ? LocalDate.ofInstant(note.updatedAt(), ZoneOffset.UTC) : "")
                    .append("\" tags=\"").append(attr(String.join(", ", note.tags() != null ? note.tags() : List.of())))
                    .append("\">\n");
            if (note.summary() != null && !note.summary().isBlank()) {
                user.append("Summary: ").append(NoteText.toPlainText(note.summary())).append("\n\n");
            }
            user.append(body).append("\n</note>\n");
        }
        user.append("</notes>\n\nQuestion: ").append(question.strip());

        JsonNode result = llm.completeJson(RAG_SYSTEM, user.toString(), "grounded_answer", RAG_SCHEMA, false);
        String answer = result.path("answer").asText("").strip();
        if (answer.isEmpty()) {
            throw new AiProviderException(llm.describe(), 200, true, "The model returned an empty answer.");
        }
        return new AskResponse(answer, citations(result.path("citations"), included, answer));
    }

    @Override
    public List<String> suggestTags(String title, String content, List<String> vocabulary, int maxTags) {
        String text = NoteText.toPlainText(content);
        StringBuilder user = new StringBuilder("<existing_tags>")
                .append(String.join(", ", vocabulary.subList(0, Math.min(vocabulary.size(), MAX_VOCABULARY))))
                .append("</existing_tags>\n\n<note title=\"").append(attr(title)).append("\">\n")
                .append(NoteText.truncate(text, MAX_TAG_NOTE_CHARS))
                .append("\n</note>");

        JsonNode result = llm.completeJson(TAGS_SYSTEM.formatted(maxTags), user.toString(), "note_tags", TAGS_SCHEMA, true);
        List<String> tags = new ArrayList<>();
        for (JsonNode tag : result.path("tags")) {
            if (tag.isTextual()) {
                tags.add(tag.asText());
            }
        }
        return tags;
    }

    /** Uses the model's cited indices; falls back to [Note: title] markers in the answer if it gave none. */
    private static List<CitationDto> citations(JsonNode cited, List<SemanticSearchResultDto> notes, String answer) {
        Map<UUID, CitationDto> byNote = new LinkedHashMap<>();
        for (JsonNode citation : cited) {
            int index = citation.path("noteIndex").asInt(0);
            if (index < 1 || index > notes.size()) {
                continue;
            }
            SemanticSearchResultDto note = notes.get(index - 1);
            String quote = citation.path("quote").asText("").strip();
            byNote.putIfAbsent(note.noteId(), citation(note, quote));
        }
        if (byNote.isEmpty()) {
            for (SemanticSearchResultDto note : notes) {
                if (note.title() != null && answer.contains("[Note: " + note.title() + "]")) {
                    byNote.putIfAbsent(note.noteId(), citation(note, ""));
                }
            }
        }
        return List.copyOf(byNote.values());
    }

    private static CitationDto citation(SemanticSearchResultDto note, String quote) {
        String snippet = quote;
        if (snippet.isEmpty() && note.summary() != null) {
            snippet = NoteText.toPlainText(note.summary());
        }
        if (snippet.isEmpty()) {
            String content = NoteText.toPlainText(note.content());
            snippet = content.lines().filter(line -> line.length() > 12).findFirst().orElse(note.title());
        }
        if (snippet.length() > MAX_SNIPPET) {
            snippet = snippet.substring(0, MAX_SNIPPET - 3) + "...";
        }
        return new CitationDto(note.noteId(), note.title(), snippet, note.similarity());
    }

    static AskResponse noRelevantNotes(String question) {
        return new AskResponse(
                "I searched through your knowledge base in UNMUTE, but couldn't find any relevant notes or transcripts matching **\""
                        + question.strip() + "\"**.\n\n"
                        + "💡 *Tip: Try broader search terms, or capture a new voice note or thought in Sources.*",
                List.of());
    }

    private static String wrapNote(String text) {
        return "<note>\n" + NoteText.truncate(text, MAX_NOTE_CHARS) + "\n</note>";
    }

    private static String attr(String value) {
        return value == null ? "" : value.replace("\"", "'").replace("\n", " ");
    }

    private static String cleanTitle(String raw) {
        String title = raw.strip().replaceAll("[\\s.;:]+$", "");
        if (title.isEmpty()) {
            return title;
        }
        title = Character.toUpperCase(title.charAt(0)) + title.substring(1);
        return title.length() > 255 ? title.substring(0, 252) + "..." : title;
    }

    /** Structured outputs constrain the enum, but casing is not guaranteed across providers. */
    static TaskPriority parsePriority(String value) {
        for (TaskPriority priority : TaskPriority.values()) {
            if (priority.name().equalsIgnoreCase(value.strip())) {
                return priority;
            }
        }
        return TaskPriority.MEDIUM;
    }

    static Instant parseDueDate(JsonNode value) {
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            return null;
        }
        String text = value.asText().strip();
        try {
            return LocalDate.parse(text.length() > 10 ? text.substring(0, 10) : text)
                    .atTime(LocalTime.NOON)
                    .toInstant(ZoneOffset.UTC);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static Map<String, ObjectNode> linked(Object... pairs) {
        Map<String, ObjectNode> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put((String) pairs[i], (ObjectNode) pairs[i + 1]);
        }
        return map;
    }
}
