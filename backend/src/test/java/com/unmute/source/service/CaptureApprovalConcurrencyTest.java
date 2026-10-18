package com.unmute.source.service;

import com.unmute.auth.domain.User;
import com.unmute.auth.repository.UserRepository;
import com.unmute.note.domain.Note;
import com.unmute.note.repository.NoteRepository;
import com.unmute.source.domain.Source;
import com.unmute.source.domain.SourceStatus;
import com.unmute.source.dto.ApproveCaptureRequest;
import com.unmute.source.dto.ReviewTask;
import com.unmute.source.dto.SourceDto;
import com.unmute.source.repository.SourceRepository;
import com.unmute.task.domain.Task;
import com.unmute.task.domain.TaskPriority;
import com.unmute.task.repository.TaskRepository;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Row-lock proof against the disposable database from {@code docker-compose.it.yml}.
 * The default Maven test run excludes the {@code postgres-it} tag. The integration
 * profile runs this class and fails if {@code 127.0.0.1:5433/unmute_it} is down.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Tag("postgres-it")
class CaptureApprovalConcurrencyTest {

    static final String URL = "jdbc:postgresql://127.0.0.1:5433/unmute_it";
    static final String USER = "unmute_it";
    /** Local disposable database only. This is not an application secret. */
    static final String PASSWORD = "unmute-it-only";

    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        requireDisposableDatabase();
        registry.add("spring.datasource.url", () -> URL);
        registry.add("spring.datasource.username", () -> USER);
        registry.add("spring.datasource.password", () -> PASSWORD);
        registry.add("unmute.ai.llm-provider", () -> "mock");
        registry.add("unmute.ai.embedding-provider", () -> "mock");
        registry.add("unmute.ai.transcription-provider", () -> "mock");
        registry.add("unmute.jobs.worker-enabled", () -> "false");
        registry.add("unmute.google.client-id", () -> "");
        registry.add("unmute.google.token-encryption-key", () -> "");
    }

    static void requireDisposableDatabase() {
        if (!"jdbc:postgresql://127.0.0.1:5433/unmute_it".equals(URL)) {
            throw new IllegalStateException("Refusing to use any database except the disposable one on port 5433.");
        }
        try (Connection connection = DriverManager.getConnection(URL, USER, PASSWORD);
             Statement statement = connection.createStatement();
             ResultSet row = statement.executeQuery("SELECT current_database(), current_user")) {
            if (!row.next()
                    || !"unmute_it".equals(row.getString(1))
                    || !"unmute_it".equals(row.getString(2))) {
                throw new IllegalStateException("Refusing to migrate a database that is not unmute_it.");
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(
                    "Disposable PostgreSQL is not ready. Start it with: "
                            + "docker compose -p unmute-it -f docker-compose.it.yml up -d --wait",
                    ex);
        }
    }

    @Autowired
    private CaptureReviewService reviews;
    @Autowired
    private SourceRepository sources;
    @Autowired
    private NoteRepository notes;
    @Autowired
    private TaskRepository tasks;
    @Autowired
    private UserRepository users;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PlatformTransactionManager transactions;

    @Test
    void concurrentApproveWaitsAndARepeatDoesNotDuplicateNotesTasksOrTags() throws Exception {
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
                    note.setTags(Set.of("held"));
                    note = notes.save(note);
                    tasks.save(new Task(managed, note, "Held task", "keep", TaskPriority.MEDIUM, null));
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
                    new ApproveCaptureRequest(
                            "Other title",
                            "Other body",
                            List.of(new ReviewTask("Other task", "do not save")),
                            List.of("other"))));
            Thread.sleep(400);
            assertThat(approval.isDone()).isFalse();
            release.countDown();
            SourceDto saved = approval.get(20, TimeUnit.SECONDS);
            holder.join(20_000);
            assertThat(holderFailure.get()).isNull();
            assertThat(saved.getNoteId()).isEqualTo(heldNote.get());
            assertSavedOnce(userId, sourceId, heldNote.get());

            SourceDto again = reviews.approve(
                    userId,
                    sourceId,
                    new ApproveCaptureRequest(
                            "Third title",
                            "Third body",
                            List.of(new ReviewTask("Third task", "do not save")),
                            List.of("third")));
            assertThat(again.getNoteId()).isEqualTo(heldNote.get());
            assertSavedOnce(userId, sourceId, heldNote.get());
        } finally {
            release.countDown();
            caller.shutdownNow();
        }
    }

    private void assertSavedOnce(UUID userId, UUID sourceId, UUID noteId) {
        assertThat(jdbc.queryForObject("SELECT title FROM notes WHERE id = ?", String.class, noteId))
                .isEqualTo("Held");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notes WHERE user_id = ?", Integer.class, userId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM tasks WHERE user_id = ? AND note_id = ?", Integer.class, userId, noteId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT title FROM tasks WHERE note_id = ?", String.class, noteId))
                .isEqualTo("Held task");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM note_tags WHERE note_id = ?", Integer.class, noteId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT tag FROM note_tags WHERE note_id = ?", String.class, noteId))
                .isEqualTo("held");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM graph_links WHERE user_id = ?", Integer.class, userId))
                .isEqualTo(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM graph_suggestions WHERE user_id = ?", Integer.class, userId))
                .isEqualTo(0);
        assertThat(sources.findById(sourceId).orElseThrow().getStatus()).isEqualTo(SourceStatus.COMPLETED);
    }
}
