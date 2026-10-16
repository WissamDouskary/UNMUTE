package com.unmute.ai.provider;

import com.unmute.ai.dto.ExtractedTaskItem;
import com.unmute.ai.dto.SummarizeResponse;
import com.unmute.task.domain.TaskPriority;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@ConditionalOnProperty(name = "unmute.ai.provider", havingValue = "mock", matchIfMissing = true)
public class MockAiProvider implements AiProvider {

    private static final Pattern HTML_TAGS_PATTERN = Pattern.compile("<[^>]*>");
    private static final Pattern TASK_ITEM_PATTERN = Pattern.compile("<li[^>]*data-type=[\"']taskItem[\"'][^>]*>(.*?)</li>", Pattern.CASE_INSENSITIVE);
    private static final Pattern BULLET_OR_LINE_PATTERN = Pattern.compile("(?m)^\\s*(?:[-*•]\\s*(?:\\[[ xX]\\])?|\\d+\\.|TODO:?|Action:?|Task:?)\\s*(.*)$");

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
            String[] sentences = cleanText.split("(?<=[.!?])\\s+");
            for (String sentence : sentences) {
                String trimmed = sentence.trim();
                if (isActionable(trimmed)) {
                    addTaskIfValid(trimmed, tasks, seenTitles, "Inferred action item from note text.");
                    if (tasks.size() >= 5) break;
                }
            }
        }

        // 4. Default if still empty but content exists
        if (tasks.isEmpty() && !cleanText.isBlank()) {
            tasks.add(new ExtractedTaskItem(
                    "Review and follow up on note notes",
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
        String clean = titleCandidate
                .replaceAll("^(?i)(TODO:?|Action:?|Task:?|\\[[ xX]\\])\\s*", "")
                .trim();

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

    private boolean isActionable(String text) {
        String lower = text.toLowerCase();
        return lower.contains("todo")
                || lower.contains("need to")
                || lower.contains("must")
                || lower.contains("should")
                || lower.contains("implement")
                || lower.contains("create")
                || lower.contains("build")
                || lower.contains("deploy")
                || lower.contains("fix")
                || lower.contains("verify")
                || lower.contains("review")
                || lower.contains("prepare")
                || lower.contains("schedule")
                || lower.contains("test")
                || lower.contains("investigate");
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

            // Pick the best snippet
            String snippet;
            if (!cleanSummary.isBlank()) {
                snippet = cleanSummary;
            } else if (!cleanContent.isBlank()) {
                String[] sentences = cleanContent.split("(?<=[.!?])\\s+");
                snippet = (sentences.length > 0 && !sentences[0].isBlank())
                        ? sentences[0].trim()
                        : cleanContent.substring(0, Math.min(cleanContent.length(), 140));
            } else {
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

