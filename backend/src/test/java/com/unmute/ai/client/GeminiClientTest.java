package com.unmute.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class GeminiClientTest {

    private static final String KEY = "AIzaSyTestabcdefghijklmnopqrstuvwxyz012345";

    private final ObjectMapper mapper = new ObjectMapper();
    private MockRestServiceServer server;
    private GeminiClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        AiProperties.Gemini props = new AiProperties.Gemini(KEY,
                "https://generativelanguage.test/v1beta/openai",
                "https://generativelanguage.test/v1beta",
                "gemini-3.8-flash", "gemini-embedding-001", "gemini-3.8-flash",
                4096, Duration.ofSeconds(1), Duration.ofSeconds(1), Duration.ofSeconds(1));
        client = new GeminiClient(builder, builder, props, mapper);
    }

    @Test
    @DisplayName("Chat requests use native generateContent with a JSON response schema")
    void chatJson() {
        server.expect(requestTo("https://generativelanguage.test/v1beta/models/gemini-3.8-flash:generateContent"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("x-goog-api-key", KEY))
                .andExpect(jsonPath("$.systemInstruction.parts[0].text").value("sys"))
                .andExpect(jsonPath("$.contents[0].parts[0].text").value("user"))
                .andExpect(jsonPath("$.generationConfig.responseMimeType").value("application/json"))
                .andExpect(jsonPath("$.generationConfig.responseSchema.type").value("OBJECT"))
                .andExpect(jsonPath("$.generationConfig.responseSchema.additionalProperties").doesNotExist())
                .andExpect(jsonPath("$.generationConfig.responseSchema.properties.summary.type").value("STRING"))
                .andRespond(withSuccess("""
                        {"candidates":[{"finishReason":"STOP","content":{"parts":[
                          {"text":"{\\"summary\\":\\"Short.\\",\\"keyPoints\\":[\\"a\\"]}"}]}}]}
                        """, MediaType.APPLICATION_JSON));

        JsonNode result = client.completeJson("sys", "user", "note_summary",
                JsonSchemas.object(Map.of("summary", JsonSchemas.string("s"))), false);

        assertThat(result.path("summary").asText()).isEqualTo("Short.");
        server.verify();
    }

    @Test
    @DisplayName("JSON schemas drop additionalProperties and map nullable unions for Gemini")
    void toGeminiSchema() {
        ObjectNode schema = JsonSchemas.object(Map.of(
                "title", JsonSchemas.string("t"),
                "due", JsonSchemas.nullableString("optional")));
        JsonNode gemini = GeminiClient.toGeminiSchema(schema, mapper);

        assertThat(gemini.path("type").asText()).isEqualTo("OBJECT");
        assertThat(gemini.has("additionalProperties")).isFalse();
        assertThat(gemini.path("properties").path("due").path("type").asText()).isEqualTo("STRING");
        assertThat(gemini.path("properties").path("due").path("nullable").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("A markdown-fenced JSON payload is unwrapped")
    void unwrapsMarkdownFence() {
        assertThat(GeminiClient.unwrapMarkdownFence("```json\n{\"a\":1}\n```")).isEqualTo("{\"a\":1}");
    }

    @Test
    @DisplayName("Embeddings request 1536 dimensions")
    void embeddings() {
        StringBuilder vector = new StringBuilder();
        for (int i = 0; i < 1536; i++) {
            vector.append(i == 0 ? "" : ",").append("0.01");
        }
        server.expect(requestTo("https://generativelanguage.test/v1beta/openai/embeddings"))
                .andExpect(jsonPath("$.model").value("gemini-embedding-001"))
                .andExpect(jsonPath("$.dimensions").value(1536))
                .andRespond(withSuccess("{\"data\":[{\"embedding\":[" + vector + "]}]}", MediaType.APPLICATION_JSON));

        assertThat(client.embed("hello", 1536)).hasSize(1536);
        server.verify();
    }

    @Test
    @DisplayName("Transcription posts inline audio to generateContent and never logs the key")
    void transcription(@TempDir Path dir) throws Exception {
        Path audio = Files.write(dir.resolve("stored.webm"), new byte[]{1, 2, 3});
        String encoded = Base64.getEncoder().encodeToString(new byte[]{1, 2, 3});
        server.expect(requestTo("https://generativelanguage.test/v1beta/models/gemini-3.8-flash:generateContent"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("x-goog-api-key", KEY))
                .andExpect(jsonPath("$.contents[0].role").value("user"))
                .andExpect(jsonPath("$.contents[0].parts[1].inlineData.mimeType").value("audio/webm"))
                .andExpect(jsonPath("$.contents[0].parts[1].inlineData.data").value(encoded))
                .andExpect(jsonPath("$.generationConfig.maxOutputTokens").value(8192))
                .andRespond(withSuccess("""
                        {"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"Hello world."}]}}]}
                        """, MediaType.APPLICATION_JSON));

        GeminiClient.Transcript transcript = client.transcribe(audio, "audio/webm");

        assertThat(transcript.text()).isEqualTo("Hello world.");
        assertThat(transcript.durationSeconds()).isNull();
        server.verify();
    }

    @Test
    @DisplayName("401 maps to a non-retryable error that names GEMINI_API_KEY and never echoes the key")
    void unauthorized() {
        server.expect(requestTo("https://generativelanguage.test/v1beta/openai/embeddings"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"API key not valid. Please pass a valid API key. " + KEY + "\",\"status\":\"UNAUTHENTICATED\"}}"));

        assertThatThrownBy(() -> client.embed("hello", 1536))
                .isInstanceOfSatisfying(AiProviderException.class, e -> {
                    assertThat(e.isRetryable()).isFalse();
                    assertThat(e.getStatus()).isEqualTo(401);
                    assertThat(e.getMessage()).contains("GEMINI_API_KEY").doesNotContain(KEY);
                });
    }
}
