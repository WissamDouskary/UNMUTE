package com.unmute.source.service;

/**
 * Interface for audio/document transcription services.
 * Implementations can be swapped between mock (dev) and real providers (Whisper, etc.)
 */
public interface TranscriptionService {

    /**
     * Transcribe a file to text.
     *
     * @param filePath     Absolute path to the file to transcribe
     * @param fileType     MIME type of the file (e.g., "audio/webm", "audio/mp3")
     * @param originalName Original filename for context
     * @return The transcription result containing the text and estimated duration
     */
    TranscriptionResult transcribe(String filePath, String fileType, String originalName);

    record TranscriptionResult(
            String text,
            int durationSeconds
    ) {
    }
}
