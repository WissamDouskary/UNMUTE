package com.unmute.ai.provider;

public interface EmbeddingProvider {

    int DIMENSION = 384;

    /**
     * Generates a 384-dimensional unit vector embedding representing the given text.
     */
    float[] generateEmbedding(String text);

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
