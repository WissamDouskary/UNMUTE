package com.unmute.source.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OpenAiTranscriptionServiceTest {

    @Test
    @DisplayName("Upload extension comes from a supported filename, then the content type, then defaults to webm")
    void uploadExtension() {
        assertThat(OpenAiTranscriptionService.extension("audio/webm", "standup.MP3")).isEqualTo("mp3");
        assertThat(OpenAiTranscriptionService.extension("audio/mp4", "recording")).isEqualTo("m4a");
        assertThat(OpenAiTranscriptionService.extension("audio/webm;codecs=opus", "blob")).isEqualTo("webm");
        assertThat(OpenAiTranscriptionService.extension("audio/x-wav", "notes.txt")).isEqualTo("wav");
        assertThat(OpenAiTranscriptionService.extension(null, null)).isEqualTo("webm");
    }
}
