package com.unmute.graph.service;

import com.unmute.graph.dto.*;
import com.unmute.graph.repository.GraphRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class GraphService {

    private final GraphRepository graphRepository;

    public GraphService(GraphRepository graphRepository) {
        this.graphRepository = graphRepository;
    }

    @Transactional(readOnly = true)
    public GraphTopologyDto getTopology(UUID userId, boolean includeArchived, boolean includeTags) {
        List<GraphNodeDto> nodes = new ArrayList<>();
        List<GraphEdgeDto> edges = new ArrayList<>();
        Set<String> noteKeys = new HashSet<>();

        for (GraphRepository.NoteRow note : graphRepository.findNotes(userId, includeArchived)) {
            String key = noteKey(note.id());
            noteKeys.add(key);
            String status = note.archived() ? "ARCHIVED" : note.pinned() ? "PINNED" : "ACTIVE";
            nodes.add(new GraphNodeDto(key, note.id(), GraphNodeType.NOTE, note.title(), status, null, note.updatedAt()));
        }

        for (GraphRepository.LinkRow link : graphRepository.findAcceptedLinks(userId)) {
            if (!noteKeys.contains(link.sourceKey()) || !noteKeys.contains(link.targetKey())) continue;
            edges.add(new GraphEdgeDto(link.id().toString(), link.sourceKey(), link.targetKey(), GraphEdgeType.RELATED_TO, "ACCEPTED"));
        }

        for (GraphRepository.TaskRow task : graphRepository.findTasks(userId)) {
            String key = "task:" + task.id();
            String status = task.completed() ? "COMPLETED" : "OPEN";
            nodes.add(new GraphNodeDto(key, task.id(), GraphNodeType.TASK, task.title(), status, task.priority(), task.updatedAt()));
            addNoteEdge(edges, noteKeys, key, task.noteId(), GraphEdgeType.TASK_OF_NOTE);
        }

        for (GraphRepository.SourceRow source : graphRepository.findSources(userId)) {
            String key = "source:" + source.id();
            nodes.add(new GraphNodeDto(key, source.id(), GraphNodeType.SOURCE, source.originalName(), source.status(), null, source.updatedAt()));
            addNoteEdge(edges, noteKeys, key, source.noteId(), GraphEdgeType.SOURCE_OF_NOTE);
        }

        if (includeTags) {
            // Tags are stored per-note with free casing; collapse "AI" and "ai" into one hub node.
            Map<String, String> tagLabels = new LinkedHashMap<>();
            Set<String> tagEdgeIds = new HashSet<>();
            for (GraphRepository.NoteTagRow row : graphRepository.findNoteTags(userId, includeArchived)) {
                String normalized = row.tag().trim().toLowerCase(Locale.ROOT);
                if (normalized.isEmpty()) continue;
                tagLabels.putIfAbsent(normalized, row.tag().trim());
                String noteKey = noteKey(row.noteId());
                String tagKey = "tag:" + normalized;
                String edgeId = GraphEdgeType.NOTE_TAGGED + ":" + noteKey + "->" + tagKey;
                if (tagEdgeIds.add(edgeId)) {
                    edges.add(new GraphEdgeDto(edgeId, noteKey, tagKey, GraphEdgeType.NOTE_TAGGED, "EXPLICIT"));
                }
            }
            tagLabels.forEach((normalized, label) ->
                    nodes.add(new GraphNodeDto("tag:" + normalized, null, GraphNodeType.TAG, label, null, null, null)));
        }

        return new GraphTopologyDto(nodes, edges, Instant.now());
    }

    private static String noteKey(UUID noteId) {
        return "note:" + noteId;
    }

    /** Only link when the parent note is part of the graph (it may be archived and filtered out). */
    private static void addNoteEdge(List<GraphEdgeDto> edges, Set<String> noteKeys, String childKey, UUID noteId, GraphEdgeType type) {
        if (noteId == null) return;
        String noteKey = noteKey(noteId);
        if (!noteKeys.contains(noteKey)) return;
        edges.add(new GraphEdgeDto(type + ":" + childKey + "->" + noteKey, childKey, noteKey, type, "EXPLICIT"));
    }
}
