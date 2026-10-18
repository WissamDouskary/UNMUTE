package com.unmute.graph.suggest;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Pairs notes that share a tag and are not already connected or reviewed.
 * This is a deterministic rule, not a language-model judgment.
 */
public final class SharedTagSuggester {

    public record NoteTags(String key, String title, Set<String> tags) {}

    public record Candidate(String sourceKey, String targetKey, String explanation, String evidence) {}

    private SharedTagSuggester() {}

    public static String pairKey(String a, String b) {
        return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a;
    }

    public static List<Candidate> propose(List<NoteTags> notes, Set<String> blockedPairs, int limit) {
        Map<String, List<NoteTags>> byTag = new HashMap<>();
        for (NoteTags note : notes) {
            if (note.tags() == null) continue;
            for (String raw : note.tags()) {
                if (raw == null || raw.isBlank()) continue;
                String tag = raw.trim().toLowerCase(Locale.ROOT);
                byTag.computeIfAbsent(tag, ignored -> new ArrayList<>()).add(note);
            }
        }

        int cap = Math.max(0, limit);
        Map<String, Candidate> found = new HashMap<>();
        for (var entry : byTag.entrySet()) {
            if (found.size() >= cap) break;
            List<NoteTags> group = entry.getValue();
            for (int i = 0; i < group.size() && found.size() < cap; i++) {
                for (int j = i + 1; j < group.size() && found.size() < cap; j++) {
                    NoteTags left = group.get(i);
                    NoteTags right = group.get(j);
                    if (left.key().equals(right.key())) continue;
                    String blocked = pairKey(left.key(), right.key());
                    if (blockedPairs.contains(blocked) || found.containsKey(blocked)) continue;
                    String source = left.key().compareTo(right.key()) < 0 ? left.key() : right.key();
                    String target = source.equals(left.key()) ? right.key() : left.key();
                    String tag = entry.getKey();
                    found.put(blocked, new Candidate(
                            source,
                            target,
                            "Both notes use the tag #" + tag + ".",
                            tag
                    ));
                }
            }
        }

        return found.values().stream()
                .sorted(Comparator.comparing(Candidate::sourceKey).thenComparing(Candidate::targetKey))
                .limit(Math.max(0, limit))
                .toList();
    }

    public static Set<String> emptyBlocked() {
        return new HashSet<>();
    }
}
