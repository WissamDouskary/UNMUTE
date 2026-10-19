package com.unmute.graph.service;

import com.unmute.graph.dto.GraphEdgeType;
import com.unmute.graph.dto.GraphTopologyDto;
import com.unmute.graph.repository.GraphRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class GraphServiceTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID OTHER = UUID.randomUUID();
    private static final UUID NOTE = UUID.randomUUID();
    private static final UUID ARCHIVED = UUID.randomUUID();
    private static final UUID TASK = UUID.randomUUID();

    private final GraphService service = new GraphService(new FixedRepository());

    @Test
    void anEmptyUserGetsNoNodesOrEdges() {
        GraphTopologyDto graph = service.getTopology(OTHER, false, true, Set.of());
        assertThat(graph.nodes()).isEmpty();
        assertThat(graph.edges()).isEmpty();
    }

    @Test
    void archivedNotesStayOutUntilRequestedAndAMissingNoteDoesNotKeepAnEdge() {
        GraphTopologyDto open = service.getTopology(OWNER, false, true);
        assertThat(open.nodes()).extracting(node -> node.id()).contains("note:" + NOTE).doesNotContain("note:" + ARCHIVED);
        assertThat(open.edges()).extracting(edge -> edge.type()).contains(GraphEdgeType.TASK_OF_NOTE, GraphEdgeType.NOTE_TAGGED);
        assertThat(open.edges()).noneMatch(edge -> edge.source().contains(ARCHIVED.toString()) || edge.target().contains(ARCHIVED.toString()));

        GraphTopologyDto withArchived = service.getTopology(OWNER, true, true);
        assertThat(withArchived.nodes()).extracting(node -> node.id()).contains("note:" + ARCHIVED);
    }

    @Test
    void aRelationshipFilterKeepsNodesAndDropsOtherEdges() {
        GraphTopologyDto tasksOnly = service.getTopology(OWNER, false, true, Set.of(GraphEdgeType.TASK_OF_NOTE));
        assertThat(tasksOnly.nodes()).extracting(node -> node.id()).contains("note:" + NOTE, "task:" + TASK, "tag:hiring");
        assertThat(tasksOnly.edges()).extracting(edge -> edge.type()).containsOnly(GraphEdgeType.TASK_OF_NOTE);
    }

    private static final class FixedRepository extends GraphRepository {
        private FixedRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public List<NoteRow> findNotes(UUID userId, boolean includeArchived) {
            if (!userId.equals(OWNER)) return List.of();
            NoteRow live = new NoteRow(NOTE, "Interview", false, false, Instant.parse("2026-10-18T00:00:00Z"));
            NoteRow archived = new NoteRow(ARCHIVED, "Old", false, true, Instant.parse("2026-10-17T00:00:00Z"));
            return includeArchived ? List.of(live, archived) : List.of(live);
        }

        @Override
        public List<TaskRow> findTasks(UUID userId) {
            if (!userId.equals(OWNER)) return List.of();
            return List.of(new TaskRow(TASK, "Call Alex", false, "MEDIUM", NOTE, Instant.parse("2026-10-18T00:00:00Z")),
                    new TaskRow(UUID.randomUUID(), "Orphan task", false, "LOW", ARCHIVED, Instant.parse("2026-10-18T00:00:00Z")));
        }

        @Override
        public List<SourceRow> findSources(UUID userId) {
            return List.of();
        }

        @Override
        public List<NoteTagRow> findNoteTags(UUID userId, boolean includeArchived) {
            if (!userId.equals(OWNER)) return List.of();
            NoteTagRow live = new NoteTagRow(NOTE, "Hiring");
            NoteTagRow archived = new NoteTagRow(ARCHIVED, "Old");
            return includeArchived ? List.of(live, archived) : List.of(live);
        }

        @Override
        public List<LinkRow> findAcceptedLinks(UUID userId) {
            if (!userId.equals(OWNER)) return List.of();
            return List.of(new LinkRow(UUID.randomUUID(), "note:" + NOTE, "note:" + ARCHIVED, "RELATED_TO"));
        }
    }
}
