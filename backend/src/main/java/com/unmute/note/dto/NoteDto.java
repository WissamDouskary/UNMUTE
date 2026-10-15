package com.unmute.note.dto;

import com.unmute.note.domain.Note;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public class NoteDto {

    private UUID id;
    private String title;
    private String content;
    private String summary;
    @com.fasterxml.jackson.annotation.JsonProperty("isPinned")
    private boolean isPinned;
    @com.fasterxml.jackson.annotation.JsonProperty("isArchived")
    private boolean isArchived;
    private Set<String> tags;
    private Instant createdAt;
    private Instant updatedAt;

    public NoteDto() {
    }

    public NoteDto(UUID id, String title, String content, String summary, boolean isPinned, boolean isArchived, Set<String> tags, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.title = title;
        this.content = content;
        this.summary = summary;
        this.isPinned = isPinned;
        this.isArchived = isArchived;
        this.tags = tags;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static NoteDto fromEntity(Note note) {
        return new NoteDto(
                note.getId(),
                note.getTitle(),
                note.getContent(),
                note.getSummary(),
                note.isPinned(),
                note.isArchived(),
                note.getTags(),
                note.getCreatedAt(),
                note.getUpdatedAt()
        );
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getContent() {
        return content;
    }

    public String getSummary() {
        return summary;
    }

    @com.fasterxml.jackson.annotation.JsonProperty("isPinned")
    public boolean isPinned() {
        return isPinned;
    }

    @com.fasterxml.jackson.annotation.JsonProperty("isArchived")
    public boolean isArchived() {
        return isArchived;
    }

    public Set<String> getTags() {
        return tags;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
