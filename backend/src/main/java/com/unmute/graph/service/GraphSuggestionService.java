package com.unmute.graph.service;

import com.unmute.common.exception.ConflictException;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.graph.dto.GraphSuggestionDto;
import com.unmute.graph.repository.GraphRepository;
import com.unmute.graph.repository.GraphSuggestionRepository;
import com.unmute.graph.suggest.SharedTagSuggester;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class GraphSuggestionService {

    private static final int LIMIT = 25;

    private final GraphSuggestionRepository repository;

    public GraphSuggestionService(GraphSuggestionRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<GraphSuggestionDto> listPending(UUID userId) {
        return repository.listPending(userId);
    }

    @Transactional
    public List<GraphSuggestionDto> generate(UUID userId) {
        Map<UUID, Set<String>> tags = new HashMap<>();
        Map<UUID, String> titles = new HashMap<>();
        for (GraphSuggestionRepository.NoteBrief note : repository.findNotes(userId)) {
            titles.put(note.id(), note.title());
            tags.put(note.id(), new HashSet<>());
        }
        for (GraphRepository.NoteTagRow row : repository.findTags(userId)) {
            tags.computeIfAbsent(row.noteId(), ignored -> new HashSet<>()).add(row.tag());
        }

        List<SharedTagSuggester.NoteTags> notes = new ArrayList<>();
        tags.forEach((id, noteTags) -> notes.add(new SharedTagSuggester.NoteTags(
                "note:" + id,
                titles.getOrDefault(id, "Untitled"),
                noteTags
        )));

        Set<String> blocked = new HashSet<>(repository.blockedPairs(userId));
        for (SharedTagSuggester.Candidate candidate : SharedTagSuggester.propose(notes, blocked, LIMIT)) {
            requireOwned(userId, candidate.sourceKey());
            requireOwned(userId, candidate.targetKey());
            repository.insertPending(userId, candidate.sourceKey(), candidate.targetKey(), candidate.explanation(), candidate.evidence());
        }
        return repository.listPending(userId);
    }

    @Transactional
    public GraphSuggestionDto accept(UUID userId, UUID id) {
        GraphSuggestionDto suggestion = require(userId, id);
        if ("ACCEPTED".equals(suggestion.status())) {
            return suggestion;
        }
        if (!"PENDING".equals(suggestion.status())) {
            throw new ConflictException("This suggestion was already reviewed.");
        }
        requireOwned(userId, suggestion.sourceKey());
        requireOwned(userId, suggestion.targetKey());
        int updated = repository.mark(userId, id, "ACCEPTED");
        if (updated == 0) {
            return require(userId, id);
        }
        repository.insertLink(userId, suggestion.sourceKey(), suggestion.targetKey(), suggestion.relationType());
        return require(userId, id);
    }

    @Transactional
    public GraphSuggestionDto reject(UUID userId, UUID id) {
        GraphSuggestionDto suggestion = require(userId, id);
        if ("REJECTED".equals(suggestion.status())) {
            return suggestion;
        }
        if (!"PENDING".equals(suggestion.status())) {
            throw new ConflictException("This suggestion was already reviewed.");
        }
        int updated = repository.mark(userId, id, "REJECTED");
        if (updated == 0) {
            return require(userId, id);
        }
        return require(userId, id);
    }

    private GraphSuggestionDto require(UUID userId, UUID id) {
        return repository.find(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Suggestion not found"));
    }

    private void requireOwned(UUID userId, String key) {
        if (key == null || !key.startsWith("note:")) {
            throw new ConflictException("Suggestions can only connect your notes.");
        }
        UUID noteId;
        try {
            noteId = UUID.fromString(key.substring(5));
        } catch (IllegalArgumentException ex) {
            throw new ConflictException("Suggestions can only connect your notes.");
        }
        if (!repository.noteOwned(userId, noteId)) {
            throw new ResourceNotFoundException("Note not found");
        }
    }
}
