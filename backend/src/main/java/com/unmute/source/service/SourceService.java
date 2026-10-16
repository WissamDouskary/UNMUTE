package com.unmute.source.service;

import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.common.exception.ConflictException;
import com.unmute.common.exception.ResourceNotFoundException;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.dto.SourceDto;
import com.unmute.source.event.SourceTranscriptionRequestedEvent;
import com.unmute.source.repository.SourceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class SourceService {

    private static final Logger log = LoggerFactory.getLogger(SourceService.class);

    private final SourceRepository sourceRepository;
    private final UserRepository userRepository;
    private final FileStorageService fileStorageService;
    private final ApplicationEventPublisher events;

    public SourceService(SourceRepository sourceRepository,
                         UserRepository userRepository,
                         FileStorageService fileStorageService,
                         ApplicationEventPublisher events) {
        this.sourceRepository = sourceRepository;
        this.userRepository = userRepository;
        this.fileStorageService = fileStorageService;
        this.events = events;
    }

    /**
     * Upload a file source, store it, and queue transcription once the source row is committed.
     */
    public SourceDto uploadSource(UUID userId, MultipartFile file) throws IOException {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "recording.webm";
        String fileType = file.getContentType() != null ? file.getContentType() : "audio/webm";
        long fileSize = file.getSize();

        String storedFilename = fileStorageService.store(file);
        deleteFileIfRolledBack(storedFilename);

        Source source = sourceRepository.save(new Source(user, storedFilename, originalName, fileType, fileSize));
        log.info("Source uploaded: {} ({}), queueing transcription", originalName, source.getId());

        events.publishEvent(new SourceTranscriptionRequestedEvent(source.getId()));
        return SourceDto.fromEntity(source);
    }

    @Transactional(readOnly = true)
    public List<SourceDto> listSources(UUID userId) {
        return sourceRepository.findWithNoteByUserId(userId)
                .stream()
                .map(SourceDto::fromEntity)
                .toList();
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

        sourceRepository.delete(source);
        deleteFileAfterCommit(source.getFilename());
    }

    /**
     * Retry transcription for a failed source.
     */
    public SourceDto retryTranscription(UUID userId, UUID sourceId) {
        Source source = sourceRepository.findByIdAndUserId(sourceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Source not found with id: " + sourceId));

        if (source.getStatus() != SourceStatus.FAILED) {
            throw new ConflictException("Can only retry failed transcriptions. Current status: " + source.getStatus());
        }

        source.setStatus(SourceStatus.PENDING);
        source.setErrorMessage(null);
        source = sourceRepository.save(source);

        events.publishEvent(new SourceTranscriptionRequestedEvent(source.getId()));
        return SourceDto.fromEntity(source);
    }

    /** The file is irreversible, so it only goes once the row deletion is durable. */
    private void deleteFileAfterCommit(String filename) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteQuietly(filename);
            }
        });
    }

    /** Avoids orphaned files on disk when the source row never gets persisted. */
    private void deleteFileIfRolledBack(String filename) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    deleteQuietly(filename);
                }
            }
        });
    }

    private void deleteQuietly(String filename) {
        try {
            fileStorageService.delete(filename);
        } catch (IOException e) {
            log.warn("Failed to delete source file: {}", filename, e);
        }
    }
}
