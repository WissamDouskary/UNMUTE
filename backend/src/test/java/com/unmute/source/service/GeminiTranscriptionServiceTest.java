package com.unmute.source.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GeminiTranscriptionServiceTest {

    @Test
    @DisplayName("MIME type comes from a supported filename, then the content type, then defaults to audio/webm")
    void mimeType() {
        assertThat(GeminiTranscriptionService.mimeType("audio/webm", "standup.MP3")).isEqualTo("audio/mp3");
        assertThat(GeminiTranscriptionService.mimeType("audio/mp4", "recording")).isEqualTo("audio/mp4");
        assertThat(GeminiTranscriptionService.mimeType("audio/webm;codecs=opus", "blob")).isEqualTo("audio/webm");
        assertThat(GeminiTranscriptionService.mimeType("audio/x-wav", "notes.txt")).isEqualTo("audio/wav");
        assertThat(GeminiTranscriptionService.mimeType(null, null)).isEqualTo("audio/webm");
    }
}
