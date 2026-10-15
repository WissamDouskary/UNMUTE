package com.unmute.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unmute.auth.dto.AuthResponse;
import com.unmute.auth.dto.RegisterRequest;
import com.unmute.note.dto.CreateNoteRequest;
import com.unmute.note.dto.NoteDto;
import com.unmute.task.domain.TaskPriority;
import com.unmute.task.dto.BatchCreateTasksRequest;
import com.unmute.task.dto.CreateTaskRequest;
import com.unmute.task.dto.TaskDto;
import com.unmute.task.dto.UpdateTaskRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class TaskIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String registerAndGetToken(String email, String name) throws Exception {
        RegisterRequest registerRequest = new RegisterRequest(email, "password123", name);
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated())
                .andReturn();

        AuthResponse authResponse = objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class);
        return authResponse.getAccessToken();
    }

    private NoteDto createTestNote(String token, String title) throws Exception {
        CreateNoteRequest request = new CreateNoteRequest(title, "Note content", Set.of("test"), false);
        MvcResult result = mockMvc.perform(post("/api/v1/notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readValue(result.getResponse().getContentAsString(), NoteDto.class);
    }

    @Test
    @DisplayName("POST /api/v1/tasks without token -> 401 Unauthorized")
    void shouldRejectUnauthenticatedRequest() throws Exception {
        CreateTaskRequest request = new CreateTaskRequest("Test Task", "Desc", null, TaskPriority.MEDIUM, null);

        mockMvc.perform(post("/api/v1/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /api/v1/tasks -> 201 Created standalone task")
    void shouldCreateStandaloneTask() throws Exception {
        String token = registerAndGetToken("taskuser@example.com", "Task User");
        Instant dueDate = Instant.now().plus(3, ChronoUnit.DAYS);
        CreateTaskRequest request = new CreateTaskRequest(
                "Deploy Spring Boot backend to production",
                "Ensure health checks and Flyway migrations pass",
                null,
                TaskPriority.HIGH,
                dueDate
        );

        mockMvc.perform(post("/api/v1/tasks")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.title", is("Deploy Spring Boot backend to production")))
                .andExpect(jsonPath("$.description", is("Ensure health checks and Flyway migrations pass")))
                .andExpect(jsonPath("$.priority", is("HIGH")))
                .andExpect(jsonPath("$.isCompleted", is(false)))
                .andExpect(jsonPath("$.noteId").doesNotExist())
                .andExpect(jsonPath("$.noteTitle").doesNotExist());
    }

    @Test
    @DisplayName("POST /api/v1/tasks linked to note -> 201 Created with note details")
    void shouldCreateTaskLinkedToNote() throws Exception {
        String token = registerAndGetToken("linkeduser@example.com", "Linked User");
        NoteDto note = createTestNote(token, "Sprint 42 Retrospective");

        CreateTaskRequest request = new CreateTaskRequest(
                "Fix Docker volume anonymous binding",
                "Ensure node_modules persist across runs",
                note.getId(),
                TaskPriority.URGENT,
                null
        );

        mockMvc.perform(post("/api/v1/tasks")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.title", is("Fix Docker volume anonymous binding")))
                .andExpect(jsonPath("$.priority", is("URGENT")))
                .andExpect(jsonPath("$.noteId", is(note.getId().toString())))
                .andExpect(jsonPath("$.noteTitle", is("Sprint 42 Retrospective")));
    }

    @Test
    @DisplayName("PATCH /api/v1/tasks/{id}/toggle -> toggles isCompleted")
    void shouldToggleTaskCompletion() throws Exception {
        String token = registerAndGetToken("toggleuser@example.com", "Toggle User");
        CreateTaskRequest request = new CreateTaskRequest("Initial task", null, null, TaskPriority.MEDIUM, null);

        MvcResult createResult = mockMvc.perform(post("/api/v1/tasks")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        TaskDto created = objectMapper.readValue(createResult.getResponse().getContentAsString(), TaskDto.class);

        // Toggle to true
        mockMvc.perform(patch("/api/v1/tasks/" + created.id() + "/toggle")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isCompleted", is(true)));

        // Toggle back to false
        mockMvc.perform(patch("/api/v1/tasks/" + created.id() + "/toggle")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isCompleted", is(false)));
    }

    @Test
    @DisplayName("PUT /api/v1/tasks/{id} -> updates task fields")
    void shouldUpdateTask() throws Exception {
        String token = registerAndGetToken("updateuser@example.com", "Update User");
        CreateTaskRequest request = new CreateTaskRequest("Old title", "Old desc", null, TaskPriority.LOW, null);

        MvcResult createResult = mockMvc.perform(post("/api/v1/tasks")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        TaskDto created = objectMapper.readValue(createResult.getResponse().getContentAsString(), TaskDto.class);

        UpdateTaskRequest updateRequest = new UpdateTaskRequest(
                "New polished title",
                "New description",
                null,
                true,
                TaskPriority.HIGH,
                null
        );

        mockMvc.perform(put("/api/v1/tasks/" + created.id())
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title", is("New polished title")))
                .andExpect(jsonPath("$.description", is("New description")))
                .andExpect(jsonPath("$.priority", is("HIGH")))
                .andExpect(jsonPath("$.isCompleted", is(true)));
    }

    @Test
    @DisplayName("DELETE /api/v1/tasks/{id} -> deletes task, returns 204")
    void shouldDeleteTask() throws Exception {
        String token = registerAndGetToken("deleteuser@example.com", "Delete User");
        CreateTaskRequest request = new CreateTaskRequest("Task to delete", null, null, TaskPriority.LOW, null);

        MvcResult createResult = mockMvc.perform(post("/api/v1/tasks")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        TaskDto created = objectMapper.readValue(createResult.getResponse().getContentAsString(), TaskDto.class);

        mockMvc.perform(delete("/api/v1/tasks/" + created.id())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/tasks/" + created.id())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /api/v1/tasks/batch -> creates multiple tasks in one atomic call")
    void shouldCreateBatchTasks() throws Exception {
        String token = registerAndGetToken("batchuser@example.com", "Batch User");
        NoteDto note = createTestNote(token, "Product Spec");

        BatchCreateTasksRequest batchRequest = new BatchCreateTasksRequest(
                note.getId(),
                List.of(
                        new CreateTaskRequest("Task 1 from batch", null, null, TaskPriority.URGENT, null),
                        new CreateTaskRequest("Task 2 from batch", null, null, TaskPriority.MEDIUM, null)
                )
        );

        mockMvc.perform(post("/api/v1/tasks/batch")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(batchRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].noteId", is(note.getId().toString())))
                .andExpect(jsonPath("$[1].noteId", is(note.getId().toString())));
    }
}
