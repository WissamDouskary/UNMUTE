package com.unmute.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.unmute.ai.config.AiProperties;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.nio.file.Path;
import java.util.function.Supplier;

/**
 * Minimal OpenAI REST client: chat completions with strict JSON-schema output, embeddings, and audio
 * transcription. The key is only ever placed in the Authorization header and never logged.
 */
public class OpenAiClient implements LlmClient {

    static final String PROVIDER = "OpenAI";
    private static final String KEY_VARIABLE = "OPENAI_API_KEY";

    private final RestClient rest;
    private final RestClient transcriptionRest;
    private final AiProperties.OpenAi properties;
    private final ObjectMapper mapper;

    /**
     * @param builder               preconfigured with the request factory (timeouts) for chat and embeddings
     * @param transcriptionBuilder  same, with the longer read timeout uploads need
     */
    public OpenAiClient(RestClient.Builder builder, RestClient.Builder transcriptionBuilder,
                        AiProperties.OpenAi properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
        this.rest = configure(builder);
        this.transcriptionRest = configure(transcriptionBuilder);
    }

    private RestClient configure(RestClient.Builder builder) {
        return builder.clone()
                .baseUrl(properties.baseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.apiKey())
                .defaultStatusHandler(HttpStatusCode::isError,
                        (request, response) -> { throw HttpErrors.fromResponse(PROVIDER, KEY_VARIABLE, response, mapper); })
                .build();
    }

    public AiProperties.OpenAi properties() {
        return properties;
    }

    @Override
    public String describe() {
        return "openai/" + properties.chatModel();
    }

    @Override
    public JsonNode completeJson(String system, String user, String schemaName, ObjectNode schema, boolean lightweight) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", properties.chatModel());
        body.putArray("messages")
                .add(mapper.createObjectNode().put("role", "system").put("content", system))
                .add(mapper.createObjectNode().put("role", "user").put("content", user));
        ObjectNode format = body.putObject("response_format").put("type", "json_schema");
        format.putObject("json_schema").put("name", schemaName).put("strict", true).set("schema", schema);
        body.put("max_completion_tokens", properties.maxCompletionTokens());

        JsonNode response = call(() -> rest.post().uri("/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class));

        JsonNode choice = response.path("choices").path(0);
        JsonNode message = choice.path("message");
        if (message.hasNonNull("refusal") && !message.path("refusal").asText().isBlank()) {
            throw new AiProviderException(PROVIDER, 200, false, "The model declined this request: " + message.path("refusal").asText());
        }
        if ("length".equals(choice.path("finish_reason").asText())) {
            throw new AiProviderException(PROVIDER, 200, false, "The model ran out of output tokens before finishing.");
        }
        return parseJson(message.path("content").asText(""));
    }

    public float[] embed(String input, int dimensions) {
        ObjectNode body = mapper.createObjectNode()
                .put("model", properties.embeddingModel())
                .put("input", input)
                .put("encoding_format", "float");
        // Only the text-embedding-3 family can shorten vectors; older models reject the parameter.
        if (properties.embeddingModel().startsWith("text-embedding-3")) {
            body.put("dimensions", dimensions);
        }

        JsonNode response = call(() -> rest.post().uri("/embeddings")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class));

        JsonNode embedding = response.path("data").path(0).path("embedding");
        if (!embedding.isArray() || embedding.size() != dimensions) {
            throw new AiProviderException(PROVIDER, 200, false, "Embedding model " + properties.embeddingModel()
                    + " returned " + embedding.size() + " dimensions; " + dimensions + " are required.");
        }
        float[] vector = new float[dimensions];
        for (int i = 0; i < dimensions; i++) {
            vector[i] = (float) embedding.get(i).asDouble();
        }
        return vector;
    }

    /** whisper-1 can return the audio duration (verbose_json); the gpt-4o transcribe models only return text. */
    public Transcript transcribe(Path file, String uploadFilename) {
        boolean verbose = properties.transcriptionModel().startsWith("whisper");
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new FileSystemResource(file) {
            @Override
            public String getFilename() {
                return uploadFilename;
            }
        });
        form.add("model", properties.transcriptionModel());
        form.add("response_format", verbose ? "verbose_json" : "json");

        JsonNode response = call(() -> transcriptionRest.post().uri("/audio/transcriptions")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(form)
                .retrieve()
                .body(JsonNode.class));

        Double duration = response.hasNonNull("duration") ? response.get("duration").asDouble() : null;
        return new Transcript(response.path("text").asText(""), duration);
    }

    public record Transcript(String text, Double durationSeconds) {}

    private JsonNode parseJson(String text) {
        try {
            return mapper.readTree(text);
        } catch (Exception e) {
            throw new AiProviderException(PROVIDER, 200, true, "The model returned malformed JSON.", e);
        }
    }

    private JsonNode call(Supplier<JsonNode> request) {
        try {
            JsonNode body = request.get();
            if (body == null) {
                throw new AiProviderException(PROVIDER, 200, true, "OpenAI returned an empty response.");
            }
            return body;
        } catch (AiProviderException e) {
            throw e;
        } catch (ResourceAccessException e) {
            throw new AiProviderException(PROVIDER, 0, true, "Could not reach OpenAI (network error or timeout).", e);
        } catch (RestClientException e) {
            throw new AiProviderException(PROVIDER, 0, true, "Unexpected response from OpenAI.", e);
        }
    }
}
