package com.unmute.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.ai.config.AiProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class OpenAiClientTest {

    private static final String KEY = "sk-test-abcdefghijklmnopqrstuvwxyz";

    private final ObjectMapper mapper = new ObjectMapper();
    private MockRestServiceServer server;
    private OpenAiClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        AiProperties.OpenAi props = new AiProperties.OpenAi(KEY, "https://api.openai.test/v1", "gpt-4o",
                "text-embedding-3-small", "whisper-1", 4096,
                Duration.ofSeconds(1), Duration.ofSeconds(1), Duration.ofSeconds(1));
        client = new OpenAiClient(builder, builder, props, mapper);
    }

    @Test
    @DisplayName("Chat requests use strict json_schema output and return the parsed content")
    void chatJson() {
        server.expect(requestTo("https://api.openai.test/v1/chat/completions"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + KEY))
                .andExpect(jsonPath("$.model").value("gpt-4o"))
                .andExpect(jsonPath("$.response_format.type").value("json_schema"))
                .andExpect(jsonPath("$.response_format.json_schema.strict").value(true))
                .andExpect(jsonPath("$.response_format.json_schema.name").value("note_summary"))
                .andExpect(jsonPath("$.messages[0].role").value("system"))
                .andExpect(jsonPath("$.max_completion_tokens").value(4096))
                .andRespond(withSuccess("""
                        {"choices":[{"finish_reason":"stop","message":{"role":"assistant","refusal":null,
                          "content":"{\\"summary\\":\\"Short.\\",\\"keyPoints\\":[\\"a\\"]}"}}]}
                        """, MediaType.APPLICATION_JSON));

        JsonNode result = client.completeJson("sys", "user", "note_summary",
                JsonSchemas.object(Map.of("summary", JsonSchemas.string("s"))), false);

        assertThat(result.path("summary").asText()).isEqualTo("Short.");
        server.verify();
    }

    @Test
    @DisplayName("A refusal is reported as a non-retryable error")
    void refusal() {
        server.expect(requestTo("https://api.openai.test/v1/chat/completions"))
                .andRespond(withSuccess("""
                        {"choices":[{"finish_reason":"stop","message":{"content":null,"refusal":"I can't help with that."}}]}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.completeJson("s", "u", "x", JsonSchemas.object(Map.of()), false))
                .isInstanceOfSatisfying(AiProviderException.class, e -> {
                    assertThat(e.isRetryable()).isFalse();
                    assertThat(e.getMessage()).contains("declined");
                });
    }

    @Test
    @DisplayName("Embeddings request 1536 dimensions and validate the vector length")
    void embeddings() {
        StringBuilder vector = new StringBuilder();
        for (int i = 0; i < 1536; i++) {
            vector.append(i == 0 ? "" : ",").append("0.01");
        }
        server.expect(requestTo("https://api.openai.test/v1/embeddings"))
                .andExpect(jsonPath("$.model").value("text-embedding-3-small"))
                .andExpect(jsonPath("$.dimensions").value(1536))
                .andExpect(jsonPath("$.encoding_format").value("float"))
                .andRespond(withSuccess("{\"data\":[{\"embedding\":[" + vector + "]}]}", MediaType.APPLICATION_JSON));

        float[] result = client.embed("hello", 1536);

        assertThat(result).hasSize(1536);
        assertThat(result[0]).isEqualTo(0.01f);
    }

    @Test
    @DisplayName("A wrong-sized embedding is rejected instead of corrupting the vector column")
    void embeddingDimensionMismatch() {
        server.expect(requestTo("https://api.openai.test/v1/embeddings"))
                .andRespond(withSuccess("{\"data\":[{\"embedding\":[0.1,0.2]}]}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.embed("hello", 1536))
                .isInstanceOf(AiProviderException.class)
                .hasMessageContaining("2 dimensions");
    }

    @Test
    @DisplayName("Transcription uploads multipart audio and reads whisper's duration")
    void transcription(@TempDir Path dir) throws Exception {
        Path audio = Files.write(dir.resolve("stored.webm"), new byte[]{1, 2, 3});
        server.expect(requestTo("https://api.openai.test/v1/audio/transcriptions"))
                .andExpect(header("Content-Type", org.hamcrest.Matchers.startsWith("multipart/form-data")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("verbose_json")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("filename=\"audio.webm\"")))
                .andRespond(withSuccess("{\"text\":\"Hello world.\",\"duration\":12.6}", MediaType.APPLICATION_JSON));

        OpenAiClient.Transcript transcript = client.transcribe(audio, "audio.webm");

        assertThat(transcript.text()).isEqualTo("Hello world.");
        assertThat(transcript.durationSeconds()).isEqualTo(12.6);
    }

    @Test
    @DisplayName("401 maps to a non-retryable error that names the env var and never echoes the key")
    void unauthorized() {
        server.expect(requestTo("https://api.openai.test/v1/embeddings"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"Incorrect API key provided: " + KEY + "\",\"code\":\"invalid_api_key\"}}"));

        assertThatThrownBy(() -> client.embed("hello", 1536))
                .isInstanceOfSatisfying(AiProviderException.class, e -> {
                    assertThat(e.isRetryable()).isFalse();
                    assertThat(e.getStatus()).isEqualTo(401);
                    assertThat(e.getMessage()).contains("OPENAI_API_KEY").doesNotContain(KEY);
                });
    }

    @Test
    @DisplayName("Rate limits are retryable, but an exhausted quota is not")
    void rateLimitVersusQuota() {
        server.expect(requestTo("https://api.openai.test/v1/embeddings"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"Rate limit reached\",\"code\":\"rate_limit_exceeded\"}}"));
        server.expect(requestTo("https://api.openai.test/v1/embeddings"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"You exceeded your current quota\",\"code\":\"insufficient_quota\"}}"));

        assertThatThrownBy(() -> client.embed("a", 1536))
                .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.isRetryable()).isTrue());
        assertThatThrownBy(() -> client.embed("b", 1536))
                .isInstanceOfSatisfying(AiProviderException.class, e -> {
                    assertThat(e.isRetryable()).isFalse();
                    assertThat(e.getMessage()).contains("quota");
                });
    }

    @Test
    @DisplayName("Server errors are retryable")
    void serverError() {
        server.expect(requestTo("https://api.openai.test/v1/chat/completions"))
                .andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        assertThatThrownBy(() -> client.completeJson("s", "u", "x", JsonSchemas.object(Map.of()), false))
                .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.isRetryable()).isTrue());
    }
}
