package com.unmute.note.service;

import com.unmute.ai.service.NoteJobScheduler;
import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.dto.PageResponse;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.note.domain.Note;
import com.unmute.note.dto.CreateNoteRequest;
import com.unmute.note.dto.NoteDto;
import com.unmute.note.dto.UpdateNoteRequest;
import com.unmute.note.repository.NoteRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional
public class NoteService {

    private final NoteRepository noteRepository;
    private final UserRepository userRepository;
    private final NoteJobScheduler noteJobs;

    public NoteService(
            NoteRepository noteRepository,
            UserRepository userRepository,
            NoteJobScheduler noteJobs
    ) {
        this.noteRepository = noteRepository;
        this.userRepository = userRepository;
        this.noteJobs = noteJobs;
    }

    public NoteDto createNote(UUID userId, CreateNoteRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        Note note = new Note(user, request.getTitle().trim(), request.getContent());
        if (request.getTags() != null) {
            note.setTags(request.getTags());
        }
        if (request.getIsPinned() != null) {
            note.setPinned(request.getIsPinned());
        }

        Note saved = noteRepository.save(note);
        noteJobs.contentChanged(saved.getId());
        return NoteDto.fromEntity(saved);
    }

    @Transactional(readOnly = true)
    public PageResponse<NoteDto> listNotes(UUID userId, boolean isArchived, String search, String tag, int page, int size) {
        int sanitizedPage = Math.max(0, page);
        int sanitizedSize = Math.min(Math.max(1, size), 100);

        // Primary sort: pinned notes first, then latest updated
        Sort sort = Sort.by(Sort.Order.desc("isPinned"), Sort.Order.desc("updatedAt"));
        Pageable pageable = PageRequest.of(sanitizedPage, sanitizedSize, sort);

        Page<Note> pageResult;
        if (search != null && !search.trim().isBlank()) {
            pageResult = noteRepository.searchNotes(userId, isArchived, search.trim(), pageable);
        } else if (tag != null && !tag.trim().isBlank()) {
            pageResult = noteRepository.findByUserIdAndIsArchivedAndTag(userId, isArchived, tag.trim(), pageable);
        } else {
            pageResult = noteRepository.findByUserIdAndIsArchived(userId, isArchived, pageable);
        }

        return PageResponse.of(pageResult, NoteDto::fromEntity);
    }

    @Transactional(readOnly = true)
    public NoteDto getNote(UUID userId, UUID noteId) {
        Note note = noteRepository.findByIdAndUserId(noteId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + noteId));
        return NoteDto.fromEntity(note);
    }

    public NoteDto updateNote(UUID userId, UUID noteId, UpdateNoteRequest request) {
        Note note = noteRepository.findByIdAndUserId(noteId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + noteId));
        EmbeddableFields embeddableBefore = EmbeddableFields.of(note);

        if (request.getTitle() != null && !request.getTitle().trim().isBlank()) {
            note.setTitle(request.getTitle().trim());
        }
        if (request.getContent() != null) {
            note.setContent(request.getContent());
        }
        if (request.getSummary() != null) {
            note.setSummary(request.getSummary());
        }
        if (request.getTags() != null) {
            note.setTags(request.getTags());
        }
        if (request.getIsPinned() != null) {
            note.setPinned(request.getIsPinned());
        }
        if (request.getIsArchived() != null) {
            note.setArchived(request.getIsArchived());
        }

        Note updated = noteRepository.save(note);
        if (!EmbeddableFields.of(updated).equals(embeddableBefore)) {
            noteJobs.contentChanged(updated.getId());
        }
        return NoteDto.fromEntity(updated);
    }

    private record EmbeddableFields(String title, String content, String summary, Set<String> tags) {
        static EmbeddableFields of(Note note) {
            return new EmbeddableFields(note.getTitle(), note.getContent(), note.getSummary(), Set.copyOf(note.getTags()));
        }
    }

    public NoteDto toggleArchive(UUID userId, UUID noteId) {
        Note note = noteRepository.findByIdAndUserId(noteId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + noteId));

        note.setArchived(!note.isArchived());
        Note updated = noteRepository.save(note);
        return NoteDto.fromEntity(updated);
    }

    public NoteDto togglePin(UUID userId, UUID noteId) {
        Note note = noteRepository.findByIdAndUserId(noteId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + noteId));

        note.setPinned(!note.isPinned());
        Note updated = noteRepository.save(note);
        return NoteDto.fromEntity(updated);
    }

    public void deleteNote(UUID userId, UUID noteId) {
        Note note = noteRepository.findByIdAndUserId(noteId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found with id: " + noteId));
        // note_embeddings rows are removed by the ON DELETE CASCADE foreign key.
        noteRepository.delete(note);
    }

    @Transactional(readOnly = true)
    public List<String> listTags(UUID userId) {
        return noteRepository.findAllTagsByUserId(userId);
    }
}
