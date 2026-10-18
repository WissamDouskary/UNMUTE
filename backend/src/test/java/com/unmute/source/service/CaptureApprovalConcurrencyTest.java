package com.unmute.source.service;

import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.dto.ApproveCaptureRequest;
import com.unmute.source.dto.SourceDto;
import com.unmute.source.repository.SourceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs only when pointed at an empty PostgreSQL database, for example the compose service's
 * {@code unmute_lock_test} database. A holder transaction keeps {@code SELECT ... FOR UPDATE}
 * until the second approval is observed waiting, then commits the source as already saved.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@EnabledIfEnvironmentVariable(named = "UNMUTE_LOCK_TEST_URL", matches = "jdbc:postgresql:.*")
class CaptureApprovalConcurrencyTest {

    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        String phrase = System.getenv("UNMUTE_LOCK_TEST_PHRASE");
        if (phrase == null || phrase.isBlank()) {
            throw new IllegalStateException("UNMUTE_LOCK_TEST_PHRASE is required");
        }
        registry.add("spring.datasource.url", () -> System.getenv("UNMUTE_LOCK_TEST_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("UNMUTE_LOCK_TEST_USER", "unmute"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("UNMUTE_LOCK_TEST_PHRASE", ""));
        registry.add("unmute.ai.llm-provider", () -> "mock");
        registry.add("unmute.ai.embedding-provider", () -> "mock");
        registry.add("unmute.ai.transcription-provider", () -> "mock");
        registry.add("unmute.jobs.worker-enabled", () -> "false");
        registry.add("unmute.google.client-id", () -> "");
        registry.add("unmute.google.token-encryption-key", () -> "");
    }

    @Autowired
    private CaptureReviewService reviews;
    @Autowired
    private SourceRepository sources;
    @Autowired
    private NoteRepository notes;
    @Autowired
    private UserRepository users;
    @Autowired
    private PlatformTransactionManager transactions;

    @Test
    void concurrentApproveWaitsForTheRowLockAndInsertsOneNote() throws Exception {
        User owner = users.save(new User("approve-lock-" + UUID.randomUUID() + "@example.com", "hash", "Alice"));
        Source ready = sources.save(new Source(owner, "brief.txt", "brief.txt", "text/plain", 12));
        ready.setStatus(SourceStatus.READY);
        ready = sources.save(ready);
        UUID userId = owner.getId();
        UUID sourceId = ready.getId();

        CountDownLatch holding = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<UUID> heldNote = new AtomicReference<>();
        AtomicReference<Throwable> holderFailure = new AtomicReference<>();
        TransactionTemplate tx = new TransactionTemplate(transactions);

        Thread holder = new Thread(() -> {
            try {
                tx.executeWithoutResult(status -> {
                    User managed = users.findById(userId).orElseThrow();
                    Source locked = sources.lockByIdAndUserId(sourceId, userId).orElseThrow();
                    Note note = notes.save(new Note(managed, "Held", "<p>Held</p>"));
                    locked.setNote(note);
                    locked.setStatus(SourceStatus.COMPLETED);
                    heldNote.set(note.getId());
                    holding.countDown();
                    try {
                        if (!release.await(20, TimeUnit.SECONDS)) {
                            throw new IllegalStateException("The approval did not arrive while the row was locked");
                        }
                    } catch (InterruptedException ex) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException(ex);
                    }
                });
            } catch (RuntimeException ex) {
                holderFailure.set(ex);
                holding.countDown();
            }
        });
        holder.start();
        assertThat(holding.await(20, TimeUnit.SECONDS)).isTrue();
        assertThat(holderFailure.get()).isNull();

        ExecutorService caller = Executors.newSingleThreadExecutor();
        try {
            Future<SourceDto> approval = caller.submit(() -> reviews.approve(
                    userId,
                    sourceId,
                    new ApproveCaptureRequest("Other title", "Other body", List.of(), List.of())));
            Thread.sleep(400);
            assertThat(approval.isDone()).isFalse();
            release.countDown();
            SourceDto saved = approval.get(20, TimeUnit.SECONDS);
            holder.join(20_000);
            assertThat(holderFailure.get()).isNull();
            assertThat(saved.getNoteId()).isEqualTo(heldNote.get());
            assertThat(notes.count()).isEqualTo(1);
            assertThat(sources.findById(sourceId).orElseThrow().getStatus()).isEqualTo(SourceStatus.COMPLETED);
        } finally {
            release.countDown();
            caller.shutdownNow();
        }
    }
}
