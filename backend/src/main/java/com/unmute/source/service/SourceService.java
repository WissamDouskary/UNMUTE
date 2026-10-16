package com.unmute.source.service;

import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.dto.SourceDto;
import com.unmute.source.repository.SourceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional
public class SourceService {

    private static final Logger log = LoggerFactory.getLogger(SourceService.class);

    private final SourceRepository sourceRepository;
    private final UserRepository userRepository;
    private final FileStorageService fileStorageService;
    private final TranscriptionPipelineRunner pipelineRunner;

    public SourceService(SourceRepository sourceRepository,
                         UserRepository userRepository,
                         FileStorageService fileStorageService,
                         TranscriptionPipelineRunner pipelineRunner) {
        this.sourceRepository = sourceRepository;
        this.userRepository = userRepository;
        this.fileStorageService = fileStorageService;
        this.pipelineRunner = pipelineRunner;
    }

    /**
     * Upload a file source, store it, and kick off async transcription.
     */
    public SourceDto uploadSource(UUID userId, MultipartFile file) throws IOException {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "recording.webm";
        String fileType = file.getContentType() != null ? file.getContentType() : "audio/webm";
        long fileSize = file.getSize();

        // Store the file
        String storedFilename = fileStorageService.store(file);

        // Create the source record
        Source source = new Source(user, storedFilename, originalName, fileType, fileSize);
        source = sourceRepository.save(source);

        log.info("Source uploaded: {} ({}), triggering async transcription pipeline", originalName, source.getId());

        // Trigger async transcription through the runner bean (enforces @Async proxy)
        pipelineRunner.runPipelineAsync(source.getId(), userId);

        return SourceDto.fromEntity(source);
    }

    @Transactional(readOnly = true)
    public List<SourceDto> listSources(UUID userId) {
        return sourceRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(SourceDto::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public SourceDto getSource(UUID userId, UUID sourceId) {
        Source source = sourceRepository.findByIdAndUserId(sourceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Source not found with id: " + sourceId));
        return SourceDto.fromEntity(source);
    }

    public void deleteSource(UUID userId, UUID sourceId) {
        Source source = sourceRepository.findByIdAndUserId(sourceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Source not found with id: " + sourceId));

        // Delete the stored file
        try {
            fileStorageService.delete(source.getFilename());
        } catch (IOException e) {
            log.warn("Failed to delete source file: {}", source.getFilename(), e);
        }

        sourceRepository.delete(source);
    }

    /**
     * Retry transcription for a failed source.
     */
    public SourceDto retryTranscription(UUID userId, UUID sourceId) {
        Source source = sourceRepository.findByIdAndUserId(sourceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Source not found with id: " + sourceId));

        if (source.getStatus() != SourceStatus.FAILED) {
            throw new IllegalStateException("Can only retry failed transcriptions. Current status: " + source.getStatus());
        }

        source.setStatus(SourceStatus.PENDING);
        source.setErrorMessage(null);
        source = sourceRepository.save(source);

        pipelineRunner.runPipelineAsync(source.getId(), userId);

        return SourceDto.fromEntity(source);
    }
}
