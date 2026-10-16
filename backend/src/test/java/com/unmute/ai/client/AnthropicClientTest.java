package com.unmute.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.ai.config.AiProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class AnthropicClientTest {

    private static final String KEY = "sk-ant-test-abcdefghijklmnopqrstuvwxyz";

    private final ObjectMapper mapper = new ObjectMapper();
    private MockRestServiceServer server;
    private AnthropicClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new AnthropicClient(builder, new AiProperties.Anthropic(KEY, "https://api.anthropic.test/v1",
                "claude-sonnet-5-5", "medium", 16000, Duration.ofSeconds(1), Duration.ofSeconds(1)), mapper);
    }

    @Test
    @DisplayName("Messages requests use output_config.format and parse the text block after thinking")
    void structuredOutput() {
        server.expect(requestTo("https://api.anthropic.test/v1/messages"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("x-api-key", KEY))
                .andExpect(header("anthropic-version", "2023-06-01"))
                .andExpect(jsonPath("$.model").value("claude-sonnet-5-5"))
                .andExpect(jsonPath("$.max_tokens").value(16000))
                .andExpect(jsonPath("$.system").value("sys"))
                .andExpect(jsonPath("$.messages[0].role").value("user"))
                .andExpect(jsonPath("$.output_config.format.type").value("json_schema"))
                .andExpect(jsonPath("$.output_config.format.schema.additionalProperties").value(false))
                .andExpect(jsonPath("$.output_config.effort").value("medium"))
                .andExpect(jsonPath("$.tool_choice").doesNotExist())
                .andExpect(jsonPath("$.thinking").doesNotExist())
                .andRespond(withSuccess("""
                        {"stop_reason":"end_turn","content":[
                          {"type":"thinking","thinking":"..."},
                          {"type":"text","text":"{\\"tags\\":[\\"roadmap\\"]}"}]}
                        """, MediaType.APPLICATION_JSON));

        JsonNode result = client.completeJson("sys", "user", "tags",
                JsonSchemas.object(Map.of("tags", JsonSchemas.arrayOf(JsonSchemas.string("t"), "tags"))), false);

        assertThat(result.path("tags").get(0).asText()).isEqualTo("roadmap");
        server.verify();
    }

    @Test
    @DisplayName("Lightweight requests lower the effort")
    void lightweightEffort() {
        server.expect(requestTo("https://api.anthropic.test/v1/messages"))
                .andExpect(jsonPath("$.output_config.effort").value("low"))
                .andRespond(withSuccess("{\"stop_reason\":\"end_turn\",\"content\":[{\"type\":\"text\",\"text\":\"{}\"}]}",
                        MediaType.APPLICATION_JSON));

        client.completeJson("s", "u", "x", JsonSchemas.object(Map.of()), true);
        server.verify();
    }

    @Test
    @DisplayName("Refusals and truncated output are not usable")
    void unusableStopReasons() {
        server.expect(requestTo("https://api.anthropic.test/v1/messages"))
                .andRespond(withSuccess("{\"stop_reason\":\"refusal\",\"content\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.anthropic.test/v1/messages"))
                .andRespond(withSuccess("{\"stop_reason\":\"max_tokens\",\"content\":[{\"type\":\"text\",\"text\":\"{\\\"a\"}]}",
                        MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.completeJson("s", "u", "x", JsonSchemas.object(Map.of()), false))
                .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.getMessage()).contains("declined"));
        assertThatThrownBy(() -> client.completeJson("s", "u", "x", JsonSchemas.object(Map.of()), false))
                .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.getMessage()).contains("output tokens"));
    }

    @Test
    @DisplayName("529 overloaded is retryable")
    void overloaded() {
        server.expect(requestTo("https://api.anthropic.test/v1/messages"))
                .andRespond(withStatus(HttpStatusCode.valueOf(529)).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}"));

        assertThatThrownBy(() -> client.completeJson("s", "u", "x", JsonSchemas.object(Map.of()), false))
                .isInstanceOfSatisfying(AiProviderException.class, e -> {
                    assertThat(e.isRetryable()).isTrue();
                    assertThat(e.getStatus()).isEqualTo(529);
                });
    }

    @Test
    @DisplayName("400 errors are not retried and keep the upstream reason")
    void badRequest() {
        server.expect(requestTo("https://api.anthropic.test/v1/messages"))
                .andRespond(withStatus(HttpStatusCode.valueOf(400)).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"schema too complex\"}}"));

        assertThatThrownBy(() -> client.completeJson("s", "u", "x", JsonSchemas.object(Map.of()), false))
                .isInstanceOfSatisfying(AiProviderException.class, e -> {
                    assertThat(e.isRetryable()).isFalse();
                    assertThat(e.getMessage()).contains("schema too complex");
                });
    }
}
