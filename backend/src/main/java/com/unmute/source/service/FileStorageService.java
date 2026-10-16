package com.unmute.source.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

/**
 * Local filesystem storage for uploaded source files.
 * Saves to ./uploads directory in dev mode.
 */
@Service
public class FileStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);

    private final Path uploadDir;

    public FileStorageService(@Value("${unmute.uploads.dir:./uploads}") String uploadsDir) {
        this.uploadDir = Paths.get(uploadsDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.uploadDir);
            log.info("Upload directory initialized: {}", this.uploadDir);
        } catch (IOException e) {
            throw new RuntimeException("Could not create upload directory: " + this.uploadDir, e);
        }
    }

    /**
     * Store a file and return the generated unique filename.
     */
    public String store(MultipartFile file) throws IOException {
        String originalFilename = file.getOriginalFilename();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }

        String storedFilename = UUID.randomUUID() + extension;
        Path targetPath = this.uploadDir.resolve(storedFilename).normalize();

        // Security: ensure path is within upload directory
        if (!targetPath.startsWith(this.uploadDir)) {
            throw new IOException("Cannot store file outside the upload directory");
        }

        try (InputStream inputStream = file.getInputStream()) {
            Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
        }

        log.info("Stored file: {} -> {}", originalFilename, storedFilename);
        return storedFilename;
    }

    /**
     * Delete a stored file by its filename.
     */
    public void delete(String filename) throws IOException {
        Path filePath = this.uploadDir.resolve(filename).normalize();
        if (!filePath.startsWith(this.uploadDir)) {
            throw new IOException("Cannot delete file outside the upload directory");
        }
        Files.deleteIfExists(filePath);
    }

    /**
     * Get the full path to a stored file.
     */
    public Path getFilePath(String filename) {
        return this.uploadDir.resolve(filename).normalize();
    }
}
