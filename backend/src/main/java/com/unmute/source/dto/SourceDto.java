package com.unmute.source.dto;

import com.unmute.source.domain.Source;

import java.time.Instant;
import java.util.UUID;

public class SourceDto {

    private UUID id;
    private String filename;
    private String originalName;
    private String fileType;
    private long fileSize;
    private String status;
    private String transcript;
    private Integer durationSeconds;
    private String errorMessage;
    private UUID noteId;
    private String noteTitle;
    private Instant createdAt;
    private Instant updatedAt;

    public SourceDto() {
    }

    public SourceDto(UUID id, String filename, String originalName, String fileType, long fileSize,
                     String status, String transcript, Integer durationSeconds, String errorMessage,
                     UUID noteId, String noteTitle, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.filename = filename;
        this.originalName = originalName;
        this.fileType = fileType;
        this.fileSize = fileSize;
        this.status = status;
        this.transcript = transcript;
        this.durationSeconds = durationSeconds;
        this.errorMessage = errorMessage;
        this.noteId = noteId;
        this.noteTitle = noteTitle;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static SourceDto fromEntity(Source source) {
        return new SourceDto(
                source.getId(),
                source.getFilename(),
                source.getOriginalName(),
                source.getFileType(),
                source.getFileSize(),
                source.getStatus().name(),
                source.getTranscript(),
                source.getDurationSeconds(),
                source.getErrorMessage(),
                source.getNote() != null ? source.getNote().getId() : null,
                source.getNote() != null ? source.getNote().getTitle() : null,
                source.getCreatedAt(),
                source.getUpdatedAt()
        );
    }

    public UUID getId() { return id; }
    public String getFilename() { return filename; }
    public String getOriginalName() { return originalName; }
    public String getFileType() { return fileType; }
    public long getFileSize() { return fileSize; }
    public String getStatus() { return status; }
    public String getTranscript() { return transcript; }
    public Integer getDurationSeconds() { return durationSeconds; }
    public String getErrorMessage() { return errorMessage; }
    public UUID getNoteId() { return noteId; }
    public String getNoteTitle() { return noteTitle; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
