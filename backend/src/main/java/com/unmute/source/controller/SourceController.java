package com.unmute.source.controller;

import com.unmute.auth.security.UserPrincipal;
import com.unmute.common.exception.InvalidTokenException;
import com.unmute.source.dto.SourceDto;
import com.unmute.source.service.SourceService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/sources")
public class SourceController {

    private final SourceService sourceService;

    public SourceController(SourceService sourceService) {
        this.sourceService = sourceService;
    }

    private UserPrincipal requirePrincipal(UserPrincipal principal) {
        if (principal == null) {
            throw new InvalidTokenException("Unauthorized: No active authentication principal");
        }
        return principal;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SourceDto> uploadSource(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("file") MultipartFile file
    ) throws IOException {
        requirePrincipal(principal);

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        SourceDto created = sourceService.uploadSource(principal.getId(), file);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    public ResponseEntity<List<SourceDto>> listSources(
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        requirePrincipal(principal);
        List<SourceDto> sources = sourceService.listSources(principal.getId());
        return ResponseEntity.ok(sources);
    }

    @GetMapping("/{id}")
    public ResponseEntity<SourceDto> getSource(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        SourceDto source = sourceService.getSource(principal.getId(), id);
        return ResponseEntity.ok(source);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSource(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        sourceService.deleteSource(principal.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/retry")
    public ResponseEntity<SourceDto> retryTranscription(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id
    ) {
        requirePrincipal(principal);
        SourceDto source = sourceService.retryTranscription(principal.getId(), id);
        return ResponseEntity.ok(source);
    }
}
