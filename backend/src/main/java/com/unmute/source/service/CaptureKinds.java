package com.unmute.source.service;

import java.util.Locale;
import java.util.Set;

/** Which uploads the capture pipeline accepts, and which job reads them. */
public final class CaptureKinds {

    private static final Set<String> DOCUMENTS = Set.of(
            "image/png",
            "image/jpeg",
            "image/webp",
            "application/pdf",
            "text/plain"
    );

    private CaptureKinds() {
    }

    public static String baseType(String mime) {
        if (mime == null || mime.isBlank()) {
            return "";
        }
        String base = mime.toLowerCase(Locale.ROOT);
        int separator = base.indexOf(';');
        if (separator >= 0) {
            base = base.substring(0, separator);
        }
        return base.trim();
    }

    public static boolean audio(String mime) {
        return baseType(mime).startsWith("audio/");
    }

    public static boolean supported(String mime) {
        String base = baseType(mime);
        return base.startsWith("audio/") || DOCUMENTS.contains(base);
    }
}
