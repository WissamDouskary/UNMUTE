package com.unmute.note.controller;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.dto.PageResponse;
import com.unmute.common.exception.InvalidTokenException;
import com.unmute.note.dto.CreateNoteRequest;
import com.unmute.note.dto.NoteDto;
import com.unmute.note.dto.UpdateNoteRequest;
import com.unmute.note.service.NoteService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notes")
public class NoteController {

    private final NoteService noteService;

    public NoteController(NoteService noteService) {
        this.noteService = noteService;
    }

    private UserPrincipal requirePrincipal(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }

    @PostMapping
    public ResponseEntity<NoteDto> createNote(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateNoteRequest request
    ) {
        requirePrincipal(principal);
        NoteDto created = noteService.createNote(principal.getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    public ResponseEntity<PageResponse<NoteDto>> listNotes(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "false") boolean archived,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String tag,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        requirePrincipal(principal);
        PageResponse<NoteDto> response = noteService.listNotes(principal.getId(), archived, search, tag, page, size);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<NoteDto> getNote(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        NoteDto note = noteService.getNote(principal.getId(), id);
        return ResponseEntity.ok(note);
    }

    @PutMapping("/{id}")
    public ResponseEntity<NoteDto> updateNote(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateNoteRequest request
    ) {
        requirePrincipal(principal);
        NoteDto updated = noteService.updateNote(principal.getId(), id, request);
        return ResponseEntity.ok(updated);
    }

    @PatchMapping("/{id}/archive")
    public ResponseEntity<NoteDto> toggleArchive(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        NoteDto updated = noteService.toggleArchive(principal.getId(), id);
        return ResponseEntity.ok(updated);
    }

    @PatchMapping("/{id}/pin")
    public ResponseEntity<NoteDto> togglePin(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        NoteDto updated = noteService.togglePin(principal.getId(), id);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteNote(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        noteService.deleteNote(principal.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/tags")
    public ResponseEntity<List<String>> listTags(@AuthenticationPrincipal UserPrincipal principal) {
        requirePrincipal(principal);
        return ResponseEntity.ok(noteService.listTags(principal.getId()));
    }
}
