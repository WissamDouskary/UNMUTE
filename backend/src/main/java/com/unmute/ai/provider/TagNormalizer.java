package com.unmute.ai.provider;

import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/** Canonical tag form: lowercase kebab-case, 2-40 characters, letters and digits in any script. */
public final class TagNormalizer {

    static final int MIN_LENGTH = 2;
    static final int MAX_LENGTH = 40;

    private static final Pattern SEPARATORS = Pattern.compile("[\\s_/.]+");
    private static final Pattern INVALID = Pattern.compile("[^\\p{L}\\p{N}-]");
    private static final Pattern DASHES = Pattern.compile("-{2,}");

    /** Too generic to help organize anything, or already applied by the app itself. */
    private static final Set<String> GENERIC = Set.of(
            "note", "notes", "misc", "miscellaneous", "general", "other", "stuff", "todo", "important",
            "idea", "ideas", "untitled", "text", "document", "voice-note", "transcription", "transcript");

    private TagNormalizer() {
    }

    /** Returns the canonical tag, or empty if nothing usable remains. */
    public static Optional<String> normalize(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String tag = Normalizer.normalize(raw, Normalizer.Form.NFKC).strip().toLowerCase(Locale.ROOT);
        tag = tag.replaceFirst("^#+", "");
        tag = SEPARATORS.matcher(tag).replaceAll("-");
        tag = INVALID.matcher(tag).replaceAll("");
        tag = DASHES.matcher(tag).replaceAll("-").replaceAll("^-|-$", "");
        if (tag.length() > MAX_LENGTH) {
            tag = tag.substring(0, MAX_LENGTH).replaceAll("-$", "");
        }
        return tag.length() < MIN_LENGTH ? Optional.empty() : Optional.of(tag);
    }

    /** Normalizes, drops generic tags and duplicates, keeps order, and caps the count. */
    public static List<String> normalizeSuggestions(Collection<String> raw, int max) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String candidate : raw) {
            normalize(candidate).filter(tag -> !GENERIC.contains(tag)).ifPresent(out::add);
            if (out.size() >= max) {
                break;
            }
        }
        return List.copyOf(out);
    }
}
