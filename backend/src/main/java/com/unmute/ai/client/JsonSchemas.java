package com.unmute.ai.client;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;

/**
 * Builds JSON schemas accepted by both OpenAI strict structured outputs and Anthropic structured outputs:
 * every property is required, {@code additionalProperties} is false, and optional values are expressed as
 * nullable types. Length and numeric range keywords are rejected by those APIs, so callers validate instead.
 */
public final class JsonSchemas {

    private static final JsonNodeFactory JSON = JsonNodeFactory.instance;

    private JsonSchemas() {
    }

    /** Property order is kept (pass a LinkedHashMap or Map.of with one entry), which steers generation order. */
    public static ObjectNode object(Map<String, ObjectNode> properties) {
        ObjectNode schema = JSON.objectNode().put("type", "object");
        ObjectNode props = schema.putObject("properties");
        ArrayNode required = JSON.arrayNode();
        properties.forEach((name, propertySchema) -> {
            props.set(name, propertySchema);
            required.add(name);
        });
        schema.set("required", required);
        schema.put("additionalProperties", false);
        return schema;
    }

    public static ObjectNode string(String description) {
        return JSON.objectNode().put("type", "string").put("description", description);
    }

    public static ObjectNode nullableString(String description) {
        ObjectNode node = JSON.objectNode();
        node.putArray("type").add("string").add("null");
        return node.put("description", description);
    }

    public static ObjectNode integer(String description) {
        return JSON.objectNode().put("type", "integer").put("description", description);
    }

    public static ObjectNode enumOf(String description, String... values) {
        ObjectNode node = JSON.objectNode().put("type", "string").put("description", description);
        ArrayNode options = node.putArray("enum");
        for (String value : values) {
            options.add(value);
        }
        return node;
    }

    public static ObjectNode arrayOf(ObjectNode items, String description) {
        ObjectNode node = JSON.objectNode().put("type", "array").put("description", description);
        node.set("items", items);
        return node;
    }
}
