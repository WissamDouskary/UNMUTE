package com.unmute.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.auth.dto.AuthResponse;
import com.unmute.auth.dto.RegisterRequest;
import com.unmute.jobs.BackgroundJobRepository;
import com.unmute.jobs.JobTypes;
import com.unmute.jobs.JobWorker;
import com.unmute.live.LiveEventService;
import com.unmute.live.LiveEventTypes;
import com.unmute.note.domain.Note;
import com.unmute.note.dto.CreateNoteRequest;
import com.unmute.note.repository.NoteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AutoTagIntegrationTest {

    private static final String RICH_CONTENT = "<p>Architecture review: we agreed to adopt Kafka as the event bus. "
            + "Kafka topics will map one-to-one to bounded contexts, and every Kafka consumer must be idempotent. "
            + "The event schema registry is shared across teams.</p>";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JobWorker jobWorker;
    @Autowired private BackgroundJobRepository jobs;
    @Autowired private NoteRepository noteRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private RecordingLiveEvents liveEvents;

    /** Records published events; Mockito cannot instrument classes on this JDK. */
    static class RecordingLiveEvents extends LiveEventService {
        final List<Object> published = new java.util.concurrent.CopyOnWriteArrayList<>();

        @Override
        public void publish(UUID userId, String type, Object payload) {
            published.add(payload);
            super.publish(userId, type, payload);
        }
    }

    @TestConfiguration
    static class LiveEventsConfig {
        @Bean
        @Primary
        RecordingLiveEvents recordingLiveEvents() {
            return new RecordingLiveEvents();
        }
    }

    @BeforeEach
    void cleanQueue() {
        jobs.deleteAll();
    }

    private String token() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest("tagger@example.com", "password123", "Tagger"))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class).getAccessToken();
    }

    private UUID createNote(String token, String content) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateNoteRequest("Kafka decision", content, Set.of("architecture"), false))))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return UUID.fromString(body.get("id").asText());
    }

    /** Embedding jobs need pgvector, which H2 lacks; these tests are about tagging only. */
    private void runDueAutoTagJobs() {
        jdbc.update("DELETE FROM background_jobs WHERE job_type <> ?", JobTypes.AUTO_TAG_NOTE);
        jdbc.update("UPDATE background_jobs SET run_at = ? WHERE status = 'PENDING'", Timestamp.from(Instant.now().minusSeconds(1)));
        jobWorker.drain();
    }

    /** Tags are eagerly fetched, so the detached note is fully readable. */
    private Note reload(UUID id) {
        return noteRepository.findById(id).orElseThrow();
    }

    @Test
    @DisplayName("A new note is auto-tagged once edits settle, and open tabs are notified")
    void tagsNewNote() throws Exception {
        String token = token();
        UUID noteId = createNote(token, RICH_CONTENT);

        assertThat(jobs.existsByJobTypeAndDedupKeyAndStatusIn(JobTypes.AUTO_TAG_NOTE, noteId.toString(),
                List.of(com.unmute.jobs.JobStatus.PENDING))).isTrue();
        assertThat(jobWorker.drain()).as("debounced, not due yet").isZero();

        runDueAutoTagJobs();

        Note note = reload(noteId);
        assertThat(note.getAutoTaggedAt()).isNotNull();
        assertThat(note.getTags()).contains("architecture", "kafka");
        assertThat(liveEvents.published).anySatisfy(e -> assertThat(e).isInstanceOfSatisfying(LiveEventTypes.NoteTagged.class, tagged -> {
            assertThat(tagged.noteId()).isEqualTo(noteId);
            assertThat(tagged.addedTags()).contains("kafka");
        }));
    }

    @Test
    @DisplayName("A note too short to tag is left for a later edit, and a tagged note is not re-tagged automatically")
    void skipsShortAndAlreadyTaggedNotes() throws Exception {
        String token = token();
        UUID shortNote = createNote(token, "<p>Buy milk</p>");
        runDueAutoTagJobs();
        assertThat(reload(shortNote).getAutoTaggedAt()).isNull();
        assertThat(liveEvents.published).noneMatch(e -> e instanceof LiveEventTypes.NoteTagged);

        UUID richNote = createNote(token, RICH_CONTENT);
        runDueAutoTagJobs();
        Instant firstRun = reload(richNote).getAutoTaggedAt();
        assertThat(firstRun).isNotNull();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/notes/" + richNote)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Kafka decision\",\"content\":\"<p>Edited. " + RICH_CONTENT.substring(3)
                                .replace("\"", "\\\"") + "\"}"))
                .andExpect(status().isOk());
        assertThat(jobs.existsByJobTypeAndDedupKeyAndStatusIn(JobTypes.AUTO_TAG_NOTE, richNote.toString(),
                List.of(com.unmute.jobs.JobStatus.PENDING))).isFalse();
    }

    @Test
    @DisplayName("POST /api/v1/ai/auto-tag queues a forced run for the owner and 404s for other users' notes")
    void explicitRequest() throws Exception {
        String token = token();
        UUID noteId = createNote(token, RICH_CONTENT);
        runDueAutoTagJobs();

        mockMvc.perform(post("/api/v1/ai/auto-tag")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"noteId\":\"" + noteId + "\"}"))
                .andExpect(status().isAccepted());
        assertThat(jobs.existsByJobTypeAndDedupKeyAndStatusIn(JobTypes.AUTO_TAG_NOTE, noteId + ":force",
                List.of(com.unmute.jobs.JobStatus.PENDING))).isTrue();

        mockMvc.perform(post("/api/v1/ai/auto-tag")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"noteId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isNotFound());
    }
}
