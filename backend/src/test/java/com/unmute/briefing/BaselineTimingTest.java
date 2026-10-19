package com.unmute.briefing;

import com.unmute.graph.dto.GraphTopologyDto;
import com.unmute.graph.repository.GraphRepository;
import com.unmute.graph.service.GraphService;
import com.unmute.task.domain.TaskPriority;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** In-process baselines. These are not HTTP or PostgreSQL timings. */
class BaselineTimingTest {

    @Test
    void ranksTwoThousandOpenTasks() {
        List<BriefingRank.TaskRow> tasks = new ArrayList<>();
        TaskPriority[] priorities = TaskPriority.values();
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        for (int index = 0; index < 2000; index++) {
            tasks.add(new BriefingRank.TaskRow(
                    UUID.randomUUID(),
                    "Task " + index,
                    priorities[index % priorities.length],
                    index % 3 == 0 ? now.plusSeconds(index) : null,
                    now.minusSeconds(index),
                    UUID.randomUUID(),
                    "Note",
                    false));
        }
        long started = System.nanoTime();
        List<BriefingRank.TaskRow> ranked = BriefingRank.rankOpenTasks(tasks);
        long elapsedMs = (System.nanoTime() - started) / 1_000_000;
        System.out.println("BRIEFING_RANK_2000_MS " + elapsedMs);
        assertThat(ranked).hasSize(2000);
        assertThat(elapsedMs).isLessThan(1000);
    }

    @Test
    void assemblesATopologyOfOneThousandNotes() {
        GraphService service = new GraphService(new ThousandNotes());
        long started = System.nanoTime();
        GraphTopologyDto graph = service.getTopology(ThousandNotes.OWNER, false, true, Set.of());
        long elapsedMs = (System.nanoTime() - started) / 1_000_000;
        System.out.println("GRAPH_SERVICE_1000_MS " + elapsedMs + " nodes=" + graph.nodes().size() + " edges=" + graph.edges().size());
        assertThat(graph.nodes()).hasSize(2000);
        assertThat(elapsedMs).isLessThan(2000);
    }

    private static final class ThousandNotes extends GraphRepository {
        private static final UUID OWNER = UUID.randomUUID();
        private final List<NoteRow> notes = new ArrayList<>();
        private final List<TaskRow> tasks = new ArrayList<>();

        private ThousandNotes() {
            super(new JdbcTemplate());
            Instant now = Instant.parse("2026-10-19T00:00:00Z");
            for (int index = 0; index < 1000; index++) {
                UUID noteId = UUID.randomUUID();
                notes.add(new NoteRow(noteId, "Note " + index, false, false, now));
                tasks.add(new TaskRow(UUID.randomUUID(), "Task " + index, false, "MEDIUM", noteId, now));
            }
        }

        @Override
        public List<NoteRow> findNotes(UUID userId, boolean includeArchived) {
            return userId.equals(OWNER) ? notes : List.of();
        }

        @Override
        public List<TaskRow> findTasks(UUID userId) {
            return userId.equals(OWNER) ? tasks : List.of();
        }

        @Override
        public List<SourceRow> findSources(UUID userId) {
            return List.of();
        }

        @Override
        public List<NoteTagRow> findNoteTags(UUID userId, boolean includeArchived) {
            return List.of();
        }

        @Override
        public List<LinkRow> findAcceptedLinks(UUID userId) {
            return List.of();
        }
    }
}
