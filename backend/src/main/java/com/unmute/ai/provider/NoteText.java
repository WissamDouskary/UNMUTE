package com.unmute.ai.provider;

import java.util.regex.Pattern;

/** Converts Tiptap HTML into readable plain text for models, keeping line structure and checklist state. */
public final class NoteText {

    private static final Pattern CHECKED_ITEM = Pattern.compile("(?i)<li[^>]*data-checked=[\"']true[\"'][^>]*>");
    private static final Pattern UNCHECKED_ITEM = Pattern.compile("(?i)<li[^>]*data-checked=[\"']false[\"'][^>]*>");
    private static final Pattern LIST_ITEM = Pattern.compile("(?i)<li[^>]*>");
    private static final Pattern BREAK = Pattern.compile("(?i)<br\\s*/?>|</(p|div|li|tr|h[1-6]|blockquote|pre)>");
    private static final Pattern TAG = Pattern.compile("<[^>]*>");
    private static final Pattern SPACES = Pattern.compile("[ \\t\\x0B\\f\\r]+");
    private static final Pattern BLANK_LINES = Pattern.compile("\\n\\s*\\n+");

    private NoteText() {
    }

    public static String toPlainText(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        String text = CHECKED_ITEM.matcher(html).replaceAll("\n- [x] ");
        text = UNCHECKED_ITEM.matcher(text).replaceAll("\n- [ ] ");
        text = LIST_ITEM.matcher(text).replaceAll("\n- ");
        text = BREAK.matcher(text).replaceAll("\n");
        text = TAG.matcher(text).replaceAll(" ")
                .replace("&nbsp;", " ")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&amp;", "&");
        text = SPACES.matcher(text).replaceAll(" ");
        text = text.lines().map(String::strip).reduce((a, b) -> a + "\n" + b).orElse("");
        return BLANK_LINES.matcher(text).replaceAll("\n\n").strip();
    }

    public static String truncate(String text, int maxChars) {
        if (text == null || text.length() <= maxChars) {
            return text;
        }
        return text.substring(0, maxChars) + "\n[…truncated]";
    }
}
