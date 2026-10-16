package com.unmute.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.unmute.ai.config.AiProperties;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Anthropic Messages API client using structured outputs ({@code output_config.format}), so the reply is
 * guaranteed to match the schema. The key travels only in the {@code x-api-key} header and is never logged.
 */
public class AnthropicClient implements LlmClient {

    static final String PROVIDER = "Anthropic";
    private static final String KEY_VARIABLE = "ANTHROPIC_API_KEY";
    private static final String API_VERSION = "2023-06-01";

    private final RestClient rest;
    private final AiProperties.Anthropic properties;
    private final ObjectMapper mapper;

    public AnthropicClient(RestClient.Builder builder, AiProperties.Anthropic properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
        this.rest = builder.clone()
                .baseUrl(properties.baseUrl())
                .defaultHeader("x-api-key", properties.apiKey())
                .defaultHeader("anthropic-version", API_VERSION)
                .defaultStatusHandler(HttpStatusCode::isError,
                        (request, response) -> { throw HttpErrors.fromResponse(PROVIDER, KEY_VARIABLE, response, mapper); })
                .build();
    }

    @Override
    public String describe() {
        return "anthropic/" + properties.model();
    }

    @Override
    public JsonNode completeJson(String system, String user, String schemaName, ObjectNode schema, boolean lightweight) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", properties.model());
        body.put("max_tokens", properties.maxTokens());
        body.put("system", system);
        body.putArray("messages").add(mapper.createObjectNode().put("role", "user").put("content", user));

        ObjectNode outputConfig = body.putObject("output_config");
        outputConfig.putObject("format").put("type", "json_schema").set("schema", schema);
        String effort = lightweight && hasEffort() ? "low" : properties.effort();
        if (effort != null && !effort.isBlank()) {
            outputConfig.put("effort", effort.trim().toLowerCase());
        }

        JsonNode response;
        try {
            response = rest.post().uri("/messages")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (AiProviderException e) {
            throw e;
        } catch (ResourceAccessException e) {
            throw new AiProviderException(PROVIDER, 0, true, "Could not reach Anthropic (network error or timeout).", e);
        } catch (RestClientException e) {
            throw new AiProviderException(PROVIDER, 0, true, "Unexpected response from Anthropic.", e);
        }
        if (response == null) {
            throw new AiProviderException(PROVIDER, 200, true, "Anthropic returned an empty response.");
        }

        String stopReason = response.path("stop_reason").asText("");
        if ("refusal".equals(stopReason)) {
            throw new AiProviderException(PROVIDER, 200, false, "Claude declined this request.");
        }
        if ("max_tokens".equals(stopReason)) {
            throw new AiProviderException(PROVIDER, 200, false, "Claude ran out of output tokens before finishing.");
        }

        // Thinking blocks may precede the answer; the structured output is the text block.
        for (JsonNode block : response.path("content")) {
            if ("text".equals(block.path("type").asText())) {
                try {
                    return mapper.readTree(block.path("text").asText(""));
                } catch (Exception e) {
                    throw new AiProviderException(PROVIDER, 200, true, "Claude returned malformed JSON.", e);
                }
            }
        }
        throw new AiProviderException(PROVIDER, 200, true, "Claude returned no text content.");
    }

    private boolean hasEffort() {
        return properties.effort() != null && !properties.effort().isBlank();
    }
}
