package com.unmute.ai.provider;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Mock embedding provider that generates deterministic, normalized 384-dimensional
 * vector embeddings using feature hashing and token projection.
 * This simulates a SentenceTransformer model (like all-MiniLM-L6-v2) without API costs.
 */
@Component
@ConditionalOnProperty(name = "unmute.ai.embedding-provider", havingValue = "mock", matchIfMissing = true)
public class MockEmbeddingProvider implements EmbeddingProvider {

    private static final Pattern CLEAN_PATTERN = Pattern.compile("<[^>]*>|[^a-zA-Z0-9\\s]");
    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("\\s+");

    private static final Set<String> STOP_WORDS = new HashSet<>(Arrays.asList(
            "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
            "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
            "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't",
            "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have",
            "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him",
            "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is",
            "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself",
            "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves",
            "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so",
            "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then",
            "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those",
            "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll",
            "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
            "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you",
            "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
    ));

    @Override
    public float[] generateEmbedding(String text) {
        float[] vector = new float[DIMENSION];

        if (text == null || text.isBlank()) {
            // Return baseline unit vector
            vector[0] = 1.0f;
            return vector;
        }

        // 1. Clean HTML and symbols, convert to lowercase
        String cleaned = CLEAN_PATTERN.matcher(text).replaceAll(" ").toLowerCase(Locale.ROOT);
        String[] tokens = WHITESPACE_PATTERN.split(cleaned.trim());

        int tokenCount = 0;
        for (String token : tokens) {
            String word = token.trim();
            if (word.length() < 2 || STOP_WORDS.contains(word)) {
                continue;
            }

            tokenCount++;
            int h1 = word.hashCode();
            int h2 = (h1 * 31 + 17) ^ 0x5bd1e995;
            int h3 = (h2 * 37 + 101) ^ 0x1b873593;
            int h4 = (h3 * 41 + 131) ^ 0x27d4eb2f;

            // Project each token into 4 orthogonal dimensions with sign hashing
            project(vector, h1, 1.0f);
            project(vector, h2, 0.85f);
            project(vector, h3, 0.70f);
            project(vector, h4, 0.55f);
        }

        // If no non-stopword tokens were found, use fallback token hashing
        if (tokenCount == 0) {
            for (char c : text.toCharArray()) {
                int idx = Math.abs(Character.hashCode(c) % DIMENSION);
                vector[idx] += 1.0f;
            }
        }

        // 2. Normalize to unit length (L2 norm)
        float sumSquares = 0.0f;
        for (float v : vector) {
            sumSquares += v * v;
        }

        if (sumSquares > 1e-9) {
            float norm = (float) Math.sqrt(sumSquares);
            for (int i = 0; i < DIMENSION; i++) {
                vector[i] /= norm;
            }
        } else {
            vector[0] = 1.0f;
        }

        return vector;
    }

    private void project(float[] vector, int hash, float weight) {
        // abs after the modulo: Math.abs(Integer.MIN_VALUE) stays negative and would index out of bounds.
        // Same bucket as Math.abs(hash) % DIMENSION for every other hash, so stored vectors stay valid.
        int idx = Math.abs(hash % DIMENSION);
        // Sign bit gives +/- direction for pseudo-random distribution
        float sign = ((hash & 1) == 0) ? 1.0f : -1.0f;
        vector[idx] += sign * weight;
    }
}
