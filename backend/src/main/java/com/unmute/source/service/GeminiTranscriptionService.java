package com.unmute.source.service;

import com.unmute.ai.client.AiProviderException;
import com.unmute.ai.client.GeminiClient;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;

/** Speech-to-text through Gemini {@code generateContent} with inline audio. */
public class GeminiTranscriptionService implements TranscriptionService {

    static final long MAX_BYTES = 20L * 1024 * 1024;

    private static final Map<String, String> MIME_BY_EXTENSION = Map.ofEntries(
            Map.entry("webm", "audio/webm"), Map.entry("mp3", "audio/mp3"), Map.entry("mpeg", "audio/mp3"),
            Map.entry("mpga", "audio/mp3"), Map.entry("wav", "audio/wav"), Map.entry("flac", "audio/flac"),
            Map.entry("ogg", "audio/ogg"), Map.entry("oga", "audio/ogg"), Map.entry("m4a", "audio/mp4"),
            Map.entry("mp4", "audio/mp4"), Map.entry("aac", "audio/aac"));

    private static final Map<String, String> MIME_BY_CONTENT_TYPE = Map.ofEntries(
            Map.entry("audio/webm", "audio/webm"), Map.entry("video/webm", "audio/webm"),
            Map.entry("audio/mp4", "audio/mp4"), Map.entry("audio/x-m4a", "audio/mp4"),
            Map.entry("audio/m4a", "audio/mp4"), Map.entry("video/mp4", "audio/mp4"),
            Map.entry("audio/mpeg", "audio/mp3"), Map.entry("audio/mp3", "audio/mp3"),
            Map.entry("audio/wav", "audio/wav"), Map.entry("audio/x-wav", "audio/wav"),
            Map.entry("audio/wave", "audio/wav"), Map.entry("audio/ogg", "audio/ogg"),
            Map.entry("audio/flac", "audio/flac"), Map.entry("audio/x-flac", "audio/flac"),
            Map.entry("audio/aac", "audio/aac"));

    private final GeminiClient client;

    public GeminiTranscriptionService(GeminiClient client) {
        this.client = client;
    }

    @Override
    public TranscriptionResult transcribe(String filePath, String fileType, String originalName) {
        Path file = Path.of(filePath);
        try {
            if (Files.size(file) > MAX_BYTES) {
                throw new AiProviderException("Gemini", 413, false,
                        "This recording is larger than 20 MB, Gemini's inline audio limit. Split it into shorter parts.");
            }
        } catch (IOException e) {
            throw new AiProviderException("Gemini", 0, false, "The uploaded audio file could not be read.", e);
        }

        GeminiClient.Transcript transcript = client.transcribe(file, mimeType(fileType, originalName));
        int duration = transcript.durationSeconds() != null ? (int) Math.round(transcript.durationSeconds()) : 0;
        return new TranscriptionResult(transcript.text().strip(), duration);
    }

    static String mimeType(String fileType, String originalName) {
        if (originalName != null) {
            int dot = originalName.lastIndexOf('.');
            if (dot >= 0 && dot < originalName.length() - 1) {
                String mime = MIME_BY_EXTENSION.get(originalName.substring(dot + 1).toLowerCase(Locale.ROOT));
                if (mime != null) {
                    return mime;
                }
            }
        }
        if (fileType != null) {
            String base = fileType.toLowerCase(Locale.ROOT).split(";")[0].strip();
            String mime = MIME_BY_CONTENT_TYPE.get(base);
            if (mime != null) {
                return mime;
            }
        }
        return "audio/webm";
    }
}
