package com.unmute.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.client.ClientHttpResponse;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Turns provider error responses into {@link AiProviderException}s with actionable, key-free messages. */
final class HttpErrors {

    private static final int MAX_BODY = 4_096;

    private HttpErrors() {
    }

    static AiProviderException fromResponse(String provider, String keyVariable, ClientHttpResponse response,
                                            ObjectMapper mapper) throws IOException {
        int status = response.getStatusCode().value();
        JsonNode error = readError(response, mapper);
        String upstreamMessage = error.path("message").asText("");
        String code = error.path("code").asText(error.path("type").asText(""));

        // OpenAI reports an exhausted balance as 429, but waiting will not fix it.
        if ("insufficient_quota".equals(code)) {
            return new AiProviderException(provider, status, false,
                    provider + " account has no remaining quota. Check billing for the key in " + keyVariable + ".");
        }

        boolean retryable = AiProviderException.isRetryableStatus(status) || status == 529;
        String message = switch (status) {
            case 401 -> provider + " rejected the API key. Check " + keyVariable + ".";
            case 403 -> provider + " denied access for this API key or model.";
            case 404 -> provider + " does not recognise the requested model or endpoint: " + upstreamMessage;
            case 413 -> provider + " rejected the request because it is too large.";
            case 429 -> provider + " rate limit reached; the request will be retried.";
            case 529 -> provider + " is temporarily overloaded; the request will be retried.";
            default -> status >= 500
                    ? provider + " is temporarily unavailable (HTTP " + status + ")."
                    : provider + " rejected the request (HTTP " + status + "): " + upstreamMessage;
        };
        return new AiProviderException(provider, status, retryable, message.strip());
    }

    private static JsonNode readError(ClientHttpResponse response, ObjectMapper mapper) {
        try (InputStream body = response.getBody()) {
            byte[] bytes = body.readNBytes(MAX_BODY);
            JsonNode root = mapper.readTree(new String(bytes, StandardCharsets.UTF_8));
            JsonNode error = root.path("error");
            return error.isObject() ? error : root;
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }
}
