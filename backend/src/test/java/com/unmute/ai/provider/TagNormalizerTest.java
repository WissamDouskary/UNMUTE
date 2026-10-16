package com.unmute.ai.provider;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class TagNormalizerTest {

    @Test
    @DisplayName("Tags become lowercase kebab-case without hashes or punctuation")
    void normalizes() {
        assertThat(TagNormalizer.normalize("  #Product Roadmap ")).contains("product-roadmap");
        assertThat(TagNormalizer.normalize("Q1_planning/2026")).contains("q1-planning-2026");
        assertThat(TagNormalizer.normalize("C++ & Rust!")).contains("c-rust");
        assertThat(TagNormalizer.normalize("--kafka--")).contains("kafka");
        assertThat(TagNormalizer.normalize("Réunion d'équipe")).contains("réunion-déquipe");
    }

    @Test
    @DisplayName("Too short, empty and over-long tags are handled")
    void bounds() {
        assertThat(TagNormalizer.normalize("a")).isEmpty();
        assertThat(TagNormalizer.normalize("!!!")).isEmpty();
        assertThat(TagNormalizer.normalize(null)).isEqualTo(Optional.empty());
        assertThat(TagNormalizer.normalize("x".repeat(60)).orElseThrow()).hasSize(TagNormalizer.MAX_LENGTH);
    }

    @Test
    @DisplayName("Suggestions drop generic tags and duplicates, keep order and respect the cap")
    void suggestions() {
        List<String> tags = TagNormalizer.normalizeSuggestions(
                List.of("Kafka", "kafka", "note", "Voice Note", "Event Sourcing", "architecture", "microservices"), 3);
        assertThat(tags).containsExactly("kafka", "event-sourcing", "architecture");
    }
}
