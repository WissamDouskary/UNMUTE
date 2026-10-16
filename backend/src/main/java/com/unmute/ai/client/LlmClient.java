package com.unmute.ai.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/** A chat model that answers with JSON conforming to a schema. */
public interface LlmClient {

    /** For logs and diagnostics, e.g. "anthropic/claude-sonnet-5-5". */
    String describe();

    /**
     * @param lightweight hints that the task is simple (e.g. tagging), so providers may spend less reasoning
     * @throws AiProviderException when the call fails, is refused, or returns unusable output
     */
    JsonNode completeJson(String system, String user, String schemaName, ObjectNode schema, boolean lightweight);
}
