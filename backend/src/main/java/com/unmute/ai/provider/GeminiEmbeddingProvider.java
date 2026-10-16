package com.unmute.ai.provider;

import com.unmute.ai.client.GeminiClient;

/** Gemini embeddings ({@code gemini-embedding-001} by default), requested at {@link #DIMENSION} dimensions. */
public class GeminiEmbeddingProvider implements EmbeddingProvider {

    /** gemini-embedding-001 accepts 2048 tokens; stay well under that for typical prose. */
    private static final int MAX_INPUT_CHARS = 8_000;

    private final GeminiClient client;

    public GeminiEmbeddingProvider(GeminiClient client) {
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
        return "gemini:" + client.properties().embeddingModel() + ":" + DIMENSION;
    }

    @Override
    public int maxInputChars() {
        return MAX_INPUT_CHARS;
    }

    /** Gemini cosine scores run higher than OpenAI's; unrelated pairs still cluster below ~0.3. */
    @Override
    public double relevanceFloor() {
        return 0.35;
    }
}
