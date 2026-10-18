package com.unmute.graph.suggest;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class SharedTagSuggesterTest {

    private static SharedTagSuggester.NoteTags note(String id, String... tags) {
        return new SharedTagSuggester.NoteTags("note:" + id, id, Set.of(tags));
    }

    @Test
    void pairsNotesThatShareATag() {
        List<SharedTagSuggester.Candidate> found = SharedTagSuggester.propose(
                List.of(note("a", "roadmap"), note("b", "roadmap"), note("c", "other")),
                Set.of(),
                10
        );
        assertThat(found).hasSize(1);
        assertThat(found.getFirst().sourceKey()).isEqualTo("note:a");
        assertThat(found.getFirst().targetKey()).isEqualTo("note:b");
        assertThat(found.getFirst().evidence()).isEqualTo("roadmap");
        assertThat(found.getFirst().explanation()).contains("#roadmap");
    }

    @Test
    void skipsReviewedPairsAndNotesWithNothingInCommon() {
        Set<String> blocked = Set.of(SharedTagSuggester.pairKey("note:a", "note:b"));
        List<SharedTagSuggester.Candidate> found = SharedTagSuggester.propose(
                List.of(note("a", "roadmap"), note("b", "roadmap"), note("c", "solo")),
                blocked,
                10
        );
        assertThat(found).isEmpty();
    }

    @Test
    void doesNotPairANoteWithItselfWhenATagIsRepeated() {
        List<SharedTagSuggester.Candidate> found = SharedTagSuggester.propose(
                List.of(note("a", "roadmap")),
                Set.of(),
                10
        );
        assertThat(found).isEmpty();
    }

    @Test
    void fiveHundredNotesStayBounded() {
        List<SharedTagSuggester.NoteTags> notes = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            notes.add(note("n" + i, "shared", "bucket-" + (i % 20)));
        }
        long started = System.nanoTime();
        List<SharedTagSuggester.Candidate> found = SharedTagSuggester.propose(notes, new HashSet<>(), 25);
        long millis = (System.nanoTime() - started) / 1_000_000;
        assertThat(found).hasSize(25);
        assertThat(millis).isLessThan(1500);
    }
}
