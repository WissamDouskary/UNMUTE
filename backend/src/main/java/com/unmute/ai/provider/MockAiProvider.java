package com.unmute.ai.provider;

import com.unmute.ai.dto.ExtractedTaskItem;
import com.unmute.ai.dto.SummarizeResponse;
import com.unmute.task.domain.TaskPriority;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Offline, rule-based stand-in for an LLM; used when no Anthropic or OpenAI key is configured. */
public class MockAiProvider implements AiProvider {

    private static final Pattern HTML_TAGS_PATTERN = Pattern.compile("<[^>]*>");
    private static final Pattern TASK_ITEM_PATTERN = Pattern.compile("<li[^>]*data-type=[\"']taskItem[\"'][^>]*>(.*?)</li>", Pattern.CASE_INSENSITIVE);
    private static final Pattern BULLET_OR_LINE_PATTERN = Pattern.compile("(?m)^\\s*(?:[-*•]\\s*(?:\\[[ xX]\\])?|\\d+\\.|TODO\\b:?|Action:|Task:)\\s*(.*)$");
    /** Sentence boundaries plus hard line breaks, so a heading line never fuses with the next sentence. */
    private static final Pattern SENTENCE_SPLIT = Pattern.compile("(?<=[.!?])\\s+|\\n+");
    private static final Pattern ACTION_ITEMS_LIST = Pattern.compile("(?i)\\baction items?\\s*:\\s*(.+)");
    private static final Pattern LIST_SEPARATOR = Pattern.compile("\\s*(?:;|,\\s*and\\s+|,|\\s+and\\s+(?=(?:I|we|you|he|she|they|[A-Z][a-z]+)\\s+(?:will|need|should|must|to)\\b))\\s*");
    /** "We need three things: first, X" / "Second, we should Y" → "X" / "We should Y". */
    private static final Pattern ORDINAL_LEAD_IN = Pattern.compile("^(?i)(?:[^:]*:\\s*)?(?:first|second|third|fourth|fifth|next|then|also|finally|lastly)(?:ly)?\\s*,\\s*");
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]{3,}");
    private static final Pattern OBLIGATION = Pattern.compile("(?i)\\b(?:todo|needs? to|must|should|have to|has to|let's|action items?)\\b");
    private static final Set<String> ACTION_VERBS = Set.of(
            "implement", "create", "build", "deploy", "fix", "verify", "review", "prepare", "schedule", "test",
            "investigate", "update", "draft", "write", "send", "set", "add", "remove", "complete", "finish",
            "follow", "call", "email", "book", "plan", "refactor", "migrate", "document", "research", "check",
            "configure", "design", "ship", "release", "organize", "contact", "share", "submit", "clean",
            "upgrade", "install", "integrate", "audit", "reply", "confirm", "finalize", "launch");
    private static final Set<String> QUERY_STOP_WORDS = Set.of(
            "what", "which", "who", "whom", "when", "where", "why", "how", "did", "does", "the", "and", "for",
            "are", "was", "were", "about", "with", "from", "that", "this", "have", "has", "our", "your", "my",
            "any", "all", "list", "tell", "show", "decide", "decided", "notes", "note");

    private static final Set<String> TAG_STOP_WORDS = Set.of(
            "that", "this", "with", "from", "have", "will", "need", "needs", "should", "would", "could", "about",
            "there", "their", "they", "them", "then", "than", "what", "when", "which", "where", "while", "also",
            "into", "some", "been", "were", "just", "like", "more", "most", "very", "only", "over", "such", "make",
            "each", "much", "here", "first", "second", "third", "next", "week", "today", "tomorrow", "think",
            "going", "want", "thing", "things", "really", "still", "because", "after", "before", "other", "these",
            "those", "being", "through", "source", "duration", "voice", "recording", "transcript", "alright",
            "okay", "your", "yours", "ours", "mine", "does", "done", "doing", "said", "says", "know", "good",
            "well", "back", "time", "able", "around", "every", "many", "same", "sure", "yeah", "maybe", "note");

    /** Reuses existing tags the note mentions, then adds words that recur in it. */
    @Override
    public List<String> suggestTags(String title, String content, List<String> vocabulary, int maxTags) {
        int limit = Math.min(maxTags, 3);
        String text = ((title != null ? title : "") + "\n" + stripHtml(content)).toLowerCase(Locale.ROOT);
        String padded = " " + text.replaceAll("[^\\p{L}\\p{N}]+", " ") + " ";

        List<String> tags = new ArrayList<>();
        for (String tag : vocabulary) {
            if (tags.size() >= limit) break;
            if (padded.contains(" " + tag.replace('-', ' ') + " ")) {
                tags.add(tag);
            }
        }

        Map<String, Integer> counts = new LinkedHashMap<>();
        Matcher words = WORD.matcher(text);
        while (words.find()) {
            String word = words.group();
            if (word.length() >= 4 && !TAG_STOP_WORDS.contains(word) && !QUERY_STOP_WORDS.contains(word)
                    && !word.chars().allMatch(Character::isDigit)) {
                counts.merge(word, 1, Integer::sum);
            }
        }
        counts.entrySet().stream()
                .filter(e -> e.getValue() >= 2)
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .filter(word -> tags.stream().noneMatch(t -> t.contains(word)))
                .limit(Math.max(0, limit - tags.size()))
                .forEach(tags::add);
        return tags;
    }

    @Override
    public SummarizeResponse summarize(String content) {
        String cleanText = stripHtml(content).trim();
        if (cleanText.isBlank()) {
            return new SummarizeResponse("This note is currently empty.", List.of("No actionable content detected."));
        }

        String[] sentences = cleanText.split("(?<=[.!?])\\s+");
        List<String> keyPoints = new ArrayList<>();

        // Extract key points from explicit bullets or sentences
        Matcher bulletMatcher = BULLET_OR_LINE_PATTERN.matcher(cleanText);
        while (bulletMatcher.find() && keyPoints.size() < 4) {
            String item = bulletMatcher.group(1).trim();
            if (item.length() > 5 && !keyPoints.contains(item)) {
                keyPoints.add(item);
            }
        }

        if (keyPoints.isEmpty()) {
            for (String sentence : sentences) {
                String trimmed = sentence.trim();
                if (trimmed.length() > 15 && keyPoints.size() < 3) {
                    keyPoints.add(trimmed);
                }
            }
        }

        if (keyPoints.isEmpty()) {
            keyPoints.add(cleanText.substring(0, Math.min(cleanText.length(), 120)));
        }

        String executiveSummary;
        if (sentences.length > 0 && sentences[0] != null && !sentences[0].isBlank()) {
            executiveSummary = "Overview: " + sentences[0].trim();
            if (sentences.length > 1 && sentences[1] != null) {
                executiveSummary += " " + sentences[1].trim();
            }
        } else {
            executiveSummary = "Note overview capturing core discussion and knowledge directives.";
        }

        return new SummarizeResponse(executiveSummary, keyPoints);
    }

    @Override
    public List<ExtractedTaskItem> extractTasks(String content) {
        List<ExtractedTaskItem> tasks = new ArrayList<>();
        Set<String> seenTitles = new HashSet<>();

        // 1. Scan for Tiptap HTML taskItems (<li data-type="taskItem">...</li>)
        Matcher taskMatcher = TASK_ITEM_PATTERN.matcher(content);
        while (taskMatcher.find()) {
            String rawText = stripHtml(taskMatcher.group(1)).trim();
            addTaskIfValid(rawText, tasks, seenTitles, "Extracted from note checklist block.");
        }

        // 2. Scan for Markdown task list patterns or TODO lines
        String cleanText = stripHtml(content);
        Matcher lineMatcher = BULLET_OR_LINE_PATTERN.matcher(cleanText);
        while (lineMatcher.find()) {
            String line = lineMatcher.group(1).trim();
            if (isActionable(line)) {
                addTaskIfValid(line, tasks, seenTitles, "Extracted from actionable bullet.");
            }
        }

        // 3. Fallback: If no explicit task syntax found, scan sentences with action verbs
        if (tasks.isEmpty()) {
            for (String sentence : sentences(cleanText)) {
                if (isMetadataLine(sentence)) continue;

                Matcher actionItems = ACTION_ITEMS_LIST.matcher(sentence);
                if (actionItems.find()) {
                    for (String item : LIST_SEPARATOR.split(actionItems.group(1))) {
                        addTaskIfValid(stripTrailingPunctuation(item), tasks, seenTitles, "Extracted from meeting action items.");
                    }
                } else if (isActionable(sentence)) {
                    addTaskIfValid(sentence, tasks, seenTitles, "Inferred action item from note text.");
                }
                if (tasks.size() >= 8) break;
            }
        }

        // 4. Default if still empty but content exists
        if (tasks.isEmpty() && !cleanText.isBlank()) {
            tasks.add(new ExtractedTaskItem(
                    "Review and follow up on this note",
                    "Synthesized from captured content: " + cleanText.substring(0, Math.min(cleanText.length(), 60)) + "...",
                    TaskPriority.MEDIUM,
                    Instant.now().plus(2, ChronoUnit.DAYS),
                    null
            ));
        }

        return tasks;
    }

    private void addTaskIfValid(String titleCandidate, List<ExtractedTaskItem> list, Set<String> seen, String defaultDesc) {
        if (titleCandidate == null || titleCandidate.length() < 3) return;

        // Clean common prefixes
        String clean = stripTrailingPunctuation(ORDINAL_LEAD_IN.matcher(titleCandidate
                .replaceAll("^(?i)(TODO\\b:?|Action:|Task:|\\[[ xX]\\])\\s*", "")
                .trim()).replaceFirst(""));
        if (clean.length() < 3) return;
        clean = Character.toUpperCase(clean.charAt(0)) + clean.substring(1);

        if (clean.length() > 255) {
            clean = clean.substring(0, 252) + "...";
        }

        if (clean.isBlank() || seen.contains(clean.toLowerCase())) return;
        seen.add(clean.toLowerCase());

        TaskPriority priority = inferPriority(clean);
        Instant dueDate = inferDueDate(priority);

        list.add(new ExtractedTaskItem(
                clean,
                defaultDesc,
                priority,
                dueDate,
                null
        ));
    }

    private static List<String> sentences(String cleanText) {
        List<String> out = new ArrayList<>();
        for (String s : SENTENCE_SPLIT.split(cleanText)) {
            String trimmed = s.trim();
            if (!trimmed.isEmpty()) out.add(trimmed);
        }
        return out;
    }

    /** Transcript notes open with a generated header ("🎙 Voice Recording Transcript", "Source: x • Duration: y"). */
    private static boolean isMetadataLine(String line) {
        String lower = line.toLowerCase(Locale.ROOT);
        return lower.contains("voice recording transcript")
                || lower.startsWith("source:")
                || lower.matches(".*\\bduration:\\s*\\d+:\\d{2}.*");
    }

    private static String stripTrailingPunctuation(String text) {
        return text.replaceAll("[\\s.;,:]+$", "").trim();
    }

    private static Set<String> keywords(String text) {
        Set<String> words = new HashSet<>();
        Matcher m = WORD.matcher(text.toLowerCase(Locale.ROOT));
        while (m.find()) {
            String w = m.group();
            if (!QUERY_STOP_WORDS.contains(w)) words.add(w);
        }
        return words;
    }

    /** Picks the sentence sharing the most keywords with the question; falls back to the first real sentence. */
    private static String bestSnippet(String question, String cleanContent) {
        Set<String> queryWords = keywords(question);
        String best = null;
        int bestScore = -1;
        for (String sentence : sentences(cleanContent)) {
            if (isMetadataLine(sentence) || sentence.length() < 12) continue;
            Set<String> words = keywords(sentence);
            words.retainAll(queryWords);
            if (words.size() > bestScore) {
                bestScore = words.size();
                best = sentence;
            }
        }
        return best;
    }

    /**
     * A sentence is actionable if it carries an obligation ("need to", "must", "TODO") or is imperative
     * (starts with an action verb). Substring matching on verbs alone flagged noun uses such as
     * "notes from the architecture review" or "latest test results".
     */
    private boolean isActionable(String text) {
        if (OBLIGATION.matcher(text).find()) {
            return true;
        }
        Matcher firstWord = WORD.matcher(text.toLowerCase(Locale.ROOT));
        return firstWord.find() && ACTION_VERBS.contains(firstWord.group());
    }

    private TaskPriority inferPriority(String text) {
        String lower = text.toLowerCase();
        if (lower.contains("urgent") || lower.contains("critical") || lower.contains("asap") || lower.contains("blocker")) {
            return TaskPriority.URGENT;
        }
        if (lower.contains("high") || lower.contains("important") || lower.contains("must") || lower.contains("priority")) {
            return TaskPriority.HIGH;
        }
        if (lower.contains("low") || lower.contains("minor") || lower.contains("optional") || lower.contains("nice to have")) {
            return TaskPriority.LOW;
        }
        return TaskPriority.MEDIUM;
    }

    private Instant inferDueDate(TaskPriority priority) {
        Instant now = Instant.now();
        return switch (priority) {
            case URGENT -> now.plus(1, ChronoUnit.DAYS);
            case HIGH -> now.plus(3, ChronoUnit.DAYS);
            case MEDIUM -> now.plus(7, ChronoUnit.DAYS);
            case LOW -> now.plus(14, ChronoUnit.DAYS);
        };
    }

    private String stripHtml(String html) {
        if (html == null) return "";
        return html
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</(p|div|li|tr|h[1-6])>", "\n")
                .replaceAll("<[^>]*>", " ")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replaceAll("[ \\t]+", " ")
                .replaceAll("(?m)^\\s+", "")
                .replaceAll("\\n{2,}", "\n")
                .trim();
    }

    @Override
    public com.unmute.ai.dto.AskResponse generateRagAnswer(String question, List<com.unmute.ai.dto.SemanticSearchResultDto> relevantNotes) {
        if (relevantNotes == null || relevantNotes.isEmpty()) {
            return new com.unmute.ai.dto.AskResponse(
                    "I searched through your knowledge base in UNMUTE, but couldn't find any relevant notes or transcripts matching **\"" +
                            question.trim() + "\"**.\n\n" +
                            "💡 *Tip: Try broader search terms, or capture a new voice note or thought in Sources.*",
                    Collections.emptyList()
            );
        }

        List<com.unmute.ai.dto.CitationDto> citations = new ArrayList<>();
        StringBuilder answerBuilder = new StringBuilder();

        answerBuilder.append("Based on your knowledge base, here is the synthesized answer to **\"")
                .append(question.trim())
                .append("\"**:\n\n");

        for (int i = 0; i < Math.min(relevantNotes.size(), 4); i++) {
            com.unmute.ai.dto.SemanticSearchResultDto note = relevantNotes.get(i);

            String cleanContent = stripHtml(note.content() != null ? note.content() : "");
            String cleanSummary = note.summary() != null ? stripHtml(note.summary()) : "";

            // Prefer the passage that actually answers the question over a generic first line or summary.
            String snippet = bestSnippet(question, cleanContent);
            if (snippet == null && !cleanSummary.isBlank()) {
                snippet = cleanSummary;
            }
            if (snippet == null) {
                snippet = "Reference note titled '" + note.title() + "'.";
            }

            if (snippet.length() > 160) {
                snippet = snippet.substring(0, 157) + "...";
            }

            citations.add(new com.unmute.ai.dto.CitationDto(
                    note.noteId(),
                    note.title(),
                    snippet,
                    note.similarity()
            ));

            answerBuilder.append("• **")
                    .append(note.title())
                    .append("** ([Note: ")
                    .append(note.title())
                    .append("]): ")
                    .append(snippet)
                    .append("\n\n");
        }

        answerBuilder.append("These insights were retrieved using vector semantic similarity across your personal second brain.");

        return new com.unmute.ai.dto.AskResponse(answerBuilder.toString(), citations);
    }
}

