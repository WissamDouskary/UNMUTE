package com.unmute.ai.provider;

public interface EmbeddingProvider {

    /** Must match the {@code vector(N)} column in note_embeddings (V8). */
    int DIMENSION = 1536;

    /**
     * Generates a {@link #DIMENSION}-dimensional embedding representing the given text.
     */
    float[] generateEmbedding(String text);

    /**
     * Identifies the vector space. Stored with every embedding so vectors from different models are never
     * compared, and a model change re-embeds the corpus.
     */
    String modelId();

    /** Longest input sent to the model; longer note text is cut. */
    default int maxInputChars() {
        return 16_000;
    }

    /**
     * Cosine similarity below which a search hit is treated as unrelated when grounding answers. Score
     * distributions differ per model, so each provider supplies its own calibrated floor.
     */
    double relevanceFloor();

    /**
     * Formats the float array into a PostgreSQL pgvector literal format: '[0.123, -0.456, ...]'
     */
    default String toVectorString(float[] vector) {
        if (vector == null || vector.length == 0) {
            return "[]";
        }
        StringBuilder sb = new StringBuilder(vector.length * 10);
        sb.append('[');
        for (int i = 0; i < vector.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(String.format(java.util.Locale.US, "%.6f", vector[i]));
        }
        sb.append(']');
        return sb.toString();
    }
}
