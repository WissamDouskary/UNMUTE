package com.unmute.ai.provider;

import com.unmute.ai.client.OpenAiClient;

/** OpenAI embeddings (text-embedding-3-small by default), requested at {@link #DIMENSION} dimensions. */
public class OpenAiEmbeddingProvider implements EmbeddingProvider {

    /** text-embedding-3 accepts 8191 tokens; this stays under it for typical prose. */
    private static final int MAX_INPUT_CHARS = 24_000;

    private final OpenAiClient client;

    public OpenAiEmbeddingProvider(OpenAiClient client) {
        this.client = client;
    }

    @Override
    public float[] generateEmbedding(String text) {
        String input = text == null || text.isBlank() ? "(empty note)" : text;
        if (input.length() > MAX_INPUT_CHARS) {
            input = input.substring(0, MAX_INPUT_CHARS);
        }
        return client.embed(input, DIMENSION);
    }

    @Override
    public String modelId() {
        return "openai:" + client.properties().embeddingModel() + ":" + DIMENSION;
    }

    @Override
    public int maxInputChars() {
        return MAX_INPUT_CHARS;
    }

    /** text-embedding-3 scores unrelated text at roughly 0.0-0.2 and related question/note pairs above 0.3. */
    @Override
    public double relevanceFloor() {
        return 0.25;
    }
}
