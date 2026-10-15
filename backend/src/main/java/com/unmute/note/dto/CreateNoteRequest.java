package com.unmute.note.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.HashSet;
import java.util.Set;

public class CreateNoteRequest {

    @NotBlank(message = "Title is required")
    @Size(max = 255, message = "Title must not exceed 255 characters")
    private String title;

    private String content;

    private Set<String> tags = new HashSet<>();

    @com.fasterxml.jackson.annotation.JsonProperty("isPinned")
    @com.fasterxml.jackson.annotation.JsonAlias({"pinned", "isPinned"})
    private Boolean isPinned = false;

    public CreateNoteRequest() {
    }

    public CreateNoteRequest(String title, String content, Set<String> tags, Boolean isPinned) {
        this.title = title;
        this.content = content;
        this.tags = tags != null ? tags : new HashSet<>();
        this.isPinned = isPinned != null ? isPinned : false;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public Set<String> getTags() {
        return tags;
    }

    public void setTags(Set<String> tags) {
        this.tags = tags != null ? tags : new HashSet<>();
    }

    public Boolean getIsPinned() {
        return isPinned;
    }

    public void setIsPinned(Boolean pinned) {
        isPinned = pinned != null ? pinned : false;
    }
}
