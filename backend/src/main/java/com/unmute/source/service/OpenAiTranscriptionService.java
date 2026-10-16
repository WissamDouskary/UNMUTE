package com.unmute.source.service;

import com.unmute.ai.client.AiProviderException;
import com.unmute.ai.client.OpenAiClient;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Speech-to-text through OpenAI's transcription endpoint (whisper-1 or gpt-4o-transcribe). */
public class OpenAiTranscriptionService implements TranscriptionService {

    static final long MAX_BYTES = 25L * 1024 * 1024;

    /** OpenAI detects the audio format from the file extension, so the upload name must carry a supported one. */
    private static final Set<String> SUPPORTED = Set.of("flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm");
    private static final Map<String, String> BY_CONTENT_TYPE = Map.ofEntries(
            Map.entry("audio/webm", "webm"), Map.entry("video/webm", "webm"),
            Map.entry("audio/mp4", "m4a"), Map.entry("audio/x-m4a", "m4a"), Map.entry("audio/m4a", "m4a"),
            Map.entry("video/mp4", "mp4"), Map.entry("audio/mpeg", "mp3"), Map.entry("audio/mp3", "mp3"),
            Map.entry("audio/wav", "wav"), Map.entry("audio/x-wav", "wav"), Map.entry("audio/wave", "wav"),
            Map.entry("audio/ogg", "ogg"), Map.entry("audio/flac", "flac"), Map.entry("audio/x-flac", "flac"));

    private final OpenAiClient client;

    public OpenAiTranscriptionService(OpenAiClient client) {
        this.client = client;
    }

    @Override
    public TranscriptionResult transcribe(String filePath, String fileType, String originalName) {
        Path file = Path.of(filePath);
        try {
            if (Files.size(file) > MAX_BYTES) {
                throw new AiProviderException("OpenAI", 413, false,
                        "This recording is larger than 25 MB, the transcription limit. Split it into shorter parts.");
            }
        } catch (IOException e) {
            throw new AiProviderException("OpenAI", 0, false, "The uploaded audio file could not be read.", e);
        }

        OpenAiClient.Transcript transcript = client.transcribe(file, "audio." + extension(fileType, originalName));
        int duration = transcript.durationSeconds() != null ? (int) Math.round(transcript.durationSeconds()) : 0;
        return new TranscriptionResult(transcript.text().strip(), duration);
    }

    static String extension(String fileType, String originalName) {
        if (originalName != null) {
            int dot = originalName.lastIndexOf('.');
            if (dot >= 0 && dot < originalName.length() - 1) {
                String ext = originalName.substring(dot + 1).toLowerCase(Locale.ROOT);
                if (SUPPORTED.contains(ext)) {
                    return ext;
                }
            }
        }
        if (fileType != null) {
            String base = fileType.toLowerCase(Locale.ROOT).split(";")[0].strip();
            String ext = BY_CONTENT_TYPE.get(base);
            if (ext != null) {
                return ext;
            }
        }
        return "webm";
    }
}
