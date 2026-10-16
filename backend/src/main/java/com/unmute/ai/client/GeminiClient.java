package com.unmute.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.unmute.ai.config.AiProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.function.Supplier;

/**
 * Gemini via the OpenAI-compatible chat/embeddings endpoints, plus native {@code generateContent} for
 * audio (the compatibility layer does not implement {@code /audio/transcriptions}). The key is only ever
 * placed in request headers and never logged.
 */
public class GeminiClient implements LlmClient {

    static final String PROVIDER = "Gemini";
    static final String KEY_VARIABLE = "GEMINI_API_KEY";
    private static final String TRANSCRIBE_PROMPT = """
            Transcribe this audio verbatim. Return only the spoken words, with light punctuation.
            Do not add a title, speaker labels, timestamps, or any commentary.
            """;

    private final RestClient rest;
    private final RestClient nativeJson;
    private final RestClient nativeRest;
    private final AiProperties.Gemini properties;
    private final ObjectMapper mapper;

    public GeminiClient(RestClient.Builder builder, RestClient.Builder transcriptionBuilder,
                        AiProperties.Gemini properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
        this.rest = builder.clone()
                .baseUrl(properties.baseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.apiKey())
                .defaultStatusHandler(HttpStatusCode::isError,
                        (request, response) -> { throw HttpErrors.fromResponse(PROVIDER, KEY_VARIABLE, response, mapper); })
                .build();
        this.nativeJson = nativeClient(builder);
        this.nativeRest = nativeClient(transcriptionBuilder);
    }

    private RestClient nativeClient(RestClient.Builder builder) {
        return builder.clone()
                .baseUrl(properties.nativeBaseUrl())
                .defaultHeader("x-goog-api-key", properties.apiKey())
                .defaultStatusHandler(HttpStatusCode::isError,
                        (request, response) -> { throw HttpErrors.fromResponse(PROVIDER, KEY_VARIABLE, response, mapper); })
                .build();
    }

    public AiProperties.Gemini properties() {
        return properties;
    }

    @Override
    public String describe() {
        return "gemini/" + properties.chatModel();
    }

    @Override
    public JsonNode completeJson(String system, String user, String schemaName, ObjectNode schema, boolean lightweight) {
        ObjectNode body = mapper.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", system);
        body.putArray("contents").addObject().put("role", "user").putArray("parts").addObject().put("text", user);
        ObjectNode config = body.putObject("generationConfig");
        config.put("temperature", lightweight ? 0.1 : 0.4);
        config.put("maxOutputTokens", properties.maxCompletionTokens());
        config.put("responseMimeType", "application/json");
        config.set("responseSchema", toGeminiSchema(schema));

        JsonNode response = call("Gemini", () -> nativeJson.post()
                .uri("/models/{model}:generateContent", properties.chatModel())
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class));

        JsonNode candidate = response.path("candidates").path(0);
        String finish = candidate.path("finishReason").asText("");
        if ("SAFETY".equals(finish) || "RECITATION".equals(finish) || "PROHIBITED_CONTENT".equals(finish)) {
            throw new AiProviderException(PROVIDER, 200, false, "Gemini declined this request (" + finish + ").");
        }
        if ("MAX_TOKENS".equals(finish)) {
            throw new AiProviderException(PROVIDER, 200, false, "The model ran out of output tokens before finishing.");
        }
        return parseJson(extractText(candidate));
    }

    /**
     * Gemini {@code responseSchema} is a JSON-Schema subset: uppercase types, {@code nullable} instead of
     * type unions, and no {@code additionalProperties}.
     */
    static ObjectNode toGeminiSchema(JsonNode schema, ObjectMapper mapper) {
        ObjectNode out = mapper.createObjectNode();
        JsonNode typeNode = schema.path("type");
        if (typeNode.isArray()) {
            boolean nullable = false;
            String primary = "STRING";
            for (JsonNode t : typeNode) {
                if ("null".equals(t.asText())) {
                    nullable = true;
                } else {
                    primary = geminiType(t.asText());
                }
            }
            out.put("type", primary);
            if (nullable) {
                out.put("nullable", true);
            }
        } else if (typeNode.isTextual()) {
            out.put("type", geminiType(typeNode.asText()));
        }
        if (schema.hasNonNull("description")) {
            out.put("description", schema.path("description").asText());
        }
        if (schema.has("enum")) {
            out.set("enum", schema.get("enum").deepCopy());
        }
        if (schema.has("properties") && schema.get("properties").isObject()) {
            ObjectNode props = out.putObject("properties");
            schema.get("properties").fields().forEachRemaining(entry ->
                    props.set(entry.getKey(), toGeminiSchema(entry.getValue(), mapper)));
        }
        if (schema.has("required")) {
            out.set("required", schema.get("required").deepCopy());
        }
        if (schema.has("items")) {
            out.set("items", toGeminiSchema(schema.get("items"), mapper));
        }
        return out;
    }

    private ObjectNode toGeminiSchema(JsonNode schema) {
        return toGeminiSchema(schema, mapper);
    }

    private static String geminiType(String type) {
        return switch (type.toLowerCase()) {
            case "object" -> "OBJECT";
            case "array" -> "ARRAY";
            case "integer" -> "INTEGER";
            case "number" -> "NUMBER";
            case "boolean" -> "BOOLEAN";
            default -> "STRING";
        };
    }

    private static String extractText(JsonNode candidate) {
        StringBuilder text = new StringBuilder();
        for (JsonNode part : candidate.path("content").path("parts")) {
            text.append(part.path("text").asText(""));
        }
        return text.toString();
    }

    public float[] embed(String input, int dimensions) {
        ObjectNode body = mapper.createObjectNode()
                .put("model", properties.embeddingModel())
                .put("input", input)
                .put("encoding_format", "float")
                .put("dimensions", dimensions);

        JsonNode response = call("Gemini", () -> rest.post().uri("/embeddings")
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

    public Transcript transcribe(Path file, String mimeType) {
        String encoded;
        try {
            encoded = Base64.getEncoder().encodeToString(Files.readAllBytes(file));
        } catch (IOException e) {
            throw new AiProviderException(PROVIDER, 0, false, "The uploaded audio file could not be read.", e);
        }

        ObjectNode body = mapper.createObjectNode();
        ObjectNode contents = body.putArray("contents").addObject().put("role", "user");
        ArrayNode parts = contents.putArray("parts");
        parts.addObject().put("text", TRANSCRIBE_PROMPT);
        parts.addObject().putObject("inlineData").put("mimeType", mimeType).put("data", encoded);
        body.putObject("generationConfig").put("temperature", 0).put("maxOutputTokens", 8192);

        JsonNode response = call("Gemini", () -> nativeRest.post()
                .uri("/models/{model}:generateContent", properties.transcriptionModel())
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class));

        if (response.path("promptFeedback").hasNonNull("blockReason")) {
            throw new AiProviderException(PROVIDER, 200, false,
                    "Gemini blocked this audio: " + response.path("promptFeedback").path("blockReason").asText());
        }
        JsonNode candidate = response.path("candidates").path(0);
        String finish = candidate.path("finishReason").asText("");
        if ("SAFETY".equals(finish) || "RECITATION".equals(finish) || "PROHIBITED_CONTENT".equals(finish)) {
            throw new AiProviderException(PROVIDER, 200, false, "Gemini declined to transcribe this audio (" + finish + ").");
        }
        if ("MAX_TOKENS".equals(finish)) {
            throw new AiProviderException(PROVIDER, 200, false, "The model ran out of output tokens before finishing.");
        }
        String transcript = extractText(candidate).strip();
        if (transcript.isBlank()) {
            throw new AiProviderException(PROVIDER, 200, true, "Gemini returned an empty transcript.");
        }
        return new Transcript(transcript, null);
    }

    public record Transcript(String text, Double durationSeconds) {}

    private JsonNode parseJson(String text) {
        String payload = unwrapMarkdownFence(text);
        try {
            return mapper.readTree(payload);
        } catch (Exception e) {
            throw new AiProviderException(PROVIDER, 200, true, "The model returned malformed JSON.", e);
        }
    }

    /** Some Gemini responses wrap JSON in a markdown fence even when json_schema is requested. */
    static String unwrapMarkdownFence(String text) {
        if (text == null) {
            return "";
        }
        String trimmed = text.strip();
        if (!trimmed.startsWith("```")) {
            return trimmed;
        }
        int start = trimmed.indexOf('\n');
        int end = trimmed.lastIndexOf("```");
        if (start < 0 || end <= start) {
            return trimmed;
        }
        return trimmed.substring(start + 1, end).strip();
    }

    private JsonNode call(String label, Supplier<JsonNode> request) {
        try {
            JsonNode body = request.get();
            if (body == null) {
                throw new AiProviderException(PROVIDER, 200, true, label + " returned an empty response.");
            }
            return body;
        } catch (AiProviderException e) {
            throw e;
        } catch (ResourceAccessException e) {
            throw new AiProviderException(PROVIDER, 0, true, "Could not reach Gemini (network error or timeout).", e);
        } catch (RestClientException e) {
            throw new AiProviderException(PROVIDER, 0, true, "Unexpected response from Gemini.", e);
        }
    }
}
