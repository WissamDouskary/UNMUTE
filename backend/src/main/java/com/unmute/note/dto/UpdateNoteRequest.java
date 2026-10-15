package com.unmute.note.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Set;

public class UpdateNoteRequest {

    @NotBlank(message = "Title is required")
    @Size(max = 255, message = "Title must not exceed 255 characters")
    private String title;

    private String content;

    private String summary;

    private Set<String> tags;

    @com.fasterxml.jackson.annotation.JsonProperty("isPinned")
    @com.fasterxml.jackson.annotation.JsonAlias({"pinned", "isPinned"})
    private Boolean isPinned;

    @com.fasterxml.jackson.annotation.JsonProperty("isArchived")
    @com.fasterxml.jackson.annotation.JsonAlias({"archived", "isArchived"})
    private Boolean isArchived;

    public UpdateNoteRequest() {
    }

    public UpdateNoteRequest(String title, String content, String summary, Set<String> tags, Boolean isPinned, Boolean isArchived) {
        this.title = title;
        this.content = content;
        this.summary = summary;
        this.tags = tags;
        this.isPinned = isPinned;
        this.isArchived = isArchived;
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

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public Set<String> getTags() {
        return tags;
    }

    public void setTags(Set<String> tags) {
        this.tags = tags;
    }

    public Boolean getIsPinned() {
        return isPinned;
    }

    public void setIsPinned(Boolean pinned) {
        isPinned = pinned;
    }

    public Boolean getIsArchived() {
        return isArchived;
    }

    public void setIsArchived(Boolean archived) {
        isArchived = archived;
    }
}
